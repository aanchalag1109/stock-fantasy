'use strict';

/**
 * PHP PARITY — restored behaviour of Admin\ContestController::cancelContest
 * ("Contest cancelled - Entry fee refunded", contest status → cancelled), shared by:
 *   - Contests → Cancel (admin)
 *   - Session cancel (Live Management / session page / deactivating a live session)
 *   - the automated "< 10 entries" cancellation (contest-automation/results.job.js)
 *
 * NEW IMPLEMENTATION — NODE.JS PROJECT (safety, not in PHP):
 *   - The contest is claimed atomically (only one request can cancel it), so double clicks
 *     or two admins cannot refund twice.
 *   - Each refund is a transaction with a deterministic id REFUND_<contest>_E<entry> on a
 *     unique index, written before the balance changes; repeats are skipped.
 *   - An interrupted cancellation (refunds_started_at set) can be re-run to finish the
 *     remaining refunds without paying anyone twice.
 *   - No full-document save(): migrated documents that don't fit the current schema can
 *     still be cancelled.
 *   - Each entry's fee goes back to the wallet(s) it was paid from (fee_from_winnings /
 *     fee_from_deposit on the entry); entries from before that was recorded → deposit_balance,
 *     as in PHP.
 */

const Contest = require('../models/contest.model');
const ContestEntry = require('../models/contest-entry.model');
const logger = require('../config/logger');
const { keysOf, publicId, num } = require('../helpers/mobile-compat');
const { creditOnce } = require('./contest-automation/ledger');
const { notify } = require('./notifications/notification.service');

// Lazy: prize-payout pulls in scoring; only needed for completed contests.
const legacyPaid = (contest) => require('./contest-automation/prize-payout.service').legacyPaid(contest);

/**
 * Cancels a contest and refunds every entry fee.
 * @param {object} contest  contest document (lean or hydrated)
 * @param {object} [opts]
 * @param {object} [opts.claimFilter] extra conditions the contest must still meet to be claimed
 * @param {string} [opts.reason]      appended to the log line
 * @returns {Promise<{success:boolean, message:string, refunded?:number, already?:boolean}>}
 */
async function cancelContest(contest, { claimFilter = {}, reason = 'admin' } = {}) {
  const label = publicId(contest);
  const now = new Date();

  // NEW IMPLEMENTATION — NODE.JS PROJECT: a scored contest whose winnings were already paid (e.g. by
  // the PHP system, without prizes_distributed) must not also refund every entry fee.
  if ((contest.status === 'completed' || contest.is_calculated) && await legacyPaid(contest)) {
    return { success: false, message: `Contest #${label}: prizes were already paid, so it cannot be cancelled`, already_paid: true };
  }

  // Claim: only one caller moves the contest to cancelled.
  const claimed = await Contest.findOneAndUpdate(
    { _id: contest._id, status: { $ne: 'cancelled' }, prizes_distributed: { $ne: true }, ...claimFilter },
    { $set: { status: 'cancelled', refunds_started_at: now } },
  );
  if (!claimed) {
    const current = await Contest.findById(contest._id).select('status prizes_distributed refunds_started_at').lean();
    if (!current) return { success: false, message: 'Not found' };
    if (current.prizes_distributed) return { success: false, message: 'Prizes already distributed; contest cannot be cancelled' };
    // Cancelled by this service before → resume any refunds that did not complete.
    if (current.status === 'cancelled' && current.refunds_started_at) {
      const resumed = await refundEntries(contest, label);
      if (resumed > 0) return { success: true, message: `Contest already cancelled; ${resumed} pending refund(s) completed`, refunded: resumed };
    }
    return { success: false, message: 'Already cancelled', already: true };
  }

  const refunded = await refundEntries(contest, label);
  logger.info(`[contest-cancel] contest ${label} cancelled (${reason}); ${refunded} entry fee(s) refunded`);
  return { success: true, message: 'Contest cancelled and users refunded', refunded };
}

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT: what to refund for one entry. Entries that recorded how their
 * fee was paid get each part back in the wallet it came from (and exactly what was charged);
 * older entries get the contest fee back in deposit_balance, as before.
 */
