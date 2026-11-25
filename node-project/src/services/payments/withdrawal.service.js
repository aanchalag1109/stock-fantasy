'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: ProbCoin withdrawals paid out in INR or USDT (client feedback)
 * Purpose: Request and process withdrawals without MongoDB multi-document transactions (the
 *          deployment is a standalone MongoDB, where they fail).
 *
 *   requestWithdrawal: quote (rate + per-currency limits) → the user's payout details are
 *     checked (USDT: wallet address; INR: UPI id or full bank details) → winnings are deducted
 *     with a guarded atomic $inc (never below zero) → WithdrawalRequest + pending ledger
 *     transaction WD_<id>. If the request cannot be saved, the deduction is undone.
 *   processWithdrawal (admin): claimed atomically (pending → approved / rejected).
 *     approve → the admin pays out manually and records the UTR / transaction hash.
 *     reject  → ProbCoins refunded to winnings exactly once (transaction WDREFUND_<id>).
 */

const mongoose = require('mongoose');
const WithdrawalRequest = require('../../models/withdrawal-request.model');
const User = require('../../models/user.model');
const Transaction = require('../../models/transaction.model');
const logger = require('../../config/logger');
const { ensureOldId, publicId } = require('../../helpers/mobile-compat');
const { creditOnce } = require('../contest-automation/ledger');
const { notify } = require('../notifications/notification.service');
const { withdrawalQuote } = require('./quote.service');
const payoutDetails = require('./payout-details.service'); // NEW IMPLEMENTATION — NODE.JS PROJECT
const kyc = require('../kyc.service'); // NEW IMPLEMENTATION — NODE.JS PROJECT

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const clean = (v) => (v == null ? '' : String(v).trim());
const fail = (status, message, extra = {}) => ({ ok: false, status, message, ...extra });

async function findUser(ref) {
  if (ref === undefined || ref === null || ref === '') return null;
  const id = String(ref);
  if (id.length === 24 && mongoose.isValidObjectId(id)) return User.findById(id).lean();
  if (/^\d+$/.test(id)) return User.findOne({ old_id: Number(id) }).lean();
  return null;
}

/**
 * @param {{ user:object, currency:string, probcoins:any, message?:string, payoutMethod?:'BANK'|'UPI' }} input
 * @returns {Promise<{ ok:true, withdrawal:object, quote:object, user:object } | { ok:false, status:number, message:string }>}
 */
async function requestWithdrawal({ user, currency, probcoins, message, payoutMethod }) {
  if (!user) return fail(404, 'User not found');
  const quote = await withdrawalQuote({ currency, probcoins });
  if (!quote.ok) return quote;

  // NEW IMPLEMENTATION — NODE.JS PROJECT (client feedback): approved KYC is required to withdraw
  let verified;
  try { verified = await kyc.checkWithdrawal(user); } catch (err) {
    logger.error(`[withdrawal] KYC check failed for user ${user._id}: ${err.message}`);
    return fail(503, 'Withdrawals are temporarily unavailable. Please try again later.');
  }
  if (!verified.ok) return verified;

  const details = user.payment_details || {};
  let destination;
  if (quote.currency === 'USDT') {
    // NEW IMPLEMENTATION — NODE.JS PROJECT: the address must fit the network admin pays on
    const problem = payoutDetails.usdtProblem(details, quote.network);
    if (problem) return fail(400, problem, { payment_details_required: true, network: quote.network });
    destination = { usdt_wallet_address: clean(details.usdt_wallet_address), usdt_network: quote.network };
  } else {
    // NEW IMPLEMENTATION — NODE.JS PROJECT: bank or UPI, the player's choice when both are saved
    const inr = payoutDetails.chooseInr(details, payoutMethod);
    if (!inr.ok) return inr;
    destination = { payout_details: inr.destination, usdt_wallet_address: null, usdt_network: null };
  }

  const coins = quote.probcoins;
  const debit = await User.updateOne({ _id: user._id, winnings_balance: { $gte: coins } }, { $inc: { winnings_balance: -coins } });
  if (!debit.modifiedCount) {
    return fail(400, 'Insufficient winnings balance. Only winnings can be withdrawn.', { winnings_balance: num(user.winnings_balance) });
  }

  let withdrawal;
  try {
    withdrawal = await WithdrawalRequest.create({
      user_id: user._id,
      amount: coins,
      status: 'pending',
      message: message || null,
      currency: quote.currency,
      rate: quote.rate,
      payout_amount: quote.payout_amount,
      ...destination,
    });
    await ensureOldId(WithdrawalRequest, withdrawal);
    const to = quote.currency === 'USDT'
      ? `${quote.payout_amount} USDT (${quote.network})`
      : `₹${quote.payout_amount} (${destination.payout_details.method})`;
    await Transaction.create({
      user_id: user._id,
      type: 'withdrawal',
      amount: coins,
      status: 'pending',
      transaction_id: `WD_${withdrawal._id}`,
      currency: quote.currency,
      currency_amount: quote.payout_amount,
      rate: quote.rate,
      description: `Withdrawal request #${publicId(withdrawal)}: ${coins} ProbCoins → ${to}`,
    });
  } catch (err) {
    if (!withdrawal) await User.updateOne({ _id: user._id }, { $inc: { winnings_balance: coins } });
    logger.error(`[withdrawal] request failed for user ${user._id}: ${err.message}`);
    return fail(500, 'Failed to create withdrawal request. Please try again.');
  }

  notify('withdrawal_submitted', { user: user._id, dedupeKey: `withdrawal_submitted:${withdrawal._id}`, params: { amount: coins }, data: { screen: 'withdrawals', withdrawal_id: publicId(withdrawal) } });
  const fresh = await User.findById(user._id).lean();
  return { ok: true, withdrawal: withdrawal.toObject ? withdrawal.toObject() : withdrawal, quote, user: fresh || user };
}

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT: the older endpoints POST /withdraw-amount and /wallet/withdraw
 * (USDT payout; `amount` = ProbCoins). They used to compare the ProbCoins with the ₹ limits and skip
 * the conversion; now they are the same request as POST /withdraw/request with currency USDT
 * (ProbCoins → USDT at the admin rate, USDT limits, payout recorded, guarded debit).
 * @returns {Promise<{ status:number, body:object, result?:object }>} legacy-shaped error body or the result
 */
