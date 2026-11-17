'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: INR ProbCoin purchases via LG Pay (client feedback)
 * Purpose: The LG Pay flow with ProbCoin conversion and gateway charges.
 *   - Order: amount (₹, before charges) → ProbCoins = amount × INR rate; charges added when the
 *     user pays them; LG Pay is asked to collect the total payable.
 *   - Confirmation (LG Pay callback, return page, admin Approve): credits the order's ProbCoins
 *     exactly once — the order is claimed atomically (status 0/3/4 → 1) and the ledger writes the
 *     transaction (transaction_id = order id, unique) before the balance $inc. No MongoDB
 *     multi-document transactions: the deployment is a standalone server where they fail, which
 *     made every LG Pay callback abort before crediting.
 *   - A callback with a bad signature is not trusted: the order is checked with LG Pay's order
 *     query instead (the old code only logged the mismatch and credited anyway).
 *   - Orders created before this change (no `probcoins`) are still credited 1:1.
 * Endpoints, URLs, parameters and the MD5 signature are unchanged.
 */

const crypto = require('crypto');
const axios = require('axios');
const mongoose = require('mongoose');
const Payment = require('../../models/payment.model');
const User = require('../../models/user.model');
const config = require('../../config/env');
const logger = require('../../config/logger');
const { creditOnce } = require('../contest-automation/ledger');
const { notify } = require('../notifications/notification.service');
const { depositQuote } = require('./quote.service');

const STATUS = { PENDING: 0, SUCCESS: 1, REVIEW: 3, PROCESSING: 4, FAILED: -1 };
const SETTLEABLE = [STATUS.PENDING, STATUS.REVIEW, STATUS.PROCESSING];
const STATUS_LABEL = { 0: 'pending', 1: 'success', 3: 'review', 4: 'processing', '-1': 'failed' };
const LGPAY = config.LGPAY;

/** Same MD5 signature as PHP. */
function generateSignature(params) {
  const p = { ...params };
  delete p.sign;
  const sorted = Object.keys(p).sort().reduce((acc, k) => { acc[k] = p[k]; return acc; }, {});
  const queryStr = Object.entries(sorted).map(([k, v]) => `${k}=${v}`).join('&');
  return crypto.createHash('md5').update(`${queryStr}&key=${LGPAY.secretKey}`).digest('hex').toUpperCase();
}

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
/** ProbCoins an order credits (orders from before the conversion: ₹ amount 1:1). */
const coinsOf = (order) => (order.probcoins != null ? num(order.probcoins) : num(order.amount));

async function findUser(ref) {
  if (ref === undefined || ref === null || ref === '') return null;
  const id = String(ref);
  if (id.length === 24 && mongoose.isValidObjectId(id)) return User.findById(id).select('_id old_id').lean();
  if (/^\d+$/.test(id)) return User.findOne({ old_id: Number(id) }).select('_id old_id').lean();
  return null;
}

function publicOrder(o) {
  return {
    order_id: o.order_id,
    gateway: 'LGPAY',
    currency: 'INR',
    status: STATUS_LABEL[o.payment_status] || 'pending',
    probcoins: coinsOf(o),
    rate: o.rate || null,
    base_amount: o.base_amount != null ? o.base_amount : o.amount,
    charges: o.charges || 0,
    charges_bearer: o.charges_bearer || null,
    total_payable: o.amount,
    created_at: o.created_at || null,
    credited_at: o.credited_at || null,
  };
}

/**
 * Creates the order and the LG Pay payment page.
 * @returns {Promise<{ ok:true, order:object, pay_url:string } | { ok:false, status:number, message:string }>}
 */
