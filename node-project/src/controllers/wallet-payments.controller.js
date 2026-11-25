'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: INR & USDT deposits and withdrawals for the app (client feedback)
 *   GET  /api/v1/payments/options                         per currency: rate, limits, charges, enabled
 *   POST /api/v1/deposit/quote        { currency, amount | probcoins }   ProbCoins + charges + total payable
 *   POST /api/v1/deposit/quotes       { probcoins }                      INR and USDT price of N ProbCoins at once
 *   POST /api/v1/deposit/inr/create   { user_id, amount | probcoins }    LG Pay → pay_url (JSON)
 *   GET  /api/v1/deposit/inr/status/:order_id?user_id=                   re-checks LG Pay while pending
 *   GET  /api/v1/deposit/inr/history?user_id=
 *   (USDT deposits: /api/v1/payram/... — see payram.controller.js)
 *   POST /api/v1/withdraw/quote       { currency, probcoins }            payout in INR / USDT
 *   POST /api/v1/withdraw/request     { user_id, currency, probcoins, message? }
 *   GET  /api/v1/withdraw/history?user_id=
 *   GET  /api/v1/payout-details?user_id=                                 saved UPI / bank / USDT details
 *   POST /api/v1/payout-details/inr   { user_id, otp, upi_id | account_holder_name + account_number + ifsc_code, bank_name? }
 *   POST /api/v1/payout-details/bank | /upi | /usdt | /remove   { user_id, otp, … }  (payout-details.service.js)
 * Users are identified by user_id, like the other mobile wallet APIs.
 */

const Payment = require('../models/payment.model');
const WithdrawalRequest = require('../models/withdrawal-request.model');
const logger = require('../config/logger');
const { keysOf } = require('../helpers/mobile-compat');
const quotes = require('../services/payments/quote.service');
const quotesService = quotes;
const lgpayDeposits = require('../services/payments/lgpay-deposit.service');
const withdrawals = require('../services/payments/withdrawal.service');
const payouts = require('../services/payments/payout-details.service'); // NEW IMPLEMENTATION — NODE.JS PROJECT
const settings = require('../services/deposit-withdrawal-settings.service');

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const input = (req, name) => {
  if (req.body && req.body[name] != null && req.body[name] !== '') return req.body[name];
  if (req.query && req.query[name] != null && req.query[name] !== '') return req.query[name];
  return undefined;
};
const fail = (res, status, message, extra = {}) => res.status(status).json({ success: false, error: message, message, ...extra });
const failWith = (res, result) => { const { ok, status, message, ...extra } = result; return fail(res, status, message, extra); };
const balances = (u) => ({
  wallet_balance: Math.round((num(u.deposit_balance) + num(u.winnings_balance)) * 100) / 100,
  deposit_balance: num(u.deposit_balance),
  winnings_balance: num(u.winnings_balance),
});

async function userFrom(req, res) {
  const userId = input(req, 'user_id');
  if (userId === undefined) { fail(res, 400, 'user_id is required'); return null; }
  const user = await withdrawals.findUser(userId);
  if (!user) { fail(res, 404, 'User not found'); return null; }
  return user;
}

const options = async (req, res) => {
  try {
    return res.json({ success: true, currencies: await quotes.paymentOptions() });
  } catch (err) {
    return fail(res, 500, 'Failed to load payment options');
  }
};

const depositQuote = async (req, res) => {
  try {
    const q = await quotes.depositQuote({ currency: input(req, 'currency'), amount: input(req, 'amount'), probcoins: input(req, 'probcoins') });
    if (!q.ok) return failWith(res, q);
    const { ok, ...quote } = q;
    return res.json({ success: true, quote });
  } catch (err) {
    return fail(res, 500, 'Failed to calculate the price');
  }
};

/**
 * "I want N ProbCoins" → what that costs in INR (LG Pay) and in USDT (PayRam), in one call, so the
 * app can show both options side by side. A currency that can't be used right now (limits, rate
 * not set, gateway off) comes back as { available: false, message } instead of failing the call.
 */
const depositQuotes = async (req, res) => {
  try {
    const probcoins = input(req, 'probcoins');
    if (probcoins === undefined) return fail(res, 400, 'probcoins is required');
    const quotes = {};
    for (const currency of ['INR', 'USDT']) {
      const q = await quotesService.depositQuote({ currency, probcoins });
      if (q.ok) { const { ok, ...quote } = q; quotes[currency] = { available: true, ...quote }; }
      else quotes[currency] = { available: false, message: q.message, ...(q.min_amount !== undefined ? { min_amount: q.min_amount, max_amount: q.max_amount } : {}) };
    }
    if (!quotes.INR.available && !quotes.USDT.available && /valid number of ProbCoins/.test(quotes.INR.message)) {
      return fail(res, 400, quotes.INR.message);
    }
    return res.json({ success: true, probcoins: Number(probcoins), quotes });
  } catch (err) {
    return fail(res, 500, 'Failed to calculate the price');
  }
};

