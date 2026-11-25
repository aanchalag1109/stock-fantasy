'use strict';

/**
 * PHP PARITY — Payment Orders admin actions, ported from PHP Admin\PaymentController
 * (index search, approve, reject, verify). The Node conversion only changed payment_status:
 * Approve credited nothing, Reject recorded nothing and Verify set status 4 instead of asking
 * LG Pay.
 *
 * Same as PHP:
 *   approve — pending (0) only → status 1, amount added to deposit_balance, deposit transaction
 *             (status success, payment_method "Admin Approved", transaction_id = order id)
 *   reject  — pending (0) only → status -1, deposit transaction (status failed,
 *             payment_method "Admin Rejected", transaction_id = order id)
 *   verify  — read-only query of LG Pay's /api/order/query; reports PAID / PENDING / FAILED
 *   search  — order id OR user name / mobile / email
 *
 * NEW IMPLEMENTATION — NODE.JS PROJECT (safety, not in PHP):
 *   - the pending check is atomic (findOneAndUpdate on payment_status 0), so a double click or two
 *     admins cannot approve the same order twice;
 *   - the deposit transaction (unique transaction_id = order id) is written before the balance
 *     changes, so an order is never credited twice;
 *   - the search text is matched literally (PHP LIKE), not as a regular expression.
 */

const axios = require('axios');
const mongoose = require('mongoose');
const Payment = require('../models/payment.model');
const User = require('../models/user.model');
const Transaction = require('../models/transaction.model');
const config = require('../config/env');
const logger = require('../config/logger');
const { generateSignature } = require('../controllers/payment.controller');
// NEW IMPLEMENTATION — NODE.JS PROJECT: INR ProbCoin purchases
const lgpayDeposits = require('./payments/lgpay-deposit.service');
const { cancelPendingCredit } = require('./contest-automation/ledger');
const { notify } = require('./notifications/notification.service');

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const isOid = (v) => String(v).length === 24 && mongoose.isValidObjectId(String(v));

/** Mongo filter for the index page: status + search over order id and the user's name/mobile/email. */
async function indexFilter({ search = '', status = '' } = {}) {
  const filter = {};
  if (status !== '' && status != null) filter.payment_status = Number(status);
  const text = String(search || '').trim();
  if (text) {
    const like = new RegExp(escapeRegex(text), 'i');
    const users = await User.find({ $or: [{ name: like }, { mobile: like }, { email: like }] }).select('_id old_id').limit(500).lean();
    const userKeys = users.flatMap((u) => (u.old_id != null ? [u._id, u.old_id] : [u._id]));
    filter.$or = [{ order_id: like }, ...(userKeys.length ? [{ user_id: { $in: userKeys } }] : [])];
  }
  return filter;
}

/** Users for the listed payments, keyed by String(id) — accepts ObjectId and legacy numeric ids. */
async function usersFor(payments) {
  const ids = [...new Set(payments.map((p) => p.user_id).filter((id) => id != null).map(String))];
  const oids = ids.filter(isOid);
  const olds = ids.filter((id) => /^\d+$/.test(id) && id.length < 24).map(Number);
  const clauses = [];
  if (oids.length) clauses.push({ _id: { $in: oids } });
  if (olds.length) clauses.push({ old_id: { $in: olds } });
  const users = clauses.length ? await User.find({ $or: clauses }).select('name mobile email old_id deposit_balance winnings_balance').lean() : [];
  const map = new Map();
  users.forEach((u) => { map.set(String(u._id), u); if (u.old_id != null) map.set(String(u.old_id), u); });
  return map;
}

// NEW IMPLEMENTATION — NODE.JS PROJECT: orders an admin may still decide — pending, needs review
// (underpaid), processing.
const OPEN = [0, 3, 4];

