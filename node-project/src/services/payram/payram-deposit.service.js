'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: USDT deposits via PayRam
 * Purpose: Create USDT deposits, process PayRam webhooks and credit ProbCoins once a payment is
 *          verified. Independent of LG Pay (own collection: payram_deposits).
 *
 * Flow
 *   1. createDeposit: amount (USDT) → rate from ProbCoin Conversion (USDT → ProbCoin) → deposit
 *      record (pending) → PayRam payment link (invoiceID = deposit_id) → link returned to the app.
 *   2. PayRam calls the webhook (authenticated by X-Payram-Signature or API-Key), or the app polls
 *      the status endpoint. Either way the payment is re-read from PayRam's API before anything is
 *      credited: state FILLED/OVER_FILLED, currency USDT, amount = our amount, invoice = our deposit.
 *   3. Credit exactly once: the deposit is claimed atomically (pending/partially_paid → credited)
 *      and the ledger writes transaction PAYRAM_<deposit_id> (unique index) before the balance
 *      $inc — concurrent or repeated webhooks cannot credit twice. MongoDB here is a standalone
 *      server, so multi-document transactions are not available; this is the atomic equivalent
 *      used elsewhere in the project (services/contest-automation/ledger.js).
 */

const mongoose = require('mongoose');
const PayramDeposit = require('../../models/payram-deposit.model');
const User = require('../../models/user.model');
const config = require('../../config/env');
const logger = require('../../config/logger');
const { creditOnce } = require('../contest-automation/ledger');
const probcoinConversion = require('../probcoin-conversion.service');
const payram = require('./payram.client');

const OPEN_STATUSES = ['pending', 'partially_paid'];
const AMOUNT_RE = /^\d{1,9}(\.\d{1,2})?$/;
const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const round2 = (n) => Math.round(Number(n) * 100) / 100;
const EPSILON = 0.000001;
// PayRam states (docs + SDK). PAID / EXPIRED appear in the SDK's description of paymentState.
const PAID_STATES = ['FILLED', 'OVER_FILLED', 'PAID'];
const CANCELLED_STATES = ['CANCELLED', 'EXPIRED'];

const fail = (status, message, extra = {}) => ({ ok: false, status, message, ...extra });

async function findUser(ref) {
  if (ref === undefined || ref === null || ref === '') return null;
  const id = String(ref);
  if (id.length === 24 && mongoose.isValidObjectId(id)) return User.findById(id).select('_id old_id email').lean();
  if (/^\d+$/.test(id)) return User.findOne({ old_id: Number(id) }).select('_id old_id email').lean();
  return null;
}

/**
 * ProbCoins for a USDT amount at the admin-configured rate (ProbCoin Conversion page).
 * @returns {Promise<{ ok:true, amount:number, rate:number, probcoins:number, min:number, max:number } | { ok:false, status:number, message:string }>}
 */
async function quote(rawAmount) {
  const str = rawAmount === undefined || rawAmount === null ? '' : String(rawAmount).trim();
  const { minDepositUsdt: min, maxDepositUsdt: max } = config.PAYRAM;
  if (!AMOUNT_RE.test(str) || Number(str) <= 0) return fail(400, 'Enter a valid USDT amount (up to 2 decimal places).', { min_amount: min, max_amount: max });
  const amount = Number(str);
  if (amount < min) return fail(400, `Minimum USDT deposit is ${min} USDT.`, { min_amount: min, max_amount: max });
  if (amount > max) return fail(400, `Maximum USDT deposit is ${max} USDT.`, { min_amount: min, max_amount: max });
  const converted = await probcoinConversion.convert('USDT', str);
  if (converted.error) return fail(503, 'USDT deposits are not available right now (conversion rate not configured).');
  if (!(converted.probcoin > 0)) return fail(400, 'This amount is too small to buy any ProbCoins.');
  return { ok: true, amount, rate: converted.rate, probcoins: converted.probcoin, min, max };
}

const newDepositId = () => `PRM${Date.now()}${Math.floor(Math.random() * 9000 + 1000)}`;

