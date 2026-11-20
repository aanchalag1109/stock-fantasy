'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 * Admin review, Priority 1 fixes: login hardening, user edit no longer writes balances, safe
 * wallet adjustment, atomic Transactions approve/reject (withdrawal requests handled on their own
 * page), App Settings only saves its own keys, withdrawal Accept/Reject form method.
 * Runs the real admin app against an in-memory store.
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

mongoose.set('bufferCommands', false);

const bcrypt = require('bcryptjs');
const request = require('supertest');
const logger = require('../../src/config/logger');
// Notifications are fire-and-forget and not under test here.
require('../../src/services/notifications/notification.service').notify = () => {};
const models = {
  User: require('../../src/models/user.model'),
  Transaction: require('../../src/models/transaction.model'),
  WithdrawalRequest: require('../../src/models/withdrawal-request.model'),
  Setting: require('../../src/models/setting.model'),
};
const adminApp = require('../../src/admin/app');
const auth = require('../../src/admin/controllers/auth.controller');

logger.silent = true;
const { ObjectId } = mongoose.Types;

let db;
const same = (a, b) => (a == null && b == null) || String(a) === String(b);
function matches(doc, filter = {}) {
  return Object.entries(filter).every(([key, cond]) => {
    if (key === '$or') return cond.some((f) => matches(doc, f));
    const val = doc[key];
    if (cond instanceof RegExp) return cond.test(val == null ? '' : String(val));
    if (cond && typeof cond === 'object' && !(cond instanceof ObjectId) && Object.keys(cond).some((k) => k.startsWith('$'))) {
      return Object.entries(cond).every(([op, arg]) => {
        if (op === '$ne') return !same(val, arg);
        if (op === '$in') return arg.some((a) => same(val, a));
        if (op === '$gte') return Number(val) >= Number(arg);
        if (op === '$regex') return new RegExp(arg).test(String(val ?? ''));
        throw new Error(`unsupported ${op}`);
      });
    }
    return same(val, cond);
  });
}
const copy = (d) => (d ? JSON.parse(JSON.stringify(d)) : d);
function query(value) {
  const q = { select: () => q, sort: () => q, lean: () => q, skip: () => q, limit: () => q, populate: () => q, then: (a, b) => Promise.resolve(value).then(a, b) };
  return q;
}
function applyUpdate(doc, u) {
  const set = u.$set || (u.$inc ? {} : u);
  Object.assign(doc, set);
  Object.entries(u.$inc || {}).forEach(([k, v]) => { doc[k] = Math.round(((doc[k] || 0) + v) * 100) / 100; });
}
Object.entries(models).forEach(([name, M]) => {
  const all = () => db[name];
  const one = (f) => all().find((d) => matches(d, f)) || null;
  M.find = (f) => query(all().filter((d) => matches(d, f)).map(copy));
  M.findOne = (f) => query(copy(one(f)));
  M.findById = (id) => query(copy(one({ _id: id })));
  M.exists = async (f) => (one(f) ? { _id: one(f)._id } : null);
  M.countDocuments = async (f) => all().filter((d) => matches(d, f || {})).length;
  M.aggregate = async () => [];
  M.create = async (doc) => {
    if (name === 'Transaction' && doc.transaction_id && all().some((t) => t.transaction_id === doc.transaction_id)) throw Object.assign(new Error('E11000'), { code: 11000 });
    const d = { _id: new ObjectId(), created_at: new Date(), ...doc };
    all().push(d);
    return d;
  };
  M.updateOne = async (f, u) => { const d = one(f); if (d) applyUpdate(d, u); return { matchedCount: d ? 1 : 0, modifiedCount: d ? 1 : 0 }; };
  M.findByIdAndUpdate = async (id, u) => { const d = one({ _id: id }); if (d) applyUpdate(d, u); return d; };
  M.findOneAndUpdate = async (f, u, opts = {}) => {
    let d = one(f);
    if (!d && opts.upsert) { d = { _id: new ObjectId(), ...f }; all().push(d); }
    if (!d) return null;
    const before = copy(d);
    applyUpdate(d, u);
    return opts.new ? copy(d) : before;
  };
});

