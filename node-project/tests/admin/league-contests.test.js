'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 * League Contests (client feedback): leagues → contests → players. Legacy and new ids, bots kept out of the
 * money, real prizes and refunds, states, filters, permissions, CSV. Real admin app on in-memory models.
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

mongoose.set('bufferCommands', false);

const bcrypt = require('bcryptjs');
const request = require('supertest');
const logger = require('../../src/config/logger');
const User = require('../../src/models/user.model');
const AdminRole = require('../../src/models/admin-role.model');
const LeagueSession = require('../../src/models/league-session.model');
const Contest = require('../../src/models/contest.model');
const ContestEntry = require('../../src/models/contest-entry.model');
const SavedBasket = require('../../src/models/saved-basket.model');
const Transaction = require('../../src/models/transaction.model');
const svc = require('../../src/services/league-contests.service');
const adminApp = require('../../src/admin/app');

logger.silent = true;
const { ObjectId } = mongoose.Types;
const HASH = bcrypt.hashSync('secret123', 4);
const day = (n) => new Date(Date.now() - n * 86400000);

// ─── In-memory store ─────────────────────────────────────────────────────────

let db;
// As MongoDB: a number, a string and an ObjectId are different values. ObjectId _ids are cast from strings.
const same = (a, b, k) => (a == null && b == null) || (a != null && b != null && (typeof a === typeof b || k === '_id') && String(a) === String(b));
const isOps = (c) => c && typeof c === 'object' && !(c instanceof ObjectId) && !(c instanceof Date) && !(c instanceof RegExp);
const hit = (v, a, k) => (a instanceof RegExp ? v != null && a.test(String(v)) : same(v, a, k));
const matches = (doc, f = {}) => Object.entries(f).every(([k, c]) => {
  if (k === '$or') return c.some((x) => matches(doc, x));
  const v = doc[k];
  if (!isOps(c)) return hit(v, c, k);
  return Object.entries(c).every(([op, arg]) => {
    if (op === '$in') return arg.some((a) => hit(v, a, k));
    if (op === '$gt') return v > arg;
    throw new Error(`unsupported ${op}`);
  });
});
function chain(rows, one) {
  const q = {
    select: () => q, lean: () => q, sort: () => q, populate: () => q,
    then: (a, b) => Promise.resolve(one ? (rows[0] ? { ...rows[0] } : null) : rows.map((d) => ({ ...d }))).then(a, b),
  };
  return q;
}
[[User, 'users'], [AdminRole, 'roles'], [LeagueSession, 'sessions'], [Contest, 'contests'], [ContestEntry, 'entries'], [SavedBasket, 'baskets'], [Transaction, 'txns']].forEach(([M, name]) => {
  const rows = (f) => db[name].filter((d) => matches(d, f));
  M.find = (f) => chain(rows(f));
  M.findOne = (f) => chain(rows(f), true);
  M.findById = (id) => chain(rows({ _id: id }), true);
  M.updateOne = async () => ({ modifiedCount: 0 });
});
ContestEntry.aggregate = async ([{ $match }, { $group }]) => {
  const groups = new Map();
  db.entries.filter((e) => matches(e, $match)).forEach((e) => {
    const perUser = typeof $group._id === 'object';
    const key = perUser ? `${typeof e.contest_id}${e.contest_id}|${typeof e.user_id}${e.user_id}` : `${typeof e.contest_id}${e.contest_id}`;
    if (!groups.has(key)) groups.set(key, { _id: perUser ? { c: e.contest_id, u: e.user_id } : e.contest_id, n: 0, recorded: 0, unrecorded: 0 });
    const g = groups.get(key);
    g.n += 1;
    g.recorded += (e.fee_from_winnings || 0) + (e.fee_from_deposit || 0);
    g.unrecorded += e.fee_from_winnings == null && e.fee_from_deposit == null ? 1 : 0;
  });
  return [...groups.values()];
};