const inrCreate = async (req, res) => {
  try {
    const user = await userFrom(req, res);
    if (!user) return undefined;
    const result = await lgpayDeposits.createInrDeposit({ user, amount: input(req, 'amount'), probcoins: input(req, 'probcoins'), ip: req.ip });
    if (!result.ok) return failWith(res, result);
    return res.json({ success: true, message: 'Complete the payment on the LG Pay page.', order: result.order, payment_url: result.pay_url });
  } catch (err) {
    logger.error(`[lgpay] create INR deposit failed: ${err.message}`);
    return fail(res, 500, 'Payment could not be started. Please try again.');
  }
};

const inrStatus = async (req, res) => {
  try {
    const user = await userFrom(req, res);
    if (!user) return undefined;
    let order = await Payment.findOne({ order_id: String(req.params.order_id || '') }).lean();
    if (!order || !keysOf(user).some((k) => String(k) === String(order.user_id))) return fail(res, 404, 'Order not found');
    order = (await lgpayDeposits.reconcileOrder(order)) || order;
    const fresh = await withdrawals.findUser(user._id);
    return res.json({ success: true, order: lgpayDeposits.publicOrder(order), ...balances(fresh || user) });
  } catch (err) {
    return fail(res, 500, 'Failed to load the order');
  }
};

const inrHistory = async (req, res) => {
  try {
    const user = await userFrom(req, res);
    if (!user) return undefined;
    const rows = await Payment.find({ user_id: { $in: keysOf(user) } }).sort({ created_at: -1 }).limit(50).lean();
    return res.json({ success: true, orders: rows.map(lgpayDeposits.publicOrder) });
  } catch (err) {
    return fail(res, 500, 'Failed to load INR deposits');
  }
};

const withdrawQuote = async (req, res) => {
  try {
    const q = await quotes.withdrawalQuote({ currency: input(req, 'currency'), probcoins: input(req, 'probcoins') });
    if (!q.ok) return failWith(res, q);
    const { ok, ...quote } = q;
    return res.json({ success: true, quote });
  } catch (err) {
    return fail(res, 500, 'Failed to calculate the payout');
  }
};

const withdrawRequest = async (req, res) => {
  try {
    const user = await userFrom(req, res);
    if (!user) return undefined;
    const result = await withdrawals.requestWithdrawal({ user, currency: input(req, 'currency'), probcoins: input(req, 'probcoins'), message: input(req, 'message'), payoutMethod: input(req, 'payout_method') });
    if (!result.ok) return failWith(res, result);
    return res.json({
      success: true,
      message: 'Withdrawal request submitted. Admin will process it shortly.',
      withdrawal: withdrawals.publicWithdrawal(result.withdrawal),
      ...balances(result.user),
    });
  } catch (err) {
    return fail(res, 500, 'Failed to create withdrawal request');
  }
};

const withdrawHistory = async (req, res) => {
  try {
    const user = await userFrom(req, res);
    if (!user) return undefined;
    const rows = await WithdrawalRequest.find({ user_id: { $in: keysOf(user) } }).sort({ created_at: -1 }).limit(50).lean();
    return res.json({ success: true, withdrawals: rows.map(withdrawals.publicWithdrawal) });
  } catch (err) {
    return fail(res, 500, 'Failed to load withdrawals');
  }
};

const payoutDetails = async (req, res) => {
  try {
    const user = await userFrom(req, res);
    if (!user) return undefined;
    return res.json({ success: true, ...payouts.publicDetails(user.payment_details, await settings.getWithdrawalNetwork()) });
  } catch (err) {
    return fail(res, 500, 'Failed to load payout details');
  }
};

// NEW IMPLEMENTATION — NODE.JS PROJECT: every change goes through payout-details.service.js (validation, OTP)
const savePayout = (partsOf, message) => async (req, res) => {
  try {
    const user = await userFrom(req, res);
    if (!user) return undefined;
    const body = req.body || {};
    const parts = partsOf(body);
    if (!parts) return fail(res, 400, 'type must be bank, upi or usdt.');
    const result = await payouts.save(user, parts, body.otp);
    if (!result.ok) return failWith(res, result);
    return res.json({ success: true, message, ...result.details });
  } catch (err) {
    logger.error(`[payout-details] save failed: ${err.message}`);
    return fail(res, 500, 'Failed to save payout details');
  }
};
const saveInrPayoutDetails = savePayout((b) => payouts.partsFromInrForm(b), 'INR payout details saved.');
const saveBank = savePayout((b) => ({ bank: b }), 'Bank account saved.');
const saveUpi = savePayout((b) => ({ upi: b }), 'UPI ID saved.');
const saveUsdt = savePayout((b) => ({ usdt: b }), 'USDT address saved.');
const removePayout = savePayout((b) => {
  const type = String(b.type || '').trim().toLowerCase();
  return ['bank', 'upi', 'usdt'].includes(type) ? { [type]: null } : null;
}, 'Payout details removed.');

module.exports = {
  options, depositQuote, depositQuotes, inrCreate, inrStatus, inrHistory, withdrawQuote, withdrawRequest, withdrawHistory,
  payoutDetails, saveInrPayoutDetails, saveBank, saveUpi, saveUsdt, removePayout,
};
