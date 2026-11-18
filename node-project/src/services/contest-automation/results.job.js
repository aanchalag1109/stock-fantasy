'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: Contest Automation (port of the PHP scheduled commands)
 * Purpose: Final scores, ranks and prize structure for contests of completed sessions.
 * Origin: Port of PHP `contest:calculate-performance` (CalculateContestPerformance, every 2 min).
 * Note: This feature must remain distinguishable from PHP-converted code.
 *
 * For each contest of a completed session whose prices the automation captured:
 *   - fewer than the contest's minimum players (default 10, as PHP; see contest-formats.js)
 *     → contest cancelled, every entry fee refunded to deposit_balance;
 *   - otherwise → final scores, ranks and prize rows; is_calculated = true.
 * NEW IMPLEMENTATION — NODE.JS PROJECT: when Contest Settings → "Declare results automatically"
 * is on (default), prizes are paid right after scoring; otherwise an admin pays them from
 * Pending Prizes, as in PHP.
 *
 * Fixes over PHP (which ran this on every completed session every 2 minutes):
 *   - each contest is processed once (PHP re-refunded cancelled contests on every run);
 *   - final scores use the captured end prices only (PHP fell back to the live price,
 *     so scores kept drifting after the session ended);
 *   - only sessions with both start_prices_captured_at and end_prices_captured_at, so
 *     historical/migrated contests are never cancelled, refunded or re-scored.
 */

const LeagueSession = require('../../models/league-session.model');
const Contest = require('../../models/contest.model');
const logger = require('../../config/logger');
const { publicId } = require('../../helpers/mobile-compat');
const scoring = require('./contest-scoring');
const { cancelContest } = require('../contest-cancellation.service');
// NEW IMPLEMENTATION — NODE.JS PROJECT: Fantasy contest formats — per-contest minimum players
// and automatic result declaration (prize payout) when the admin setting is on.
const formats = require('../contest-formats');
const contestSettings = require('../contest-settings.service');
const payout = require('./prize-payout.service');

// PHP: contests with fewer than 10 entries are cancelled. Still the default for the existing
// types; new types use their own minimum (H2H 2, WTA 2, Nx N) or the admin's value.
const MIN_PARTICIPANTS = formats.LEGACY_MIN_PARTICIPANTS;

// Same cancellation + refund as the admin Cancel button (services/contest-cancellation.service.js);
// the claim also requires the contest to be still uncalculated.
async function cancelAndRefund(contest, minimum) {
  const result = await cancelContest(contest, {
    claimFilter: { is_calculated: { $ne: true } },
    reason: `fewer than ${minimum} entries`,
  });
  if (!result.success) return 0;
  await Contest.updateOne({ _id: contest._id }, { $set: { is_calculated: true } });
  return 1;
}

async function calculate(contest, session) {
  const { start, end } = scoring.sessionPriceMaps(session);
  const entries = await scoring.contestEntries(contest);
  const ranked = await scoring.assignRanks(await scoring.scoreEntries(entries, start, end));
  if (!scoring.isFixedPrize(contest)) await scoring.savePrizeRows(contest, entries.length);
  await Contest.updateOne({ _id: contest._id, is_calculated: { $ne: true } }, { $set: { is_calculated: true } });
  logger.info(`[contest-automation] contest ${publicId(contest)} calculated: ${ranked.length} entries ranked`);
}

// NEW IMPLEMENTATION — NODE.JS PROJECT: declare the result — pay prizes right after scoring.
// distributeContest() is idempotent (lease + one transaction id per entry), so a failure here
// leaves the contest on Pending Prizes for the admin, and nobody is ever paid twice.
async function declareResult(contest) {
  try {
    const result = await payout.distributeContest(String(contest._id));
    if (result.success) logger.info(`[contest-automation] ${result.message}`);
    else if (!result.already_paid) logger.warn(`[contest-automation] contest ${publicId(contest)} not paid automatically: ${result.message}`);
    return result.success ? 1 : 0;
  } catch (err) {
    logger.error(`[contest-automation] contest ${publicId(contest)} automatic payout failed: ${err.message}`);
    return 0;
  }
}

async function runContestResults() {
  const sessions = await LeagueSession.find({
    status: 'completed',
    start_prices_captured_at: { $ne: null },
    end_prices_captured_at: { $ne: null },
    run_all_active: { $ne: true }, // PHP PARITY: a RUN ALL job pays this session itself
  }).lean();
  let calculated = 0;
  let cancelled = 0;
  let paid = 0;
  const { auto_declare_results: autoDeclare } = sessions.length ? await contestSettings.getSettings() : {};
  for (const session of sessions) {
    const contests = await scoring.sessionContests(session, { is_calculated: { $ne: true }, prizes_distributed: { $ne: true } });
    for (const contest of contests) {
      try {
        const participants = await scoring.countParticipants(contest);
        const minimum = formats.minParticipantsFor(contest);
        if (participants < minimum) cancelled += await cancelAndRefund(contest, minimum);
        else {
          await calculate(contest, session);
          calculated += 1;
          if (autoDeclare) paid += await declareResult(contest);
        }
      } catch (err) {
        logger.error(`[contest-automation] contest ${publicId(contest)} failed: ${err.message}`);
      }
    }
  }
  return { calculated, cancelled, paid };
}

module.exports = { runContestResults, MIN_PARTICIPANTS };
