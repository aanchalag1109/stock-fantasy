'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 * Admin → USDT Deposits (PayRam): list with totals / filters / search, detail page, "Check with
 * PayRam", approve (credit once) and reject, and permissions. In-memory models; PayRam stubbed.
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

mongoose.set('bufferCommands', false);

const axios = require('axios');
const bcrypt = require('bcryptjs');
const request = require('supertest');
const config = require('../../src/config/env');
const logger = require('../../src/config/logger');
const PayramDeposit = require('../../src/models/payram-deposit.model');
const User = require('../../src/models/user.model');
const AdminRole = require('../../src/models/admin-role.model');
const Transaction = require('../../src/models/transaction.model');
const adminApp = require('../../src/admin/app');

logger.silent = true;
const { ObjectId } = mongoose.Types;

let db;
let payramState;
const same = (a, b) => (a == null && b == null) || String(a) === String(b);
function matches(doc, filter = {}) {
  return Object.entries(filter).every(([key, cond]) => {
    if (key === '$or') return cond.some((f) => matches(doc, f));
    const val = doc[key];
    if (cond instanceof RegExp) return cond.test(val == null ? '' : String(val));
    if (cond && typeof cond === 'object' && !(cond instanceof ObjectId) && !(cond instanceof Date) && Object.keys(cond).some((k) => k.startsWith('$'))) {
      return Object.entries(cond).every(([op, arg]) => {
        if (op === '$in') return arg.some((a) => same(val, a));
        if (op === '$gte') return val >= arg;
        if (op === '$lte') return val <= arg;
        throw new Error(`unsupported ${op}`);
      });
    }
    return same(val, cond);
  });
}
const clone = (d) => (d ? JSON.parse(JSON.stringify(d), (k, v) => (typeof v === 'string' && /^\d{4}-\d\d-\d\dT/.test(v) ? new Date(v) : v)) : d);
function query(value) {
  const q = {
    select: () => q, lean: () => q,
    sort: (spec) => { const [[k, dir]] = Object.entries(spec); if (Array.isArray(value)) value = [...value].sort((a, b) => (a[k] - b[k]) * dir); return q; },
    skip: (n) => { if (Array.isArray(value)) value = value.slice(n); return q; },
    limit: (n) => { if (Array.isArray(value)) value = value.slice(0, n); return q; },
    then: (a, b) => Promise.resolve(value).then(a, b),
  };
  return q;
}
function applyUpdate(doc, u) {
  Object.assign(doc, u.$set || {});
  Object.entries(u.$inc || {}).forEach(([k, v]) => { doc[k] = (doc[k] || 0) + v; });
  Object.entries(u.$push || {}).forEach(([k, v]) => { doc[k] = [...(doc[k] || []), ...(v.$each || [v])].slice(v.$slice || 0); });
}

PayramDeposit.find = (f) => query(db.deposits.filter((d) => matches(d, f)).map(clone));
PayramDeposit.findOne = (f) => query(clone(db.deposits.find((d) => matches(d, f)) || null));
PayramDeposit.findById = (id) => query(clone(db.deposits.find((d) => same(d._id, id)) || null));
PayramDeposit.countDocuments = async (f) => db.deposits.filter((d) => matches(d, f)).length;
PayramDeposit.aggregate = async ([{ $match }]) => {
  const groups = new Map();
  db.deposits.filter((d) => matches(d, $match)).forEach((d) => {
    const g = groups.get(d.status) || { _id: d.status, count: 0, usdt: 0, probcoins: 0 };
    g.count += 1; g.usdt += d.amount; g.probcoins += d.probcoins;
    groups.set(d.status, g);
  });
  return [...groups.values()];
};
PayramDeposit.updateOne = async (f, u) => { const d = db.deposits.find((x) => matches(x, f)); if (d) applyUpdate(d, u); return { modifiedCount: d ? 1 : 0 }; };
PayramDeposit.findOneAndUpdate = async (f, u) => { const d = db.deposits.find((x) => matches(x, f)); if (!d) return null; const before = clone(d); applyUpdate(d, u); return before; };
User.find = (f) => query(db.users.filter((u) => matches(u, f)).map(clone));
User.findOne = (f) => query(clone(db.users.find((u) => matches(u, f)) || null));
User.findById = (id) => query(clone(db.users.find((u) => same(u._id, id)) || null));
User.updateOne = async (f, u) => { const d = db.users.find((x) => matches(x, f)); if (d) applyUpdate(d, u); return { modifiedCount: d ? 1 : 0 }; };
AdminRole.findById = (id) => query(clone(db.roles.find((r) => same(r._id, id)) || null));
Transaction.findOne = (f) => query(clone(db.transactions.find((t) => matches(t, f)) || null));
Transaction.create = async (doc) => {
  if (db.transactions.some((t) => t.transaction_id === doc.transaction_id)) throw Object.assign(new Error('E11000'), { code: 11000 });
  const t = { _id: new ObjectId(), ...doc }; db.transactions.push(t); return t;
};
axios.get = async (url) => {
  const ref = decodeURIComponent(url.split('/').pop());
  return payramState[ref] ? { status: 200, data: payramState[ref] } : { status: 404, data: { message: 'not found' } };
};