function customerEmail(user) {
  const email = String(user.email || '').trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return email;
  return `user-${user.old_id != null ? user.old_id : user._id}@users.probtrade.app`;
}

/** What the app sees. */
function publicDeposit(d) {
  return {
    deposit_id: d.deposit_id,
    gateway: 'PAYRAM',
    currency: 'USDT',
    amount: d.amount,
    rate: d.rate,
    probcoins: d.probcoins,
    status: d.status,
    payment_url: d.status === 'pending' || d.status === 'partially_paid' ? d.payment_url : null,
    reference_id: d.reference_id || null,
    filled_amount: d.filled_amount != null ? d.filled_amount : null,
    created_at: d.created_at || null,
    credited_at: d.credited_at || null,
  };
}

/**
 * Creates the deposit and the PayRam payment link.
 * @returns {Promise<{ ok:true, deposit:object } | { ok:false, status:number, message:string }>}
 */
async function createDeposit({ user, amount }) {
  if (!user) return fail(404, 'User not found');
  if (!payram.isConfigured()) return fail(503, 'USDT deposits are not available right now.');
  const q = await quote(amount);
  if (!q.ok) return q;

  const depositId = newDepositId();
  const deposit = await PayramDeposit.create({
    deposit_id: depositId,
    user_id: user._id,
    gateway: 'PAYRAM',
    currency: 'USDT',
    amount: q.amount,
    rate: q.rate,
    probcoins: q.probcoins,
    network: config.PAYRAM.network || null,
    status: 'pending',
  });

  const link = await payram.createPayment({
    invoiceId: depositId,
    customerId: user.old_id != null ? user.old_id : user._id,
    customerEmail: customerEmail(user),
    amountUsd: q.amount,
    network: config.PAYRAM.network || undefined,
  });
  if (!link.ok) {
    await PayramDeposit.updateOne({ _id: deposit._id }, { $set: { status: 'failed', failure_reason: link.message } });
    logger.warn(`[payram] deposit ${depositId} could not be started: ${link.message}`);
    return fail(502, 'USDT payment could not be started. Please try again later.', { reason: link.code || undefined });
  }

  await PayramDeposit.updateOne({ _id: deposit._id }, { $set: { reference_id: link.reference_id, payment_url: link.url } });
  logger.info(`[payram] deposit ${depositId} created: ${q.amount} USDT → ${q.probcoins} ProbCoins, ref ${link.reference_id}`);
  return { ok: true, deposit: publicDeposit({ ...deposit.toObject(), reference_id: link.reference_id, payment_url: link.url }) };
}

async function logEvent(deposit, entry) {
  await PayramDeposit.updateOne(
    { _id: deposit._id },
    { $push: { webhook_log: { $each: [{ received_at: new Date(), ...entry }], $slice: -50 } } },
  ).catch((err) => logger.warn(`[payram] could not log event for ${deposit.deposit_id}: ${err.message}`));
}

async function toReview(deposit, reason, extra = {}) {
  const res = await PayramDeposit.updateOne(
    { _id: deposit._id, status: { $in: OPEN_STATUSES } },
    { $set: { status: 'review', review_reason: reason, ...extra } },
  );
  if (res.modifiedCount) logger.warn(`[payram] deposit ${deposit.deposit_id} needs review: ${reason}`);
  return 'review';
}

/**
 * Credits the ProbCoins once. Returns 'credited' | 'already' | 'retry' | 'review'.
 * fromStatuses: statuses the deposit may be claimed from (an admin can also credit 'review').
 */