const rejectedText = (payment) => `INR deposit rejected - nothing was credited (Order ${payment.order_id})`;
const noteOf = (v) => String(v == null ? '' : v).trim().slice(0, 300) || null;
/** Who decided, when and why — shown on Deposit Orders → View. */
const decisionSet = (decision, { admin, note } = {}) => ({ decision, decided_by: admin || 'admin', decided_at: new Date(), admin_note: noteOf(note) });
const saveDecision = (payment, decision, by) => Payment.updateOne({ _id: payment._id }, { $set: decisionSet(decision, by) })
  .catch((err) => logger.warn(`[payments] decision on ${payment.order_id} not saved: ${err.message}`));

async function claimPending(id, newStatus) {
  if (!isOid(id)) return null;
  return Payment.findOneAndUpdate({ _id: id, payment_status: { $in: OPEN } }, { $set: { payment_status: newStatus } });
}

/**
 * Returns { type: 'success'|'error', message } — the flash shown by the admin page.
 * NEW IMPLEMENTATION — NODE.JS PROJECT: credits the order's ProbCoins (INR rate; orders from before
 * the conversion 1:1) through the same credit-once path as the LG Pay callback.
 */
async function approve(id, by = {}) {
  const payment = isOid(id) ? await Payment.findOne({ _id: id, payment_status: { $in: OPEN } }).lean() : null;
  if (!payment) return { type: 'error', message: 'Payment not found or already processed' };
  const result = await lgpayDeposits.settleOrder(payment, { source: 'admin' });
  if (result.credited || result.already) await saveDecision(payment, 'approved', by);
  if (result.credited) return { type: 'success', message: 'Payment approved successfully' };
  if (result.already) {
    logger.warn(`[payments] order ${payment.order_id} already had a deposit transaction; balance not credited again`);
    return { type: 'success', message: 'Payment approved successfully (it had already been credited)' };
  }
  if (result.error === 'user not found') return { type: 'error', message: 'Failed to approve payment: user not found' };
  return { type: 'error', message: 'Failed to approve payment: ' + result.error };
}

async function reject(id, by = {}) {
  const payment = await claimPending(id, -1);
  if (!payment) return { type: 'error', message: 'Payment not found or already processed' };
  try {
    await Transaction.create({
      user_id: payment.user_id,
      type: 'deposit',
      amount: lgpayDeposits.coinsOf(payment),
      currency: 'INR',
      currency_amount: num(payment.amount),
      status: 'failed',
      payment_method: 'Admin Rejected',
      transaction_id: payment.order_id,
      description: rejectedText(payment),
    });
  } catch (err) {
    const reopen = (set) => Payment.updateOne({ _id: payment._id, payment_status: -1 }, { $set: set }).catch(() => {});
    if (!(err && err.code === 11000)) {
      await reopen({ payment_status: payment.payment_status });
      return { type: 'error', message: 'Failed to reject payment: ' + err.message };
    }
    // NEW IMPLEMENTATION — NODE.JS PROJECT: the order already has a history row. It used to be ignored, so a
    // rejected order could keep a "success" row. An unfinished credit is stopped for good; money that did
    // reach the wallet is never reported as rejected.
    let found;
    try {
      found = await cancelPendingCredit(payment.order_id, { payment_method: 'Admin Rejected', description: rejectedText(payment) });
    } catch (lookupErr) {
      await reopen({ payment_status: payment.payment_status });
      return { type: 'error', message: 'Failed to reject payment: ' + lookupErr.message };
    }
    if (found.state === 'none') {
      await reopen({ payment_status: payment.payment_status });
      return { type: 'error', message: 'Failed to reject payment. Please try again.' };
    }
    if (found.state === 'applied') {
      await reopen({ payment_status: 1, credited_at: payment.credited_at || new Date() });
      return { type: 'error', message: 'Not rejected: this deposit had already reached the wallet. The order is now marked Success.' };
    }
    if (found.state === 'settled' && found.row.status !== 'failed') {
      await reopen({ payment_status: 3, review_reason: 'The wallet history already shows this deposit as successful. Check the wallet before deciding.' });
      return { type: 'error', message: "Not rejected: the wallet history already shows this deposit as successful. Moved to Needs review; check the player's wallet first." };
    }
  }
  await saveDecision(payment, 'rejected', by);
  // NEW IMPLEMENTATION — NODE.JS PROJECT: Automated Notifications
  notify('deposit_failed', {
    user: payment.user_id,
    dedupeKey: `deposit_failed:payment:${payment.order_id}`,
    params: { amount: lgpayDeposits.coinsOf(payment), reference: payment.order_id },
    data: { order_id: payment.order_id },
  });
  return { type: 'success', message: 'Payment rejected successfully' };
}