const HASH = bcrypt.hashSync('secret123', 4);
const ids = {};
const deposit = (id) => db.deposits.find((d) => d.deposit_id === id);
function reset() {
  Object.assign(config.PAYRAM, { apiUrl: 'http://payram.test', apiKey: 'k' });
  ids.player = new ObjectId();
  ids.viewerRole = new ObjectId();
  const at = (h) => new Date(Date.UTC(2026, 10, 10, h));
  const base = { user_id: ids.player, gateway: 'PAYRAM', currency: 'USDT', rate: 100, webhook_log: [] };
  db = {
    roles: [{ _id: ids.viewerRole, name: 'Finance viewer', permissions: ['usdt_deposits.view'] }],
    users: [
      { _id: new ObjectId(), email: 'super@test.local', password: HASH, is_admin: true, is_super_admin: true },
      { _id: new ObjectId(), email: 'viewer@test.local', password: HASH, is_admin: true, admin_role_id: ids.viewerRole },
      { _id: ids.player, old_id: 272, name: 'Praveen Patel', mobile: '9876500000', email: 'p@example.com', deposit_balance: 1615, winnings_balance: 0 },
    ],
    deposits: [
      { ...base, _id: new ObjectId(), deposit_id: 'PRM1', amount: 10, probcoins: 1000, status: 'credited', reference_id: 'ref-1', payram_state: 'FILLED', filled_amount: 10, credited_at: at(5), created_at: at(4), transaction_id: 'PAYRAM_PRM1',
        verification: { verified_at: at(5), payment_state: 'FILLED', amount_in_usd: 10, filled_amount_in_usd: 10, currency: 'USDT' }, tx_hashes: ['0xhash1'],
        webhook_log: [{ received_at: at(5), source: 'webhook', status: 'FILLED', authenticated_by: 'signature', result: 'credited (PayRam API: FILLED)' }] },
      { ...base, _id: new ObjectId(), deposit_id: 'PRM2', amount: 5, probcoins: 500, status: 'pending', reference_id: 'ref-2', payment_url: 'http://payram.test/payments?reference_id=ref-2', created_at: at(6) },
      { ...base, _id: new ObjectId(), deposit_id: 'PRM3', amount: 20, probcoins: 2000, status: 'review', reference_id: 'ref-3', filled_amount: 12, review_reason: 'Payment cancelled after receiving 12 of 20 USDT', created_at: at(7) },
      { ...base, _id: new ObjectId(), deposit_id: 'PRM4', amount: 3, probcoins: 300, status: 'failed', failure_reason: 'This project has no deposit wallet.', created_at: at(8) },
    ],
    transactions: [{ _id: new ObjectId(), user_id: ids.player, type: 'deposit', amount: 1000, status: 'success', transaction_id: 'PAYRAM_PRM1', payment_method: 'PayRam (USDT)', description: 'USDT deposit via PayRam: 10 USDT → 1000 ProbCoins (rate 100)' }],
  };
  payramState = {};
}
async function login(email = 'super@test.local') {
  const agent = request.agent(adminApp);
  await agent.post('/login').type('form').send({ email, password: 'secret123' });
  return agent;
}
const rowsOf = (html) => [...html.matchAll(/data-deposit="([^"]+)"/g)].map((m) => m[1]);
const balance = () => db.users[2].deposit_balance;

