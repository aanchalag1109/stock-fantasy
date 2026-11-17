'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 * Client feedback — INR & USDT deposits and withdrawals:
 *   per-currency options / quotes (rate, limits, gateway charges), INR purchase via LG Pay
 *   (ProbCoins at the INR rate, charges, signed callback, credit once, underpayment → review),
 *   INR / USDT withdrawals (conversion, limits, payout details, approve / reject-refund),
 *   settings validation.
 * Runs the real Express app on in-memory models; LG Pay is stubbed (no network).
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

mongoose.set('bufferCommands', false);

const axios = require('axios');
const request = require('supertest');
const config = require('../../src/config/env');
const logger = require('../../src/config/logger');
const models = {
  Payment: require('../../src/models/payment.model'),
  User: require('../../src/models/user.model'),
  Transaction: require('../../src/models/transaction.model'),
  WithdrawalRequest: require('../../src/models/withdrawal-request.model'),
  Notification: require('../../src/models/notification.model'),
};
const Setting = require('../../src/models/setting.model');
const settingsService = require('../../src/services/deposit-withdrawal-settings.service');
const withdrawals = require('../../src/services/payments/withdrawal.service');
const { generateSignature } = require('../../src/controllers/payment.controller');
const app = require('../../src/app');

logger.silent = true;
const { ObjectId } = mongoose.Types;

// ─── In-memory store ─────────────────────────────────────────────────────────

let db;
const same = (a, b) => (a == null && b == null) || String(a) === String(b);
function matches(doc, filter = {}) {
  return Object.entries(filter).every(([key, cond]) => {
    const val = key.includes('.') ? key.split('.').reduce((v, k) => (v == null ? v : v[k]), doc) : doc[key];
    if (cond && typeof cond === 'object' && !(cond instanceof ObjectId) && !(cond instanceof Date) && Object.keys(cond).some((k) => k.startsWith('$'))) {
      return Object.entries(cond).every(([op, arg]) => {
        if (op === '$in') return arg.some((a) => same(val, a));
        if (op === '$gte') return Number(val) >= Number(arg);
        if (op === '$type') return typeof val === arg;
        throw new Error(`unsupported ${op}`);
      });
    }
    return same(val, cond);
  });
}
const clone = (d) => (d ? JSON.parse(JSON.stringify(d), (k, v) => (typeof v === 'string' && /^\d{4}-\d\d-\d\dT/.test(v) ? new Date(v) : v)) : d);
function query(value) {
  const q = {
    select: () => q, lean: () => q, populate: () => q, session: () => q,
    sort: () => q, limit: (n) => { if (Array.isArray(value)) value = value.slice(0, n); return q; },
    then: (a, b) => Promise.resolve(value).then(a, b),
  };
  return q;
}
function applyUpdate(doc, u) {
  Object.entries(u.$set || {}).forEach(([k, v]) => {
    if (k.includes('.')) { const [a, b] = k.split('.'); doc[a] = { ...(doc[a] || {}), [b]: v }; } else doc[k] = v;
  });
  Object.entries(u.$inc || {}).forEach(([k, v]) => { doc[k] = Math.round(((doc[k] || 0) + v) * 100) / 100; });
}
function stub(name) {
  const M = models[name];
  const all = () => db[name];
  const one = (f) => all().find((d) => matches(d, f)) || null;
  M.find = (f) => query(all().filter((d) => matches(d, f)).map(clone));
  M.findOne = (f) => {
    const q = query(clone(one(f)));
    q.sort = () => { const rows = all().filter((d) => matches(d, f)); q.then = (a, b) => Promise.resolve(clone(rows.at(-1) || null)).then(a, b); return q; };
    return q;
  };
  M.findById = (id) => query(clone(one({ _id: id })));
  M.countDocuments = async (f) => all().filter((d) => matches(d, f)).length;
  M.create = async (doc) => {
    if (name === 'Transaction' && doc.transaction_id && all().some((t) => t.transaction_id === doc.transaction_id)) throw Object.assign(new Error('E11000'), { code: 11000 });
    if (name === 'Notification' && doc.dedupe_key && all().some((t) => t.dedupe_key === doc.dedupe_key)) throw Object.assign(new Error('E11000'), { code: 11000 });
    const d = { _id: new ObjectId(), created_at: new Date(), ...doc };
    all().push(d);
    return { ...clone(d), toObject: () => clone(d) };
  };
  M.updateOne = async (f, u) => { const d = one(f); if (d) applyUpdate(d, u); return { modifiedCount: d ? 1 : 0 }; };
  M.updateMany = async (f, u) => { const ds = all().filter((d) => matches(d, f)); ds.forEach((d) => applyUpdate(d, u)); return { modifiedCount: ds.length }; };
  M.findOneAndUpdate = async (f, u) => { const d = one(f); if (!d) return null; const before = clone(d); applyUpdate(d, u); return before; };
}
Object.keys(models).forEach(stub);
Setting.find = (f) => ({ lean: async () => Object.entries(db.settings).filter(([k]) => f.key.$in.includes(k)).map(([key, value]) => ({ key, value })) });
Setting.findOne = (f) => query(f.key === 'probcoin_conversion' ? { key: f.key, value: { inr_to_probcoin_rate: 10, usdt_to_probcoin_rate: 100 } } : null);
Setting.findOneAndUpdate = async (f, doc) => { db.settings[f.key] = doc.value; return doc; };

