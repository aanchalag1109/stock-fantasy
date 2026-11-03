'use strict';

/**
 * PHP PARITY — Performance contest page "RUN ALL" (PHP Admin\RunAllController + App\Jobs\RunAllJob).
 * The admin enters a start and end time (today, IST). The job then:
 *   1. waits until the start time;
 *   2. fetches start prices for every session asset (up to 10 attempts, 10 s apart) and aborts
 *      if any are still missing;
 *   3. sets the session live (start/end time = the entered times) and its contests live;
 *   4. waits until the end time and fetches end prices;
 *   5. scores, ranks and pays this contest's prizes;
 *   6. completes the session and its live/upcoming contests.
 * Progress is written to a log the page polls; "Stop" ends the job.
 *
 * NEW IMPLEMENTATION — NODE.JS PROJECT (differences from PHP, deliberate):
 *   - Stop really stops the job (PHP only deleted jobs still waiting in the queue, so a running
 *     job carried on). The job checks for a stop request every few seconds while waiting.
 *   - Prizes are paid through the Pending Prizes payout (tied ranks share prizes, duplicate-proof,
 *     same rules as the app leaderboard) instead of PHP's per-rank loop.
 *   - While the job runs the session is flagged run_all_active, so the scheduled automation does
 *     not flip, price, cancel or pay it at the same time.
 *   - Only one job per contest at a time; a job lost to a server restart is reported as failed.
 */

const mongoose = require('mongoose');
const Contest = require('../models/contest.model');
const LeagueSession = require('../models/league-session.model');
const RunAllJob = require('../models/run-all-job.model');
const logger = require('../config/logger');
const { keysOf, publicId } = require('../helpers/mobile-compat');
const lifecycle = require('./contest-automation/session-lifecycle.job');
const scoring = require('./contest-automation/contest-scoring');
const payout = require('./contest-automation/prize-payout.service');

const MAX_START_ATTEMPTS = 10;
const RETRY_DELAY_MS = 10 * 1000;
const CHECK_INTERVAL_MS = 5 * 1000;
const STALE_AFTER_MS = 2 * 60 * 1000;