async function legacyUsdtWithdrawal({ user, amount, message }) {
  if (!user) return { status: 404, body: { success: false, error: 'User not found', message: 'User not found' } };
  const result = await requestWithdrawal({ user, currency: 'USDT', probcoins: amount, message });
  if (!result.ok) {
    const { ok, status, message: text, ...extra } = result;
    return { status: status || 400, body: { success: false, error: text, message: text, ...extra } };
  }
  return { status: 200, result };
}

/**
 * Admin decision. action: 'approve' | 'reject'.
 * @returns {Promise<{ type:'success'|'error', message:string }>}
 */
async function processWithdrawal(id, { action, adminMessage, payoutReference, admin }) {
  const status = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : null;
  if (!status) return { type: 'error', message: 'Unknown action' };
  if (!mongoose.isValidObjectId(String(id))) return { type: 'error', message: 'Request already processed or not found' };
  const reference = clean(payoutReference).slice(0, 200);

  let before = await WithdrawalRequest.findOneAndUpdate(
    { _id: id, status: 'pending' },
    { $set: {
      status, admin_message: clean(adminMessage) || null, payout_reference: reference || null, processed_at: new Date(),
      ...(status === 'rejected' ? { refund_state: 'pending' } : {}),
    } },
  );
  let reason = clean(adminMessage) || null;
  // NEW IMPLEMENTATION — NODE.JS PROJECT: rejected, but the refund did not finish → Reject again finishes it
  // (creditOnce never pays it twice). Only for requests that recorded refund_state.
  if (!before && status === 'rejected') {
    before = await WithdrawalRequest.findOne({ _id: id, status: 'rejected', refund_state: 'pending' }).lean();
    if (before) reason = before.admin_message || null;
  }
  if (!before) return { type: 'error', message: 'Request already processed or not found' };

  const coins = num(before.amount);
  if (status === 'rejected') {
    let refund;
    try {
      refund = await creditOnce({
        userRef: before.user_id,
        balance: 'winnings_balance',
        amount: coins,
        transaction: {
          // NEW IMPLEMENTATION — NODE.JS PROJECT: 'refund' as in PHP (was 'deposit'), so the app shows a refund
          type: 'refund',
          transaction_id: `WDREFUND_${before._id}`,
          payment_method: 'Withdrawal refund',
          description: `Withdrawal #${publicId(before)} rejected - amount refunded${reason ? ': ' + reason : ''}`,
        },
      });
    } catch (err) {
      logger.error(`[withdrawal] ${before._id} rejected but the refund did not finish: ${err.message}`);
      return { type: 'error', message: 'Withdrawal rejected, but the refund did not finish. Open the request and press Retry Refund.' };
    }
    if (refund.missingUser || (refund.duplicate && refund.existing && refund.existing.status === 'failed')) {
      logger.error(`[withdrawal] ${before._id} rejected but not refunded (user ${before.user_id}${refund.missingUser ? ' not found' : ', failed refund row'})`);
      return { type: 'error', message: refund.missingUser ? 'Withdrawal rejected, but the user was not found, so nothing was refunded.' : 'Withdrawal rejected, but its refund row is marked failed. Check the player\'s wallet.' };
    }
    await WithdrawalRequest.updateOne({ _id: before._id, status: 'rejected' }, { $set: { refund_state: 'done' } })
      .catch((err) => logger.warn(`[withdrawal] ${before._id} refunded but not marked done: ${err.message}`));
  }
  const ledgerStatus = status === 'approved' ? 'success' : 'failed';
  const synced = await Transaction.updateOne({ transaction_id: `WD_${before._id}` }, { $set: { status: ledgerStatus } });
  if (!(synced && synced.matchedCount)) {
    // NEW IMPLEMENTATION — NODE.JS PROJECT: older endpoints wrote the ledger row without WD_<id>;
    // find it by its description ("Withdrawal request #<id> …") so it does not stay pending.
    const refs = [String(before._id), before.old_id != null ? String(before.old_id) : null].filter(Boolean);
    await Transaction.updateOne({
      type: 'withdrawal',
      status: 'pending',
      user_id: before.user_id,
      description: { $regex: `^Withdrawal request #(${refs.join('|')}) ` },
    }, { $set: { status: ledgerStatus, transaction_id: `WD_${before._id}` } });
  }
  logger.info(`[withdrawal] ${before._id} ${status} by ${admin || 'admin'}${reference ? ` (ref ${reference})` : ''}`);

  // NEW IMPLEMENTATION — NODE.JS PROJECT: Automated Notifications — one per withdrawal and outcome
  notify(`withdrawal_${status}`, {
    user: before.user_id,
    dedupeKey: `withdrawal_${status}:${before._id}`,
    params: { amount: coins, reason: status === 'rejected' ? reason : null },
    data: { screen: 'withdrawals', withdrawal_id: String(before._id) },
  });
  if (status === 'rejected') return { type: 'success', message: 'Withdrawal rejected. Amount refunded.' };
  const currency = before.currency || 'USDT';
  const payout = before.payout_amount != null ? (currency === 'INR' ? `₹${before.payout_amount}` : `${before.payout_amount} USDT`) : null;
  return {
    type: 'success',
    message: payout
      ? `Withdrawal accepted. Please send ${payout} to the user${currency === 'INR' ? '' : "'s wallet"}.`
      : 'Withdrawal accepted. Please send USDT to user wallet.',
  };
}

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT: the status the app understands. The app was built on the PHP
 * API, where an accepted withdrawal is 'accepted'; Node stores 'approved' — shown as 'accepted'.
 */
