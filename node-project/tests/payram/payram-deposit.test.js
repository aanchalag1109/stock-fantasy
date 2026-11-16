'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 * USDT deposits via PayRam: create → PayRam link, webhook authentication (X-Payram-Signature and
 * API-Key), verification against PayRam's API, amount/currency/invoice checks, credit exactly once
 * (repeated and concurrent webhooks), partial / over / cancelled payments, status polling.
 * Runs the real Express app; models are in memory and PayRam is a stub (no network).
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const mongoose = require('mongoose');

mongoose.set('bufferCommands', false);

const axios = require('axios');
const request = require('supertest');
const config = require('../../src/config/env');
const logger = require('../../src/config/logger');
const PayramDeposit = require('../../src/models/payram-deposit.model');
const User = require('../../src/models/user.model');
const Transaction = require('../../src/models/transaction.model');
const Setting = require('../../src/models/setting.model');
const Payment = require('../../src/models/payment.model');
const app = require('../../src/app');

logger.silent = true;
const { ObjectId } = mongoose.Types;
const API_KEY = 'test-payram-key-0123456789abcdef';
const BASE = 'http://payram.test';

// ─── In-memory store ─────────────────────────────────────────────────────────

let db;
const same = (a, b) => (a == null && b == null) || String(a) === String(b);
function matches(doc, filter = {}) {
  return Object.entries(filter).every(([key, cond]) => {
    const val = doc[key];
    if (cond && typeof cond === 'object' && !(cond instanceof ObjectId) && !(cond instanceof Date) && Object.keys(cond).some((k) => k.startsWith('$'))) {
      return Object.entries(cond).every(([op, arg]) => {
        if (op === '$in') return arg.some((a) => same(val, a));
        if (op === '$ne') return !same(val, arg);
        throw new Error(`unsupported ${op}`);
      });
    }
    return same(val, cond);
  });
}
const clone = (d) => (d ? JSON.parse(JSON.stringify(d), (k, v) => (typeof v === 'string' && /^\d{4}-\d\d-\d\dT/.test(v) ? new Date(v) : v)) : d);
function query(value) {
  const q = {
    select: () => q, lean: () => q, sort: () => q, limit: (n) => { if (Array.isArray(value)) value = value.slice(0, n); return q; },
    then: (a, b) => Promise.resolve(value).then(a, b),
  };
  return q;
}
function applyUpdate(doc, u) {
  Object.assign(doc, u.$set || {});
  Object.entries(u.$inc || {}).forEach(([k, v]) => { doc[k] = (doc[k] || 0) + v; });
  Object.entries(u.$push || {}).forEach(([k, v]) => { doc[k] = [...(doc[k] || []), ...(v.$each || [v])].slice(v.$slice || 0); });
}

PayramDeposit.create = async (doc) => {
  const d = { _id: new ObjectId(), webhook_log: [], created_at: new Date(), ...doc };
  db.deposits.push(d);
  return { ...clone(d), toObject() { return clone(d); } };
};
PayramDeposit.findOne = (f) => query(clone(db.deposits.find((d) => matches(d, f)) || null));
PayramDeposit.findById = (id) => query(clone(db.deposits.find((d) => same(d._id, id)) || null));
PayramDeposit.find = (f) => query(db.deposits.filter((d) => matches(d, f)).map(clone));
PayramDeposit.updateOne = async (f, u) => {
  const d = db.deposits.find((x) => matches(x, f));
  if (d) applyUpdate(d, u);
  return { modifiedCount: d ? 1 : 0 };
};
PayramDeposit.findOneAndUpdate = async (f, u) => {
  const d = db.deposits.find((x) => matches(x, f));
  if (!d) return null;
  const before = clone(d);
  applyUpdate(d, u);
  return before;
};
User.findById = (id) => query(clone(db.users.find((u) => same(u._id, id)) || null));
User.findOne = (f) => query(clone(db.users.find((u) => matches(u, f)) || null));
User.updateOne = async (f, u) => { const d = db.users.find((x) => matches(x, f)); if (d) applyUpdate(d, u); return { modifiedCount: d ? 1 : 0 }; };
Transaction.create = async (doc) => {
  // the unique transaction_id index that makes crediting idempotent
  if (doc.transaction_id && db.transactions.some((t) => t.transaction_id === doc.transaction_id)) throw Object.assign(new Error('E11000'), { code: 11000 });
  const t = { _id: new ObjectId(), ...doc };
  db.transactions.push(t);
  return t;
};
Setting.findOne = (f) => query(f.key === 'probcoin_conversion' && db.rate ? { key: f.key, value: { usdt_to_probcoin_rate: db.rate, inr_to_probcoin_rate: 1 } } : null);
Payment.create = async () => { throw new Error('PayRam must not touch LG Pay payments'); };