let K;
let U;
function reset() {
  const role = { _id: new ObjectId(), name: 'Viewer', permissions: ['league_contests.view'] };
  const user = (name, extra) => ({ _id: new ObjectId(), name, mobile: `98${name}`, email: `${name}@p.test`, is_admin: false, ...extra });
  U = { asha: user('Asha', { old_id: 41 }), ben: user('Ben', { old_id: 42 }), chen: user('=Chen'), bot: user('Bot', { old_id: 900, is_test_user: true }) };
  const S1 = { _id: new ObjectId(), old_id: 301, name: 'Morning League', market: 'indian_stock', status: 'completed', start_time: day(3), end_time: day(2) };
  const S2 = { _id: new ObjectId(), name: 'Crypto Night', market: 'crypto', status: 'upcoming', start_time: day(-1), end_time: day(-2) };
  const contest = (extra) => ({ _id: new ObjectId(), category: 'mega', status: 'completed', participants: 20, entry_fee: 100, platform_fee: 10, winning_percentage: 30, prize_pool: 1800, prize_distribution: [], created_at: day(5), ...extra });
  K = {
    paid: contest({ old_id: 1148, league_session_id: 301, prizes_distributed: true }),
    legacy: contest({ old_id: 1001, league_session_id: S1._id, category: 'equal', entry_fee: 50 }), // paid by the old system
    pending: contest({ old_id: 1150, league_session_id: String(S1._id), category: 'multiplier', multiplier: 4, entry_fee: 20 }),
    cancelled: contest({ old_id: 1151, league_session_id: 301, status: 'cancelled', category: 'h2h', participants: 2 }),
    upcoming: contest({ league_session_id: S2._id, status: 'active' }),
    full: contest({ old_id: 1154, league_session_id: S2._id, status: 'active', category: 'h2h', participants: 2, entry_fee: 10 }),
  };
  let n = 5000;
  const entry = (contestId, userId, extra) => ({ _id: new ObjectId(), old_id: (n += 1), contest_id: contestId, user_id: userId, basket_id: 77, total_score: 0, rank: null, created_at: day(4), ...extra });
  const E = [
    entry(1148, 41, { fee_from_deposit: 60, fee_from_winnings: 40, rank: 1, total_score: 250 }),
    entry(K.paid._id, U.asha._id, { fee_from_deposit: 100, fee_from_winnings: 0, rank: 3 }),
    entry(K.paid._id, U.ben._id, { rank: 2 }), // fee not recorded → the contest's fee
    entry('1148', String(U.chen._id), { fee_from_deposit: 0, fee_from_winnings: 100, rank: 4 }),
    entry(K.paid._id, 900, { rank: 5 }),
    entry(1001, 42, { rank: 1 }), entry(1001, 41, { rank: 2 }),
    entry(K.pending._id, U.asha._id, { fee_from_deposit: 20 }),
    entry(1151, U.asha._id, { fee_from_deposit: 100 }), entry(K.cancelled._id, U.bot._id),
    entry(K.upcoming._id, U.asha._id, { fee_from_deposit: 100 }),
    entry(K.full._id, U.asha._id, { fee_from_deposit: 10 }), entry(1154, 42, { fee_from_winnings: 10 }),
  ];
  const txn = (extra) => ({ _id: new ObjectId(), status: 'success', type: 'winnings', contest_id: null, ...extra });
  db = {
    roles: [role],
    users: [
      { _id: new ObjectId(), name: 'Super', email: 'super@a.test', password: HASH, is_admin: true, is_super_admin: true },
      { _id: new ObjectId(), name: 'Viewer', email: 'viewer@a.test', password: HASH, is_admin: true, admin_role_id: role._id },
      ...Object.values(U),
    ],
    sessions: [S1, S2],
    contests: Object.values(K),
    entries: E,
    baskets: [{ _id: new ObjectId(), old_id: 77, serial_no: 'B1', assets: [{ symbol: 'INFY' }, { symbol: 'TCS' }], multipliers: [{ multiplier: 2, prediction: 'UP' }, { multiplier: 1, prediction: 'DOWN' }] }],
    txns: [
      txn({ user_id: 41, contest_id: 1148, amount: 270.25, transaction_id: `MP_1148_E${E[0].old_id}` }),
      txn({ user_id: U.asha._id, contest_id: 1148, amount: 30, transaction_id: `MP_1148_E${E[1].old_id}` }),
      txn({ user_id: U.ben._id, contest_id: K.paid._id, amount: 50, transaction_id: 'OTHER_1' }),
      txn({ user_id: 900, contest_id: 1148, amount: 5, transaction_id: `MP_1148_E${E[4].old_id}` }),
      txn({ user_id: 41, contest_id: 1148, amount: 999, status: 'failed', transaction_id: 'MP_1148_E1' }),
      txn({ user_id: 42, amount: 45, transaction_id: `CONTEST_1001_ENTRY_${E[5].old_id}` }),
      txn({ user_id: 42, amount: 777, transaction_id: 'CONTEST_10011_ENTRY_9' }), // another contest
      txn({ user_id: U.asha._id, contest_id: 1151, type: 'refund', amount: 100, transaction_id: `REFUND_1151_E${E[8].old_id}` }),
      txn({ user_id: U.asha._id, contest_id: 1151, type: 'deposit', amount: 5000, transaction_id: 'DEP_1' }),
    ],
  };
}
async function login(who = 'super') {
  const agent = request.agent(adminApp);
  await agent.post('/login').type('form').send({ email: `${who}@a.test`, password: 'secret123' });
  return agent;
}
const q = (text) => Object.fromEntries(new URLSearchParams(text));
const ids = async (text) => (await svc.listContests(q(text))).rows.map((r) => (String(r.id).length === 24 ? 'new' : r.id)).sort().join();
const one = async (text) => (await svc.listContests(q(text))).rows[0];

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('leagues', () => {
  beforeEach(reset);

  test('totals: every kind of id counted once, bots not in the money, real prizes and refunds', async () => {
    const { rows, counts } = await svc.listSessions({});
    assert.deepEqual([counts[''], counts.upcoming, counts.completed], [2, 1, 1]);
    const t = rows.find((r) => r.id === 301).totals;
    assert.deepEqual([t.contests, t.entries, t.real_entries, t.bot_entries, t.players, t.bots], [4, 10, 8, 2, 3, 1]);
    assert.deepEqual(t.states, { upcoming: 0, live: 0, result_pending: 1, paid: 2, cancelled: 1, ended: 0 });
    assert.equal(t.collection, 400 + 100 + 20 + 100);
    assert.deepEqual([t.prizes_paid, t.bot_prizes, t.refunded], [395.25, 5, 100]);
    assert.equal(t.earning, (400 - 350.25) + (100 - 45) + (100 - 100));
    assert.equal(t.unsettled, 1);
    assert.equal(rows.find((r) => r.id !== 301).totals.earning, null, 'nothing settled → unknown, not 0');
  });

  test('filters and sorting', async () => {
    const names = async (text) => (await svc.listSessions(q(text))).rows.map((r) => r.session.name.split(' ')[0]).join();
    assert.equal(await names(''), 'Crypto,Morning');
    assert.equal(await names('sort=oldest'), 'Morning,Crypto');
    assert.equal(await names('sort=joined'), 'Morning,Crypto');
    assert.equal(await names('search=night'), 'Crypto');
    assert.equal(await names('search=%23301'), 'Morning');
    assert.equal(await names('market=crypto'), 'Crypto');
    assert.equal(await names('status=completed'), 'Morning');
    assert.equal(await names('search=.*'), '');
  });
});

