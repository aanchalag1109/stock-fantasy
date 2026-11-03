'use strict';

/**
 * PHP PARITY — session actions of the PHP admin that were missed in the conversion:
 *   Live Management (Admin\LiveManagementController / SessionStatusController):
 *     liveSessionsData, startSession, endAndDistribute ("End & Distribute"),
 *     fixOrphanedContests ("Cleanup Orphaned"), contestDetails, portfolioDetails
 *   Leagues/Sessions (Admin\LeagueSessionController):
 *     refetchMissingPrices ("Refetch Missing Prices"),
 *     cancelSession — PHP's "deactivate a live session (will refund all users)"
 *
 * NEW IMPLEMENTATION — NODE.JS PROJECT (differences from PHP, all deliberate):
 *   - cancelSession really refunds: PHP's refundUsers() added a non-existent entry_fee to
 *     a `coins` column, so users got nothing. Here every contest of the session is cancelled
 *     through the same service as Contests → Cancel (entry fee back to deposit_balance,
 *     idempotent), and the session becomes status "cancelled", active=false.
 *   - endAndDistribute pays through the Pending Prizes payout (same prize rules as the app
 *     leaderboard, duplicate-proof) instead of PHP's legacy calculateResults call.
 *   - refetchMissingPrices only fills start prices of started sessions and end prices of
 *     completed ones (PHP also wrote "end prices" for sessions that had not ended).
 *   - Cancelled contests are never moved back to live/completed (PHP updated all contests).
 */

const mongoose = require('mongoose');
const LeagueSession = require('../models/league-session.model');
const Contest = require('../models/contest.model');
const ContestEntry = require('../models/contest-entry.model');
const SavedBasket = require('../models/saved-basket.model');
const User = require('../models/user.model');
const logger = require('../config/logger');
const { keysOf, publicId, num, round2 } = require('../helpers/mobile-compat');
const { cancelContest } = require('./contest-cancellation.service');
const lifecycle = require('./contest-automation/session-lifecycle.job');
const scoring = require('./contest-automation/contest-scoring');
const payout = require('./contest-automation/prize-payout.service');
const { runLiveScores } = require('./contest-automation/live-scores.job');
const { withLock } = require('./contest-automation/job-lock');

const isOid = (v) => String(v).length === 24 && mongoose.isValidObjectId(String(v));

async function findByAnyId(Model, id) {
  const text = String(id || '');
  if (isOid(text)) {
    const doc = await Model.findById(text).lean();
    if (doc) return doc;
  }
  if (/^\d+$/.test(text)) return Model.findOne({ old_id: Number(text) }).lean();
  return null;
}
const findSession = (id) => findByAnyId(LeagueSession, id);

async function usersByIds(ids) {
  const list = [...new Set(ids.filter((id) => id != null).map(String))];
  const clauses = [];
  const oids = list.filter(isOid);
  const olds = list.filter((id) => /^\d+$/.test(id) && id.length < 24).map(Number);
  if (oids.length) clauses.push({ _id: { $in: oids } });
  if (olds.length) clauses.push({ old_id: { $in: olds } });
  const users = clauses.length ? await User.find({ $or: clauses }).select('name email mobile old_id').lean() : [];
  const map = new Map();
  users.forEach((u) => { map.set(String(u._id), u); if (u.old_id != null) map.set(String(u.old_id), u); });
  return map;
}

// ─── Live Management overview ────────────────────────────────────────────────