async function createInrDeposit({ user, amount, probcoins, ip }) {
  if (!user) return { ok: false, status: 404, message: 'User not found' };
  const quote = await depositQuote({ currency: 'INR', amount, probcoins });
  if (!quote.ok) return quote;

  const orderId = `ORD${Date.now()}${Math.floor(Math.random() * 9000 + 1000)}`;
  const order = await Payment.create({
    order_id: orderId,
    user_id: user._id,
    amount: quote.total_payable,
    payment_status: STATUS.PENDING,
    currency: 'INR',
    probcoins: quote.probcoins,
    rate: quote.rate,
    base_amount: quote.base_amount,
    charges: quote.charges,
    charges_bearer: quote.charges_bearer,
  });
  // NEW IMPLEMENTATION — NODE.JS PROJECT: Automated Notifications (event off by default: order awaiting payment)
  notify('deposit_initiated', { user: user._id, dedupeKey: `deposit_initiated:${orderId}`, params: { amount: quote.probcoins, reference: orderId }, data: { order_id: orderId } });

  const params = {
    app_id: LGPAY.appId,
    trade_type: 'INRUPI',
    order_sn: orderId,
    money: Math.round(quote.total_payable * 100),
    notify_url: LGPAY.notifyUrl,
    return_url: `${config.APP_URL}/api/v1/payment/return?order_id=${orderId}`,
    ip: ip || '127.0.0.1',
  };
  params.sign = generateSignature(params);
  logger.info('Calling LG Pay API', { params });
  try {
    const response = await axios.post(`${LGPAY.baseUrl}/api/order/create`, new URLSearchParams(params).toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 30000,
    });
    logger.info('LG Pay response:', { status: response.status, data: response.data });
    if (response.status === 200 && response.data && response.data.status === 1) {
      return { ok: true, order: publicOrder(order.toObject ? order.toObject() : order), pay_url: response.data.data.pay_url, quote };
    }
  } catch (err) {
    logger.error('LG Pay create order failed:', err.message);
  }
  await Payment.updateOne({ _id: order._id, payment_status: STATUS.PENDING }, { $set: { payment_status: STATUS.FAILED, review_reason: 'LG Pay could not create the payment' } });
  return { ok: false, status: 502, message: 'Payment creation failed' };
}

/**
 * Credits the order's ProbCoins once. Safe to call from every confirmation path.
 * @returns {Promise<{ credited:boolean, already?:boolean, error?:string }>}
 */
async function settleOrder(order, { source, paidAmount } = {}) {
  const claimed = await Payment.findOneAndUpdate(
    { _id: order._id, payment_status: { $in: SETTLEABLE } },
    { $set: { payment_status: STATUS.SUCCESS, credited_at: new Date(), ...(paidAmount != null ? { paid_amount: paidAmount } : {}) } },
  );
  if (!claimed) return { credited: false, already: true };
  const coins = coinsOf(claimed);
  try {
    const result = await creditOnce({
      userRef: claimed.user_id,
      balance: 'deposit_balance',
      amount: coins,
      transaction: {
        type: 'deposit',
        payment_method: source === 'admin' ? 'Admin Approved' : 'LG Pay (INR)',
        transaction_id: claimed.order_id,
        description: claimed.probcoins != null
          ? `INR deposit via LG Pay: ₹${claimed.amount} → ${coins} ProbCoins (rate ${claimed.rate})`
          : 'Deposit via LG Pay',
        currency: 'INR',
        currency_amount: claimed.amount,
        rate: claimed.rate || null,
      },
    });
    if (result.missingUser) {
      await Payment.updateOne({ _id: claimed._id }, { $set: { payment_status: STATUS.REVIEW, credited_at: null, review_reason: 'User not found when crediting' } });
      return { credited: false, error: 'user not found' };
    }
    if (result.duplicate) return { credited: false, already: true };
    logger.info('Payment callback processed successfully', { orderId: claimed.order_id, probcoins: coins, source });
    // NEW IMPLEMENTATION — NODE.JS PROJECT: Automated Notifications — deduped per order (callback retries / return page / admin)
    notify('deposit_success', { user: claimed.user_id, dedupeKey: `deposit_success:payment:${claimed.order_id}`, params: { amount: coins, reference: claimed.order_id }, data: { order_id: claimed.order_id } });
    return { credited: true };
  } catch (err) {
    await Payment.updateOne({ _id: claimed._id, payment_status: STATUS.SUCCESS }, { $set: { payment_status: claimed.payment_status, credited_at: null } }).catch(() => {});
    logger.error(`[lgpay] crediting ${claimed.order_id} failed: ${err.message}`);
    return { credited: false, error: err.message };
  }
}

