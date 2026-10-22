'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: Contest Automation (port of the PHP scheduled commands)
 * End-to-end tests of the session lifecycle, live scores, results and prize payout
 * against an in-memory store, with the price feed replaced by controllable prices.
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

mongoose.set('bufferCommands', false); // unstubbed DB calls fail fast

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
};
const Setting = require('../../src/models/setting.model');
const priceFeed = require('../../src/services/contest-automation/price-feed');
const { runSessionLifecycle } = require('../../src/services/contest-automation/session-lifecycle.job');
const { runLiveScores } = require('../../src/services/contest-automation/live-scores.job');
const { runContestResults } = require('../../src/services/contest-automation/results.job');
const payout = require('../../src/services/contest-automation/prize-payout.service');
const { withLock } = require('../../src/services/contest-automation/job-lock');
const notifications = require('../../src/services/notifications/notification.service');
const { scoreAssets, buildDynamicPrizeDistribution, round2 } = require('../../src/helpers/mobile-compat');
const { pendingPrizes } = require('../../src/admin/controllers/pages.controller');

logger.silent = true;
const { ObjectId } = mongoose.Types;

// ─── In-memory store ─────────────────────────────────────────────────────────

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
  const q = { select: () => q, sort: () => q, session: () => q, lean: () => q, limit: () => q, then: (a, b) => Promise.resolve(value).then(a, b) };
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
  Model.countDocuments = async (f) => all().filter((d) => matches(d, f)).length;
  Model.distinct = async (field, f) => [...new Set(all().filter((d) => matches(d, f)).map((d) => d[field]))];
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
Setting.findOne = () => query(null); // notification settings → defaults

// Controllable price feed.
let feedPrices;   // symbol -> price (missing = fetch failure)
let feedCalls;
priceFeed.getPrices = async (session, assets) => {
  feedCalls.push(assets.map((a) => a.asset_symbol));
  const prices = new Map();
  assets.forEach((a) => { if (feedPrices[a.asset_symbol] > 0) prices.set(a.asset_symbol, feedPrices[a.asset_symbol]); });
  return { prices, unsupported: [] };
};

// ─── Fixtures ────────────────────────────────────────────────────────────────

const NOW = new Date('2026-10-21T10:00:00Z');
const min = (m) => new Date(NOW.getTime() + m * 60000);
const SYMBOLS = ['RELIANCE', 'TCS', 'INFY'];

function reset() {
  db = Object.fromEntries(Object.keys(models).map((n) => [n, []]));
  feedPrices = { RELIANCE: 100, TCS: 200, INFY: 50 };
  feedCalls = [];
}

function addSession(extra = {}) {
  const s = {
    _id: new ObjectId(), name: 'Morning League', market_type: 'stock', status: 'upcoming',
    start_time: min(-1), end_time: min(60), start_prices_captured_at: null, end_prices_captured_at: null,
    assets: SYMBOLS.map((sym) => ({ asset_symbol: sym, category_name: 'Large Cap Indian', start_price: null, end_price: null })),
    ...extra,
  };
  db.LeagueSession.push(s);
  return s;
}
function addContest(session, extra = {}) {
  const c = { _id: new ObjectId(), league_session_id: session._id, category: 'mega', status: 'upcoming', entry_fee: 10, platform_fee: 10, winning_percentage: 30, is_calculated: false, prizes_distributed: false, payout_started_at: null, ...extra };
  db.Contest.push(c);
  return c;
}
// Adds n entries; basket i holds `assets`, with optional per-entry prediction/multiplier.
function addEntries(contest, session, n, basketFor = () => ({ assets: [{ name: 'RELIANCE' }], multipliers: [] })) {
  const created = [];
  for (let i = 0; i < n; i += 1) {
    const user = { _id: new ObjectId(), name: `u${i}`, deposit_balance: 0, winnings_balance: 0 };
    const basket = { _id: new ObjectId(), ...basketFor(i) };
    const entry = { _id: new ObjectId(), contest_id: contest._id, session_id: session._id, user_id: user._id, basket_id: basket._id, total_score: 0, rank: null, starting_prices: {}, created_at: new Date(NOW.getTime() + i) };
    db.User.push(user);
    db.SavedBasket.push(basket);
    db.ContestEntry.push(entry);
    created.push({ user, basket, entry });
  }
  return created;
}
const get = (name, id) => db[name].find((d) => same(d._id, id));
async function settle() { await notifications.idle(); await notifications.idle(); }

// ─── Session lifecycle ───────────────────────────────────────────────────────

