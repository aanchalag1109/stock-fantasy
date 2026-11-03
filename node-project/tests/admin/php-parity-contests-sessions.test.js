'use strict';

/**
 * PHP PARITY tests — contests, sessions and Live Management features that were missed in the
 * PHP → Node conversion (contest cancel + refund, session cancel/deactivate + refund, Live
 * Management actions, session edit rules, refetch missing prices).
 * Runs the real admin app (logged in as a super admin) against an in-memory store.
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

mongoose.set('bufferCommands', false); // unstubbed DB calls fail fast

const bcrypt = require('bcryptjs');
const request = require('supertest');
const logger = require('../../src/config/logger');
const models = {
  LeagueSession: require('../../src/models/league-session.model'),
  Contest: require('../../src/models/contest.model'),
  ContestEntry: require('../../src/models/contest-entry.model'),
  SavedBasket: require('../../src/models/saved-basket.model'),
  ContestPerformancePrize: require('../../src/models/contest-performance-prize.model'),
  Transaction: require('../../src/models/transaction.model'),
  User: require('../../src/models/user.model'),
  Notification: require('../../src/models/notification.model'),
  JobLock: require('../../src/models/job-lock.model'),
  AdminRole: require('../../src/models/admin-role.model'),
  Asset: require('../../src/models/asset.model'),
  MarketTypeCategory: require('../../src/models/market-type-category.model'),
};
const Setting = require('../../src/models/setting.model');
const priceFeed = require('../../src/services/contest-automation/price-feed');
const notifications = require('../../src/services/notifications/notification.service');
const adminApp = require('../../src/admin/app');

logger.silent = true;
const { ObjectId } = mongoose.Types;

// ─── In-memory store (same approach as tests/contest-automation) ─────────────

let db;
const same = (a, b) => (a == null && b == null) || String(a) === String(b);
const cmp = (a, b) => (a instanceof Date || b instanceof Date ? new Date(a) - new Date(b) : Number(a) - Number(b));
function matches(doc, filter = {}) {
  return Object.entries(filter).every(([key, cond]) => {
    if (key === '$or') return cond.some((f) => matches(doc, f));
    const val = key.split('.').reduce((v, k) => (v == null ? undefined : v[k]), doc);
    if (cond instanceof RegExp) return cond.test(val == null ? '' : String(val));
    if (cond && typeof cond === 'object' && !(cond instanceof ObjectId) && !(cond instanceof Date) && Object.keys(cond).some((k) => k.startsWith('$'))) {
      return Object.entries(cond).every(([op, arg]) => {
        switch (op) {
          case '$ne': return !same(val, arg);
          case '$in': return arg.some((a) => same(val, a));
          case '$nin': return !arg.some((a) => same(val, a));
          case '$gt': return val != null && cmp(val, arg) > 0;
          case '$gte': return val != null && cmp(val, arg) >= 0;
          case '$lt': return val != null && cmp(val, arg) < 0;
          case '$lte': return val != null && cmp(val, arg) <= 0;
          case '$regex': return val != null && new RegExp(arg).test(String(val));
          case '$not': return !(val != null && arg.test(String(val)));
          default: throw new Error(`unsupported operator ${op}`);
        }
      });
    }
    return same(val, cond);
  });
}
const copy = (d) => (d ? JSON.parse(JSON.stringify(d), (k, v) => (typeof v === 'string' && /^\d{4}-\d\d-\d\dT/.test(v) ? new Date(v) : v)) : d);
function query(value) {
  // sort / skip / limit are applied to array results (used by the list-filter tests)
  const sortBy = (spec) => (x, y) => {
    for (const [k, dir] of Object.entries(spec)) {
      const a = x[k]; const b = y[k];
      if (a == null && b == null) continue;
      if (a == null) return dir; if (b == null) return -dir;
      const c = a instanceof ObjectId || typeof a === 'string' ? String(a).localeCompare(String(b)) : cmp(a, b);
      if (c) return c * dir;
    }
    return 0;
  };
  const q = {
    select: () => q, session: () => q, lean: () => q, populate: () => q,
    sort: (spec) => { if (Array.isArray(value) && spec && typeof spec === 'object') value = [...value].sort(sortBy(spec)); return q; },
    skip: (n) => { if (Array.isArray(value)) value = value.slice(n); return q; },
    limit: (n) => { if (Array.isArray(value)) value = value.slice(0, n); return q; },
    then: (a, b) => Promise.resolve(value).then(a, b),
  };
  return q;
}
function applyUpdate(doc, update) {
  const set = update.$set || (update.$inc || update.$unset ? {} : update);
  Object.assign(doc, set);
  Object.entries(update.$inc || {}).forEach(([k, v]) => { doc[k] = (doc[k] || 0) + v; });
}
function stub(name) {
  const Model = models[name];
  const all = () => db[name];
  const find = (f) => all().find((d) => matches(d, f)) || null;
  Model.find = (f) => query(all().filter((d) => matches(d, f)).map(copy));
  Model.findOne = (f) => query(copy(find(f)));
  Model.findById = (id) => query(copy(find({ _id: id })));
  Model.exists = async (f) => (find(f) ? { _id: find(f)._id } : null);
  Model.countDocuments = async (f) => all().filter((d) => matches(d, f || {})).length;
  Model.aggregate = async (pipeline) => {
    const m = pipeline.find((st) => st.$match);
    const rows = all().filter((d) => matches(d, m ? m.$match : {}));
    const group = (pipeline.find((st) => st.$group) || {}).$group || {};
    if (group._id === '$status') {
      const byStatus = new Map();
      rows.forEach((d) => byStatus.set(d.status, (byStatus.get(d.status) || 0) + 1));
      return [...byStatus].map(([status, n]) => ({ _id: status, n }));
    }
    if (group._id === null) return rows.length ? [{ _id: null, pool: rows.reduce((t, d) => t + (Number(d.prize_pool) || 0), 0) }] : [];
    const counts = new Map();
    rows.forEach((d) => { const k = String(d.contest_id); counts.set(k, { _id: d.contest_id, count: ((counts.get(k) || {}).count || 0) + 1 }); });
    return [...counts.values()];
  };
  Model.create = async (input) => {
    const make = (doc) => {
      const unique = { Transaction: 'transaction_id', Notification: 'dedupe_key' }[name];
      if (unique && doc[unique] && all().some((d) => d[unique] === doc[unique])) throw Object.assign(new Error('E11000'), { code: 11000 });
      const d = { _id: new ObjectId(), created_at: new Date(), ...doc };
      all().push(d);
      return d;
    };
    return Array.isArray(input) ? input.map(make) : make(input);
  };
  Model.insertMany = async (docs) => docs.map((d) => { const x = { _id: new ObjectId(), ...d }; all().push(x); return x; });
  Model.updateOne = async (f, u) => { const d = find(f); if (d) applyUpdate(d, u); return { modifiedCount: d ? 1 : 0 }; };
  Model.updateMany = async (f, u) => { const ds = all().filter((d) => matches(d, f)); ds.forEach((d) => applyUpdate(d, u)); return { modifiedCount: ds.length }; };
  Model.deleteOne = async (f) => { const n = all().length; const d = find(f); db[name] = all().filter((x) => x !== d); return { deletedCount: n - db[name].length }; };
  Model.deleteMany = async (f) => { const n = all().length; db[name] = all().filter((d) => !matches(d, f)); return { deletedCount: n - db[name].length }; };
  Model.findOneAndUpdate = async (f, u, opts = {}) => {
    let d = find(f);
    if (!d && opts.upsert) {
      if (f._id && all().some((x) => same(x._id, f._id))) throw Object.assign(new Error('E11000'), { code: 11000 });
      d = { _id: f._id || new ObjectId() };
      all().push(d);
    }
    if (!d) return null;
    const before = copy(d);
    applyUpdate(d, u);
    return opts.new ? copy(d) : before;
  };
}
Object.keys(models).forEach(stub);
Setting.findOne = () => query(null);

let feedPrices;
priceFeed.getPrices = async (session, assets) => {
  const prices = new Map();
  assets.forEach((a) => { if (feedPrices[a.asset_symbol] > 0) prices.set(a.asset_symbol, feedPrices[a.asset_symbol]); });
  return { prices, unsupported: [] };
};

// ─── Fixtures ────────────────────────────────────────────────────────────────

const HASH = bcrypt.hashSync('secret123', 4);
const ids = {};
const get = (name, id) => db[name].find((d) => same(d._id, id));
const min = (m) => new Date(Date.now() + m * 60000);

function reset() {
  db = Object.fromEntries(Object.keys(models).map((n) => [n, []]));
  feedPrices = { AAA: 100, BBB: 200 };
  ids.super = new ObjectId();
  ids.viewer = new ObjectId();
  ids.viewerRole = new ObjectId();
  db.AdminRole.push({ _id: ids.viewerRole, name: 'Viewer', name_key: 'viewer', permissions: ['live_management.view', 'contests.view', 'sessions.view'] });
  db.User.push({ _id: ids.super, name: 'super', email: 'super@test.local', password: HASH, is_admin: true, is_super_admin: true });
  db.User.push({ _id: ids.viewer, name: 'viewer', email: 'viewer@test.local', password: HASH, is_admin: true, admin_role_id: ids.viewerRole });
}
function addSession(extra = {}) {
  const s = {
    _id: new ObjectId(), name: 'Morning League', market_type: 'stock', status: 'live', active: true,
    start_time: min(-10), end_time: min(50), max_stocks: 5, start_prices_captured_at: null, end_prices_captured_at: null,
    assets: [{ asset_symbol: 'AAA', start_price: 100, end_price: null }, { asset_symbol: 'BBB', start_price: 200, end_price: null }],
    ...extra,
  };
  db.LeagueSession.push(s);
  return s;
}
function addContest(session, extra = {}) {
  const c = { _id: new ObjectId(), league_session_id: session ? session._id : null, category: 'mega', status: 'live', entry_fee: 25, platform_fee: 10, winning_percentage: 30, participants: 100, prize_pool: 500, is_calculated: false, prizes_distributed: false, ...extra };
  db.Contest.push(c);
  return c;
}
function addEntries(contest, n, gain = (i) => 10 - i) {
  const rows = [];
  for (let i = 0; i < n; i += 1) {
    const user = { _id: new ObjectId(), name: `player${i}`, email: `p${i}@x`, deposit_balance: 0, winnings_balance: 0 };
    const sym = `S${String(contest._id).slice(-4)}${i}`;
    const basket = { _id: new ObjectId(), assets: [{ name: sym }], multipliers: [] };
    const entry = { _id: new ObjectId(), contest_id: contest._id, user_id: user._id, basket_id: basket._id, total_score: 0, created_at: new Date(Date.now() + i) };
    db.User.push(user); db.SavedBasket.push(basket); db.ContestEntry.push(entry);
    rows.push({ user, basket, entry, sym, gain: gain(i) });
  }
  return rows;
}
async function login(email = 'super@test.local') {
  const agent = request.agent(adminApp);
  const res = await agent.post('/login').type('form').send({ email, password: 'secret123' });
  assert.equal(res.status, 302);
  return agent;
}
const json = (agent, method, url) => agent[method](url).set('Accept', 'application/json');
const balance = (row) => get('User', row.user._id).deposit_balance;

// ─── Contests: Cancel + refund ───────────────────────────────────────────────

describe('Contests → Cancel (PHP cancelContest)', () => {
  beforeEach(reset);

  test('cancels and refunds every entry fee once, even for orphaned contests (no session)', async () => {
    const c = addContest(null, { status: 'upcoming' }); // 192 real contests look like this
    const rows = addEntries(c, 3);
    const admin = await login();
    const res = await json(admin, 'post', `/contests/${c._id}/cancel`);
    assert.equal(res.status, 200, res.text);
    assert.equal(res.body.message, 'Contest cancelled and users refunded');
    assert.equal(get('Contest', c._id).status, 'cancelled');
    rows.forEach((r) => assert.equal(balance(r), 25));
    assert.ok(db.Transaction.every((t) => t.description === `Contest #${c._id} cancelled - Entry fee refunded` && t.type === 'deposit'));

    const again = await json(admin, 'post', `/contests/${c._id}/cancel`);
    assert.equal(again.status, 400);
    assert.equal(again.body.message, 'Already cancelled');
    rows.forEach((r) => assert.equal(balance(r), 25));
  });

  test('double clicks refund only once', async () => {
    const c = addContest(addSession());
    const rows = addEntries(c, 4);
    const admin = await login();
    const results = await Promise.all([1, 2, 3].map(() => json(admin, 'post', `/contests/${c._id}/cancel`)));
    assert.equal(results.filter((r) => r.status === 200).length, 1);
    rows.forEach((r) => assert.equal(balance(r), 25));
    assert.equal(db.Transaction.length, 4);
  });

  test('an interrupted cancellation can be finished without paying anyone twice', async () => {
    const c = addContest(addSession());
    const rows = addEntries(c, 3);
    // Simulate a crash after the first refund: contest cancelled, 1 of 3 refunded.
    Object.assign(get('Contest', c._id), { status: 'cancelled', refunds_started_at: new Date() });
    db.Transaction.push({ _id: new ObjectId(), user_id: rows[0].user._id, type: 'deposit', amount: 25, status: 'success', transaction_id: `REFUND_${c._id}_E${rows[0].entry._id}` });
    get('User', rows[0].user._id).deposit_balance = 25;
    const admin = await login();
    const res = await json(admin, 'post', `/contests/${c._id}/cancel`);
    assert.equal(res.status, 200);
    assert.match(res.body.message, /2 pending refund/);
    rows.forEach((r) => assert.equal(balance(r), 25));
  });

  test('paid contests cannot be cancelled', async () => {
    const c = addContest(addSession(), { prizes_distributed: true });
    addEntries(c, 2);
    const admin = await login();
    const res = await json(admin, 'post', `/contests/${c._id}/cancel`);
    assert.equal(res.status, 409);
    assert.equal(db.Transaction.length, 0);
  });

  test('pin works on orphaned contests too', async () => {
    const c = addContest(null);
    const admin = await login();
    const res = await json(admin, 'post', `/contests/${c._id}/pin`).send({ pin_order: 3 });
    assert.equal(res.body.is_pinned, true);
    assert.equal(get('Contest', c._id).pin_order, 3);
  });
});

// ─── Session cancel (Live Management / session page / deactivate) ────────────

describe('Session cancel + refund', () => {
  beforeEach(reset);

  function sessionWithContests() {
    const s = addSession();
    const c1 = addContest(s);
    const c2 = addContest(s, { entry_fee: 10 });
    const done = addContest(s, { status: 'cancelled' });
    return { s, c1, c2, done, r1: addEntries(c1, 2), r2: addEntries(c2, 3) };
  }

  test('Live Management "Cancel Session": every contest cancelled, every user refunded once', async () => {
    const { s, c1, c2, done, r1, r2 } = sessionWithContests();
    const admin = await login();
    const res = await json(admin, 'post', `/api/cancel-session/${s._id}`);
    await notifications.idle();
    assert.equal(res.status, 200, res.text);
    assert.equal(res.body.contests_cancelled, 2);
    assert.equal(res.body.refunds, 5);
    assert.equal(get('LeagueSession', s._id).status, 'cancelled');
    assert.equal(get('LeagueSession', s._id).active, false);
    [c1, c2, done].forEach((c) => assert.equal(get('Contest', c._id).status, 'cancelled'));
    r1.forEach((r) => assert.equal(balance(r), 25));
    r2.forEach((r) => assert.equal(balance(r), 10));

    const again = await json(admin, 'post', `/api/cancel-session/${s._id}`);
    assert.equal(again.status, 400);
    assert.equal(again.body.message, 'Session already cancelled');
    assert.equal(db.Transaction.length, 5);
  });

  test('session page "Cancel Session" uses the same logic; completed sessions are refused', async () => {
    const { s } = sessionWithContests();
    const admin = await login();
    assert.equal((await json(admin, 'post', `/league_sessions/${s._id}/cancel`)).status, 200);

    const finished = addSession({ status: 'completed' });
    addEntries(addContest(finished, { status: 'completed' }), 2);
    const res = await json(admin, 'post', `/league_sessions/${finished._id}/cancel`);
    assert.equal(res.status, 400);
    assert.match(res.body.message, /Completed sessions cannot be cancelled/);
  });

  test('PHP path: deactivating a LIVE session in the edit form cancels it and refunds users', async () => {
    const { s, r1 } = sessionWithContests();
    const admin = await login();
    const res = await admin.post(`/league_sessions/${s._id}?_method=PUT`).type('form').send({ name: 'Morning League', active: '0' });
    assert.equal(res.status, 302);
    assert.equal(get('LeagueSession', s._id).status, 'cancelled');
    r1.forEach((r) => assert.equal(balance(r), 25));
  });

  test('view-only admins cannot cancel', async () => {
    const { s } = sessionWithContests();
    const viewer = await login('viewer@test.local');
    assert.equal((await json(viewer, 'post', `/api/cancel-session/${s._id}`)).status, 403);
    assert.equal((await json(viewer, 'post', `/league_sessions/${s._id}/cancel`)).status, 403);
    assert.equal(db.Transaction.length, 0);
  });
});

// ─── Live Management ─────────────────────────────────────────────────────────

describe('Live Management (PHP LiveManagementController)', () => {
  beforeEach(reset);

  test('page renders with PHP actions; viewers see no action buttons', async () => {
    const admin = await login();
    const page = await admin.get('/live-management');
    assert.equal(page.status, 200);
    ['Start Contests', 'Update Scores', 'Cleanup Orphaned', 'statusFilter', '/api/live-sessions-data'].forEach((t) => assert.match(page.text, new RegExp(t)));
    const viewer = await login('viewer@test.local');
    const vpage = await viewer.get('/live-management');
    assert.equal(vpage.status, 200);
    assert.doesNotMatch(vpage.text, /Start Contests/);
  });

  test('live-sessions-data: per-session contests, participants, prize pool and overview cards', async () => {
    const live = addSession();
    const c = addContest(live, { prize_pool: 300 });
    addEntries(c, 4);
    addSession({ status: 'upcoming' });
    const admin = await login();
    const res = await json(admin, 'get', '/api/live-sessions-data?status=live');
    assert.equal(res.body.sessions.length, 1);
    assert.equal(res.body.sessions[0].contests_count, 1);
    assert.equal(res.body.sessions[0].participants_count, 4);
    assert.equal(res.body.sessions[0].total_prize_pool, 300);
    assert.equal(res.body.live_sessions_count, 1);
    assert.equal(res.body.live_contests_count, 1);
    assert.equal(res.body.total_participants, 4);
    assert.equal(res.body.total_prize_pool, 300);
    assert.equal((await json(admin, 'get', '/api/live-sessions-data?status=all')).body.sessions.length, 2);
  });

  test('Start: upcoming session goes live, contests live, start prices captured', async () => {
    const s = addSession({ status: 'upcoming', start_time: min(30), end_time: min(90), assets: [{ asset_symbol: 'AAA' }, { asset_symbol: 'BBB' }] });
    const c = addContest(s, { status: 'upcoming' });
    const cancelled = addContest(s, { status: 'cancelled' });
    const [{ entry }] = addEntries(c, 1, () => 0).map((r) => { get('SavedBasket', r.basket._id).assets = [{ name: 'AAA' }]; return r; });
    const admin = await login();
    const res = await json(admin, 'post', `/api/start-session/${s._id}`);
    assert.equal(res.status, 200, res.text);
    assert.equal(get('LeagueSession', s._id).status, 'live');
    assert.equal(get('Contest', c._id).status, 'live');
    assert.equal(get('Contest', cancelled._id).status, 'cancelled');
    assert.deepEqual(get('LeagueSession', s._id).assets.map((a) => a.start_price), [100, 200]);
    assert.deepEqual(get('ContestEntry', entry._id).starting_prices, { AAA: 100 });

    assert.equal((await json(admin, 'post', `/api/start-session/${s._id}`)).status, 400, 'only upcoming sessions');
  });

  test('End & Distribute: end prices, session + contests completed, prizes paid once', async () => {
    const s = addSession();
    const c = addContest(s);
    const rows = addEntries(c, 10);
    get('LeagueSession', s._id).assets = rows.map((r) => ({ asset_symbol: r.sym, start_price: 100, end_price: null }));
    rows.forEach((r) => { feedPrices[r.sym] = 100 + r.gain; });
    const admin = await login();
    const res = await json(admin, 'post', `/api/manual-complete-session/${s._id}`);
    await notifications.idle();
    assert.equal(res.status, 200, res.text);
    assert.match(res.body.message, /Winnings distributed for 1 contests/);
    assert.equal(get('LeagueSession', s._id).status, 'completed');
    assert.equal(get('Contest', c._id).status, 'completed');
    assert.equal(get('Contest', c._id).prizes_distributed, true);
    assert.ok(get('User', rows[0].user._id).winnings_balance > 0, 'rank 1 paid');
    const paid = db.Transaction.filter((t) => t.type === 'winnings').length;

    const again = await json(admin, 'post', `/api/manual-complete-session/${s._id}`);
    assert.equal(again.status, 400);
    assert.equal(again.body.message, 'Session already completed.');
    assert.equal(db.Transaction.filter((t) => t.type === 'winnings').length, paid);
  });

  test('Cleanup Orphaned: live/upcoming contests of completed sessions → completed', async () => {
    const done = addSession({ status: 'completed' });
    const stuck = addContest(done, { status: 'live' });
    const cancelled = addContest(done, { status: 'cancelled' });
    const running = addContest(addSession(), { status: 'live' });
    const admin = await login();
    const res = await json(admin, 'post', '/api/fix-orphaned-contests');
    assert.equal(res.body.message, 'Fixed 1 orphaned contests.');
    assert.equal(get('Contest', stuck._id).status, 'completed');
    assert.equal(get('Contest', cancelled._id).status, 'cancelled');
    assert.equal(get('Contest', running._id).status, 'live');
  });

  test('Start Contests / Update Scores run the automation jobs', async () => {
    addContest(addSession({ status: 'upcoming', start_time: min(-1), end_time: min(60) }), { status: 'upcoming' });
    const admin = await login();
    const start = await json(admin, 'post', '/api/live/start-contests');
    assert.equal(start.body.success, true);
    assert.equal(start.body.sessions_started, 1);
    assert.equal(start.body.contests_started, 1);
    const scores = await json(admin, 'post', '/api/live/update-scores');
    assert.equal(scores.body.success, true);
  });

  test('View Detail pages: session contests, contest participants and portfolio', async () => {
    const s = addSession();
    const c = addContest(s);
    const rows = addEntries(c, 2);
    get('ContestEntry', rows[0].entry._id).total_score = 300;
    get('ContestEntry', rows[0].entry._id).starting_prices = { [rows[0].sym]: 100 };
    get('LeagueSession', s._id).assets.push({ asset_symbol: rows[0].sym, start_price: 100, end_price: 103 });
    const admin = await login();

    const page = await admin.get(`/session-contests/${s._id}`);
    assert.equal(page.status, 200);
    assert.match(page.text, new RegExp(`/live-contest-detail/${c._id}`));
    assert.equal((await admin.get(`/live-contest-detail/${c._id}`)).status, 200);

    const details = await json(admin, 'get', `/api/contest-details/${c._id}`);
    assert.equal(details.body.participants_count, 2);
    assert.equal(details.body.participants[0].user_name, 'player0');
    assert.equal(details.body.contest.session_name, 'Morning League');

    const portfolio = await json(admin, 'get', `/api/portfolio-details/${rows[0].entry._id}`);
    assert.equal(portfolio.body.participant.user_name, 'player0');
    assert.deepEqual(portfolio.body.assets.map((a) => [a.start_price, a.current_price, a.change_percent]), [[100, 103, 3]]);
  });

  test('action endpoints require live_management.manage', async () => {
    const s = addSession({ status: 'upcoming' });
    const viewer = await login('viewer@test.local');
    for (const url of [`/api/start-session/${s._id}`, `/api/manual-complete-session/${s._id}`, '/api/fix-orphaned-contests', '/api/live/start-contests', '/api/live/update-scores']) {
      assert.equal((await json(viewer, 'post', url)).status, 403, url);
    }
    assert.equal(get('LeagueSession', s._id).status, 'upcoming');
  });
});

// ─── Session edit & refetch ──────────────────────────────────────────────────

describe('Session edit (PHP edit rules) and Refetch Missing Prices', () => {
  beforeEach(reset);

  test('edit form shows times in IST; saving without changes keeps the exact times', async () => {
    const s = addSession({ status: 'upcoming', start_time: new Date('2026-11-05T04:00:00Z'), end_time: new Date('2026-11-05T10:00:00Z') });
    const admin = await login();
    const page = await admin.get(`/league_sessions/${s._id}/edit`);
    assert.match(page.text, /value="2026-11-05T09:30"/); // 04:00 UTC = 09:30 IST
    await admin.post(`/league_sessions/${s._id}?_method=PUT`).type('form')
      .send({ name: 'renamed', start_time: '2026-11-05T09:30', end_time: '2026-11-05T15:30' });
    assert.equal(get('LeagueSession', s._id).start_time.toISOString(), '2026-11-05T04:00:00.000Z');
    assert.equal(get('LeagueSession', s._id).name, 'Morning League', 'name is locked for upcoming sessions (PHP)');
  });

  test('upcoming: end must be after start; live: times locked, rename allowed', async () => {
    const up = addSession({ status: 'upcoming' });
    const admin = await login();
    await admin.post(`/league_sessions/${up._id}?_method=PUT`).type('form').send({ start_time: '2026-11-05T10:00', end_time: '2026-11-05T09:00' });
    assert.notEqual(get('LeagueSession', up._id).end_time.toISOString(), new Date('2026-11-05T03:30:00Z').toISOString());

    const live = addSession();
    const startBefore = get('LeagueSession', live._id).start_time.toISOString();
    await admin.post(`/league_sessions/${live._id}?_method=PUT`).type('form').send({ name: 'Evening', active: '1', start_time: '2030-01-01T00:00', end_time: '2030-01-01T01:00' });
    assert.equal(get('LeagueSession', live._id).name, 'Evening');
    assert.equal(get('LeagueSession', live._id).start_time.toISOString(), startBefore);
    assert.equal(get('LeagueSession', live._id).status, 'live');
  });

  test('draft: assets can be edited and captured prices are kept', async () => {
    db.MarketTypeCategory.push({ _id: new ObjectId(), old_id: 7, name: 'Large Cap Indian', category_type: 'stock', status: 'active' });
    db.Asset.push({ _id: new ObjectId(), symbol: 'CCC', name: 'Ccc Ltd', status: 'active' });
    const s = addSession({ status: 'draft' });
    const admin = await login();
    // Exactly what the edit page's checkbox grid posts (asset_selection[]=<categoryId>:<symbol>).
    await admin.post(`/league_sessions/${s._id}?_method=PUT`).type('form').send(
      'name=Draft&market_type=stock&max_stocks=4&start_time=2026-11-05T09%3A30&end_time=2026-11-05T15%3A30'
      + '&status=upcoming&active=1&asset_selection%5B%5D=7%3AAAA&asset_selection%5B%5D=7%3ACCC',
    );
    const saved = get('LeagueSession', s._id);
    assert.deepEqual(saved.assets.map((a) => a.asset_symbol), ['AAA', 'CCC']);
    assert.equal(saved.assets[0].start_price, 100, 'existing price kept');
    assert.equal(saved.assets[1].category_name, 'Large Cap Indian');
    assert.equal(saved.max_stocks, 4);
    assert.equal(saved.status, 'upcoming');
  });

  test('session CREATE keeps the selected assets (multer parses stocks[22][] into a sparse array)', async () => {
    db.MarketTypeCategory.push({ _id: new ObjectId(), old_id: 22, name: 'Large Cap Indian', category_type: 'stock', status: 'active' });
    db.Asset.push({ _id: new ObjectId(), symbol: 'RELIANCE', name: 'Reliance', status: 'active' }, { _id: new ObjectId(), symbol: 'TCS', name: 'TCS', status: 'active' });
    const admin = await login();
    const res = await admin.post('/league_sessions')
      .field('name', 'Nifty 50').field('market_type', 'stock').field('max_stocks', '5')
      .field('start_time', '2026-11-06T09:30').field('end_time', '2026-11-06T15:30')
      .field('status', 'upcoming').field('active', '1')
      .field('stocks[22][]', 'RELIANCE').field('stocks[22][]', 'TCS');
    assert.equal(res.status, 302);
    const created = db.LeagueSession.find((x) => x.name === 'Nifty 50');
    assert.ok(created, 'session created');
    assert.deepEqual(created.assets.map((a) => [a.category_id, a.category_name, a.asset_symbol]), [[22, 'Large Cap Indian', 'RELIANCE'], [22, 'Large Cap Indian', 'TCS']]);
  });

  test('completed and cancelled sessions are read-only', async () => {
    const done = addSession({ status: 'completed' });
    const admin = await login();
    const res = await admin.get(`/league_sessions/${done._id}/edit`);
    assert.equal(res.headers.location, `/league_sessions/${done._id}`);
    await admin.post(`/league_sessions/${done._id}?_method=PUT`).type('form').send({ name: 'x' });
    assert.equal(get('LeagueSession', done._id).name, 'Morning League');
  });

  test('Refetch Missing Prices fills only what is missing, and only where it makes sense', async () => {
    const live = addSession({ assets: [{ asset_symbol: 'AAA', start_price: 90 }, { asset_symbol: 'BBB', start_price: null }] });
    const admin = await login();
    const res = await json(admin, 'post', `/league_sessions/${live._id}/refetch-prices`);
    assert.equal(res.body.success, true);
    assert.equal(res.body.fetched, 1);
    assert.deepEqual(get('LeagueSession', live._id).assets.map((a) => [a.start_price, a.end_price == null ? null : a.end_price]), [[90, null], [200, null]], 'no end prices for a live session; existing price kept');

    const upcoming = addSession({ status: 'upcoming' });
    assert.equal((await json(admin, 'post', `/league_sessions/${upcoming._id}/refetch-prices`)).status, 400);

    const done = addSession({ status: 'completed', assets: [{ asset_symbol: 'AAA', start_price: 90, end_price: null }] });
    await json(admin, 'post', `/league_sessions/${done._id}/refetch-prices`);
    assert.equal(get('LeagueSession', done._id).assets[0].end_price, 100);
  });

  test('session page shows Refetch and Cancel buttons by status', async () => {
    const live = addSession();
    const admin = await login();
    const page = await admin.get(`/league_sessions/${live._id}`);
    assert.match(page.text, /Refetch Missing Prices/);
    assert.match(page.text, /Cancel Session/);
    assert.match(page.text, /This session is live/);
  });
});

// ─── NEW IMPLEMENTATION — NODE.JS PROJECT: client feedback — list filters + refund-safe delete ──

describe('Sessions & Contests list filters (client feedback)', () => {
  beforeEach(reset);

  const day = (iso) => new Date(`${iso}T10:00:00+05:30`); // 10:00 IST on that day
  const sessionRows = (html) => [...html.matchAll(/<div class="fw-semibold text-dark">([^<]+)<\/div>/g)].map((m) => m[1]);
  const tabCount = (html, tab) => Number(html.match(new RegExp(`data-status-tab="${tab}"[\\s\\S]*?<span class="badge[^"]*"[^>]*>(\\d+)<`))[1]);

  function seedSessions() {
    addSession({ name: 'Oct 1 done', status: 'completed', start_time: day('2026-10-01'), end_time: day('2026-10-01') });
    addSession({ name: 'Oct 5 done', status: 'completed', start_time: day('2026-10-05'), end_time: day('2026-10-05') });
    addSession({ name: 'Oct 9 cancelled', status: 'cancelled', active: false, start_time: day('2026-10-09'), end_time: day('2026-10-09') });
    addSession({ name: 'Far upcoming', status: 'upcoming', start_time: min(60 * 24 * 30), end_time: min(60 * 24 * 30 + 60) });
  }

  test('sessions: latest first by default, oldest on request', async () => {
    seedSessions();
    const admin = await login();
    assert.deepEqual(sessionRows((await admin.get('/league_sessions')).text), ['Far upcoming', 'Oct 9 cancelled', 'Oct 5 done', 'Oct 1 done']);
    assert.deepEqual(sessionRows((await admin.get('/league_sessions?sort=oldest')).text), ['Oct 1 done', 'Oct 5 done', 'Oct 9 cancelled', 'Far upcoming']);
  });

  test('sessions: status + date range (IST days, inclusive) combine; tab counts follow the dates', async () => {
    seedSessions();
    const admin = await login();
    const page = (await admin.get('/league_sessions?status=completed&from=2026-10-02&to=2026-10-09')).text;
    assert.deepEqual(sessionRows(page), ['Oct 5 done']);
    assert.equal(tabCount(page, 'completed'), 1);
    assert.equal(tabCount(page, 'cancelled'), 1);
    assert.equal(tabCount(page, 'all'), 2);
    assert.match(page, /href="\/league_sessions\?status=cancelled&amp;from=2026-10-02&amp;to=2026-10-09"/, 'tabs keep the date filter');
    // swapped dates are tolerated; junk is ignored
    assert.deepEqual(sessionRows((await admin.get('/league_sessions?from=2026-10-05&to=2026-10-01&sort=oldest')).text), ['Oct 1 done', 'Oct 5 done']);
    assert.equal(sessionRows((await admin.get('/league_sessions?status=bogus&from=nope')).text).length, 4);
  });

  test('sessions list has a Cancel button for open sessions that refunds through the cancel route', async () => {
    const s = addSession({ name: 'Open one', status: 'upcoming', start_time: min(60), end_time: min(120) });
    addSession({ name: 'Done', status: 'completed', start_time: min(-120), end_time: min(-60) });
    const rows = addEntries(addContest(s, { status: 'active' }), 2);
    const admin = await login();
    const page = (await admin.get('/league_sessions')).text;
    assert.equal((page.match(/onclick="cancelSession\(/g) || []).length, 1);
    const res = await json(admin, 'post', `/league_sessions/${s._id}/cancel`);
    assert.equal(res.status, 200, res.text);
    rows.forEach((r) => assert.equal(balance(r), 25));
    assert.equal(get('LeagueSession', s._id).status, 'cancelled');
  });

  test('contests: status filters use the session state; Cancelled uses the contest; counts are not per page', async () => {
    const live = addSession({ status: 'live', start_time: day('2026-10-20') });
    const upcoming = addSession({ status: 'upcoming', start_time: day('2026-10-25') });
    const done = addSession({ status: 'completed', start_time: day('2026-10-10') });
    for (let i = 0; i < 10; i += 1) addContest(done, { status: 'completed', name: `Done ${i}`, created_at: day('2026-10-09') });
    addContest(live, { status: 'live', name: 'Live A', created_at: day('2026-10-18') });
    addContest(upcoming, { status: 'active', name: 'Up A', created_at: day('2026-10-19') });
    addContest(upcoming, { status: 'cancelled', name: 'Up cancelled', created_at: day('2026-10-21') });
    const admin = await login();
    const all = (await admin.get('/contests')).text;
    assert.equal(tabCount(all, 'all'), 13);
    assert.equal(tabCount(all, 'completed'), 10);
    assert.equal(tabCount(all, 'upcoming'), 1, 'cancelled contests are not counted as upcoming');
    assert.equal(tabCount(all, 'cancelled'), 1);
    const names = (html) => [...html.matchAll(/Contest: ([^<]+)<\/div>/g)].map((m) => m[1]);
    assert.deepEqual(names(all).slice(0, 3), ['Up cancelled', 'Up A', 'Live A'], 'newest first');
    assert.deepEqual(names((await admin.get('/contests?status=cancelled')).text), ['Up cancelled']);
    assert.deepEqual(names((await admin.get('/contests?status=upcoming')).text), ['Up A']);
    assert.deepEqual(names((await admin.get('/contests?from=2026-10-20&to=2026-10-31')).text), ['Up cancelled', 'Up A', 'Live A']);
    assert.match((await admin.get('/contests?status=completed&page=2')).text, /Showing 9 to 10 of 10 contests/);
  });
});

describe('Delete refunds open contests first (client feedback)', () => {
  beforeEach(reset);

  test('deleting an open contest refunds its joined users; a completed one is just deleted', async () => {
    const s = addSession({ status: 'upcoming' });
    const open = addContest(s, { status: 'active' });
    const rows = addEntries(open, 3);
    const done = addContest(addSession({ status: 'completed' }), { status: 'completed' });
    const doneRows = addEntries(done, 2);
    const admin = await login();
    await admin.post(`/contests/${open._id}?_method=DELETE`);
    assert.equal(get('Contest', open._id), undefined);
    rows.forEach((r) => assert.equal(balance(r), 25));
    await admin.post(`/contests/${done._id}?_method=DELETE`);
    assert.equal(get('Contest', done._id), undefined);
    doneRows.forEach((r) => assert.equal(balance(r), 0));
    assert.match((await admin.get('/contests')).text, /Contest deleted!/);
  });

  test('bulk delete refunds open contests and still skips live ones', async () => {
    const s = addSession({ status: 'upcoming' });
    const a = addContest(s, { status: 'active' });
    const live = addContest(addSession(), { status: 'live' });
    const rows = addEntries(a, 2);
    const admin = await login();
    await admin.post('/contests/bulk-delete').type('form').send({ 'contest_ids[]': [String(a._id), String(live._id)] });
    assert.equal(get('Contest', a._id), undefined);
    assert.ok(get('Contest', live._id));
    rows.forEach((r) => assert.equal(balance(r), 25));
    assert.match((await admin.get('/contests')).text, /Deleted 1 contests\. 2 entry fee\(s\) refunded\./);
  });

  test('deleting a session refunds its open contests and detaches them (PHP: ON DELETE SET NULL)', async () => {
    const s = addSession({ status: 'upcoming', start_time: min(60), end_time: min(120) });
    const c1 = addContest(s, { status: 'active' });
    const c2 = addContest(s, { status: 'cancelled' });
    const rows = addEntries(c1, 2);
    const admin = await login();
    await admin.post(`/league_sessions/${s._id}?_method=DELETE`);
    assert.equal(get('LeagueSession', s._id), undefined);
    rows.forEach((r) => assert.equal(balance(r), 25));
    assert.equal(get('Contest', c1._id).status, 'cancelled');
    assert.equal(get('Contest', c1._id).league_session_id, null);
    assert.equal(get('Contest', c2._id).league_session_id, null);
    assert.equal(db.Transaction.length, 2, 'the already-cancelled contest is not refunded again');
  });

  test('active live sessions still cannot be deleted', async () => {
    const s = addSession({ status: 'live', active: true });
    const rows = addEntries(addContest(s), 2);
    const admin = await login();
    await admin.post(`/league_sessions/${s._id}?_method=DELETE`);
    assert.ok(get('LeagueSession', s._id));
    rows.forEach((r) => assert.equal(balance(r), 0));
  });
});