describe('Admin → USDT Deposits: list and detail', () => {
  beforeEach(reset);

  test('lists every deposit (newest first) with totals and status counts', async () => {
    const admin = await login();
    const page = (await admin.get('/usdt-deposits')).text;
    assert.deepEqual(rowsOf(page), ['PRM4', 'PRM3', 'PRM2', 'PRM1']);
    assert.match(page, /id="totalCreditedUsdt">10\.00 USDT/);
    assert.match(page, /id="totalCreditedPc">1,000 PC/);
    assert.match(page, /data-status-tab="review"[\s\S]*?>1</);
    assert.match(page, /Payment cancelled after receiving 12 of 20 USDT/);
    assert.match(page, /This project has no deposit wallet\./);
    assert.match(page, /Praveen Patel/);
    assert.match(page, /href="\/usdt-deposits"[^>]*>\s*<i class="bi bi-currency-bitcoin"><\/i> USDT Deposits/, 'sidebar link');
  });

  test('filters by status, search (deposit id / user) and sort', async () => {
    const admin = await login();
    assert.deepEqual(rowsOf((await admin.get('/usdt-deposits?status=credited')).text), ['PRM1']);
    assert.deepEqual(rowsOf((await admin.get('/usdt-deposits?search=PRM2')).text), ['PRM2']);
    assert.deepEqual(rowsOf((await admin.get('/usdt-deposits?search=praveen&sort=oldest')).text), ['PRM1', 'PRM2', 'PRM3', 'PRM4']);
    assert.deepEqual(rowsOf((await admin.get('/usdt-deposits?search=nobody')).text), []);
  });

  test('detail shows amounts, rate, PayRam reference, verification, tx hash, wallet transaction and event log', async () => {
    const admin = await login();
    const page = (await admin.get('/usdt-deposits/PRM1')).text;
    for (const text of ['ref-1', '1,000 PC', '1 USDT = 100 PC', '0xhash1', 'PAYRAM_PRM1', 'PayRam (USDT)', 'credited (PayRam API: FILLED)', 'signature', 'Praveen Patel']) {
      assert.ok(page.includes(text), text);
    }
    assert.match(page, /Credited/);
    assert.doesNotMatch(page, /\/approve"/, 'a credited deposit cannot be approved again');
    assert.equal((await admin.get('/usdt-deposits/NOPE')).status, 302);
  });
});

describe('Admin → USDT Deposits: actions', () => {
  beforeEach(reset);

  test('"Re-verify" credits a pending deposit that PayRam reports as paid', async () => {
    payramState['ref-2'] = { paymentState: 'FILLED', amountInUSD: '5', filledAmountInUSD: '5', invoiceID: 'PRM2', currencySymbol: 'USDT' };
    const admin = await login();
    await admin.post('/usdt-deposits/PRM2/check');
    assert.equal(deposit('PRM2').status, 'credited');
    assert.equal(balance(), 1615 + 500);
    assert.equal(deposit('PRM2').webhook_log.at(-1).source, 'admin_check');
  });

  test('approve credits a deposit in review exactly once; reject credits nothing', async () => {
    const admin = await login();
    await admin.post('/usdt-deposits/PRM3/approve').type('form').send({ note: 'checked on tronscan' });
    assert.equal(deposit('PRM3').status, 'credited');
    assert.equal(balance(), 1615 + 2000);
    assert.match(deposit('PRM3').review_reason, /Approved by super@test\.local: checked on tronscan/);
    const tx = db.transactions.find((t) => t.transaction_id === 'PAYRAM_PRM3');
    assert.equal(tx.payment_method, 'PayRam (USDT) - Admin Approved');

    await admin.post('/usdt-deposits/PRM3/approve');
    assert.equal(balance(), 1615 + 2000, 'second approve does nothing');
    assert.match((await admin.get('/usdt-deposits/PRM3')).text, /already credited/);

    await admin.post('/usdt-deposits/PRM2/reject').type('form').send({ note: 'customer abandoned' });
    assert.equal(deposit('PRM2').status, 'cancelled');
    assert.match(deposit('PRM2').review_reason, /Rejected by super@test\.local: customer abandoned/);
    assert.equal(balance(), 1615 + 2000);
  });

  test('a view-only admin sees the pages but no actions, and actions are refused', async () => {
    const viewer = await login('viewer@test.local');
    assert.equal((await viewer.get('/usdt-deposits')).status, 200);
    const detail = (await viewer.get('/usdt-deposits/PRM3')).text;
    assert.doesNotMatch(detail, /\/approve"|\/reject"|\/check"/);
    for (const path of ['/usdt-deposits/PRM3/approve', '/usdt-deposits/PRM3/reject', '/usdt-deposits/PRM2/check']) {
      assert.equal((await viewer.post(path).set('Accept', 'application/json')).status, 403, path);
    }
    assert.equal(deposit('PRM3').status, 'review');
    assert.equal(balance(), 1615);
  });
});

// NEW IMPLEMENTATION — NODE.JS PROJECT: separate PayRam testnet connection
describe('Admin → USDT Deposits: mainnet / testnet', () => {
  beforeEach(reset);

  test('testnet deposits carry a TESTNET badge and can be filtered; older deposits count as mainnet', async () => {
    deposit('PRM2').environment = 'testnet';
    const admin = await login();
    const page = (await admin.get('/usdt-deposits')).text;
    assert.match(page, /data-deposit="PRM2"[\s\S]*?data-testnet>TESTNET</);
    assert.match(page, /id="activeEnvironment">New deposits: MAINNET/);
    assert.deepEqual(rowsOf((await admin.get('/usdt-deposits?environment=testnet')).text), ['PRM2']);
    assert.deepEqual(rowsOf((await admin.get('/usdt-deposits?environment=mainnet')).text), ['PRM4', 'PRM3', 'PRM1']);
    assert.match((await admin.get('/usdt-deposits/PRM2')).text, /id="depositEnvironment">TESTNET/);
  });
});