/** LG Pay's own view of the order. @returns {Promise<{ state:'paid'|'pending'|'failed'|'unknown', money?:number }>} */
async function queryOrder(orderId) {
  const params = { app_id: LGPAY.appId, order_sn: orderId };
  try {
    const response = await axios.get(`${LGPAY.baseUrl}/api/order/query`, {
      params: { ...params, sign: generateSignature(params) },
      timeout: 10000,
      validateStatus: () => true,
    });
    const result = response.status === 200 ? response.data : null;
    if (!result || typeof result !== 'object' || result.status === undefined) return { state: 'unknown' };
    if (Number(result.status) === 1 && result.data && Number(result.data.status) === 1) {
      return { state: 'paid', money: result.data.money !== undefined ? Number(result.data.money) / 100 : undefined };
    }
    if (Number(result.status) === 1 || Number(result.status) === 0) return { state: 'pending' };
    return { state: 'failed' };
  } catch (err) {
    return { state: 'unknown' };
  }
}

/** Paid less than the order total → hold for an admin instead of crediting. */
async function settleIfFullyPaid(order, paid, source) {
  if (paid != null && paid + 0.001 < num(order.amount)) {
    await Payment.updateOne(
      { _id: order._id, payment_status: { $in: [STATUS.PENDING, STATUS.PROCESSING] } },
      { $set: { payment_status: STATUS.REVIEW, paid_amount: paid, review_reason: `Underpaid: LG Pay reports ₹${paid} for an order of ₹${order.amount}` } },
    );
    return { credited: false, review: true };
  }
  return settleOrder(order, { source, paidAmount: paid != null ? paid : null });
}

/** Re-checks an open order with LG Pay and credits it when paid (return page, app status, admin). */
async function reconcileOrder(order) {
  if (!order || ![STATUS.PENDING, STATUS.PROCESSING].includes(order.payment_status)) return order;
  const result = await queryOrder(order.order_id);
  if (result.state === 'paid') await settleIfFullyPaid(order, result.money, 'lgpay_query');
  return Payment.findById(order._id).lean();
}

/** POST /payment/lgpay-callback body. */
async function handleCallback(body = {}) {
  const orderId = body.order_sn ? String(body.order_sn) : '';
  if (!orderId) return { message: 'order_sn missing' };
  const order = await Payment.findOne({ order_id: orderId }).lean();
  if (!order || ![STATUS.PENDING, STATUS.PROCESSING].includes(order.payment_status)) return { message: 'unknown or already processed' };

  const validSign = body.sign && String(body.sign).toUpperCase() === generateSignature(body);
  if (validSign && parseInt(body.status, 10) === 1) {
    const paid = body.money !== undefined && body.money !== '' ? Number(body.money) / 100 : null;
    await settleIfFullyPaid(order, Number.isFinite(paid) ? paid : null, 'lgpay_callback');
    return { message: 'processed' };
  }
  if (!validSign) logger.warn('LG Pay callback signature mismatch; checking the order with LG Pay instead', { orderId });
  else logger.warn('Payment status not success', { status: body.status });
  await reconcileOrder(order);
  return { message: 'checked' };
}

module.exports = {
  STATUS, STATUS_LABEL, generateSignature, createInrDeposit, settleOrder, queryOrder, reconcileOrder,
  handleCallback, publicOrder, coinsOf, findUser,
};