// LG Pay stub
let lgpay;
axios.post = async (url, body) => {
  assert.ok(url.endsWith('/api/order/create'), url);
  lgpay.created.push(Object.fromEntries(new URLSearchParams(body)));
  return { status: 200, data: { status: 1, data: { pay_url: 'https://lgpay.test/pay/1' } } };
};
axios.get = async (url, opts) => {
  assert.ok(url.endsWith('/api/order/query'), url);
  lgpay.queries += 1;
  return { status: 200, data: lgpay.queryResult };
};

// ─── Fixtures ────────────────────────────────────────────────────────────────

const ids = {};
function reset() {
  Object.assign(config.PAYRAM, { apiUrl: 'http://payram.test', apiKey: 'k', minDepositUsdt: 1, maxDepositUsdt: 10000 });
  ids.user = new ObjectId();
  db = {
    settings: {
      min_deposit_amount: 100, max_deposit_amount: 50000, min_withdrawal_amount: 100, max_withdrawal_amount: 20000,
      usdt_min_withdrawal_amount: 5, usdt_max_withdrawal_amount: 1000,
    },
    Payment: [], Transaction: [], WithdrawalRequest: [], Notification: [],
    User: [{ _id: ids.user, old_id: 41, name: 'Asha', deposit_balance: 0, winnings_balance: 50000, payment_details: { usdt_wallet_address: 'TXyzWallet' } }],
  };
  lgpay = { created: [], queries: 0, queryResult: { status: 0 } };
}
const user = () => db.User[0];
const signed = (body) => ({ ...body, sign: generateSignature(body) });
const callback = (body) => request(app).post('/api/v1/payment/lgpay-callback').type('form').send(body);
const createInr = (body) => request(app).post('/api/v1/deposit/inr/create').send({ user_id: '41', ...body });

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Deposit options and quotes (INR & USDT)', () => {
  beforeEach(reset);

  test('options list both currencies with rate, limits, charges and availability', async () => {
    Object.assign(db.settings, { inr_deposit_charge_percent: 2, inr_deposit_charge_bearer: 'user' });
    const res = await request(app).get('/api/v1/payments/options');
    const [inr, usdt] = res.body.currencies;
    assert.deepEqual(
      { c: inr.currency, rate: inr.rate, min: inr.min_deposit, max: inr.max_deposit, pct: inr.charge_percent, enabled: inr.deposit_enabled, wd: inr.withdrawal_enabled },
      { c: 'INR', rate: 10, min: 100, max: 50000, pct: 2, enabled: true, wd: true },
    );
    assert.deepEqual(
      { c: usdt.currency, rate: usdt.rate, min: usdt.min_deposit, max: usdt.max_deposit, wmin: usdt.min_withdrawal, net: usdt.withdrawal_network },
      { c: 'USDT', rate: 100, min: 1, max: 10000, wmin: 5, net: 'TRC20' },
    );
  });

  test('INR quote: ProbCoins at the INR rate, charges and total payable shown', async () => {
    Object.assign(db.settings, { inr_deposit_charge_percent: 2, inr_deposit_charge_fixed: 5, inr_deposit_charge_bearer: 'user' });
    const q = (await request(app).post('/api/v1/deposit/quote').send({ currency: 'INR', amount: '500' })).body.quote;
    assert.deepEqual(
      { coins: q.probcoins, base: q.base_amount, charges: q.charges, total: q.total_payable, bearer: q.charges_bearer },
      { coins: 5000, base: 500, charges: 15, total: 515, bearer: 'user' },
    );
    const byCoins = (await request(app).post('/api/v1/deposit/quote').send({ currency: 'INR', probcoins: '2500' })).body.quote;
    assert.equal(byCoins.base_amount, 250);
    const low = await request(app).post('/api/v1/deposit/quote').send({ currency: 'INR', amount: '50' });
    assert.equal(low.status, 400);
    assert.match(low.body.message, /at least 100/);
  });
});