/** PHP getLiveSessionsData: sessions with contest / participant counts and the overview cards. */
async function liveSessionsData(status = 'all') {
  const match = status && status !== 'all' ? { status } : {};
  const sessions = await LeagueSession.find(match).sort({ start_time: -1 }).select('old_id name market_type status start_time end_time max_stocks active').lean();
  const sessionKeys = sessions.flatMap(keysOf);
  const contests = sessionKeys.length
    ? await Contest.find({ league_session_id: { $in: sessionKeys } }).select('old_id league_session_id prize_pool status').lean()
    : [];
  const entryCounts = new Map();
  const contestKeys = contests.flatMap(keysOf);
  if (contestKeys.length) {
    const rows = await ContestEntry.aggregate([
      { $match: { contest_id: { $in: contestKeys } } },
      { $group: { _id: '$contest_id', count: { $sum: 1 } } },
    ]);
    rows.forEach((r) => entryCounts.set(String(r._id), r.count));
  }
  const entriesOf = (c) => keysOf(c).reduce((sum, k) => sum + (entryCounts.get(String(k)) || 0), 0);
  const contestsBySession = new Map();
  contests.forEach((c) => {
    const key = String(c.league_session_id);
    if (!contestsBySession.has(key)) contestsBySession.set(key, []);
    contestsBySession.get(key).push(c);
  });

  const out = sessions.map((s) => {
    const list = keysOf(s).flatMap((k) => contestsBySession.get(String(k)) || []);
    return {
      id: publicId(s),
      _id: String(s._id),
      name: s.name,
      market_type: s.market_type,
      status: s.status,
      active: s.active !== false,
      start_time: s.start_time,
      end_time: s.end_time,
      max_stocks: s.max_stocks,
      contests_count: list.length,
      participants_count: list.reduce((sum, c) => sum + entriesOf(c), 0),
      total_prize_pool: round2(list.reduce((sum, c) => sum + num(c.prize_pool), 0)),
    };
  });

  const liveSessions = await LeagueSession.find({ status: 'live' }).select('_id old_id').lean();
  const liveKeys = liveSessions.flatMap(keysOf);
  const liveContests = liveKeys.length ? await Contest.find({ league_session_id: { $in: liveKeys } }).select('prize_pool').lean() : [];
  return {
    success: true,
    sessions: out,
    live_sessions_count: liveSessions.length,
    live_contests_count: liveContests.length,
    total_participants: await ContestEntry.countDocuments({}),
    total_prize_pool: round2(liveContests.reduce((sum, c) => sum + num(c.prize_pool), 0)),
  };
}

// ─── Session actions ─────────────────────────────────────────────────────────

/** PHP startSession: upcoming → live now, contests live, and start prices captured. */
async function startSession(sessionId) {
  const session = await findSession(sessionId);
  if (!session) return { success: false, status: 404, message: 'Session not found' };
  const now = new Date();
  const updated = await LeagueSession.updateOne(
    { _id: session._id, status: { $in: ['upcoming', 'draft'] } },
    { $set: { status: 'live' } },
  );
  if (!updated.modifiedCount) return { success: false, status: 400, message: `Session is ${session.status}; only upcoming sessions can be started` };
  await Contest.updateMany(
    { league_session_id: { $in: keysOf(session) }, status: { $nin: ['cancelled', 'completed'] } },
    { $set: { status: 'live' } },
  );
  // Starting early: capture start prices now (the scheduler only does it near start_time).
  await lifecycle.captureStart({ ...session, status: 'live', start_time: now < new Date(session.start_time) ? now : session.start_time }, now);
  logger.info(`[live-management] session ${publicId(session)} started manually`);
  return { success: true, message: 'Session started successfully' };
}

/**
 * Session cancel (client request; PHP: deactivate live session → refund all users).
 * Session → cancelled + inactive, every contest cancelled with entry fees refunded.
 * Safe to repeat: finishes any contests left over from an interrupted run.
 */
