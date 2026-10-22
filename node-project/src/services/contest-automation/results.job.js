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
const { publicId, num } = require('../../helpers/mobile-compat');
const { notify } = require('../notifications/notification.service');
const scoring = require('./contest-scoring');
const { creditOnce } = require('./ledger');

const MIN_PARTICIPANTS = 10; // PHP: contests with fewer than 10 entries are cancelled

async function cancelAndRefund(contest) {
  // Claim atomically: only one run/process may cancel and refund a contest.
  const claimed = await Contest.findOneAndUpdate(
    { _id: contest._id, status: { $ne: 'cancelled' }, is_calculated: { $ne: true }, prizes_distributed: { $ne: true } },
    { $set: { status: 'cancelled', is_calculated: true } },
  );
  if (!claimed) return 0;

  const fee = num(contest.entry_fee);
  const label = publicId(contest);
  let refunded = 0;
  if (fee > 0) {
    for (const entry of await scoring.contestEntries(contest)) {
      const txId = `REFUND_${label}_E${entry.old_id != null ? entry.old_id : entry._id}`;
      const result = await creditOnce({
        userRef: entry.user_id,
        balance: 'deposit_balance',
        amount: fee,
        transaction: { type: 'deposit', contest_id: label, transaction_id: txId, description: `Contest #${label} cancelled - Entry fee refunded` },
      });
      if (!result.credited) continue;
      refunded += 1;
      notify('refund_credited', { user: result.user, dedupeKey: `refund:txn:${result.transaction._id}`, params: { amount: fee, contestLabel: label }, data: { screen: 'wallet', contest_id: label } });
    }
  }
  logger.info(`[contest-automation] contest ${label} cancelled (<${MIN_PARTICIPANTS} entries); ${refunded} entry fee(s) refunded`);
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
