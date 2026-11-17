'use strict';

const Payment = require('../models/payment.model');
const logger = require('../config/logger');
// NEW IMPLEMENTATION — NODE.JS PROJECT: INR ProbCoin purchases (client feedback). The LG Pay
// order, callback and return page now go through services/payments/lgpay-deposit.service.js:
// ProbCoins at the INR rate, gateway charges, credit-once without MongoDB transactions, and a
// signature-checked callback. Endpoints, parameters and redirects are unchanged.
const lgpayDeposits = require('../services/payments/lgpay-deposit.service');

const { generateSignature } = lgpayDeposits;

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
 * GET /api/v1/payment/create-order?data=   (data = base64 JSON { user_id, amount (₹), timestamp })
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

    // Validate timestamp (10 minutes)
    if (Date.now() - paymentData.timestamp > 600000) {
      return res.status(400).send('Payment link expired');
    }

    const user = await lgpayDeposits.findUser(paymentData.user_id);
    if (!user) return res.status(404).send('User not found');

    const result = await lgpayDeposits.createInrDeposit({ user, amount: paymentData.amount, ip: req.ip });
    if (!result.ok) return res.status(result.status === 502 ? 500 : result.status).send(result.message);
    return res.redirect(result.pay_url);
  } catch (err) {
    logger.error('Payment order creation exception:', err.message);
    res.status(500).send('Payment failed');
  }
};

/**
 * POST /api/v1/payment/lgpay-callback
 */
const lgpayCallback = async (req, res) => {
  try {
    logger.info('=== LGPAY CALLBACK RECEIVED ===', req.body);
    const result = await lgpayDeposits.handleCallback(req.body || {});
    logger.info(`LG Pay callback ${req.body && req.body.order_sn}: ${result.message}`);
    return res.json({ status: 'success' });
  } catch (err) {
    logger.error('Callback exception:', err.message);
    return res.json({ status: 'error' });
  }
};

/**
 * GET /api/v1/payment/return?order_id=
 */
const paymentReturn = async (req, res) => {
  const orderId = req.query.order_id;
  if (!orderId) return res.redirect('probtrade://payment-failed?error=no_order_id');
  let payment = await Payment.findOne({ order_id: String(orderId) }).lean();
  if (!payment) return res.redirect('probtrade://payment-failed?error=payment_not_found');
  try {
    payment = (await lgpayDeposits.reconcileOrder(payment)) || payment;
  } catch (err) {
    logger.error('Payment return failed:', err.message);
    return res.redirect('probtrade://payment-failed?error=wallet_update_failed');
  }
  if (Number(payment.payment_status) === lgpayDeposits.STATUS.SUCCESS) {
    return res.redirect(`probtrade://payment-success?order_id=${orderId}`);
  }
  return res.redirect(`probtrade://payment-pending?order_id=${orderId}`);
};

// generateSignature is also used by the admin Payment Orders "Verify" (PHP PARITY)
module.exports = { createOrder, lgpayCallback, paymentReturn, generateSignature };