async function cancelSession(sessionId, { actor = 'admin' } = {}) {
  const session = await findSession(sessionId);
  if (!session) return { success: false, status: 404, message: 'Session not found' };
  if (session.status === 'completed') {
    return { success: false, status: 400, message: 'Completed sessions cannot be cancelled (results may already be paid). Cancel individual contests instead.' };
  }
  const claimed = await LeagueSession.updateOne(
    { _id: session._id, status: { $nin: ['completed', 'cancelled'] } },
    { $set: { status: 'cancelled', active: false } },
  );
  const wasCancelled = !claimed.modifiedCount;

  let contestsCancelled = 0;
  let refunds = 0;
  const skipped = [];
  for (const contest of await Contest.find({ league_session_id: { $in: keysOf(session) } }).lean()) {
    const result = await cancelContest(contest, { reason: `session ${publicId(session)} cancelled by ${actor}` });
    if (result.success) {
      if (!result.message.startsWith('Contest already cancelled')) contestsCancelled += 1;
      refunds += result.refunded || 0;
    } else if (!result.already) {
      skipped.push(`#${publicId(contest)}: ${result.message}`);
    }
  }
  if (wasCancelled && !contestsCancelled && !refunds) {
    return { success: false, status: 400, message: 'Session already cancelled' };
  }
  logger.info(`[live-management] session ${publicId(session)} cancelled by ${actor}: ${contestsCancelled} contest(s), ${refunds} refund(s)`);
  return {
    success: true,
    message: `Session cancelled: ${contestsCancelled} contest(s) cancelled, ${refunds} entry fee refund(s) issued`
      + (skipped.length ? `. Not cancelled: ${skipped.join('; ')}` : ''),
    contests_cancelled: contestsCancelled,
    refunds,
    skipped,
  };
}

/**
 * PHP manualCompleteSession ("End & Distribute"): save final prices, complete the session
 * and its contests, and pay every contest's prizes.
 */
async function endAndDistribute(sessionId, { actor = 'admin' } = {}) {
  const session = await findSession(sessionId);
  if (!session) return { success: false, status: 404, message: 'Session not found' };
  if (session.status === 'completed') return { success: false, status: 400, message: 'Session already completed.' };
  const claimed = await LeagueSession.updateOne(
    { _id: session._id, status: { $in: ['live', 'completing'] } },
    { $set: { status: 'completing' } },
  );
  if (!claimed.modifiedCount) return { success: false, status: 400, message: `Only live sessions can be ended (session is ${session.status}).` };

  try {
    const now = new Date();
    // Step 1: final prices (fetch whatever is still missing), copied to every entry.
    const filled = await lifecycle.fillMissingPrices(session, 'end_price', now);
    const { end } = scoring.sessionPriceMaps(filled.session);
    if (Object.keys(end).length) await lifecycle.copyToEntries(filled.session, end, 'ending_prices', 'contest_ended_at', now);
    await LeagueSession.updateOne({ _id: session._id }, {
      $set: { status: 'completed', end_prices_captured_at: now, ...(session.start_prices_captured_at ? {} : { start_prices_captured_at: now }) },
    });
    await Contest.updateMany(
      { league_session_id: { $in: keysOf(session) }, status: { $nin: ['cancelled', 'completed'] } },
      { $set: { status: 'completed' } },
    );

    // Step 2: pay out contest by contest.
    const results = [];
    let paid = 0;
    for (const contest of await scoring.sessionContests(session, { prizes_distributed: { $ne: true } })) {
      try {
        const result = await payout.distributeContest(String(contest._id));
        results.push(result);
        if (result.success) paid += 1;
      } catch (err) {
        logger.error(`[live-management] payout failed for contest ${publicId(contest)}: ${err.message}`);
        results.push({ success: false, message: `Contest #${publicId(contest)}: ${err.message}` });
      }
    }
    logger.info(`[live-management] session ${publicId(session)} ended & distributed by ${actor}: ${paid} contest(s) paid`);
    const problems = results.filter((r) => !r.success).map((r) => r.message);
    return {
      success: true,
      message: `Successfully processed session! Winnings distributed for ${paid} contests.` + (problems.length ? ` Not paid: ${problems.join('; ')}` : ''),
      contests_paid: paid,
      results,
    };
  } catch (err) {
    await LeagueSession.updateOne({ _id: session._id, status: 'completing' }, { $set: { status: 'live' } });
    throw err;
  }
}