describe('INR deposit via LG Pay', () => {
  beforeEach(reset);

  test('creates the order at the INR rate with charges; LG Pay collects the total', async () => {
    Object.assign(db.settings, { inr_deposit_charge_percent: 2, inr_deposit_charge_bearer: 'user' });
    const res = await createInr({ amount: '500' });
    assert.equal(res.status, 200, res.text);
    assert.equal(res.body.payment_url, 'https://lgpay.test/pay/1');
    assert.equal(lgpay.created[0].money, '51000', 'paise: ₹500 + 2% = ₹510');
    const order = db.Payment[0];
    assert.deepEqual(
      { amount: order.amount, coins: order.probcoins, rate: order.rate, base: order.base_amount, charges: order.charges, currency: order.currency },
      { amount: 510, coins: 5000, rate: 10, base: 500, charges: 10, currency: 'INR' },
    );
  });

  test('the legacy create-order link uses the same conversion and redirects to LG Pay', async () => {
    const data = encodeURIComponent(Buffer.from(JSON.stringify({ user_id: String(ids.user), amount: 300, timestamp: Date.now() })).toString('base64'));
    const res = await request(app).get(`/api/v1/payment/create-order?data=${data}`);
    assert.equal(res.status, 302);
    assert.equal(res.headers.location, 'https://lgpay.test/pay/1');
    assert.equal(db.Payment[0].probcoins, 3000);
  });

  test('a signed success callback credits the ProbCoins once (retries do nothing)', async () => {
    await createInr({ amount: '500' });
    const orderId = db.Payment[0].order_id;
    await callback(signed({ order_sn: orderId, status: '1', money: '50000' }));
    await callback(signed({ order_sn: orderId, status: '1', money: '50000' }));
    assert.equal(user().deposit_balance, 5000);
    assert.equal(db.Payment[0].payment_status, 1);
    const txns = db.Transaction.filter((t) => t.transaction_id === orderId);
    assert.equal(txns.length, 1);
    assert.deepEqual({ amount: txns[0].amount, cur: txns[0].currency, paid: txns[0].currency_amount }, { amount: 5000, cur: 'INR', paid: 500 });
  });

  test('a forged callback is not trusted: credited only if LG Pay confirms the order', async () => {
    await createInr({ amount: '500' });
    const orderId = db.Payment[0].order_id;
    await callback({ order_sn: orderId, status: '1', sign: 'forged' });
    assert.equal(user().deposit_balance, 0);
    assert.equal(lgpay.queries, 1, 'checked with LG Pay instead');
    lgpay.queryResult = { status: 1, data: { status: 1, money: 50000 } };
    await callback({ order_sn: orderId, status: '1', sign: 'forged' });
    assert.equal(user().deposit_balance, 5000);
  });

  test('an underpaid order is held for review; admin approval credits it', async () => {
    await createInr({ amount: '500' });
    const order = db.Payment[0];
    await callback(signed({ order_sn: order.order_id, status: '1', money: '30000' }));
    assert.equal(order.payment_status, 3);
    assert.match(order.review_reason, /Underpaid: LG Pay reports ₹300 for an order of ₹500/);
    assert.equal(user().deposit_balance, 0);
    const approved = await require('../../src/services/payment-orders.service').approve(String(order._id));
    assert.equal(approved.type, 'success');
    assert.equal(user().deposit_balance, 5000);
  });

  test('the app can poll the INR order status (re-checked with LG Pay)', async () => {
    await createInr({ amount: '200' });
    const orderId = db.Payment[0].order_id;
    let res = await request(app).get(`/api/v1/deposit/inr/status/${orderId}`).query({ user_id: '41' });
    assert.equal(res.body.order.status, 'pending');
    lgpay.queryResult = { status: 1, data: { status: 1, money: 20000 } };
    res = await request(app).get(`/api/v1/deposit/inr/status/${orderId}`).query({ user_id: '41' });
    assert.equal(res.body.order.status, 'success');
    assert.equal(res.body.deposit_balance, 2000);
  });

  test('orders created before the conversion are still credited 1:1', async () => {
    db.Payment.push({ _id: new ObjectId(), order_id: 'ORDOLD', user_id: ids.user, amount: 700, payment_status: 0 });
    await callback(signed({ order_sn: 'ORDOLD', status: '1' }));
    assert.equal(user().deposit_balance, 700);
  });
});

