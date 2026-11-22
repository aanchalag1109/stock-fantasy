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

/** INR payout destination from the user's saved payment details, or null. */
function inrDestination(details = {}) {
  const upi = clean(details.upi_id);
  if (upi) return { method: 'UPI', upi_id: upi, account_holder_name: clean(details.account_holder_name) || null };
  const account = clean(details.account_number);
  const ifsc = clean(details.ifsc_code).toUpperCase();
  const holder = clean(details.account_holder_name);
  if (account && ifsc && holder) {
    return { method: 'BANK', account_holder_name: holder, account_number: account, ifsc_code: ifsc, bank_name: clean(details.bank_name) || null };
  }
  return null;
}

/**
 * @param {{ user:object, currency:string, probcoins:any, message?:string }} input
 * @returns {Promise<{ ok:true, withdrawal:object, quote:object, user:object } | { ok:false, status:number, message:string }>}
 */
async function requestWithdrawal({ user, currency, probcoins, message }) {
  if (!user) return fail(404, 'User not found');
  const quote = await withdrawalQuote({ currency, probcoins });
  if (!quote.ok) return quote;

  const details = user.payment_details || {};
  let destination;
  if (quote.currency === 'USDT') {
    if (!clean(details.usdt_wallet_address)) {
      return fail(400, 'Please add your USDT wallet address before withdrawing.', { payment_details_required: true });
    }
    destination = { usdt_wallet_address: clean(details.usdt_wallet_address), usdt_network: quote.network };
  } else {
    const inr = inrDestination(details);
    if (!inr) return fail(400, 'Please add your UPI ID or bank account details before withdrawing in INR.', { payment_details_required: true });
    destination = { payout_details: inr, usdt_wallet_address: null, usdt_network: null };
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

  const before = await WithdrawalRequest.findOneAndUpdate(
    { _id: id, status: 'pending' },
    { $set: { status, admin_message: clean(adminMessage) || null, payout_reference: reference || null, processed_at: new Date() } },
  );
  if (!before) return { type: 'error', message: 'Request already processed or not found' };

  const coins = num(before.amount);
  if (status === 'rejected') {
    const refund = await creditOnce({
      userRef: before.user_id,
      balance: 'winnings_balance',
      amount: coins,
      transaction: {
        type: 'deposit',
        transaction_id: `WDREFUND_${before._id}`,
        payment_method: 'Withdrawal refund',
        description: `Withdrawal rejected - refund${adminMessage ? ': ' + clean(adminMessage) : ''}`,
      },
    });
    if (refund.missingUser) logger.error(`[withdrawal] ${before._id} rejected but user ${before.user_id} was not found for the refund`);
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
    params: { amount: coins, reason: status === 'rejected' ? clean(adminMessage) || null : null },
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

/** What the app sees. */
function publicWithdrawal(w) {
  return {
    id: publicId(w),
    probcoins: num(w.amount),
    currency: w.currency || 'USDT',
    payout_amount: w.payout_amount != null ? w.payout_amount : null,
    rate: w.rate || null,
    status: w.status,
    usdt_wallet_address: w.usdt_wallet_address || null,
    usdt_network: w.usdt_network || null,
    payout_details: w.payout_details || null,
    payout_reference: w.payout_reference || null,
    admin_message: w.admin_message || null,
    created_at: w.created_at || null,
  };
}

/**
 * Saves the user's INR payout details (UPI and/or bank). USDT details keep using the existing
 * /payment-details/update endpoint.
 * @returns {Promise<{ ok:true, details:object } | { ok:false, status:number, message:string, errors?:object }>}
 */
async function saveInrPayoutDetails(user, body = {}) {
  const errors = {};
  const upi = clean(body.upi_id);
  const account = clean(body.account_number);
  const ifsc = clean(body.ifsc_code).toUpperCase();
  const holder = clean(body.account_holder_name);
  const bank = clean(body.bank_name);
  if (upi && !/^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$/.test(upi)) errors.upi_id = 'Enter a valid UPI ID, e.g. name@bank.';
  if (account && !/^\d{6,20}$/.test(account)) errors.account_number = 'Account number must be 6–20 digits.';
  if (ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) errors.ifsc_code = 'Enter a valid IFSC code, e.g. HDFC0001234.';
  if ((account || ifsc) && !(account && ifsc && holder)) errors.account_number = errors.account_number || 'Bank details need account holder name, account number and IFSC.';
  if (!upi && !account) errors.upi_id = 'Enter a UPI ID or bank account details.';
  if (holder.length > 100) errors.account_holder_name = 'Name is too long.';
  if (Object.keys(errors).length) return fail(422, 'Please correct the payout details.', { errors });

  const set = {
    'payment_details.upi_id': upi || null,
    'payment_details.account_holder_name': holder || null,
    'payment_details.account_number': account || null,
    'payment_details.ifsc_code': ifsc || null,
    'payment_details.bank_name': bank || null,
  };
  await User.updateOne({ _id: user._id }, { $set: set });
  return { ok: true, details: { upi_id: upi || null, account_holder_name: holder || null, account_number: account || null, ifsc_code: ifsc || null, bank_name: bank || null } };
}

module.exports = { requestWithdrawal, legacyUsdtWithdrawal, processWithdrawal, publicWithdrawal, inrDestination, saveInrPayoutDetails, findUser };