const appStatus = (status) => (status === 'approved' ? 'accepted' : status || 'pending');
const STATUS_LABEL = { pending: 'Pending', accepted: 'Accepted', rejected: 'Rejected' };
const statusLabel = (status) => STATUS_LABEL[appStatus(status)] || appStatus(status);
/** Every status meaning "accepted by an admin" (Node and PHP rows), for queries. */
const ACCEPTED_STATUSES = ['approved', 'accepted'];

/** What the app sees. */
function publicWithdrawal(w) {
  return {
    id: publicId(w),
    probcoins: num(w.amount),
    currency: w.currency || 'USDT',
    payout_amount: w.payout_amount != null ? w.payout_amount : null,
    rate: w.rate || null,
    status: appStatus(w.status),
    status_label: statusLabel(w.status),
    usdt_wallet_address: w.usdt_wallet_address || null,
    usdt_network: w.usdt_network || null,
    payout_details: payoutDetails.maskDestination(w.payout_details), // never the full account number
    payout_reference: w.payout_reference || null,
    admin_message: w.admin_message || null,
    created_at: w.created_at || null,
  };
}

module.exports = {
  requestWithdrawal, legacyUsdtWithdrawal, processWithdrawal, publicWithdrawal, findUser,
  appStatus, statusLabel, ACCEPTED_STATUSES,
};