async function credit(deposit, verification, { fromStatuses = OPEN_STATUSES, paymentMethod = 'PayRam (USDT)', extraSet = {} } = {}) {
  const transactionId = `PAYRAM_${deposit.deposit_id}`;
  const claimed = await PayramDeposit.findOneAndUpdate(
    { _id: deposit._id, status: { $in: fromStatuses } },
    { $set: { status: 'credited', credited_at: new Date(), transaction_id: transactionId, verification, ...extraSet } },
  );
  if (!claimed) return 'already';
  try {
    const result = await creditOnce({
      userRef: claimed.user_id,
      balance: 'deposit_balance',
      amount: claimed.probcoins,
      transaction: {
        type: 'deposit',
        payment_method: paymentMethod,
        transaction_id: transactionId,
        transaction_reference: claimed.reference_id,
        description: `USDT deposit via PayRam: ${claimed.amount} USDT → ${claimed.probcoins} ProbCoins (rate ${claimed.rate})`,
      },
    });
    if (result.missingUser) {
      await PayramDeposit.updateOne({ _id: claimed._id }, { $set: { status: 'review', credited_at: null, review_reason: 'User not found when crediting' } });
      return 'review';
    }
    if (result.duplicate) return 'already';
    logger.info(`[payram] deposit ${claimed.deposit_id} credited ${claimed.probcoins} ProbCoins to user ${claimed.user_id}`);
    return 'credited';
  } catch (err) {
    // Undo the claim so the next webhook retry / status check can credit it.
    await PayramDeposit.updateOne({ _id: claimed._id, status: 'credited' }, { $set: { status: claimed.status, credited_at: null, transaction_id: null } }).catch(() => {});
    logger.error(`[payram] crediting ${claimed.deposit_id} failed: ${err.message}`);
    return 'retry';
  }
}

/**
 * Reads the payment from PayRam's API and applies it. Nothing is credited without this check.
 * @returns {Promise<{ result:string, retry?:boolean }>}
 */
async function verifyAndApply(deposit, { source, authenticatedBy = null, webhook = null }) {
  const check = await payram.getPayment(deposit.reference_id);
  if (!check.ok) {
    await logEvent(deposit, { source, status: webhook ? String(webhook.status || '') : null, authenticated_by: authenticatedBy, result: `verification failed: ${check.message}` });
    return { result: 'verification_unavailable', retry: true };
  }
  const data = check.data;
  const state = String(data.paymentState || '').toUpperCase();
  const amountInUsd = num(data.amountInUSD);
  const filledUsd = num(data.filledAmountInUSD != null ? data.filledAmountInUSD : (webhook && webhook.filled_amount_in_usd));
  const filled = num(data.filledAmount != null ? data.filledAmount : (webhook && webhook.filled_amount));
  const currency = String(data.currencySymbol || (webhook && webhook.currency) || '').toUpperCase();
  const txHashes = webhook && Array.isArray(webhook.payment_info) ? webhook.payment_info.map((p) => p && p.transaction_hash).filter(Boolean) : [];
  const progress = {
    payram_state: state,
    ...(filled != null ? { filled_amount: filled } : {}),
    ...(filledUsd != null ? { filled_amount_in_usd: filledUsd } : {}),
    ...(txHashes.length ? { tx_hashes: txHashes } : {}),
  };

  let result;
  if (data.invoiceID && String(data.invoiceID) !== deposit.deposit_id) {
    result = await toReview(deposit, `PayRam invoice ${data.invoiceID} does not match deposit ${deposit.deposit_id}`, progress);
  } else if (amountInUsd != null && Math.abs(amountInUsd - deposit.amount) > EPSILON) {
    result = await toReview(deposit, `PayRam amount ${amountInUsd} does not match deposit amount ${deposit.amount} USDT`, progress);
  } else if (PAID_STATES.includes(state)) {
    if (currency && currency !== 'USDT') {
      result = await toReview(deposit, `Paid in ${currency} instead of USDT`, progress);
    } else if (filledUsd != null && filledUsd + 0.01 < deposit.amount) {
      result = await toReview(deposit, `PayRam reports ${state} but only ${filledUsd} USD of ${deposit.amount} was received`, progress);
    } else {
      await PayramDeposit.updateOne({ _id: deposit._id, status: { $in: OPEN_STATUSES } }, { $set: progress });
      result = await credit(deposit, {
        verified_at: new Date(), payment_state: state, amount_in_usd: amountInUsd, filled_amount_in_usd: filledUsd, currency: currency || null,
      });
      if (result === 'credited' && state === 'OVER_FILLED') {
        await PayramDeposit.updateOne({ _id: deposit._id }, { $set: { review_reason: `Overpaid: received ${filledUsd != null ? filledUsd : '?'} USD for a ${deposit.amount} USDT deposit; ProbCoins credited for ${deposit.amount} USDT.` } });
      }
    }
  } else if (state === 'PARTIALLY_FILLED') {
    await PayramDeposit.updateOne({ _id: deposit._id, status: { $in: OPEN_STATUSES } }, { $set: { status: 'partially_paid', ...progress } });
    result = 'partially_paid';
  } else if (CANCELLED_STATES.includes(state)) {
    if ((filledUsd || 0) > 0 || (filled || 0) > 0) {
      result = await toReview(deposit, `Payment ${state.toLowerCase()} after receiving ${filledUsd != null ? filledUsd : filled} of ${deposit.amount} USDT`, progress);
    } else {
      await PayramDeposit.updateOne({ _id: deposit._id, status: { $in: OPEN_STATUSES } }, { $set: { status: 'cancelled', ...progress } });
      result = 'cancelled';
    }
  } else {
    await PayramDeposit.updateOne({ _id: deposit._id, status: { $in: OPEN_STATUSES } }, { $set: progress });
    result = state === 'OPEN' ? 'pending' : `ignored state ${state || '(none)'}`;
  }

  await logEvent(deposit, {
    source,
    status: webhook ? String(webhook.status || '') : state,
    authenticated_by: authenticatedBy,
    filled_amount: filled != null ? String(filled) : null,
    filled_amount_in_usd: filledUsd != null ? String(filledUsd) : null,
    result: `${result} (PayRam API: ${state})`,
  });
  return { result, retry: result === 'retry' };
}