describe('session lifecycle (league:update-status)', () => {
  beforeEach(reset);

  test('going live: status, contest status, start prices, entry starting prices, prize preview', async () => {
    const s = addSession();
    const c = addContest(s, { status: 'active' });
    const cancelled = addContest(s, { status: 'cancelled' });
    const [{ entry }] = addEntries(c, s, 10, () => ({ assets: [{ name: 'RELIANCE' }, { name: 'TCS' }], multipliers: [] }));

    const result = await runSessionLifecycle(NOW);
    assert.equal(result.to_live, 1);
    assert.equal(result.started, 1);
    assert.equal(get('LeagueSession', s._id).status, 'live');
    assert.equal(get('Contest', c._id).status, 'live');
    assert.equal(get('Contest', cancelled._id).status, 'cancelled', 'cancelled contests are never revived');
    assert.deepEqual(get('LeagueSession', s._id).assets.map((a) => a.start_price), [100, 200, 50]);
    assert.deepEqual(get('ContestEntry', entry._id).starting_prices, { RELIANCE: 100, TCS: 200 });
    assert.ok(get('LeagueSession', s._id).start_prices_captured_at);
    assert.ok(db.ContestPerformancePrize.length > 0, 'prize preview stored');

    feedCalls = [];
    await runSessionLifecycle(min(1));
    assert.deepEqual(feedCalls, [], 'start prices are fetched once');
  });

  test('failed fetches are retried inside the window, then finalised with what exists', async () => {
    const s = addSession();
    feedPrices = { RELIANCE: 100 };
    await runSessionLifecycle(NOW);
    assert.equal(get('LeagueSession', s._id).start_prices_captured_at, null);
    await runSessionLifecycle(min(5));
    assert.deepEqual(feedCalls[1], ['TCS', 'INFY'], 'only missing prices are re-fetched');
    feedPrices = { RELIANCE: 999, TCS: 200 };
    await runSessionLifecycle(min(10));
    assert.deepEqual(get('LeagueSession', s._id).assets.map((a) => a.start_price), [100, 200, null], 'existing prices never overwritten');
    assert.equal(get('LeagueSession', s._id).start_prices_captured_at, null);
    await runSessionLifecycle(min(35)); // window over: finalise with the prices that exist
    assert.ok(get('LeagueSession', s._id).start_prices_captured_at);
  });

  test('a session found live long after its start is not priced late', async () => {
    const s = addSession({ status: 'live', start_time: min(-120) });
    await runSessionLifecycle(NOW);
    assert.deepEqual(feedCalls, []);
    assert.equal(get('LeagueSession', s._id).start_prices_captured_at, null);
  });

  test('ending: status, contests completed, end prices, entry ending prices', async () => {
    const s = addSession();
    const c = addContest(s);
    const cancelled = addContest(s, { status: 'cancelled' });
    const [{ entry }] = addEntries(c, s, 10);
    await runSessionLifecycle(NOW);
    feedPrices = { RELIANCE: 110, TCS: 190, INFY: 55 };
    const result = await runSessionLifecycle(min(61));
    assert.equal(result.to_completed, 1);
    assert.equal(result.ended, 1);
    assert.equal(get('Contest', c._id).status, 'completed');
    assert.equal(get('Contest', cancelled._id).status, 'cancelled');
    assert.deepEqual(get('LeagueSession', s._id).assets.map((a) => a.end_price), [110, 190, 55]);
    assert.deepEqual(get('ContestEntry', entry._id).ending_prices, { RELIANCE: 110 });
    assert.ok(get('LeagueSession', s._id).end_prices_captured_at);
  });

  test('no end prices at all → not finalised (left for manual review)', async () => {
    const s = addSession();
    addEntries(addContest(s), s, 10);
    await runSessionLifecycle(NOW);
    feedPrices = {};
    await runSessionLifecycle(min(61));
    await runSessionLifecycle(min(95));
    assert.equal(get('LeagueSession', s._id).end_prices_captured_at, null);
  });
});

// ─── Live scores ─────────────────────────────────────────────────────────────

describe('live scores (contest:update-live-scores)', () => {
  beforeEach(reset);

  test('scores entries with starting prices against current prices and ranks the contest', async () => {
    const s = addSession();
    const c = addContest(s);
    const rows = addEntries(c, s, 3, (i) => ({ assets: [{ name: 'RELIANCE' }], multipliers: [{ multiplier: 1, prediction: i === 1 ? 'DOWN' : 'UP' }] }));
    await runSessionLifecycle(NOW);
    get('ContestEntry', rows[2].entry._id).starting_prices = {}; // joined without starting prices
    feedPrices = { RELIANCE: 105, TCS: 200, INFY: 50 };
    const result = await runLiveScores();
    assert.equal(result.contests_updated, 1);
    assert.equal(get('ContestEntry', rows[0].entry._id).total_score, 500);   // +5% UP
    assert.equal(get('ContestEntry', rows[1].entry._id).total_score, -500);  // +5% but predicted DOWN
    assert.equal(get('ContestEntry', rows[2].entry._id).total_score, 0);
    assert.deepEqual(rows.map((r) => get('ContestEntry', r.entry._id).rank), [1, 3, 2]);
  });
});