// ─── PayRam stub ─────────────────────────────────────────────────────────────

let payram; // { created: [], state: Map(reference → status response), down: false, createError: null }
axios.post = async (url, body, opts) => {
  assert.equal(url, `${BASE}/api/v1/payment`);
  assert.equal(opts.headers['API-Key'], API_KEY);
  payram.created.push(body);
  if (payram.createError) return { status: 422, data: { code: 3, error: { code: payram.createError, message: 'This project has no deposit wallet.' } } };
  const reference = `ref-${payram.created.length}`;
  payram.state.set(reference, { paymentState: 'OPEN', amountInUSD: String(body.amountInUSD), invoiceID: body.invoiceID, currencySymbol: 'USDT', filledAmount: null, filledAmountInUSD: null });
  return { status: 200, data: { reference_id: reference, url: `${BASE}/payments?reference_id=${reference}`, host: BASE } };
};
axios.get = async (url, opts) => {
  assert.ok(url.startsWith(`${BASE}/api/v1/payment/reference/`), url);
  assert.equal(opts.headers['API-Key'], API_KEY);
  payram.statusCalls += 1;
  if (payram.down) throw new Error('ECONNREFUSED');
  const ref = decodeURIComponent(url.split('/').pop());
  const state = payram.state.get(ref);
  return state ? { status: 200, data: state } : { status: 404, data: { message: 'not found' } };
};

// ─── Fixtures / helpers ──────────────────────────────────────────────────────

const ids = {};
function reset() {
  Object.assign(config.PAYRAM, { apiUrl: BASE, apiKey: API_KEY, network: '', minDepositUsdt: 1, maxDepositUsdt: 10000 });
  ids.user = new ObjectId();
  ids.other = new ObjectId();
  db = {
    rate: 90, // 1 USDT = 90 ProbCoins
    users: [
      { _id: ids.user, old_id: 41, email: 'player@example.com', deposit_balance: 100, winnings_balance: 0 },
      { _id: ids.other, old_id: 42, email: '', deposit_balance: 0, winnings_balance: 0 },
    ],
    deposits: [],
    transactions: [],
  };
  payram = { created: [], state: new Map(), down: false, createError: null, statusCalls: 0 };
}
const balance = () => db.users[0].deposit_balance;
const deposit = () => db.deposits[0];
const sign = (raw) => `sha256=${crypto.createHmac('sha256', API_KEY).update(raw).digest('hex')}`;