/**
 * Handles POST /api/v1/payram/webhook.
 * @param {Buffer} rawBody exact request bytes
 * @param {object} headers
 * @returns {Promise<{ httpStatus:number, body:object }>}
 */
async function handleWebhook(rawBody, headers) {
  const auth = payram.verifyWebhook(rawBody, headers);
  if (!auth.ok) {
    logger.warn(`[payram] webhook rejected (${auth.method ? `bad ${auth.method}` : 'no signature or API-Key'})`);
    return { httpStatus: 401, body: { message: 'Unauthorized' } };
  }
  let payload;
  try {
    payload = JSON.parse(Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody || ''));
  } catch (err) {
    return { httpStatus: 400, body: { message: 'Invalid JSON' } };
  }
  const referenceId = payload && payload.reference_id ? String(payload.reference_id) : '';
  if (!referenceId) return { httpStatus: 400, body: { message: 'reference_id is required' } };

  const deposit = await PayramDeposit.findOne({ reference_id: referenceId }).lean();
  if (!deposit) {
    logger.warn(`[payram] webhook for unknown reference ${referenceId} (status ${payload.status})`);
    return { httpStatus: 200, body: { message: 'Webhook received successfully' } };
  }
  if (payload.invoice_id && String(payload.invoice_id) !== deposit.deposit_id) {
    await logEvent(deposit, { source: 'webhook', status: String(payload.status || ''), authenticated_by: auth.method, result: `invoice mismatch (${payload.invoice_id})` });
    return { httpStatus: 400, body: { message: 'invoice_id does not match' } };
  }
  if (!OPEN_STATUSES.includes(deposit.status)) {
    await logEvent(deposit, { source: 'webhook', status: String(payload.status || ''), authenticated_by: auth.method, result: `ignored: deposit already ${deposit.status}` });
    return { httpStatus: 200, body: { message: 'Webhook received successfully' } };
  }

  const outcome = await verifyAndApply(deposit, { source: 'webhook', authenticatedBy: auth.method, webhook: payload });
  // 5xx makes PayRam retry (verification unavailable or crediting failed); everything else is final.
  if (outcome.retry) return { httpStatus: 503, body: { message: 'Temporarily unable to verify the payment; please retry' } };
  return { httpStatus: 200, body: { message: 'Webhook received successfully' } };
}

