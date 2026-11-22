'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 * Players → Export CSV: same filters as the list (joined date range in India time, KYC, search),
 * per-player totals, CSV-injection safe, guarded by users.export.
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

mongoose.set('bufferCommands', false);

const bcrypt = require('bcryptjs');
const request = require('supertest');
const logger = require('../../src/config/logger');
const User = require('../../src/models/user.model');
const Transaction = require('../../src/models/transaction.model');
const ContestEntry = require('../../src/models/contest-entry.model');
const WithdrawalRequest = require('../../src/models/withdrawal-request.model');
const adminApp = require('../../src/admin/app');
const auth = require('../../src/admin/controllers/auth.controller');
const usersRouter = require('../../src/admin/routes/users.routes');
const { csvCell, dateRange } = require('../../src/services/admin-user-export.service');

logger.silent = true;
const { ObjectId } = mongoose.Types;

let db;
const same = (a, b) => (a == null && b == null) || String(a) === String(b);
function matches(doc, filter = {}) {
  return Object.entries(filter).every(([k, cond]) => {
    if (k === '$or') return cond.some((f) => matches(doc, f));
    if (k === '$nor') return !cond.some((f) => matches(doc, f));
    const val = doc[k];
    if (cond instanceof RegExp) return cond.test(val == null ? '' : String(val));
    if (cond && typeof cond === 'object' && !(cond instanceof ObjectId) && !(cond instanceof Date)) {
      return Object.entries(cond).every(([op, arg]) => {
        if (op === '$ne') return !same(val, arg);
        if (op === '$in') return arg.some((a) => same(val, a));
        if (op === '$gte') return val != null && new Date(val) >= arg;
        if (op === '$lte') return val != null && new Date(val) <= arg;
        throw new Error(`unsupported ${op}`);
      });
    }
    return same(val, cond);
  });
}
const query = (rows) => {
  let out = rows;
  const q = {
    select: () => q, lean: () => q, populate: () => q,
    sort: () => q,
    skip: (n) => { out = out.slice(n); return q; },
    limit: (n) => { out = out.slice(0, n); return q; },
    then: (a, b) => Promise.resolve(out).then(a, b),
  };
  return q;
};
function groupSum(rows, pipeline) {
  const [{ $match: m }, second] = pipeline;
  if (!second || !second.$group) return rows.filter((r) => matches(r, m)); // the Players list page
  const g = second.$group;
  const field = g.total.$sum;
  const map = new Map();
  rows.filter((r) => matches(r, m)).forEach((r) => {
    const k = String(r.user_id);
    map.set(k, (map.get(k) || 0) + (field === 1 ? 1 : r[field.slice(1)]));
  });
  return [...map].map(([_id, total]) => ({ _id, total }));
}
const stores = [[User, 'users'], [Transaction, 'txns'], [ContestEntry, 'entries'], [WithdrawalRequest, 'wds']];
stores.forEach(([M, name]) => {
  M.find = (f) => query(db[name].filter((d) => matches(d, f || {})));
  M.findOne = (f) => query(db[name].filter((d) => matches(d, f || {})).slice(0, 1)).then((r) => r[0] || null);
  M.findById = (id) => ({ ...query([]), then: (a, b) => Promise.resolve(db[name].find((d) => same(d._id, id)) || null).then(a, b), select() { return this; }, lean() { return this; } });
  M.countDocuments = async (f) => db[name].filter((d) => matches(d, f || {})).length;
  M.aggregate = async (p) => groupSum(db[name], p);
});