async function createDeposit(amount = '10.5', userId = '41') {
  const res = await request(app).post('/api/v1/payram/deposit').send({ user_id: userId, amount });
  return res;
}
/** PayRam's view of the payment changes, then it calls our webhook. */
function payramSays(reference, update) {
  Object.assign(payram.state.get(reference), update);
}
function sendWebhook(payload, { headers } = {}) {
  const raw = Buffer.from(JSON.stringify(payload));
  return request(app).post('/api/v1/payram/webhook')
    .set('Content-Type', 'application/json')
    .set(headers || { 'X-Payram-Signature': sign(raw) })
    .send(raw.toString());
}
const filledPayload = (d, extra = {}) => ({
  reference_id: d.reference_id, invoice_id: d.deposit_id, customer_id: '41', status: 'FILLED', amount: String(d.amount), currency: 'USDT',
  filled_amount: String(d.amount), filled_amount_in_usd: String(d.amount),
  payment_info: [{ transaction_hash: '0xabc', source_address: 'Tsrc', destination_address: 'Tdst', block_number: 1 }], ...extra,
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('PayRam USDT deposit — creating the payment', () => {
  beforeEach(reset);

  test('config and quote use the ProbCoin Conversion USDT rate', async () => {
    const cfg = await request(app).get('/api/v1/payram/config');
    assert.deepEqual({ enabled: cfg.body.enabled, rate: cfg.body.rate, currency: cfg.body.currency }, { enabled: true, rate: 90, currency: 'USDT' });
    const q = await request(app).post('/api/v1/payram/quote').send({ amount: '10.5' });
    assert.equal(q.body.probcoins, 945);
    for (const [amount, message] of [['0', 'valid USDT amount'], ['abc', 'valid USDT amount'], ['1.234', 'valid USDT amount'], ['0.5', 'Minimum USDT deposit is 1'], ['20000', 'Maximum USDT deposit is 10000']]) {
      const r = await request(app).post('/api/v1/payram/quote').send({ amount });
      assert.equal(r.status, 400, amount);
      assert.match(r.body.message, new RegExp(message));
    }
  });

  test('creates the deposit, asks PayRam for a USDT payment and returns the payment URL', async () => {
    const res = await createDeposit('10.5');
    assert.equal(res.status, 200, res.text);
    assert.equal(res.body.payment_url, `${BASE}/payments?reference_id=ref-1`);
    assert.deepEqual(payram.created[0], {
      customerEmail: 'player@example.com', customerID: '41', amountInUSD: 10.5, invoiceID: deposit().deposit_id, currency: 'USDT',
    });
    assert.equal(deposit().gateway, 'PAYRAM');
    assert.equal(deposit().currency, 'USDT');
    assert.equal(deposit().status, 'pending');
    assert.equal(deposit().reference_id, 'ref-1');
    assert.equal(deposit().rate, 90);
    assert.equal(deposit().probcoins, 945);
    assert.equal(balance(), 100, 'nothing is credited before payment');
  });

  test('users without an email get a placeholder address; optional network is passed through', async () => {
    config.PAYRAM.network = 'TRX';
    await createDeposit('5', '42');
    assert.equal(payram.created[0].customerEmail, 'user-42@users.probtrade.app');
    assert.equal(payram.created[0].network, 'TRX');
  });

  test('PayRam refusing the payment (e.g. no deposit wallet) marks the deposit failed', async () => {
    payram.createError = 'DEPOSIT_WALLET_NOT_ASSIGNED';
    const res = await createDeposit('10');
    assert.equal(res.status, 502);
    assert.equal(res.body.reason, 'DEPOSIT_WALLET_NOT_ASSIGNED');
    assert.equal(deposit().status, 'failed');
  });

  test('no USDT rate configured → unavailable and PayRam is not called', async () => {
    db.rate = null;
    const res = await createDeposit('10');
    assert.equal(res.status, 503);
    assert.equal(payram.created.length, 0);
    assert.equal(db.deposits.length, 0);
  });

  test('unknown user is rejected', async () => {
    assert.equal((await createDeposit('10', '999')).status, 404);
    assert.equal((await request(app).post('/api/v1/payram/deposit').send({ amount: '10' })).status, 400);
  });
});

describe('PayRam USDT deposit — webhook', () => {
  beforeEach(reset);

  test('signed FILLED webhook, confirmed by the PayRam API, credits the ProbCoins once', async () => {
    await createDeposit('10.5');
    const d = deposit();
    payramSays(d.reference_id, { paymentState: 'FILLED', filledAmount: '10.5', filledAmountInUSD: '10.5' });
    const res = await sendWebhook(filledPayload(d));
    assert.equal(res.status, 200, res.text);
    assert.equal(balance(), 100 + 945);
    assert.equal(deposit().status, 'credited');
    assert.ok(deposit().credited_at);
    assert.equal(deposit().verification.payment_state, 'FILLED');
    assert.deepEqual(deposit().tx_hashes, ['0xabc']);
    assert.equal(db.transactions.length, 1);
    assert.deepEqual(
      (({ type, amount, status, transaction_id, payment_method }) => ({ type, amount, status, transaction_id, payment_method }))(db.transactions[0]),
      { type: 'deposit', amount: 945, status: 'success', transaction_id: `PAYRAM_${d.deposit_id}`, payment_method: 'PayRam (USDT)' },
    );
    assert.equal(deposit().webhook_log.at(-1).authenticated_by, 'signature');

    // PayRam retries the same event → acknowledged, not credited again
    assert.equal((await sendWebhook(filledPayload(d))).status, 200);
    assert.equal(balance(), 100 + 945);
    assert.equal(db.transactions.length, 1);
  });

  test('concurrent duplicate webhooks credit exactly once', async () => {
    await createDeposit('10');
    const d = deposit();
    payramSays(d.reference_id, { paymentState: 'FILLED', filledAmountInUSD: '10' });
    const results = await Promise.all([1, 2, 3, 4, 5].map(() => sendWebhook(filledPayload(d))));
    assert.ok(results.every((r) => r.status === 200));
    assert.equal(balance(), 100 + 900);
    assert.equal(db.transactions.length, 1);
  });

  test('legacy API-Key header authentication works; bad or missing credentials are rejected', async () => {
    await createDeposit('10');
    const d = deposit();
    payramSays(d.reference_id, { paymentState: 'FILLED', filledAmountInUSD: '10' });
    assert.equal((await sendWebhook(filledPayload(d), { headers: { 'X-Payram-Signature': 'sha256=deadbeef' } })).status, 401);
    assert.equal((await sendWebhook(filledPayload(d), { headers: { 'API-Key': 'wrong' } })).status, 401);
    assert.equal((await sendWebhook(filledPayload(d), { headers: {} })).status, 401);
    // body changed after signing → signature no longer matches
    const raw = JSON.stringify(filledPayload(d));
    const tampered = await request(app).post('/api/v1/payram/webhook').set('Content-Type', 'application/json')
      .set('X-Payram-Signature', sign(Buffer.from(raw))).send(raw.replace('"FILLED"', '"OVER_FILLED"'));
    assert.equal(tampered.status, 401);
    assert.equal(balance(), 100);

    const ok = await sendWebhook(filledPayload(d), { headers: { 'API-Key': API_KEY } });
    assert.equal(ok.status, 200);
    assert.equal(balance(), 100 + 900);
    assert.equal(deposit().webhook_log.at(-1).authenticated_by, 'api_key');
  });

  test('a FILLED webhook is not trusted when PayRam\'s API still says OPEN', async () => {
    await createDeposit('10');
    const res = await sendWebhook(filledPayload(deposit()));
    assert.equal(res.status, 200);
    assert.equal(balance(), 100);
    assert.equal(deposit().status, 'pending');
  });

  test('PayRam API unreachable → 503 so PayRam retries; the retry credits', async () => {
    await createDeposit('10');
    const d = deposit();
    payramSays(d.reference_id, { paymentState: 'FILLED', filledAmountInUSD: '10' });
    payram.down = true;
    assert.equal((await sendWebhook(filledPayload(d))).status, 503);
    assert.equal(balance(), 100);
    payram.down = false;
    assert.equal((await sendWebhook(filledPayload(d))).status, 200);
    assert.equal(balance(), 100 + 900);
  });

  test('amount, currency or invoice mismatches go to review without crediting', async () => {
    const cases = [
      [{ amountInUSD: '1', paymentState: 'FILLED' }, /does not match deposit amount/],
      [{ currencySymbol: 'USDC', paymentState: 'FILLED', filledAmountInUSD: '10' }, /Paid in USDC instead of USDT/],
      [{ invoiceID: 'SOMETHING-ELSE', paymentState: 'FILLED' }, /does not match deposit/],
      [{ paymentState: 'FILLED', filledAmountInUSD: '4' }, /only 4 USD of 10 was received/],
    ];
    for (const [state, reason] of cases) {
      reset();
      await createDeposit('10');
      payramSays(deposit().reference_id, state);
      await sendWebhook(filledPayload(deposit()));
      assert.equal(deposit().status, 'review', String(reason));
      assert.match(deposit().review_reason, reason);
      assert.equal(balance(), 100);
    }
  });

  test('webhook invoice_id must match our deposit', async () => {
    await createDeposit('10');
    const res = await sendWebhook(filledPayload(deposit(), { invoice_id: 'PRM-OTHER' }));
    assert.equal(res.status, 400);
    assert.equal(balance(), 100);
  });

  test('partial payment, then expiry → review; expiry with nothing paid → cancelled', async () => {
    await createDeposit('10');
    const d = deposit();
    payramSays(d.reference_id, { paymentState: 'PARTIALLY_FILLED', filledAmount: '6', filledAmountInUSD: '6' });
    await sendWebhook(filledPayload(d, { status: 'PARTIALLY_FILLED', filled_amount: '6', filled_amount_in_usd: '6' }));
    assert.equal(deposit().status, 'partially_paid');
    assert.equal(deposit().filled_amount, 6);
    payramSays(d.reference_id, { paymentState: 'CANCELLED' });
    await sendWebhook(filledPayload(d, { status: 'CANCELLED' }));
    assert.equal(deposit().status, 'review');
    assert.match(deposit().review_reason, /cancelled after receiving 6 of 10 USDT/);
    assert.equal(balance(), 100);

    reset();
    await createDeposit('10');
    payramSays(deposit().reference_id, { paymentState: 'CANCELLED' });
    await sendWebhook(filledPayload(deposit(), { status: 'CANCELLED', filled_amount: null, filled_amount_in_usd: null }));
    assert.equal(deposit().status, 'cancelled');
  });

  test('partial payment that is later completed is credited', async () => {
    await createDeposit('10');
    const d = deposit();
    payramSays(d.reference_id, { paymentState: 'PARTIALLY_FILLED', filledAmountInUSD: '6' });
    await sendWebhook(filledPayload(d, { status: 'PARTIALLY_FILLED' }));
    payramSays(d.reference_id, { paymentState: 'FILLED', filledAmountInUSD: '10' });
    await sendWebhook(filledPayload(d));
    assert.equal(deposit().status, 'credited');
    assert.equal(balance(), 100 + 900);
  });

  test('overpayment credits the deposit amount and flags it', async () => {
    await createDeposit('10');
    payramSays(deposit().reference_id, { paymentState: 'OVER_FILLED', filledAmountInUSD: '12.5' });
    await sendWebhook(filledPayload(deposit(), { status: 'OVER_FILLED' }));
    assert.equal(deposit().status, 'credited');
    assert.equal(balance(), 100 + 900);
    assert.match(deposit().review_reason, /Overpaid: received 12.5 USD/);
  });

  test('unknown reference is acknowledged and ignored; a credited deposit ignores later events', async () => {
    assert.equal((await sendWebhook({ reference_id: 'nope', status: 'FILLED' })).status, 200);
    await createDeposit('10');
    payramSays(deposit().reference_id, { paymentState: 'FILLED', filledAmountInUSD: '10' });
    await sendWebhook(filledPayload(deposit()));
    const calls = payram.statusCalls;
    payramSays(deposit().reference_id, { paymentState: 'CANCELLED' });
    await sendWebhook(filledPayload(deposit(), { status: 'CANCELLED' }));
    assert.equal(deposit().status, 'credited');
    assert.equal(payram.statusCalls, calls, 'no further verification for a closed deposit');
  });
});

describe('PayRam USDT deposit — status polling and history', () => {
  beforeEach(reset);

  test('status check verifies with PayRam and credits (missed webhook); other users cannot read it', async () => {
    await createDeposit('10');
    const d = deposit();
    let res = await request(app).get(`/api/v1/payram/deposit/${d.deposit_id}`).query({ user_id: '41' });
    assert.equal(res.body.deposit.status, 'pending');
    assert.ok(res.body.deposit.payment_url);

    payramSays(d.reference_id, { paymentState: 'FILLED', filledAmountInUSD: '10' });
    res = await request(app).get(`/api/v1/payram/deposit/${d.deposit_id}`).query({ user_id: '41' });
    assert.equal(res.body.deposit.status, 'credited');
    assert.equal(res.body.deposit.payment_url, null);
    assert.equal(balance(), 100 + 900);
    assert.equal(deposit().webhook_log.at(-1).source, 'status_check');

    // webhook arriving afterwards does nothing more
    await sendWebhook(filledPayload(d));
    assert.equal(balance(), 100 + 900);

    assert.equal((await request(app).get(`/api/v1/payram/deposit/${d.deposit_id}`).query({ user_id: '42' })).status, 404);
    const list = await request(app).get('/api/v1/payram/deposits').query({ user_id: '41' });
    assert.equal(list.body.deposits.length, 1);
    assert.equal(list.body.deposits[0].probcoins, 900);
  });

  test('the /api/payram alias works too', async () => {
    assert.equal((await request(app).get('/api/payram/config')).body.currency, 'USDT');
  });
});