// Overridable in tests.
const clock = {
  now: () => new Date(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

class StoppedError extends Error {}

const isOid = (v) => String(v).length === 24 && mongoose.isValidObjectId(String(v));
async function findContest(id) {
  const text = String(id || '');
  if (isOid(text)) { const c = await Contest.findById(text).lean(); if (c) return c; }
  if (/^\d+$/.test(text)) return Contest.findOne({ old_id: Number(text) }).lean();
  return null;
}
async function findSession(ref) {
  if (ref == null) return null;
  const text = String(ref);
  if (isOid(text)) { const s = await LeagueSession.findById(text).lean(); if (s) return s; }
  if (/^\d+$/.test(text)) return LeagueSession.findOne({ old_id: Number(text) }).lean();
  return null;
}

const hhmm = (d) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(d);

/** "HH:MM" (or HH:MM:SS) today in IST → Date, or null. */
function todayAt(time, now = clock.now()) {
  const match = String(time || '').trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  const [, h, m, s = '00'] = match;
  if (Number(h) > 23 || Number(m) > 59 || Number(s) > 59) return null;
  // formatToParts: locale output order differs between ICU builds (en-CA can give MM/DD/YYYY).
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (type) => parts.find((p) => p.type === type).value;
  return new Date(`${part('year')}-${part('month')}-${part('day')}T${h.padStart(2, '0')}:${m}:${s}+05:30`);
}

const isStale = (job, now) => ['queued', 'running'].includes(job.status)
  && (!job.heartbeat_at || now - new Date(job.heartbeat_at) > STALE_AFTER_MS);

/** PHP runAll: validates input and starts the job. Returns { status, body }. */
async function start(contestId, { start_time: startTime, end_time: endTime } = {}, { actor = 'admin' } = {}) {
  const contest = await findContest(contestId);
  if (!contest) return { status: 404, body: { success: false, message: 'Contest not found' } };
  if (!startTime || !endTime) return { status: 422, body: { success: false, message: 'Please enter both a start time and an end time' } };
  const now = clock.now();
  const startAt = todayAt(startTime, now);
  const endAt = todayAt(endTime, now);
  if (!startAt || !endAt) return { status: 422, body: { success: false, message: 'Times must be in HH:MM format' } };
  if (endAt <= startAt) return { status: 422, body: { success: false, message: 'End time must be after start time' } };
  const session = await findSession(contest.league_session_id);
  if (!session) return { status: 422, body: { success: false, message: 'This contest has no session' } };
  if (['completed', 'cancelled'].includes(session.status)) {
    return { status: 422, body: { success: false, message: `Session is ${session.status}` } };
  }

  const id = String(contest._id);
  const existing = await RunAllJob.findById(id).lean();
  if (existing && ['queued', 'running'].includes(existing.status) && !isStale(existing, now)) {
    return { status: 409, body: { success: false, message: 'A RUN ALL job is already running for this contest' } };
  }
  await RunAllJob.findOneAndUpdate(
    { _id: id },
    {
      $set: {
        session_id: session._id,
        status: 'queued',
        log: ['Job queued!', `Start: ${hhmm(startAt)}`, `End: ${hhmm(endAt)}`],
        start_at: startAt,
        end_at: endAt,
        stop_requested: false,
        heartbeat_at: now,
        started_by: actor,
      },
    },
    { upsert: true },
  );
  logger.info(`[run-all] ${actor} queued RUN ALL for contest ${publicId(contest)} (${hhmm(startAt)} → ${hhmm(endAt)})`);
  // Fire and forget; progress goes to the job log.
  module.exports._running = execute(id, contest, session, startAt, endAt).catch((err) => logger.error(`[run-all] ${err.message}`));
  return {
    status: 200,
    body: { success: true, message: 'Job queued!', start: hhmm(startAt), end: hhmm(endAt), poll_url: `/api/run-all-log/${id}` },
  };
}

async function execute(id, contest, session, startAt, endAt) {
  const log = async (line) => {
    const job = await RunAllJob.findOneAndUpdate(
      { _id: id },
      { $push: { log: line }, $set: { status: 'running', heartbeat_at: clock.now() } },
      { new: true },
    );
    if (job && job.stop_requested) throw new StoppedError();
  };
  const checkStop = async () => {
    const job = await RunAllJob.findOneAndUpdate({ _id: id }, { $set: { heartbeat_at: clock.now() } }, { new: true });
    if (!job || job.stop_requested) throw new StoppedError();
  };
  const waitUntil = async (when) => {
    for (;;) {
      await checkStop();
      const left = when - clock.now();
      if (left <= 0) return;
      await clock.sleep(Math.min(left, CHECK_INTERVAL_MS));
    }
  };

  try {
    await LeagueSession.updateOne({ _id: session._id }, { $set: { run_all_active: true } });

    if (startAt > clock.now()) {
      await log(`Waiting for start time: ${hhmm(startAt)} (${Math.round((startAt - clock.now()) / 1000)}s)`);
      await waitUntil(startAt);
    }

    // Phase 1: start prices — every asset must have one.
    const symbols = (session.assets || []).filter((a) => a.asset_symbol);
    const total = symbols.length;
    await log(`Phase 1: Fetching start prices for ${total} assets...`);
    let current = await LeagueSession.findById(session._id).lean();
    let saved = 0;
    for (let attempt = 1; attempt <= MAX_START_ATTEMPTS; attempt += 1) {
      current = (await lifecycle.fillMissingPrices(current, 'start_price', clock.now())).session;
      saved = (current.assets || []).filter((a) => a.asset_symbol && Number(a.start_price) > 0).length;
      await log(`Attempt ${attempt}: ${saved}/${total} prices saved`);
      if (saved >= total) break;
      if (attempt < MAX_START_ATTEMPTS) {
        await log(`Still missing ${total - saved} prices, retrying in 10s...`);
        await clock.sleep(RETRY_DELAY_MS);
        await checkStop();
      }
    }
    if (saved < total) throw new Error(`Could not fetch all start prices after ${MAX_START_ATTEMPTS} attempts. Got ${saved}/${total}. Aborting.`);

    const liveAt = clock.now();
    await LeagueSession.updateOne({ _id: session._id }, {
      $set: { status: 'live', start_time: startAt, end_time: endAt, start_prices_captured_at: liveAt },
    });
    await Contest.updateMany(
      { league_session_id: { $in: keysOf(session) }, status: { $nin: ['cancelled', 'completed'] } },
      { $set: { status: 'live' } },
    );
    const { start } = scoring.sessionPriceMaps(current);
    await lifecycle.copyToEntries(current, start, 'starting_prices', 'contest_started_at', liveAt);
    await log('All prices saved. Session LIVE');

    if (endAt > clock.now()) {
      await log(`Waiting for end time: ${hhmm(endAt)} (${Math.round((endAt - clock.now()) / 1000)}s)`);
      await waitUntil(endAt);
    }

    // Phase 2: end prices.
    await log('Phase 2: Fetching end prices...');
    current = (await lifecycle.fillMissingPrices(await LeagueSession.findById(session._id).lean(), 'end_price', clock.now())).session;
    const { end } = scoring.sessionPriceMaps(current);
    await log(`End prices saved: ${Object.keys(end).length}`);

    // Phase 3: scores + prizes for this contest (session must be completed for the payout).
    const endedAt = clock.now();
    await LeagueSession.updateOne({ _id: session._id }, { $set: { status: 'completed', end_time: endAt, end_prices_captured_at: endedAt } });
    if (Object.keys(end).length) await lifecycle.copyToEntries(current, end, 'ending_prices', 'contest_ended_at', endedAt);
    await log('Phase 3a: Calculating scores...');
    await log(`Scores calculated: ${await scoring.countParticipants(contest)} entries`);
    await log('Phase 3b: Distributing prizes...');
    const result = await payout.distributeContest(String(contest._id));
    await log(result.success ? `Prizes distributed: ${result.winners_count} winners` : `Prizes not distributed: ${result.message}`);

    // Phase 4: complete.
    await log('Phase 4: Marking completed...');
    await Contest.updateMany(
      { league_session_id: { $in: keysOf(session) }, status: { $in: ['live', 'upcoming', 'active'] } },
      { $set: { status: 'completed' } },
    );
    await LeagueSession.updateOne({ _id: session._id }, { $set: { run_all_active: false } });
    await RunAllJob.updateOne({ _id: id }, { $push: { log: 'DONE - Session completed!' }, $set: { status: 'done', heartbeat_at: clock.now() } });
  } catch (err) {
    const line = err instanceof StoppedError ? 'Job manually stopped by admin.' : `Error: ${err.message}`;
    if (!(err instanceof StoppedError)) logger.error(`[run-all] contest ${id} failed: ${err.message}`);
    try {
      await LeagueSession.updateOne({ _id: session._id }, { $set: { run_all_active: false } });
      const job = await RunAllJob.findById(id).lean();
      const already = job && job.log && job.log[job.log.length - 1] === line; // Stop already logged it
      await RunAllJob.updateOne({ _id: id }, { ...(already ? {} : { $push: { log: line } }), $set: { status: 'failed' } });
    } catch (cleanupErr) {
      logger.error(`[run-all] contest ${id}: could not record failure: ${cleanupErr.message}`);
    }
  }
}

/** PHP getLog. */
async function getLog(contestId) {
  const job = await RunAllJob.findById(String(contestId)).lean();
  if (!job) return { status: 'not_started', log: [] };
  if (isStale(job, clock.now())) {
    return { status: 'failed', log: [...job.log, 'Error: job was interrupted (server restarted). Please run it again.'] };
  }
  return { status: job.status, log: job.log };
}

/** PHP stopJob: marks the job failed; the runner stops at its next check. */
async function stop(contestId, { actor = 'admin' } = {}) {
  const id = String(contestId);
  const job = await RunAllJob.findById(id).lean();
  if (!job) return { success: false, message: 'No RUN ALL job for this contest' };
  await RunAllJob.updateOne({ _id: id }, {
    $set: { stop_requested: true, status: 'failed' },
    $push: { log: 'Job manually stopped by admin.' },
  });
  if (job.session_id != null) await LeagueSession.updateOne({ _id: job.session_id }, { $set: { run_all_active: false } });
  logger.info(`[run-all] ${actor} stopped RUN ALL for contest ${id}`);
  return { success: true, message: 'Job stopped' };
}

module.exports = { start, getLog, stop, todayAt, clock, MAX_START_ATTEMPTS, _running: null };