/** Re-checks an open deposit with PayRam (app status polling). Returns the fresh record. */
async function refreshDeposit(deposit) {
  if (deposit && deposit.reference_id && OPEN_STATUSES.includes(deposit.status)) {
    await verifyAndApply(deposit, { source: 'status_check' });
    return PayramDeposit.findById(deposit._id).lean();
  }
  return deposit;
}

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT: admin actions (Admin → USDT Deposits).
 * approve: credit a deposit in review (or still open) after the admin checked it — same
 *          credit-once path as the webhook. reject: close it without crediting.
 * @returns {Promise<{ type:'success'|'error'|'warning', message:string }>}
 */
async function adminApprove(depositId, { admin, note }) {
  const deposit = await PayramDeposit.findOne({ deposit_id: String(depositId) }).lean();
  if (!deposit) return { type: 'error', message: 'Deposit not found' };
  if (![...OPEN_STATUSES, 'review'].includes(deposit.status)) return { type: 'error', message: `Deposit is already ${deposit.status}` };
  const result = await credit(deposit, { verified_at: new Date(), payment_state: `ADMIN APPROVED by ${admin}` }, {
    fromStatuses: [...OPEN_STATUSES, 'review'],
    paymentMethod: 'PayRam (USDT) - Admin Approved',
    extraSet: { review_reason: [deposit.review_reason, `Approved by ${admin}${note ? `: ${note}` : ''}`].filter(Boolean).join(' | ') },
  });
  await logEvent(deposit, { source: 'admin', status: 'APPROVE', authenticated_by: admin, result });
  if (result === 'credited') return { type: 'success', message: `Credited ${deposit.probcoins} ProbCoins for deposit ${deposit.deposit_id}.` };
  if (result === 'already') return { type: 'warning', message: 'This deposit had already been credited.' };
  return { type: 'error', message: `Could not credit the deposit (${result}).` };
}

async function adminReject(depositId, { admin, note }) {
  const deposit = await PayramDeposit.findOne({ deposit_id: String(depositId) }).lean();
  if (!deposit) return { type: 'error', message: 'Deposit not found' };
  const reason = `Rejected by ${admin}${note ? `: ${note}` : ''}`;
  const res = await PayramDeposit.updateOne(
    { _id: deposit._id, status: { $in: [...OPEN_STATUSES, 'review'] } },
    { $set: { status: 'cancelled', review_reason: [deposit.review_reason, reason].filter(Boolean).join(' | ') } },
  );
  if (!res.modifiedCount) return { type: 'error', message: `Deposit is already ${deposit.status}` };
  await logEvent(deposit, { source: 'admin', status: 'REJECT', authenticated_by: admin, result: 'cancelled' });
  return { type: 'success', message: `Deposit ${deposit.deposit_id} rejected; nothing was credited.` };
}

/** Admin "Check with PayRam": re-reads the payment and applies it (credits if now paid). */
async function adminRefresh(depositId) {
  const deposit = await PayramDeposit.findOne({ deposit_id: String(depositId) }).lean();
  if (!deposit) return { type: 'error', message: 'Deposit not found' };
  if (!deposit.reference_id) return { type: 'error', message: 'This deposit has no PayRam reference (it was never created at PayRam).' };
  if (!OPEN_STATUSES.includes(deposit.status)) {
    const check = await payram.getPayment(deposit.reference_id);
    return check.ok
      ? { type: 'success', message: `PayRam status: ${check.data.paymentState}${check.data.filledAmountInUSD ? ` (received ${check.data.filledAmountInUSD} USD)` : ''}. Deposit is ${deposit.status}; nothing changed.` }
      : { type: 'error', message: `PayRam: ${check.message}` };
  }
  const outcome = await verifyAndApply(deposit, { source: 'admin_check' });
  if (outcome.result === 'verification_unavailable') return { type: 'error', message: 'Could not reach PayRam. Try again later.' };
  return { type: outcome.result === 'credited' ? 'success' : 'warning', message: `Checked with PayRam: ${outcome.result}.` };
}

module.exports = {
  adminApprove, adminReject, adminRefresh,
  quote, createDeposit, handleWebhook, refreshDeposit, verifyAndApply, publicDeposit, findUser, OPEN_STATUSES,
};
