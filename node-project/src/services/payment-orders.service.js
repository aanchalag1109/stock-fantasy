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
const { creditOnce } = require('./contest-automation/ledger');
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
  const users = clauses.length ? await User.find({ $or: clauses }).select('name mobile email old_id').lean() : [];
  const map = new Map();
  users.forEach((u) => { map.set(String(u._id), u); if (u.old_id != null) map.set(String(u.old_id), u); });
  return map;
}

async function claimPending(id, newStatus) {
  if (!isOid(id)) return null;
  return Payment.findOneAndUpdate({ _id: id, payment_status: 0 }, { $set: { payment_status: newStatus } });
}

/** Returns { type: 'success'|'error', message } — the flash shown by the admin page. */
async function approve(id) {
  const payment = await claimPending(id, 1);
  if (!payment) return { type: 'error', message: 'Payment not found or already processed' };
  try {
    const result = await creditOnce({
      userRef: payment.user_id,
      balance: 'deposit_balance',
      amount: num(payment.amount),
      transaction: { type: 'deposit', payment_method: 'Admin Approved', transaction_id: payment.order_id },
    });
    if (result.missingUser) {
      await Payment.updateOne({ _id: payment._id, payment_status: 1 }, { $set: { payment_status: 0 } });
      return { type: 'error', message: 'Failed to approve payment: user not found' };
    }
    if (result.duplicate) {
      logger.warn(`[payments] order ${payment.order_id} already had a deposit transaction; balance not credited again`);
      return { type: 'success', message: 'Payment approved successfully (it had already been credited)' };
    }
    notify('deposit_success', {
      user: result.user,
      dedupeKey: `deposit_success:payment:${payment.order_id}`,
      params: { amount: num(payment.amount), reference: payment.order_id },
      data: { order_id: payment.order_id },
    });
    return { type: 'success', message: 'Payment approved successfully' };
  } catch (err) {
    await Payment.updateOne({ _id: payment._id, payment_status: 1 }, { $set: { payment_status: 0 } }).catch(() => {});
    return { type: 'error', message: 'Failed to approve payment: ' + err.message };
  }
}

async function reject(id) {
  const payment = await claimPending(id, -1);
  if (!payment) return { type: 'error', message: 'Payment not found or already processed' };
  try {
    await Transaction.create({
      user_id: payment.user_id,
      type: 'deposit',
      amount: num(payment.amount),
      status: 'failed',
      payment_method: 'Admin Rejected',
      transaction_id: payment.order_id,
    });
  } catch (err) {
    if (!(err && err.code === 11000)) {
      await Payment.updateOne({ _id: payment._id, payment_status: -1 }, { $set: { payment_status: 0 } }).catch(() => {});
      return { type: 'error', message: 'Failed to reject payment: ' + err.message };
    }
  }
  // NEW IMPLEMENTATION — NODE.JS PROJECT: Automated Notifications
  notify('deposit_failed', {
    user: payment.user_id,
    dedupeKey: `deposit_failed:payment:${payment.order_id}`,
    params: { amount: payment.amount, reference: payment.order_id },
    data: { order_id: payment.order_id },
  });
  return { type: 'success', message: 'Payment rejected successfully' };
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
    if (Number(result.status) === 1 && result.data && result.data.money !== undefined) {
      return { type: 'success', message: `LG Pay Status: PAID ✓ - Amount: ₹${Number(result.data.money) / 100} - You can now approve this payment` };
    }
    if (Number(result.status) === 0) return { type: 'warning', message: 'LG Pay Status: PENDING - Payment not completed yet' };
    return { type: 'error', message: `LG Pay Status: FAILED - ${result.msg || 'Unknown error'}` };
  } catch (err) {
    return { type: 'error', message: 'Error: ' + err.message };
  }
}

module.exports = { indexFilter, usersFor, approve, reject, verify };