const HASH = bcrypt.hashSync('secret123', 4);
const ids = {};
const get = (name, id) => db[name].find((d) => same(d._id, id));
function reset() {
  auth._resetLoginThrottle();
  db = { User: [], Transaction: [], WithdrawalRequest: [], Setting: [] };
  ids.super = new ObjectId();
  ids.player = new ObjectId();
  db.User.push({ _id: ids.super, name: 'super', email: 'super@test.local', password: HASH, is_admin: true, is_super_admin: true });
  db.User.push({ _id: ids.player, old_id: 7, name: 'Asha', email: 'asha@x.com', mobile: '+919811122233', deposit_balance: 100, winnings_balance: 50 });
}
async function login(email = 'super@test.local', password = 'secret123') {
  const agent = request.agent(adminApp);
  const res = await agent.post('/login').type('form').send({ email, password });
  return { agent, res };
}
const admin = async () => (await login()).agent;
const player = () => get('User', ids.player);

describe('Admin login', () => {
  beforeEach(reset);

  test('an operator in the email field does not log anyone in', async () => {
    const agent = request.agent(adminApp);
    const res = await agent.post('/login').type('form').send('email[$ne]=x&password=secret123');
    assert.equal(res.headers.location, '/login');
    assert.equal((await agent.get('/dashboard')).headers.location, '/login');
  });

  test('email is case-insensitive; wrong email and wrong password give the same message', async () => {
    const ok = await login('SUPER@test.local');
    assert.equal(ok.res.headers.location, '/dashboard');

    const a = await login('nobody@test.local');
    const b = await login('super@test.local', 'wrong-pass');
    const textA = (await a.agent.get('/login')).text;
    const textB = (await b.agent.get('/login')).text;
    assert.match(textA, /Invalid credentials or not an admin\./);
    assert.match(textB, /Invalid credentials or not an admin\./);
    assert.doesNotMatch(textB, /Invalid password\./);
  });

  test('five failed attempts lock the account for 15 minutes, even with the right password', async () => {
    for (let i = 0; i < 5; i += 1) await login('super@test.local', 'wrong-pass');
    const { agent, res } = await login();
    assert.equal(res.headers.location, '/login');
    assert.match((await agent.get('/login')).text, /Too many failed login attempts/);
  });
});

describe('Players → edit and wallet', () => {
  beforeEach(reset);

  test('saving the edit form does not change balances', async () => {
    const agent = await admin();
    player().winnings_balance = 80; // e.g. a prize credited after the form was opened
    await agent.post(`/users/${ids.player}?_method=PUT`).type('form')
      .send({ name: 'Asha K', email: 'asha@x.com', deposit_balance: '0', winnings_balance: '50' });
    assert.equal(player().name, 'Asha K');
    assert.equal(player().deposit_balance, 100);
    assert.equal(player().winnings_balance, 80);
  });

  test('credit and debit move the balance with a ledger row and the reason', async () => {
    const agent = await admin();
    await agent.post(`/users/${ids.player}/wallet`).type('form').send({ type: 'add_winnings', amount: '25', reason: 'Goodwill credit' });
    assert.equal(player().winnings_balance, 75);
    await agent.post('/users/7/wallet').type('form').send({ type: 'deduct_deposit', amount: '40', reason: 'Duplicate deposit' });
    assert.equal(player().deposit_balance, 60);
    const rows = db.Transaction.filter((t) => t.payment_method === 'Admin adjustment');
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map((t) => [t.type, t.amount]), [['deposit', 25], ['withdrawal', 40]]);
    assert.match(rows[0].description, /Goodwill credit/);
    assert.ok(rows.every((t) => /^ADJ_/.test(t.transaction_id)));
  });

  test('negative amounts, a missing reason, an unknown action and overdrafts are refused', async () => {
    const agent = await admin();
    const cases = [
      { type: 'add_deposit', amount: '-50', reason: 'test' },
      { type: 'deduct_deposit', amount: '-50', reason: 'test' },
      { type: 'add_deposit', amount: '10', reason: '' },
      { type: 'steal', amount: '10', reason: 'test' },
      { amount: '10', reason: 'test' },
      { type: 'deduct_winnings', amount: '51', reason: 'too much' },
    ];
    for (const body of cases) {
      const res = await agent.post(`/users/${ids.player}/wallet`).type('form').send(body);
      assert.equal(res.status, 302, JSON.stringify(body));
    }
    assert.equal(player().deposit_balance, 100);
    assert.equal(player().winnings_balance, 50);
    assert.equal(db.Transaction.length, 0);
  });
});