describe('contests', () => {
  beforeEach(reset);

  test('league filter finds contests by every kind of id; other filters', async () => {
    const expect = {
      '': '1001,1148,1150,1151,1154,new', 'session=301': '1001,1148,1150,1151', [`session=${db.sessions[0]._id}`]: '1001,1148,1150,1151', 'session=999': '',
      'session=301&state=paid': '1001,1148', 'state=result_pending': '1150', 'state=cancelled': '1151', 'state=upcoming': '1154,new',
      'type=x4': '1150', 'type=x2': '', 'type=h2h': '1151,1154', 'fee_min=10&fee_max=20': '1150,1154', 'fill=full': '1151,1154', 'fill=empty': '',
      'warning=below_min': 'new', 'search=%231148': '1148', 'search=114': '',
    };
    for (const [text, want] of Object.entries(expect)) assert.equal(await ids(text), want, text);
  });

  test('numbers of one contest', async () => {
    let r = await one('search=1148');
    assert.deepEqual([r.joined, r.spots, r.spots_left, r.players, r.real_entries, r.bot_entries], [5, 20, 15, 3, 4, 1]);
    assert.deepEqual([r.collection, r.prizes_paid, r.bot_prizes, r.earning, r.advertised_pool, r.current_pool], [400, 350.25, 5, 49.75, 1800, 450]);
    r = await one('search=1151');
    assert.deepEqual([r.current_pool, r.refunded, r.earning], [null, 100, 0]);
    r = await one('search=1150');
    assert.deepEqual([r.state, r.earning, r.type_label], ['result_pending', null, '4x']);
    r = await one('state=upcoming&type=mega');
    assert.deepEqual([r.needs, r.minimum, r.current_pool], [9, 10, 1800]);
  });

  test('the summary covers the whole league, whatever the filters', async () => {
    const d = await svc.listContests(q('session=301&state=paid'));
    assert.deepEqual([d.rows.length, d.summary.contests, d.counts[''], d.counts.paid], [2, 4, 4, 2]);
    assert.equal((await svc.listContests({})).summary, null);
  });

  test('state rules', () => {
    const s = (status) => ({ status });
    assert.equal(svc.stateOf({ status: 'cancelled', prizes_distributed: true }, s('completed'), 5, true), 'cancelled');
    assert.equal(svc.stateOf({ status: 'active' }, s('live'), 5, false), 'live');
    assert.equal(svc.stateOf({ status: 'active' }, s('completing'), 5, false), 'result_pending');
    assert.equal(svc.stateOf({ status: 'completed' }, s('completed'), 0, false), 'ended');
    assert.equal(svc.stateOf({ status: 'completed' }, null, 3, true), 'paid');
    assert.equal(svc.stateOf({ status: 'active' }, s('cancelled'), 3, false), 'cancelled');
    assert.equal(svc.stateOf({ status: 'active' }, null, 3, false), 'upcoming');
  });
});