/** PHP fixOrphanedContests ("Cleanup Orphaned"): contests still live/upcoming in completed sessions. */
async function fixOrphanedContests() {
  const sessions = await LeagueSession.find({ status: 'completed' }).select('_id old_id').lean();
  const keys = sessions.flatMap(keysOf);
  if (!keys.length) return { success: true, message: 'Fixed 0 orphaned contests.', fixed: 0 };
  const result = await Contest.updateMany(
    { league_session_id: { $in: keys }, status: { $in: ['live', 'upcoming'] } },
    { $set: { status: 'completed' } },
  );
  const fixed = result.modifiedCount || 0;
  return { success: true, message: `Fixed ${fixed} orphaned contests.`, fixed };
}

/** PHP "Start Contests" button (cron all-in-one): run the session lifecycle now. */
async function runStartContests() {
  const before = await Contest.countDocuments({ status: 'live' });
  const result = await withLock('contest-automation:session-lifecycle', 5 * 60 * 1000, () => lifecycle.runSessionLifecycle());
  if (result.skipped) return { success: false, message: 'The scheduler is running this job right now; try again in a moment.' };
  const after = await Contest.countDocuments({ status: 'live' });
  return {
    success: true,
    sessions_started: (result.to_live || 0),
    contests_started: Math.max(0, after - before),
    sessions_completed: result.to_completed || 0,
  };
}

/** PHP "Update Scores" button (cron update-scores): refresh live scores now. */
async function runUpdateScores() {
  const result = await withLock('contest-automation:live-scores', 14 * 60 * 1000, () => runLiveScores());
  if (result.skipped) return { success: false, message: 'Live scores are being updated right now; try again in a moment.' };
  return { success: true, message: 'Scores updated successfully', ...result };
}

/**
 * PHP refetchMissingPrices: fetch prices that are still missing. Start prices only for
 * started sessions, end prices only for completed sessions; existing prices are kept.
 */
async function refetchMissingPrices(sessionId) {
  const session = await findSession(sessionId);
  if (!session) return { success: false, status: 404, message: 'Session not found' };
  const now = new Date();
  const fields = [];
  if (['live', 'completing', 'completed'].includes(session.status)) fields.push('start_price');
  if (session.status === 'completed') fields.push('end_price');
  if (!fields.length) return { success: false, status: 400, message: `Session is ${session.status}; prices are captured once it starts.` };

  const before = new Map((session.assets || []).filter((a) => a.asset_symbol).map((a) => [a.asset_symbol, a]));
  let current = session;
  for (const field of fields) current = (await lifecycle.fillMissingPrices(current, field, now)).session;
  const fetched = [];
  const failed = [];
  (current.assets || []).filter((a) => a.asset_symbol).forEach((asset) => {
    fields.forEach((field) => {
      const had = num((before.get(asset.asset_symbol) || {})[field]) > 0;
      const has = num(asset[field]) > 0;
      if (!had && has) fetched.push(`${asset.asset_symbol} (${field.replace('_price', '')})`);
      if (!has) failed.push(asset.asset_symbol);
    });
  });
  const { start, end } = scoring.sessionPriceMaps(current);
  if (fields.includes('start_price') && Object.keys(start).length) await lifecycle.copyToEntries(current, start, 'starting_prices', 'contest_started_at', now);
  if (fields.includes('end_price') && Object.keys(end).length) await lifecycle.copyToEntries(current, end, 'ending_prices', 'contest_ended_at', now);
  const uniqueFailed = [...new Set(failed)];
  return {
    success: true,
    fetched: fetched.length,
    failed: uniqueFailed,
    message: `Fetched ${fetched.length} missing prices` + (uniqueFailed.length ? `. Failed: ${uniqueFailed.join(', ')}` : ''),
  };
}

// ─── Detail views ────────────────────────────────────────────────────────────

/** Session + its contests with joined counts (PHP session-contests page). */
async function sessionContests(sessionId) {
  const session = await findSession(sessionId);
  if (!session) return null;
  const contests = await Contest.find({ league_session_id: { $in: keysOf(session) } }).sort({ created_at: 1 }).lean();
  for (const contest of contests) contest.joined_count = await scoring.countParticipants(contest);
  return {
    session,
    contests,
    total_participants: contests.reduce((sum, c) => sum + c.joined_count, 0),
    total_prize_pool: round2(contests.reduce((sum, c) => sum + num(c.prize_pool), 0)),
  };
}