function refundFor(entry, fee) {
  if (entry.fee_from_winnings != null || entry.fee_from_deposit != null) {
    const toWinnings = round2(Math.max(0, num(entry.fee_from_winnings)));
    const toDeposit = round2(Math.max(0, num(entry.fee_from_deposit)));
    return { amount: round2(toWinnings + toDeposit), toWinnings, toDeposit };
  }
  return { amount: fee, toWinnings: 0, toDeposit: fee };
}

async function refundEntries(contest, label) {
  const fee = num(contest.entry_fee);
  const entries = await ContestEntry.find({ contest_id: { $in: keysOf(contest) } })
    .select('_id old_id user_id fee_from_winnings fee_from_deposit').lean();
  let refunded = 0;
  for (const entry of entries) {
    const { amount, toWinnings, toDeposit } = refundFor(entry, fee);
    if (!(amount > 0)) continue;
    const result = await creditOnce({
      userRef: entry.user_id,
      balance: 'deposit_balance',
      amount,
      split: { winnings_balance: toWinnings, deposit_balance: toDeposit },
      transaction: {
        // NEW IMPLEMENTATION — NODE.JS PROJECT: 'refund' as in PHP, so the app lists it under the contest
        // as a refund (was 'deposit')
        type: 'refund',
        payment_method: 'Contest refund',
        contest_id: label,
        transaction_id: `REFUND_${label}_E${entry.old_id != null ? entry.old_id : entry._id}`,
        description: `Contest #${label} cancelled - Entry fee refunded`,
        from_winnings: toWinnings,
        from_deposit: toDeposit,
      },
    });
    if (!result.credited) continue;
    refunded += 1;
    notify('refund_credited', {
      user: result.user,
      dedupeKey: `refund:txn:${result.transaction._id}`,
      params: { amount, contestLabel: label, toWinnings, toDeposit },
      data: { screen: 'wallet', contest_id: label },
    });
  }
  return refunded;
}

// NEW IMPLEMENTATION — NODE.JS PROJECT: client feedback — deleting a contest or session must not
// swallow entry fees. A contest that is still open (active/live) is cancelled and refunded first;
// completed contests are left as they are (their results may already be paid; legacy contests have
// no reliable "paid" flag), exactly like PHP's plain delete.
const OPEN_STATUSES = ['active', 'live', 'upcoming'];

function isOpen(contest) {
  return OPEN_STATUSES.includes(contest.status || 'active') && contest.prizes_distributed !== true;
}

/**
 * Refunds an open contest before it is deleted or detached.
 * @returns {Promise<{ok:boolean, refunded:number, message?:string}>} ok=false → do not delete
 */
async function refundBeforeDelete(contest, { actor = 'admin' } = {}) {
  if (!isOpen(contest)) {
    // NEW IMPLEMENTATION — NODE.JS PROJECT: a completed contest whose prizes were never paid holds the
    // players' winnings; deleting it would lose them, so it must be paid or cancelled first.
    if (contest.status === 'completed' && contest.prizes_distributed !== true) {
      const entries = await ContestEntry.countDocuments({ contest_id: { $in: keysOf(contest) } });
      if (entries > 0 && !(await legacyPaid(contest))) {
        return { ok: false, refunded: 0, message: `Contest #${publicId(contest)} is completed but its prizes have not been paid. Pay them from Pending Prizes, or cancel it (refunds the entry fees), before deleting.` };
      }
    }
    return { ok: true, refunded: 0 };
  }
  const result = await cancelContest(contest, {
    claimFilter: { status: { $in: OPEN_STATUSES } },
    reason: `deleted by ${actor}`,
  });
  if (result.success) return { ok: true, refunded: result.refunded || 0 };
  // Lost a race (e.g. it just completed or was cancelled by someone else): re-check before deleting.
  const current = await Contest.findById(contest._id).select('status prizes_distributed').lean();
  if (!current || current.status === 'cancelled' || !isOpen(current)) return { ok: true, refunded: 0 };
  return { ok: false, refunded: 0, message: `Contest #${publicId(contest)}: ${result.message}` };
}

module.exports = { cancelContest, refundBeforeDelete, isOpen };
