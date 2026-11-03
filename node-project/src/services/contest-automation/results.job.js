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
 *   - fewer than MIN_PARTICIPANTS entries → contest cancelled, every entry fee refunded
 *     to deposit_balance (as PHP);
 *   - otherwise → final scores, ranks and prize rows; is_calculated = true.
 * Prizes are NOT paid here — as in PHP, an admin pays them from Pending Prizes.
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

const MIN_PARTICIPANTS = 10; // PHP: contests with fewer than 10 entries are cancelled

// Same cancellation + refund as the admin Cancel button (services/contest-cancellation.service.js);
// the claim also requires the contest to be still uncalculated.
async function cancelAndRefund(contest) {
  const result = await cancelContest(contest, {
    claimFilter: { is_calculated: { $ne: true } },
    reason: `fewer than ${MIN_PARTICIPANTS} entries`,
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
  logger.info(`[contest-automation] contest ${publicId(contest)} calculated: ${ranked.length} entries ranked (prizes pending admin payout)`);
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
  for (const session of sessions) {
    const contests = await scoring.sessionContests(session, { is_calculated: { $ne: true }, prizes_distributed: { $ne: true } });
    for (const contest of contests) {
      try {
        const participants = await scoring.countParticipants(contest);
        if (participants < MIN_PARTICIPANTS) cancelled += await cancelAndRefund(contest);
        else { await calculate(contest, session); calculated += 1; }
      } catch (err) {
        logger.error(`[contest-automation] contest ${publicId(contest)} failed: ${err.message}`);
      }
    }
  }
  return { calculated, cancelled };
}

module.exports = { runContestResults, MIN_PARTICIPANTS };