/** Everything Deposit Orders → View shows, or null. */
async function detail(id) {
  const payment = isOid(id) ? await Payment.findById(id).lean() : null;
  if (!payment) return null;
  const [users, transaction] = await Promise.all([usersFor([payment]), Transaction.findOne({ transaction_id: payment.order_id }).lean()]);
  return { payment, user: users.get(String(payment.user_id)) || null, transaction: transaction || null, decidable: OPEN.includes(Number(payment.payment_status)) };
}

/** Orders per status tab, for the same search. */
async function statusCounts(search) {
  const keys = ['', 0, 3, 4, 1, -1];
  const totals = await Promise.all(keys.map(async (status) => Payment.countDocuments(await indexFilter({ search, status }))));
  return Object.fromEntries(keys.map((k, n) => [k === '' ? 'all' : String(k), totals[n]]));
}

/** Read-only LG Pay order query (PHP verify). Never changes the payment. */
async function verify(id) {
  const payment = isOid(id) ? await Payment.findById(id).lean() : null;
  if (!payment) return { type: 'error', message: 'Payment not found' };
  try {
    const params = { app_id: config.LGPAY.appId, order_sn: payment.order_id };
    const response = await axios.get(`${config.LGPAY.baseUrl}/api/order/query`, {
      params: { ...params, sign: generateSignature(params) },
      timeout: 10000,
      validateStatus: () => true,
    });
    if (response.status !== 200) return { type: 'error', message: `Failed to connect to LG Pay (HTTP ${response.status})` };
    const result = response.data;
    if (!result || typeof result !== 'object' || result.status === undefined) return { type: 'error', message: 'Invalid response from LG Pay' };
    // NEW IMPLEMENTATION — NODE.JS PROJECT: result.status only says the query worked. PAID needs the order's own
    // status (data.status), the same rule as the automatic check; before, an amount alone was enough.
    if (Number(result.status) === 1) {
      const data = result.data && typeof result.data === 'object' ? result.data : {};
      const amount = data.money !== undefined && Number.isFinite(Number(data.money)) ? Number(data.money) / 100 : null;
      const amountText = amount != null ? ` - Amount: ₹${amount}` : '';
      if (data.status === undefined || data.status === null || data.status === '') {
        return { type: 'warning', message: `LG Pay Status: NOT CONFIRMED${amountText} - LG Pay did not say whether this order is paid. Check it in LG Pay before accepting.` };
      }
      if (Number(data.status) !== 1) return { type: 'warning', message: `LG Pay Status: NOT PAID${amountText} - Do not accept this payment yet` };
      if (amount != null && amount + 0.001 < num(payment.amount)) {
        return { type: 'warning', message: `LG Pay Status: PAID LESS - received ₹${amount} for an order of ₹${payment.amount}` };
      }
      return { type: 'success', message: `LG Pay Status: PAID ✓${amountText} - You can now approve this payment` };
    }
    if (Number(result.status) === 0) return { type: 'warning', message: 'LG Pay Status: PENDING - Payment not completed yet' };
    return { type: 'error', message: `LG Pay Status: FAILED - ${result.msg || 'Unknown error'}` };
  } catch (err) {
    return { type: 'error', message: 'Error: ' + err.message };
  }
}

module.exports = { indexFilter, usersFor, approve, reject, verify, detail, statusCounts };