describe('Withdrawals in INR or USDT', () => {
  beforeEach(reset);

  test('quote converts ProbCoins at each currency rate and applies that currency\'s limits', async () => {
    const inr = (await request(app).post('/api/v1/withdraw/quote').send({ currency: 'INR', probcoins: '5000' })).body.quote;
    assert.deepEqual({ payout: inr.payout_amount, rate: inr.rate }, { payout: 500, rate: 10 });
    const usdt = (await request(app).post('/api/v1/withdraw/quote').send({ currency: 'USDT', probcoins: '5000' })).body.quote;
    assert.deepEqual({ payout: usdt.payout_amount, net: usdt.network }, { payout: 50, net: 'TRC20' });
    const tooSmall = await request(app).post('/api/v1/withdraw/quote').send({ currency: 'USDT', probcoins: '100' });
    assert.match(tooSmall.body.message, /at least 5 USDT/);
  });

  test('INR withdrawal needs UPI or bank details; then deducts winnings and records the payout', async () => {
    let res = await request(app).post('/api/v1/withdraw/request').send({ user_id: '41', currency: 'INR', probcoins: '5000' });
    assert.equal(res.status, 400);
    assert.equal(res.body.payment_details_required, true);

    res = await request(app).post('/api/v1/payout-details/inr').send({ user_id: '41', upi_id: 'not a upi' });
    assert.equal(res.status, 422);
    res = await request(app).post('/api/v1/payout-details/inr').send({ user_id: '41', upi_id: 'asha@okhdfc', account_holder_name: 'Asha' });
    assert.equal(res.status, 200, res.text);

    res = await request(app).post('/api/v1/withdraw/request').send({ user_id: '41', currency: 'INR', probcoins: '5000' });
    assert.equal(res.status, 200, res.text);
    assert.equal(user().winnings_balance, 45000);
    const w = db.WithdrawalRequest[0];
    assert.deepEqual({ coins: w.amount, cur: w.currency, payout: w.payout_amount, to: w.payout_details.upi_id }, { coins: 5000, cur: 'INR', payout: 500, to: 'asha@okhdfc' });
    assert.equal(db.Transaction.find((t) => t.transaction_id === `WD_${w._id}`).status, 'pending');
  });

  test('USDT withdrawal uses the saved address and the admin network; insufficient winnings refused', async () => {
    const res = await request(app).post('/api/v1/withdraw/request').send({ user_id: '41', currency: 'USDT', probcoins: '1000' });
    assert.equal(res.body.withdrawal.usdt_wallet_address, 'TXyzWallet');
    assert.equal(res.body.withdrawal.payout_amount, 10);
    user().winnings_balance = 10;
    const broke = await request(app).post('/api/v1/withdraw/request').send({ user_id: '41', currency: 'USDT', probcoins: '1000' });
    assert.match(broke.body.message, /Insufficient winnings/);
    assert.equal(user().winnings_balance, 10);
  });

  test('admin accept records the payout reference; reject refunds the ProbCoins exactly once', async () => {
    await request(app).post('/api/v1/withdraw/request').send({ user_id: '41', currency: 'USDT', probcoins: '1000' });
    await request(app).post('/api/v1/withdraw/request').send({ user_id: '41', currency: 'USDT', probcoins: '2000' });
    const [a, b] = db.WithdrawalRequest;
    assert.equal(user().winnings_balance, 47000);

    const ok = await withdrawals.processWithdrawal(String(a._id), { action: 'approve', payoutReference: '0xhash', admin: 'admin@x' });
    assert.match(ok.message, /send 10 USDT/);
    assert.deepEqual({ s: a.status, ref: a.payout_reference }, { s: 'approved', ref: '0xhash' });
    assert.equal(db.Transaction.find((t) => t.transaction_id === `WD_${a._id}`).status, 'success');

    await withdrawals.processWithdrawal(String(b._id), { action: 'reject', adminMessage: 'Wrong address', admin: 'admin@x' });
    await withdrawals.processWithdrawal(String(b._id), { action: 'reject', adminMessage: 'again', admin: 'admin@x' });
    assert.equal(user().winnings_balance, 49000, 'refunded once');
    assert.equal(b.status, 'rejected');
  });
});

