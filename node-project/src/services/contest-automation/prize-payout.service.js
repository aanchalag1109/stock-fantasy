'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: Contest Automation (port of the PHP scheduled commands)
 * Purpose: Pay contest prizes from the admin Pending Prizes page.
 * Origin: Port of PHP Admin\PendingPrizesController (distributeContest /
 *          distributeSession / processDistribution). The Node page previously
 *          answered "not enabled".
 * Note: This feature must remain distinguishable from PHP-converted code.
 *
 * Steps (as PHP): re-score with the session's start/end prices → rank → prize rows
 * (fixed contests: stored prize_distribution; others: app's dynamic distribution) →
 * credit winnings, splitting the prizes of tied ranks equally → mark prizes_distributed.
 *
 * Duplicate protection (stronger than PHP's "sum of winnings > 0" check):
 *   - contests already marked paid, or paid through the legacy calculate-results path,
 *     are refused;
 *   - a lease (payout_started_at) stops two payouts of the same contest running at once;
 *   - each prize uses transaction_id MP_<contest>_E<entry> (unique), so a retried or
 *     interrupted payout resumes without paying anyone twice.
 */

const mongoose = require('mongoose');
const Contest = require('../../models/contest.model');
const LeagueSession = require('../../models/league-session.model');
const Transaction = require('../../models/transaction.model');
const logger = require('../../config/logger');
const { keysOf, publicId, num, round2 } = require('../../helpers/mobile-compat');
const { notify } = require('../notifications/notification.service');
const scoring = require('./contest-scoring');
const { creditOnce } = require('./ledger');

const LEASE_MS = 10 * 60 * 1000;

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function findByAnyId(Model, id) {
  const text = String(id);
  if (text.length === 24 && mongoose.isValidObjectId(text)) return Model.findById(text).lean();
  if (/^\d+$/.test(text)) return Model.findOne({ old_id: Number(text) }).lean();
  return null;
}

/** Winnings already paid outside this payout (legacy calculate-results transactions). */
function legacyPaid(contest) {
  const label = escapeRegex(publicId(contest));
  return Transaction.exists({
    type: 'winnings',
    status: 'success',
    amount: { $gt: 0 },
    $or: [
      { transaction_id: { $regex: `^CONTEST_${label}_ENTRY_` } },
      { contest_id: { $in: keysOf(contest) }, transaction_id: { $not: new RegExp(`^MP_${label}_E`) } },
    ],
  });
}

function prizeForRank(rows, rank) {
  const row = rows.find((r) => rank >= r.rank_start && rank <= r.rank_end);
  return row ? num(row.per_winner_amount) : 0;
}

async function distributeContest(contestId) {
  const contest = await findByAnyId(Contest, contestId);
  if (!contest) return { success: false, message: `Contest #${contestId} not found` };
  const label = publicId(contest);
  if (contest.status === 'cancelled') return { success: false, message: `Contest #${label} is cancelled` };
  if (contest.prizes_distributed) return { success: false, message: `Contest #${label}: prizes already distributed`, already_paid: true };

  const session = await findByAnyId(LeagueSession, contest.league_session_id);
  if (!session) return { success: false, message: `Session not found for contest #${label}` };
  if (session.status !== 'completed') return { success: false, message: `Contest #${label}: session has not completed yet` };
  const participants = await scoring.countParticipants(contest);
  if (!participants) return { success: false, message: `Contest #${label}: No participants` };
  if (await legacyPaid(contest)) return { success: false, message: `Contest #${label}: prizes were already paid`, already_paid: true };

  const { start, end } = scoring.sessionPriceMaps(session);
  if (!Object.keys(start).length || !Object.keys(end).length) {
    return { success: false, message: `Contest #${label}: Start or end prices missing` };
  }

  const now = new Date();
  const lease = await Contest.updateOne(
    { _id: contest._id, prizes_distributed: { $ne: true }, $or: [{ payout_started_at: null }, { payout_started_at: { $lt: new Date(now - LEASE_MS) } }] },
    { $set: { payout_started_at: now } },
  );
  if (!lease.modifiedCount) return { success: false, message: `Contest #${label}: a payout is already in progress` };

  try {
    const ranked = await scoring.assignRanks(await scoring.scoreEntries(await scoring.contestEntries(contest), start, end));
    const rows = await scoring.payoutPrizeRows(contest, participants);
    if (!rows.length) {
      await Contest.updateOne({ _id: contest._id }, { $set: { payout_started_at: null } });
      return { success: false, message: `Contest #${label}: Could not generate prize structure (prize pool may be 0)` };
    }

    let winners = 0;
    let total = 0;
    const done = new Set();
    for (const entry of ranked) {
      if (done.has(entry.rank)) continue;
      done.add(entry.rank);
      const tied = ranked.filter((e) => e.rank === entry.rank);
      let amount;
      if (tied.length > 1) {
        let pool = 0;
        for (let r = entry.rank; r < entry.rank + tied.length; r += 1) pool += prizeForRank(rows, r);
        amount = pool > 0 ? round2(pool / tied.length) : 0;
      } else {
        amount = round2(prizeForRank(rows, entry.rank));
      }
      if (amount <= 0) continue;

      for (const winner of tied) {
        const entryKey = winner.old_id != null ? winner.old_id : winner._id;
        const txId = `MP_${label}_E${entryKey}`;
        const result = await creditOnce({
          userRef: winner.user_id,
          balance: 'winnings_balance',
          amount,
          transaction: { type: 'winnings', contest_id: label, transaction_id: txId, description: `Won ₹${amount} in contest #${label} (Rank ${winner.rank}, Entry #${entryKey})` },
        });
        if (!result.credited) continue;
        winners += 1;
        total = round2(total + amount);
        notify('winnings_credited', {
          user: result.user,
          dedupeKey: `winnings:${txId}`,
          params: { amount, contestLabel: `${String(contest.category || '').toUpperCase()} contest #${label}`, sessionName: session.name },
          data: { screen: 'contest', contest_id: label, session_id: publicId(session), transaction_id: txId },
        });
      }
    }

    await Contest.updateOne({ _id: contest._id }, { $set: { prizes_distributed: true, is_calculated: true, payout_started_at: null } });
    return { success: true, message: `Contest #${label}: ₹${total} → ${winners} winners`, winners_count: winners, total_amount: total, contest_id: label };
  } catch (err) {
    await Contest.updateOne({ _id: contest._id }, { $set: { payout_started_at: null } }).catch(() => {});
    throw err;
  }
}

async function distributeSession(sessionId) {
  const session = await findByAnyId(LeagueSession, sessionId);
  if (!session) return { success: false, message: `Session #${sessionId} not found` };
  const results = [];
  let winners = 0;
  let total = 0;
  for (const contest of await scoring.sessionContests(session)) {
    const result = await distributeContest(String(contest._id));
    results.push(result);
    if (result.success) {
      winners += result.winners_count || 0;
      total = round2(total + (result.total_amount || 0));
    }
  }
  return {
    success: true,
    message: `Session #${publicId(session)}: ₹${total} distributed to ${winners} winners`,
    total_winners: winners,
    total_amount: total,
    contest_results: results,
  };
}

module.exports = { distributeContest, distributeSession };