const HASH = bcrypt.hashSync('secret123', 4);
const ids = {};
function reset() {
  auth._resetLoginThrottle();
  ['super', 'a', 'b', 'c'].forEach((k) => { ids[k] = new ObjectId(); });
  db = {
    users: [
      { _id: ids.super, name: 'super', email: 'super@test.local', password: HASH, is_admin: true, is_super_admin: true },
      // 1 Nov 2026 00:30 IST = 31 Oct 19:00 UTC → belongs to 1 Nov in India
      { _id: ids.a, old_id: 11, name: 'Asha, "A"', email: 'asha@x.com', mobile: '+919800000001', kyc_status: 'approved', deposit_balance: 100, winnings_balance: 25.5, created_at: new Date('2026-10-31T19:00:00Z'), payment_details: { upi_id: 'asha@upi' } },
      { _id: ids.b, name: '=HYPERLINK("http://evil")', email: 'b@x.com', kyc_status: 'pending', deposit_balance: 0, winnings_balance: 0, created_at: new Date('2026-11-10T10:00:00Z') },
      { _id: ids.c, name: 'Old', email: 'c@x.com', created_at: new Date('2026-09-01T10:00:00Z') },
      { _id: new ObjectId(), name: 'Bot', is_test_user: true, created_at: new Date('2026-11-05T10:00:00Z') },
    ],
    txns: [
      { user_id: ids.a, type: 'deposit', status: 'success', amount: 500 },
      { user_id: 11, type: 'deposit', status: 'success', amount: 100 }, // legacy numeric id
      { user_id: ids.a, type: 'deposit', status: 'success', amount: 40, payment_method: 'Withdrawal refund' },
      { user_id: ids.a, type: 'deposit', status: 'failed', amount: 999 },
      { user_id: ids.a, type: 'winnings', status: 'success', amount: 75 },
    ],
    entries: [{ user_id: ids.a }, { user_id: ids.a }, { user_id: 11 }],
    wds: [{ user_id: ids.a, status: 'approved', amount: 30 }, { user_id: ids.a, status: 'rejected', amount: 70 }],
  };
}
async function admin() {
  const agent = request.agent(adminApp);
  await agent.post('/login').type('form').send({ email: 'super@test.local', password: 'secret123' });
  return agent;
}
const parse = (text) => text.replace(/^﻿/, '').trim().split('\r\n');

describe('Players → Export CSV', () => {
  beforeEach(reset);

  test('downloads the players joined in the date range (India time), bots excluded, with totals', async () => {
    const res = await (await admin()).get('/users/export?from=2026-11-01&to=2026-11-30');
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /text\/csv/);
    assert.match(res.headers['content-disposition'], /attachment; filename="players_from-2026-11-01_to-2026-11-30_\d+\.csv"/);
    assert.ok(res.text.startsWith('﻿'), 'UTF-8 BOM for Excel');
    const lines = parse(res.text);
    assert.equal(lines.length, 3, 'header + 2 players (Old and Bot left out)');
    assert.match(lines[0], /^User ID,Name,Email,Mobile/);
    const asha = lines.find((l) => l.startsWith('11,'));
    // name quoted, +mobile neutralised, balances, contests 3, deposited 600 (refund & failed excluded), winnings 75, withdrawn 30
    assert.equal(asha, `11,"Asha, ""A""",asha@x.com,'+919800000001,,,approved,No,100,25.5,125.5,3,600,75,30,asha@upi,,2026-11-01 00:30,`);
    assert.ok(lines.some((l) => l.includes(`"'=HYPERLINK(""http://evil"")"`)), 'formula neutralised');
  });

  test('uses the same KYC / search filters as the list', async () => {
    const agent = await admin();
    assert.equal(parse((await agent.get('/users/export?kyc_status=verified')).text).length, 2);
    assert.equal(parse((await agent.get('/users/export?search=c%40x.com')).text).length, 2);
    assert.equal(parse((await agent.get('/users/export')).text).length, 4, 'header + 3 (super admin without old_id and bot excluded)');
  });

  test('the list page applies the date filter and offers the export with the filters', async () => {
    const page = await (await admin()).get('/users?from=2026-11-01&to=2026-11-30');
    assert.equal(page.status, 200);
    assert.match(page.text, /formaction="\/users\/export"/);
    assert.match(page.text, /Export CSV \(2 players\)/);
  });

  test('the route requires users.export', () => {
    const layer = usersRouter.stack.find((l) => l.route && l.route.path === '/export');
    const guards = layer.route.stack.map((s) => s.handle.permissions).filter(Boolean);
    assert.deepEqual(guards, [['users.export']]);
  });

  test('helpers', () => {
    assert.equal(csvCell('-1+1'), "'-1+1");
    assert.equal(csvCell(-5), '-5');
    assert.equal(dateRange({ from: 'nope' }), null);
    assert.equal(dateRange({ to: '2026-11-22' }).$lte.toISOString(), '2026-11-22T18:29:59.999Z');
  });
});
