'use strict';

const axios = require('axios');
const crypto = require('crypto');
const mongoose = require('mongoose');
const Payment = require('../models/payment.model');
const User = require('../models/user.model');
const Transaction = require('../models/transaction.model');
const config = require('../config/env');
const logger = require('../config/logger');
// NEW IMPLEMENTATION — NODE.JS PROJECT: Automated Notifications
const { notify } = require('../services/notifications/notification.service');
// NEW IMPLEMENTATION — NODE.JS PROJECT: admin-configured deposit limits
const { checkTransactionAmount } = require('../services/deposit-withdrawal-settings.service');

const LGPAY = config.LGPAY;

function generateSignature(params) {
  const p = { ...params };
  delete p.sign;
  const sorted = Object.keys(p).sort().reduce((acc, k) => { acc[k] = p[k]; return acc; }, {});
  const queryStr = Object.entries(sorted).map(([k, v]) => `${k}=${v}`).join('&');
  const str = `${queryStr}&key=${LGPAY.secretKey}`;
  return crypto.createHash('md5').update(str).digest('hex').toUpperCase();
}

function decryptData(encryptedData) {
  try {
    const urlDecoded = decodeURIComponent(encryptedData);
    const base64Decoded = Buffer.from(urlDecoded, 'base64').toString('utf-8');
    const data = JSON.parse(base64Decoded);
    if (!data || !data.user_id || !data.amount) return null;
    return data;
  } catch (e) {
    logger.error('Decryption error:', e.message);
    return null;
  }
}

/**
 * GET /api/v1/payment/create-order?data=
 */
const createOrder = async (req, res) => {
  try {
    logger.info('=== PAYMENT ORDER CREATION STARTED ===');
    const encryptedData = req.query.data;
    if (!encryptedData) {
      logger.error('No payment data received');
      return res.status(400).send('No payment data received');
    }

    const paymentData = decryptData(encryptedData);
    if (!paymentData) {
      logger.error('Invalid payment data');
      return res.status(400).send('Invalid payment data');
    }

    const { user_id: userId, timestamp } = paymentData;

    // Validate timestamp (10 minutes)
    const currentTime = Date.now();
    if (currentTime - timestamp > 600000) {
      return res.status(400).send('Payment link expired');
    }

    // NEW IMPLEMENTATION — NODE.JS PROJECT: enforce deposit limits before the order
    // is stored or LG Pay is called. Callback/return only settle orders checked here.
    const check = await checkTransactionAmount('deposit', paymentData.amount);
    if (!check.ok) return res.status(check.status).send(check.message);
    const amount = check.amount;

    const user = await User.findById(userId);
    if (!user) return res.status(404).send('User not found');

    const orderId = `ORD${Date.now()}${Math.floor(Math.random() * 9000 + 1000)}`;

    await Payment.create({
      order_id: orderId,
      user_id: userId,
      amount,
      payment_status: 0,
    });
    // NEW IMPLEMENTATION — NODE.JS PROJECT: Automated Notifications (event off by default: order awaiting payment)
    notify('deposit_initiated', { user: userId, dedupeKey: `deposit_initiated:${orderId}`, params: { amount, reference: orderId }, data: { order_id: orderId } });

    const params = {
      app_id: LGPAY.appId,
      trade_type: 'INRUPI',
      order_sn: orderId,
      money: Math.floor(amount * 100),
      notify_url: `http://probtrade.com/api/v1/payment/lgpay-callback`,
      return_url: `${config.APP_URL}/api/v1/payment/return?order_id=${orderId}`,
      ip: req.ip || '127.0.0.1',
    };
    params.sign = generateSignature(params);

    logger.info('Calling LG Pay API', { params });

    const response = await axios.post(`${LGPAY.baseUrl}/api/order/create`, new URLSearchParams(params).toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 30000,
    });

    logger.info('LG Pay response:', { status: response.status, data: response.data });

    if (response.status === 200 && response.data?.status === 1) {
      return res.redirect(response.data.data.pay_url);
    }

    return res.status(500).send('Payment creation failed');
  } catch (err) {
    logger.error('Payment order creation exception:', err.message);
    res.status(500).send('Payment failed');
  }
};