describe('Deposit & Withdrawal Settings validation', () => {
  test('USDT limits are all-or-nothing; charges validated; INR still required', () => {
    const base = { min_deposit_amount: '100', max_deposit_amount: '50000', min_withdrawal_amount: '100', max_withdrawal_amount: '20000' };
    assert.deepEqual(settingsService.validate(base).errors, {});
    assert.match(settingsService.validate({ ...base, usdt_min_deposit_amount: '5' }).errors.usdt_max_deposit_amount, /required/);
    assert.match(settingsService.validate({ ...base, inr_deposit_charge_percent: '75' }).errors.inr_deposit_charge_percent, /between 0 and 50/);
    assert.match(settingsService.validate({ ...base, usdt_deposit_charge_bearer: 'nobody' }).errors.usdt_deposit_charge_bearer, /user.*platform/);
    assert.match(settingsService.validate({ ...base, usdt_withdrawal_network: 'XYZ' }).errors.usdt_withdrawal_network, /TRC20, BEP20, ERC20/);
    assert.match(settingsService.validate({ min_deposit_amount: '100' }).errors.max_deposit_amount, /required/);
  });
});

// NEW IMPLEMENTATION — NODE.JS PROJECT: transactions are labelled in ProbCoins
describe('ProbCoin labels on transactions', () => {
  beforeEach(reset);

  test('label helpers', () => {
    const { probcoinLabel, currencyLabel, transactionLabels } = require('../../src/helpers/mobile-compat');
    assert.equal(probcoinLabel(1500), '1,500 ProbCoins');
    assert.equal(probcoinLabel(2500.5), '2,500.5 ProbCoins');
    assert.equal(currencyLabel(500, 'INR'), '₹500');
    assert.equal(currencyLabel(5.5, 'USDT'), '5.5 USDT');
    assert.deepEqual(transactionLabels({ amount: 50 }), { unit: 'ProbCoins', amount_label: '50 ProbCoins' });
    assert.deepEqual(
      transactionLabels({ amount: 5000, currency: 'INR', currency_amount: 500 }),
      { unit: 'ProbCoins', amount_label: '5,000 ProbCoins', currency: 'INR', currency_amount: 500, currency_label: '₹500' },
    );
  });

  test('the app transaction list carries the ProbCoin label and the real-money side of a purchase', async () => {
    await createInr({ amount: '500' });
    const orderId = db.Payment[0].order_id;
    await callback(signed({ order_sn: orderId, status: '1', money: '50000' }));
    db.Transaction.push({ _id: new ObjectId(), user_id: String(ids.user), type: 'winnings', amount: 50, status: 'success', description: 'Won 50 ProbCoins in contest #9' });
    db.Transaction.forEach((t) => { t.user_id = String(t.user_id); });
    const res = await request(app).get('/api/v1/wallet/transactions').query({ user_id: String(ids.user) });
    const purchase = res.body.transactions.find((t) => t.transaction_id === orderId);
    assert.deepEqual(
      { unit: purchase.unit, label: purchase.amount_label, paid: purchase.currency_label },
      { unit: 'ProbCoins', label: '5,000 ProbCoins', paid: '₹500' },
    );
    const prize = res.body.transactions.find((t) => t.type === 'winnings');
    assert.equal(prize.amount_label, '50 ProbCoins');
    assert.equal(prize.currency_label, undefined);
  });

});