describe('players', () => {
  beforeEach(reset);
  const who = async (id, text) => (await svc.contestPlayers(id, q(text))).rows.map((r) => r.user.name).join();

  test('rank, fee split, picks and each entry\'s own prize', async () => {
    const { rows } = await svc.contestPlayers(1148, {});
    assert.deepEqual(rows.map((r) => [r.rank, r.user.name, r.prize]), [[1, 'Asha', 270.25], [2, 'Ben', 50], [3, 'Asha', 30], [4, '=Chen', 0], [5, 'Bot', 5]]);
    assert.deepEqual([rows[0].fee, rows[0].fee_from_deposit, rows[0].fee_from_winnings, rows[1].fee, rows[1].fee_recorded], [100, 60, 40, 100, false]);
    assert.deepEqual([rows[0].basket, rows[0].picks], ['B1', ['INFY ↑ 2x', 'TCS ↓']]);
    assert.deepEqual((await svc.contestPlayers(1001, {})).rows.map((r) => r.prize), [45, 0], 'old prize without contest_id');
    assert.deepEqual((await svc.contestPlayers(1151, {})).rows.map((r) => r.refund), [100, 0]);
  });

  test('filters', async () => {
    assert.equal(await who(1148, 'kind=bot'), 'Bot');
    assert.equal(await who(1148, 'result=won&kind=real'), 'Asha,Ben,Asha');
    assert.equal(await who(1148, 'result=none'), '=Chen');
    assert.equal(await who(1148, 'search=98ben'), 'Ben');
    assert.equal(await who(1148, 'search=41'), 'Asha,Asha');
    assert.equal(await who(1148, 'search=((('), '');
    assert.equal(await who(1148, 'sort=prize'), 'Asha,Ben,Asha,Bot,=Chen');
    assert.equal(await who(1151, 'result=refunded'), 'Asha');
    assert.equal(await svc.contestPlayers('424242', {}), null);
  });
});

describe('admin pages', () => {
  beforeEach(reset);

  test('every page opens, also with odd query strings', async () => {
    const agent = await login();
    const pages = ['/league-contests', '/league-contests?status=live', '/league-contests/contests', '/league-contests/contests?session=301', '/league-contests/contests?session=999',
      '/league-contests/contests?search[$ne]=1&state[]=x&session[$gt]=&page=99', '/league-contests/contests/1148', `/league-contests/contests/${K.upcoming._id}`, '/league-contests/contests/1151'];
    for (const url of pages) {
      const res = await agent.get(url);
      assert.equal(res.status, 200, url);
      assert.doesNotMatch(res.text, /Render Error/, url);
    }
    assert.match((await agent.get(`/league-contests/contests/${K.upcoming._id}`)).text, /1 of the 10 players it needs/);
    assert.match((await agent.get('/league-contests')).text, /sidebar-link active"[^>]*>\s*<i class="bi bi-diagram-3"><\/i> League Contests/);
    assert.equal((await agent.get('/league-contests/contests/424242')).status, 302);
  });

  test('export: filtered, formula-safe, and only with the export permission', async () => {
    const agent = await login();
    const players = await agent.get('/league-contests/contests/1148/export?kind=real');
    assert.match(players.headers['content-disposition'], /contest_1148_players_/);
    assert.equal(players.text.trim().split('\r\n').length, 5);
    assert.match(players.text, /'=Chen/);
    assert.equal((await agent.get('/league-contests/contests/export?session=301&state=paid')).text.trim().split('\r\n').length, 3);
    assert.equal((await agent.get('/league-contests/export')).text.trim().split('\r\n').length, 3);
    const viewer = await login('viewer');
    assert.equal((await viewer.get('/league-contests')).status, 200);
    assert.doesNotMatch((await viewer.get('/league-contests/contests')).text, /Export CSV/);
    for (const url of ['/league-contests/export', '/league-contests/contests/export', '/league-contests/contests/1148/export']) assert.equal((await viewer.get(url)).status, 403, url);
    db.roles[0].permissions = ['dashboard.view'];
    assert.equal((await viewer.get('/league-contests')).status, 403);
    assert.equal((await request(adminApp).get('/league-contests')).status, 302);
  });
});