describe('Transactions → approve / reject', () => {
  beforeEach(reset);

  test('a pending deposit is credited once, however often Approve is clicked', async () => {
    const t = { _id: new ObjectId(), old_id: 501, user_id: ids.player, type: 'deposit', amount: 30, status: 'pending' };
    db.Transaction.push(t);
    const agent = await admin();
    await Promise.all([1, 2, 3].map(() => agent.post('/transactions/501/approve')));
    assert.equal(get('Transaction', t._id).status, 'success');
    assert.equal(player().deposit_balance, 130);
  });

  test('a withdrawal that belongs to a withdrawal request is sent to that page, nothing refunded', async () => {
    const w = { _id: new ObjectId(), user_id: ids.player, amount: 20, status: 'pending' };
    db.WithdrawalRequest.push(w);
    const t = { _id: new ObjectId(), user_id: ids.player, type: 'withdrawal', amount: 20, status: 'pending', transaction_id: `WD_${w._id}` };
    const legacy = { _id: new ObjectId(), user_id: ids.player, type: 'withdrawal', amount: 20, status: 'pending', description: `Withdrawal request #${w._id} (USDT TRC20)` };
    db.Transaction.push(t, legacy);
    const agent = await admin();
    for (const row of [t, legacy]) {
      const res = await agent.post(`/transactions/${row._id}/reject`);
      assert.equal(res.headers.location, `/withdrawal_requests/${w._id}`);
      assert.equal(get('Transaction', row._id).status, 'pending');
    }
    assert.equal(player().winnings_balance, 50);
  });

  test('rejecting an unlinked pending withdrawal refunds it exactly once', async () => {
    const t = { _id: new ObjectId(), user_id: ids.player, type: 'withdrawal', amount: 20, status: 'pending', description: 'Old withdrawal' };
    db.Transaction.push(t);
    const agent = await admin();
    await Promise.all([1, 2].map(() => agent.post(`/transactions/${t._id}/reject`)));
    assert.equal(get('Transaction', t._id).status, 'failed');
    assert.equal(player().winnings_balance, 70);
    assert.equal(db.Transaction.filter((x) => x.transaction_id === `TXNREFUND_${t._id}`).length, 1);
  });
});

describe('App Settings and withdrawal form', () => {
  beforeEach(reset);

  test('POST /settings saves only the page\'s own keys', async () => {
    const agent = await admin();
    await agent.post('/settings').type('form').send({ terms: 'New terms', min_withdrawal_amount: '0', probcoin_conversion: 'x' });
    const keys = db.Setting.map((s) => s.key);
    assert.deepEqual(keys, ['terms']);
  });

  test('withdrawal Accept/Reject form sends PUT through the query string', () => {
    const view = fs.readFileSync(path.join(__dirname, '../../src/admin/views/withdrawals/show.ejs'), 'utf8');
    assert.match(view, /action="\/withdrawal_requests\/<%= request\._id %>\?_method=PUT"/);
  });
});