/**
 * POST /api/v1/payment/lgpay-callback
 */
const lgpayCallback = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    logger.info('=== LGPAY CALLBACK RECEIVED ===', req.body);
    session.startTransaction();

    const { order_sn: orderId, status, sign } = req.body;

    // Verify signature
    const expectedSign = generateSignature(req.body);
    if (sign !== expectedSign) {
      logger.warn('Signature mismatch (proceeding for testing)', { received: sign, expected: expectedSign });
    }

    const order = await Payment.findOne({ order_id: orderId }).session(session);
    if (!order || order.payment_status !== 0) {
      await session.abortTransaction();
      return res.json({ status: 'success' });
    }

    if (parseInt(status) === 1) {
      order.payment_status = 1;
      await order.save({ session });

      const user = await User.findById(order.user_id).session(session);
      if (user) {
        user.deposit_balance = (user.deposit_balance || 0) + order.amount;
        await user.save({ session });
      }

      await Transaction.create([{
        user_id: order.user_id,
        type: 'deposit',
        amount: order.amount,
        transaction_id: orderId,
        description: 'Deposit via LG Pay',
        status: 'success',
      }], { session });

      await session.commitTransaction();
      logger.info('Payment callback processed successfully', { orderId, amount: order.amount });
      // NEW IMPLEMENTATION — NODE.JS PROJECT: Automated Notifications — confirmed by LG Pay; deduped per order (callback retries / return page)
      notify('deposit_success', { user: order.user_id, dedupeKey: `deposit_success:payment:${orderId}`, params: { amount: order.amount, reference: orderId }, data: { order_id: orderId } });
    } else {
      await session.abortTransaction();
      logger.warn('Payment status not success', { status });
    }

    return res.json({ status: 'success' });
  } catch (err) {
    await session.abortTransaction();
    logger.error('Callback exception:', err.message);
    res.json({ status: 'error' });
  } finally {
    session.endSession();
  }
};

/**
 * GET /api/v1/payment/return?order_id=
 */
const paymentReturn = async (req, res) => {
  const orderId = req.query.order_id;
  if (!orderId) return res.redirect('probtrade://payment-failed?error=no_order_id');
  const payment = await Payment.findOne({ order_id: orderId });
  if (!payment) return res.redirect('probtrade://payment-failed?error=payment_not_found');
  if (Number(payment.payment_status) === 1) {
    return res.redirect(`probtrade://payment-success?order_id=${orderId}`);
  }
  try {
    const params = { app_id: LGPAY.appId, order_sn: orderId };
    const sign = generateSignature(params);
    const response = await axios.get(`${LGPAY.baseUrl}/api/order/query`, {
      params: { ...params, sign },
      timeout: 10000,
      validateStatus: () => true,
    });
    const result = response.status === 200 ? response.data : null;
    if (result && Number(result.status) === 1 && result.data && Number(result.data.status) === 1) {
      payment.payment_status = 1;
      await payment.save();
      const user = await User.findById(payment.user_id);
      if (user) {
        user.deposit_balance = (user.deposit_balance || 0) + payment.amount;
        await user.save();
      }
      await Transaction.create({
        user_id: payment.user_id,
        type: 'deposit',
        amount: payment.amount,
        status: 'success',
        transaction_id: orderId,
        description: 'Deposit via LG Pay',
      });
      // NEW IMPLEMENTATION — NODE.JS PROJECT: Automated Notifications — confirmed by the LG Pay order query; same key as the callback
      notify('deposit_success', { user: payment.user_id, dedupeKey: `deposit_success:payment:${orderId}`, params: { amount: payment.amount, reference: orderId }, data: { order_id: orderId } });
      return res.redirect(`probtrade://payment-success?order_id=${orderId}`);
    }
  } catch (err) {
    logger.error('Payment return failed:', err.message);
    return res.redirect('probtrade://payment-failed?error=wallet_update_failed');
  }
  return res.redirect(`probtrade://payment-pending?order_id=${orderId}`);
};

module.exports = { createOrder, lgpayCallback, paymentReturn };