// ─── Results ─────────────────────────────────────────────────────────────────

async function runToCompletion(session, endPrices) {
  await runSessionLifecycle(NOW);
  feedPrices = endPrices;
  await runSessionLifecycle(min(61));
}

describe('results (contest:calculate-performance)', () => {
  beforeEach(reset);

  test('fewer than 10 entries: cancelled and refunded exactly once', async () => {
    const s = addSession();
    const c = addContest(s);
    const rows = addEntries(c, s, 4);
    await runToCompletion(s, { RELIANCE: 110, TCS: 200, INFY: 50 });
    const first = await runContestResults();
    const second = await runContestResults();
    await settle();
    assert.equal(first.cancelled, 1);
    assert.equal(second.cancelled, 0);
    assert.equal(get('Contest', c._id).status, 'cancelled');
    rows.forEach(({ user }) => assert.equal(get('User', user._id).deposit_balance, 10));
    assert.equal(db.Transaction.length, 4);
    assert.equal(db.Notification.filter((n) => n.event === 'refund_credited').length, 4);
  });

  test('10+ entries: final scores (same function as the app), ranks with ties, prize rows, nothing paid', async () => {
    const s = addSession();
    const c = addContest(s);
    const baskets = (i) => ({
      assets: [{ name: 'RELIANCE' }, { name: 'TCS' }],
      multipliers: i % 3 === 0 ? [{ multiplier: 2, prediction: 'UP' }] : [{ multiplier: 1, prediction: i % 2 ? 'DOWN' : 'UP' }],
    });
    const rows = addEntries(c, s, 12, baskets);
    const end = { RELIANCE: 110, TCS: 190, INFY: 50 };
    await runToCompletion(s, end);
    const result = await runContestResults();
    assert.equal(result.calculated, 1);

    const prices = { start: { RELIANCE: 100, TCS: 200, INFY: 50 }, end, started: true };
    rows.forEach(({ entry, basket }) => {
      assert.equal(get('ContestEntry', entry._id).total_score, round2(scoreAssets(basket.assets, basket.multipliers, prices).total));
    });
    const ranked = rows.map((r) => get('ContestEntry', r.entry._id)).sort((a, b) => a.rank - b.rank);
    for (let i = 1; i < ranked.length; i += 1) {
      if (ranked[i].total_score === ranked[i - 1].total_score) assert.equal(ranked[i].rank, ranked[i - 1].rank, 'ties share a rank');
      else assert.equal(ranked[i].rank, i + 1, 'next rank is skipped after a tie');
    }
    assert.equal(get('Contest', c._id).is_calculated, true);
    assert.equal(get('Contest', c._id).prizes_distributed, false);
    assert.equal(db.Transaction.length, 0, 'prizes are paid by an admin, as in PHP');
    assert.deepEqual(db.ContestPerformancePrize.map((p) => p.per_winner_amount), buildDynamicPrizeDistribution(3, 108, 'mega').map((r) => r.per_winner_amount));
  });

  test('historical sessions (not captured by the automation) are never touched', async () => {
    const s = addSession({ status: 'completed', start_time: min(-60 * 24 * 120), end_time: min(-60 * 24 * 119),
      assets: SYMBOLS.map((sym) => ({ asset_symbol: sym, start_price: 100, end_price: 110 })) });
    const c = addContest(s, { status: 'completed' });
    addEntries(c, s, 3);
    await runSessionLifecycle(NOW);
    await runContestResults();
    assert.equal(get('Contest', c._id).status, 'completed');
    assert.equal(get('Contest', c._id).is_calculated, false);
    assert.equal(db.Transaction.length, 0);
    assert.deepEqual(feedCalls, []);
  });
});

// ─── Prize payout ────────────────────────────────────────────────────────────