/** PHP getContestDetails: contest with its participants ranked by score. */
async function contestDetails(contestId) {
  const contest = await findByAnyId(Contest, contestId);
  if (!contest) return null;
  const session = contest.league_session_id != null ? await findSession(contest.league_session_id) : null;
  const entries = await ContestEntry.find({ contest_id: { $in: keysOf(contest) } }).lean();
  const baskets = await scoring.basketsFor(entries);
  const users = await usersByIds(entries.map((e) => e.user_id));
  const participants = entries
    .slice()
    .sort((a, b) => (num(b.total_score) - num(a.total_score)) || (new Date(a.created_at || 0) - new Date(b.created_at || 0)))
    .map((entry, index) => {
      const basket = baskets.get(String(entry.basket_id)) || {};
      const user = users.get(String(entry.user_id)) || {};
      return {
        id: String(entry._id),
        rank: entry.rank || index + 1,
        user_id: user.old_id != null ? user.old_id : String(entry.user_id),
        user_name: user.name || 'Unknown User',
        user_email: user.email || 'N/A',
        assets: Array.isArray(basket.assets) ? basket.assets : [],
        total_score: round2(entry.total_score),
      };
    });
  return {
    success: true,
    contest: { ...contest, id: publicId(contest), session_name: session ? session.name : null, market_type: session ? session.market_type : null },
    participants,
    participants_count: participants.length,
  };
}

/** PHP getPortfolioDetails: one entry's assets with start/current prices and weighted score. */
async function portfolioDetails(entryId) {
  const entry = await findByAnyId(ContestEntry, entryId);
  if (!entry) return null;
  const basket = await findByAnyId(SavedBasket, entry.basket_id) || {};
  const user = (await usersByIds([entry.user_id])).get(String(entry.user_id)) || {};
  const contest = await findByAnyId(Contest, entry.contest_id);
  const session = contest && contest.league_session_id != null ? await findSession(contest.league_session_id) : null;
  const sessionPrices = session ? scoring.sessionPriceMaps(session) : { start: {}, end: {} };
  const own = entry.starting_prices && typeof entry.starting_prices === 'object' ? entry.starting_prices : {};
  const ending = entry.ending_prices && typeof entry.ending_prices === 'object' ? entry.ending_prices : {};
  const multipliers = Array.isArray(basket.multipliers) ? basket.multipliers : [];

  const assets = (Array.isArray(basket.assets) ? basket.assets : []).map((asset, index) => {
    const symbol = asset.symbol || asset.name || 'N/A';
    const start = num(own[symbol]) || num(sessionPrices.start[symbol]);
    const current = num(ending[symbol]) || num(sessionPrices.end[symbol]) || start;
    const m = multipliers[index]; // positional, exactly as the app's scoreAssets()
    const multiplier = num(m && typeof m === 'object' ? m.multiplier : m) || 1;
    const prediction = String((m && typeof m === 'object' && m.prediction) || 'UP').toUpperCase();
    const change = start > 0 ? ((current - start) / start) * 100 : 0;
    const directional = prediction === 'DOWN' ? -change : change;
    return {
      symbol,
      name: asset.name || symbol,
      prediction,
      multiplier,
      start_price: start,
      current_price: current,
      change_percent: round2(change),
      weighted_score: round2(directional * multiplier),
    };
  });
  return {
    success: true,
    participant: {
      id: String(entry._id),
      user_name: user.name || 'Unknown User',
      total_score: round2(entry.total_score),
      rank: entry.rank || null,
      contest_started_at: entry.contest_started_at || null,
      contest_ended_at: entry.contest_ended_at || null,
    },
    assets,
  };
}

module.exports = {
  findSession, liveSessionsData, startSession, cancelSession, endAndDistribute, fixOrphanedContests,
  runStartContests, runUpdateScores, refetchMissingPrices, sessionContests, contestDetails, portfolioDetails,
};
