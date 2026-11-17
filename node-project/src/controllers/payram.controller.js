'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: USDT deposits via PayRam — mobile API (LG Pay INR deposits are unchanged)
 *
 *   GET  /api/v1/payram/config                       rate, min/max, availability
 *   POST /api/v1/payram/quote          { amount }    ProbCoins for a USDT amount
 *   POST /api/v1/payram/deposit        { user_id, amount }  → payment_url to open in the app
 *   GET  /api/v1/payram/deposit/:id    ?user_id=     status (re-checked with PayRam while open)
 *   GET  /api/v1/payram/deposits       ?user_id=     the user's USDT deposits
 *   POST /api/v1/payram/webhook                      PayRam mainnet → us (registered in app.js with a raw body)
 *   POST /api/v1/payram/testnet/webhook              PayRam testnet → us (separate key)
 *
 * Users are identified by user_id, like the existing mobile deposit flow.
 */

const PayramDeposit = require('../models/payram-deposit.model');
const config = require('../config/env');
const logger = require('../config/logger');
const quotes = require('../services/payments/quote.service');
const payram = require('../services/payram/payram.client');
const deposits = require('../services/payram/payram-deposit.service');

const input = (req, name) => {
  if (req.body && req.body[name] != null && req.body[name] !== '') return req.body[name];
  if (req.query && req.query[name] != null && req.query[name] !== '') return req.query[name];
  return undefined;
};
const fail = (res, status, message, extra = {}) => res.status(status).json({ success: false, error: message, message, ...extra });

async function userFrom(req, res) {
  const userId = input(req, 'user_id');
  if (userId === undefined) { fail(res, 400, 'user_id is required'); return null; }
  const user = await deposits.findUser(userId);
  if (!user) { fail(res, 404, 'User not found'); return null; }
  return user;
}

const getConfig = async (req, res) => {
  try {
    const usdt = (await quotes.paymentOptions()).find((o) => o.currency === 'USDT');
    return res.json({
      success: true,
      currency: 'USDT',
      gateway: 'PAYRAM',
      enabled: Boolean(usdt.deposit_enabled && payram.isConfigured()),
      environment: payram.activeEnvironment(), // NEW IMPLEMENTATION — NODE.JS PROJECT: 'mainnet' | 'testnet'
      rate: usdt.rate,
      min_amount: usdt.min_deposit,
      max_amount: usdt.max_deposit,
      charge_percent: usdt.charge_percent,
      charge_fixed: usdt.charge_fixed,
      charges_bearer: usdt.charges_bearer,
      network: payram.connection().network,
    });
  } catch (err) {
    return fail(res, 500, 'Failed to load USDT deposit settings');
  }
};

/** { amount } (USDT before charges) or { probcoins } → ProbCoins, charges and total payable. */
const getQuote = async (req, res) => {
  try {
    const q = await deposits.quote(input(req, 'amount'), { probcoins: input(req, 'probcoins') });
    if (!q.ok) {
      const { ok, status, message, ...extra } = q;
      return fail(res, status, message, extra);
    }
    const { ok, ...quote } = q;
    return res.json({ success: true, ...quote, amount: q.base_amount });
  } catch (err) {
    return fail(res, 500, 'Failed to calculate ProbCoins');
  }
};

const createDeposit = async (req, res) => {
  try {
    const user = await userFrom(req, res);
    if (!user) return undefined;
    const result = await deposits.createDeposit({ user, amount: input(req, 'amount'), probcoins: input(req, 'probcoins') });
    if (!result.ok) {
      const { ok, status, message, ...extra } = result;
      return fail(res, status, message, extra);
    }
    return res.json({ success: true, message: 'Complete the payment on the PayRam page.', deposit: result.deposit, payment_url: result.deposit.payment_url });
  } catch (err) {
    logger.error(`[payram] create deposit failed: ${err.message}`);
    return fail(res, 500, 'USDT payment could not be started. Please try again.');
  }
};

const getDeposit = async (req, res) => {
  try {
    const user = await userFrom(req, res);
    if (!user) return undefined;
    const deposit = await PayramDeposit.findOne({ deposit_id: String(req.params.deposit_id || ''), user_id: user._id }).lean();
    if (!deposit) return fail(res, 404, 'Deposit not found');
    const fresh = await deposits.refreshDeposit(deposit);
    return res.json({ success: true, deposit: deposits.publicDeposit(fresh || deposit) });
  } catch (err) {
    return fail(res, 500, 'Failed to load the deposit');
  }
};

const listDeposits = async (req, res) => {
  try {
    const user = await userFrom(req, res);
    if (!user) return undefined;
    const rows = await PayramDeposit.find({ user_id: user._id }).sort({ created_at: -1 }).limit(50).lean();
    return res.json({ success: true, deposits: rows.map(deposits.publicDeposit) });
  } catch (err) {
    return fail(res, 500, 'Failed to load USDT deposits');
  }
};

/** Needs the raw body (signature) — registered in app.js before the JSON parser. */
const webhookFor = (environment) => async (req, res) => {
  try {
    const { httpStatus, body } = await deposits.handleWebhook(req.body, req.headers, environment);
    return res.status(httpStatus).json(body);
  } catch (err) {
    logger.error(`[payram:${environment}] webhook failed: ${err.message}`);
    return res.status(500).json({ message: 'Temporary error; please retry' });
  }
};
const webhook = webhookFor('mainnet');
// NEW IMPLEMENTATION — NODE.JS PROJECT: separate webhook for the PayRam testnet connection
const testnetWebhook = webhookFor('testnet');

module.exports = { getConfig, getQuote, createDeposit, getDeposit, listDeposits, webhook, testnetWebhook };