describe('prize payout (Pending Prizes)', () => {
  let s;
  let c;
  let rows;
  beforeEach(async () => {
    reset();
    s = addSession();
    c = addContest(s);
    // scores: entry i gains (10 - i)% → ranks 1..10, except entries 1 and 2 tie at rank 2
    rows = addEntries(c, s, 10, (i) => ({ assets: [{ name: `S${i}` }], multipliers: [] }));
    get('LeagueSession', s._id).assets = rows.map((r, i) => ({ asset_symbol: `S${i}`, start_price: 100, end_price: 100 + (i === 2 ? 9 : 10 - i) }));
    get('LeagueSession', s._id).status = 'completed';
  });

  test('pays prize rows with tie splitting, credits winnings, marks the contest paid', async () => {
    const result = await payout.distributeContest(String(c._id));
    await settle();
    assert.equal(result.success, true, result.message);
    const prize = buildDynamicPrizeDistribution(3, 90, 'mega');
    const per = (rank) => prize.find((p) => rank >= p.rank_start && rank <= p.rank_end).per_winner_amount;
    // 10 entries × 30% → 3 paid ranks
    assert.equal(get('User', rows[0].user._id).winnings_balance, per(1));
    // entries 1 and 2 tie at rank 2 → they split the prizes of ranks 2 and 3 equally
    const tieShare = round2((per(2) + per(3)) / 2);
    assert.equal(get('User', rows[1].user._id).winnings_balance, tieShare);
    assert.equal(get('User', rows[2].user._id).winnings_balance, tieShare);
    assert.equal(get('ContestEntry', rows[3].entry._id).rank, 4, 'rank after a tie is skipped');
    assert.equal(get('User', rows[3].user._id).winnings_balance, 0);
    assert.equal(result.winners_count, 3);
    assert.equal(get('Contest', c._id).prizes_distributed, true);
    assert.equal(db.Notification.filter((n) => n.event === 'winnings_credited').length, 3);
  });

  test('can never pay twice: repeat calls, interrupted runs and concurrent clicks', async () => {
    const [a, b] = await Promise.all([payout.distributeContest(String(c._id)), payout.distributeContest(String(c._id))]);
    assert.equal([a, b].filter((r) => r.success).length, 1, 'concurrent payout blocked by the lease');
    const paidTotal = db.Transaction.reduce((sum, t) => sum + t.amount, 0);

    assert.equal((await payout.distributeContest(String(c._id))).already_paid, true);

    // Simulate a crash before the contest was marked paid: rerun resumes without duplicates.
    get('Contest', c._id).prizes_distributed = false;
    get('Contest', c._id).payout_started_at = null;
    await payout.distributeContest(String(c._id));
    assert.equal(db.Transaction.reduce((sum, t) => sum + t.amount, 0), paidTotal);
  });

  test('refuses contests paid by the legacy path, cancelled, unfinished or unpriced', async () => {
    db.Transaction.push({ _id: new ObjectId(), type: 'winnings', status: 'success', amount: 50, transaction_id: `CONTEST_${c._id}_ENTRY_1` });
    assert.equal((await payout.distributeContest(String(c._id))).already_paid, true);
    db.Transaction = [];

    get('LeagueSession', s._id).status = 'live';
    assert.match((await payout.distributeContest(String(c._id))).message, /not completed/);
    get('LeagueSession', s._id).status = 'completed';

    get('LeagueSession', s._id).assets.forEach((a) => { a.end_price = null; });
    assert.match((await payout.distributeContest(String(c._id))).message, /prices missing/);

    get('Contest', c._id).status = 'cancelled';
    assert.match((await payout.distributeContest(String(c._id))).message, /cancelled/);
    assert.equal(db.Transaction.length, 0);
  });

  test('fixed-prize contests pay their stored prize_distribution', async () => {
    Object.assign(get('Contest', c._id), { category: 'guaranteed', is_fixed_prize: true, prize_distribution: [{ rank_start: 1, rank_end: 1, per_winner: 500 }, { rank_start: 2, rank_end: 2, per_winner: 100 }] });
    const result = await payout.distributeContest(String(c._id));
    assert.equal(result.total_amount, 600);
    assert.equal(get('User', rows[0].user._id).winnings_balance, 500);
  });

  test('session payout and the admin endpoints', async () => {
    const res = { body: null, statusCode: 200, status(code) { this.statusCode = code; return this; }, json(b) { this.body = b; return this; } };
    await pendingPrizes.distributeSession({ params: { id: String(s._id) }, adminAccess: { email: 'admin@test' } }, res);
    assert.equal(res.body.success, true);
    assert.equal(res.body.total_winners, 3);

    await pendingPrizes.distributeContest({ params: { id: String(c._id) }, adminAccess: { email: 'admin@test' } }, res);
    assert.equal(res.body.already_paid, true);
  });
});

// ─── Job lock ────────────────────────────────────────────────────────────────

describe('job lock', () => {
  beforeEach(reset);

  test('only one concurrent run executes; an expired lease can be taken over', async () => {
    let runs = 0;
    const slow = () => new Promise((resolve) => setTimeout(() => { runs += 1; resolve({ ok: true }); }, 20));
    const results = await Promise.all([withLock('job', 60000, slow), withLock('job', 60000, slow)]);
    assert.equal(runs, 1);
    assert.equal(results.filter((r) => r.skipped).length, 1);

    db.JobLock[0].locked_until = new Date(Date.now() + 60000);
    db.JobLock[0].owner = 'crashed-process';
    assert.equal((await withLock('job', 60000, slow)).skipped, true);
    db.JobLock[0].locked_until = new Date(Date.now() - 1);
    assert.deepEqual(await withLock('job', 60000, slow), { ok: true });
  });
});
