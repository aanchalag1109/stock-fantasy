'use strict';

/**
 * PHP PARITY tests — Payment Orders (PHP Admin\PaymentController) and the Performance contest
 * page tools (RUN ALL, How It Works diagnostics, Verify Historical Prices, Analyze Price Errors,
 * Calculate Results). Real admin app, in-memory store, stubbed HTTP and a fake clock.
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const mongoose = require('mongoose');

mongoose.set('bufferCommands', false); // unstubbed DB calls fail fast

const bcrypt = require('bcryptjs');
const axios = require('axios');
const request = require('supertest');
const config = require('../../src/config/env');
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
  AdminRole: require('../../src/models/admin-role.model'),
  Payment: require('../../src/models/payment.model'),
  RunAllJob: require('../../src/models/run-all-job.model'),
};
const Setting = require('../../src/models/setting.model');
const priceFeed = require('../../src/services/contest-automation/price-feed');
const notifications = require('../../src/services/notifications/notification.service');
const tools = require('../../src/services/performance-tools.service');
const runAll = require('../../src/services/run-all.service');
const adminApp = require('../../src/admin/app');

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
          case '$in': return arg.some((a) => (a instanceof RegExp ? a.test(String(val)) : same(val, a)));
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
  const q = { select: () => q, sort: () => q, session: () => q, lean: () => q, limit: () => q, skip: () => q, populate: () => q, then: (a, b) => Promise.resolve(value).then(a, b) };
  return q;
}
function applyUpdate(doc, update) {
  const set = update.$set || (update.$inc || update.$push || update.$unset ? {} : update);
  Object.assign(doc, set);
  Object.entries(update.$inc || {}).forEach(([k, v]) => { doc[k] = (doc[k] || 0) + v; });
  Object.entries(update.$push || {}).forEach(([k, v]) => { doc[k] = [...(doc[k] || []), v]; });
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
    if (!d && opts.upsert) { d = { _id: f._id || new ObjectId() }; all().push(d); }
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

function reset() {
  db = Object.fromEntries(Object.keys(models).map((n) => [n, []]));
  feedPrices = {};
  ids.super = new ObjectId();
  ids.viewer = new ObjectId();
  ids.viewerRole = new ObjectId();
  db.AdminRole.push({ _id: ids.viewerRole, name: 'Viewer', name_key: 'viewer', permissions: ['payments.view', 'performance.view'] });
  db.User.push({ _id: ids.super, name: 'super', email: 'super@test.local', password: HASH, is_admin: true, is_super_admin: true });
  db.User.push({ _id: ids.viewer, name: 'viewer', email: 'viewer@test.local', password: HASH, is_admin: true, admin_role_id: ids.viewerRole });
}
async function login(email = 'super@test.local') {
  const agent = request.agent(adminApp);
  await agent.post('/login').type('form').send({ email, password: 'secret123' });
  return agent;
}
async function flashAfter(agent, res) {
  const page = await agent.get(res.headers.location);
  const m = page.text.match(/alert alert-(success|danger|warning)[^>]*>[\s\S]*?<\/i>\s*([^<]+)/);
  return m ? { type: m[1], text: m[2].trim() } : null;
}

// ─── Payment Orders ──────────────────────────────────────────────────────────

describe('Payment Orders (PHP Admin\\PaymentController)', () => {
  let user;
  let payment;
  beforeEach(() => {
    reset();
    user = { _id: new ObjectId(), name: 'Asha Verma', mobile: '9876543210', email: 'asha@x.com', deposit_balance: 100, winnings_balance: 0 };
    db.User.push(user);
    payment = { _id: new ObjectId(), order_id: 'ORD123', user_id: user._id, amount: 500, payment_status: 0, created_at: new Date() };
    db.Payment.push(payment, { _id: new ObjectId(), order_id: 'ORD999', user_id: new ObjectId(), amount: 50, payment_status: 1, created_at: new Date() });
  });

  test('search matches order id or the user name / mobile / email (literal text)', async () => {
    const admin = await login();
    for (const q of ['ORD123', 'asha ver', '98765', 'asha@x']) {
      const page = await admin.get('/payments?search=' + encodeURIComponent(q));
      assert.match(page.text, /ORD123/, q);
      assert.doesNotMatch(page.text, /ORD999/, q);
    }
    assert.equal((await admin.get('/payments?search=' + encodeURIComponent('.*'))).status, 200);
    assert.doesNotMatch((await admin.get('/payments?search=' + encodeURIComponent('.*'))).text, /ORD123/, 'regex characters are matched literally');
  });

  test('Approve: pending → paid, deposit credited once, "Admin Approved" transaction, back to the filtered page', async () => {
    const admin = await login();
    const res = await admin.post(`/payments/${payment._id}/approve`).set('Referer', 'http://localhost/payments?status=0&page=1');
    await notifications.idle();
    assert.equal(res.headers.location, 'http://localhost/payments?status=0&page=1');
    assert.equal(get('Payment', payment._id).payment_status, 1);
    assert.equal(get('User', user._id).deposit_balance, 600);
    const tx = db.Transaction.find((t) => t.transaction_id === 'ORD123');
    assert.deepEqual([tx.type, tx.amount, tx.status, tx.payment_method], ['deposit', 500, 'success', 'Admin Approved']);
    assert.equal((await flashAfter(admin, { headers: { location: '/payments' } })).text, 'Payment approved successfully');
    assert.equal(db.Notification.filter((n) => n.event === 'deposit_success').length, 1);

    const again = await admin.post(`/payments/${payment._id}/approve`);
    assert.equal((await flashAfter(admin, again)).text, 'Payment not found or already processed');
    assert.equal(get('User', user._id).deposit_balance, 600);
  });

  test('double-click Approve credits only once', async () => {
    const admin = await login();
    await Promise.all([1, 2, 3].map(() => admin.post(`/payments/${payment._id}/approve`)));
    assert.equal(get('User', user._id).deposit_balance, 600);
    assert.equal(db.Transaction.length, 1);
  });

  test('Reject: pending → failed, "Admin Rejected" failed transaction, no balance change', async () => {
    const admin = await login();
    const res = await admin.post(`/payments/${payment._id}/reject`);
    assert.equal(get('Payment', payment._id).payment_status, -1);
    assert.equal(get('User', user._id).deposit_balance, 100);
    const tx = db.Transaction.find((t) => t.transaction_id === 'ORD123');
    assert.deepEqual([tx.type, tx.amount, tx.status, tx.payment_method], ['deposit', 500, 'failed', 'Admin Rejected']);
    assert.equal((await flashAfter(admin, res)).text, 'Payment rejected successfully');
    const again = await admin.post(`/payments/${payment._id}/approve`);
    assert.equal((await flashAfter(admin, again)).text, 'Payment not found or already processed');
  });

  test('Verify asks LG Pay (signed) and reports PAID / PENDING / FAILED without changing the payment', async () => {
    const calls = [];
    const answers = [
      [{ status: 200, data: { status: 1, data: { money: 50000 } } }, 'success', 'LG Pay Status: PAID ✓ - Amount: ₹500 - You can now approve this payment'],
      [{ status: 200, data: { status: 0 } }, 'warning', 'LG Pay Status: PENDING - Payment not completed yet'],
      [{ status: 200, data: { status: 2, msg: 'Order expired' } }, 'danger', 'LG Pay Status: FAILED - Order expired'],
      [{ status: 502, data: '' }, 'danger', 'Failed to connect to LG Pay (HTTP 502)'],
      [{ status: 200, data: {} }, 'danger', 'Invalid response from LG Pay'],
    ];
    const original = axios.get;
    const admin = await login();
    try {
      for (const [answer, type, text] of answers) {
        axios.get = async (url, opts) => { calls.push({ url, params: opts.params }); return answer; };
        const res = await admin.post(`/payments/${payment._id}/verify`);
        const flash = await flashAfter(admin, res);
        assert.deepEqual([flash.type, flash.text], [type, text]);
      }
    } finally { axios.get = original; }
    assert.equal(get('Payment', payment._id).payment_status, 0, 'verify never changes the payment');
    assert.equal(calls[0].url, `${config.LGPAY.baseUrl}/api/order/query`);
    const expected = crypto.createHash('md5').update(`app_id=${config.LGPAY.appId}&order_sn=ORD123&key=${config.LGPAY.secretKey}`).digest('hex').toUpperCase();
    assert.deepEqual(calls[0].params, { app_id: config.LGPAY.appId, order_sn: 'ORD123', sign: expected });
  });

  test('view-only admins cannot approve, reject or verify', async () => {
    const viewer = await login('viewer@test.local');
    for (const action of ['approve', 'reject', 'verify']) {
      assert.equal((await viewer.post(`/payments/${payment._id}/${action}`).set('Accept', 'application/json')).status, 403);
    }
    assert.equal(get('Payment', payment._id).payment_status, 0);
  });
});

// ─── Performance contest page ────────────────────────────────────────────────

function contestFixture({ entries = 10, sessionStatus = 'completed', withPrices = true } = {}) {
  const session = {
    _id: new ObjectId(), name: 'Morning League', market_type: 'stock', status: sessionStatus, active: true,
    start_time: new Date('2026-10-26T04:00:00Z'), end_time: new Date('2026-10-26T05:00:00Z'), assets: [],
  };
  const contest = { _id: new ObjectId(), league_session_id: session._id, category: 'mega', status: sessionStatus === 'completed' ? 'completed' : 'live', entry_fee: 10, platform_fee: 10, winning_percentage: 30, participants: 100, prize_pool: 0, is_calculated: false, prizes_distributed: false };
  const rows = [];
  for (let i = 0; i < entries; i += 1) {
    const user = { _id: new ObjectId(), name: `player${i}`, mobile: `90000000${i}`, deposit_balance: 0, winnings_balance: 0 };
    const sym = `S${i}`;
    const basket = { _id: new ObjectId(), assets: [{ name: sym }], multipliers: [] };
    const entry = { _id: new ObjectId(), contest_id: contest._id, user_id: user._id, basket_id: basket._id, total_score: (10 - i) * 100, created_at: new Date(Date.now() + i) };
    session.assets.push({
      asset_symbol: sym, start_price: withPrices ? 100 : null, end_price: withPrices && sessionStatus === 'completed' ? 100 + (10 - i) : null,
      start_price_fetched_at: new Date('2026-10-26T04:02:00Z'), end_price_fetched_at: new Date('2026-10-26T05:45:00Z'),
    });
    db.User.push(user); db.SavedBasket.push(basket); db.ContestEntry.push(entry);
    db.Transaction.push({ _id: new ObjectId(), user_id: user._id, type: 'contest_entry', amount: 10, status: 'success', description: `Joined Contest #${contest._id}` });
    rows.push({ user, basket, entry, sym });
  }
  db.LeagueSession.push(session);
  db.Contest.push(contest);
  return { session, contest, rows };
}

describe('Performance contest page (PHP performance/show.blade.php)', () => {
  beforeEach(reset);

  test('page shows How It Works with diagnostics; RUN ALL and Calculate Results only for performance.manage', async () => {
    const { contest } = contestFixture();
    const admin = await login();
    const page = await admin.get(`/performance/${contest._id}`);
    assert.equal(page.status, 200);
    ['How It Works', 'System Status &amp; Error Detection', 'STEP 8: User-wise Prize Calculation', 'STEP 10: Asset Prices', 'Verify All Prices via API', 'Analyze Error Reasons', 'RUN ALL', 'Calculate Results']
      .forEach((t) => assert.ok(page.text.includes(t), t));
    const viewer = await login('viewer@test.local');
    const vpage = await viewer.get(`/performance/${contest._id}`);
    assert.ok(vpage.text.includes('How It Works'));
    assert.ok(!vpage.text.includes('id="runAllBtn"'));
    assert.ok(!vpage.text.includes('id="calculateResultsBtn"'));
  });

  test('diagnostics: PHP checks, calculation steps, tied ranks and price timing', () => {
    const { session, contest, rows } = contestFixture();
    const participants = rows.map((r) => ({ ...r.entry, user_name: r.user.name, user_mobile: r.user.mobile }));
    participants[2].total_score = participants[1].total_score; // tie for rank 2
    const stats = { total_participants: 10, total_pool_generated: 100, actual_winners: 3 };
    const dist = [{ label: 'Ranks 1-1', winners: 1, percent: 50, perWinner: 45 }, { label: 'Ranks 2-3', winners: 2, percent: 50, perWinner: 22 }];
    const d = tools.diagnostics({ contest: { ...contest, session_status: 'completed' }, session, participants, stats, flexibleDistribution: dist, transactionCount: 10 });
    assert.equal(d.errorCount, 0);
    assert.equal(d.checks.length, 8);
    assert.deepEqual(d.steps, { participants: 10, entryFee: 10, platformPct: 10, winningPct: 30, totalPool: 100, platformFee: 10, prizePool: 90, totalWinners: 3 });
    assert.deepEqual(d.winners.map((w) => [w.rank, w.prize]), [[1, 45], [2, 22], [2, 22]]);
    assert.equal(d.timingErrors, 10, 'end prices fetched 45 min after session end');
    assert.ok(d.timings.filter((t) => t.price_type === 'Start Price').every((t) => t.type === 'success'));

    const broken = tools.diagnostics({ contest: { ...contest, session_status: 'live' }, session: { ...session, assets: [] }, participants, stats, flexibleDistribution: [], transactionCount: 0 });
    assert.deepEqual(broken.checks.filter((c) => c.type !== 'success').map((c) => c.title), ['Prize Distribution Missing', 'Missing Start Prices', 'No Transactions Found']);
  });

  test('Verify Historical Prices compares saved prices with API prices and labels the source', async () => {
    const { session } = contestFixture({ entries: 2 });
    const original = axios.get;
    axios.get = async (url, opts) => {
      if (opts.params.exchange === 'NSE' && opts.params.tradingSymbol === 'S0') return { status: 200, data: { lastPrice: 120 } };
      if (opts.params.exchange === 'BSE' && opts.params.tradingSymbol === 'S1') return { status: 200, data: { lastPrice: 105 } };
      return { status: 404, data: {} };
    };
    try {
      const admin = await login('viewer@test.local');
      const res = await admin.post(`/api/verify-historical-prices/${session._id}`).set('Accept', 'application/json');
      assert.equal(res.body.success, true);
      const start0 = res.body.verification_results.find((r) => r.asset_symbol === 'S0' && r.price_type === 'start');
      assert.deepEqual([start0.our_price, start0.api_price, start0.api_source, Math.round(start0.difference_percent)], [100, 120, 'RapidAPI NSE (Current)', 20]);
      assert.equal(res.body.verification_results.find((r) => r.asset_symbol === 'S1').api_source, 'RapidAPI BSE (Current)');
    } finally { axios.get = original; }
  });

  test('Analyze Price Errors: missing, timing, extreme and "no movement" — BTC in USD is not "extreme"', async () => {
    const session = {
      _id: new ObjectId(), status: 'completed', start_time: new Date('2026-10-26T04:00:00Z'), end_time: new Date('2026-10-26T05:00:00Z'),
      assets: [
        { asset_symbol: 'MISSING' },
        { asset_symbol: 'LATE', start_price: 50, start_price_fetched_at: new Date('2026-10-26T04:45:00Z') },
        { asset_symbol: 'HUGE', start_price: 250000, start_price_fetched_at: new Date('2026-10-26T04:00:00Z') },
        { asset_symbol: 'FLAT', start_price: 70, end_price: 70, start_price_fetched_at: new Date('2026-10-26T04:00:00Z'), end_price_fetched_at: new Date('2026-10-26T05:00:00Z') },
        { asset_symbol: 'BTC-USD', start_price: 65000, start_price_fetched_at: new Date('2026-10-26T04:00:00Z') },
      ],
    };
    db.LeagueSession.push(session);
    const result = await tools.analyzePriceErrors(String(session._id));
    const titles = result.analysis_results.map((e) => `${e.asset_symbol}:${e.error_title}`);
    assert.deepEqual(titles.sort(), ['FLAT:No Price Movement Detected', 'HUGE:Extreme Price Value', 'LATE:Significant Timing Deviation', 'MISSING:Missing or Invalid Price']);
  });

  test('Calculate Results runs the PHP calculate-results routine (scores, ranks, credits prizes once)', async () => {
    const { contest, rows } = contestFixture();
    db.ContestPerformancePrize.push({ contest_id: contest._id, rank_start: 1, rank_end: 1, per_winner_amount: 50 });
    const admin = await login();
    const res = await admin.post(`/api/performance/${contest._id}/calculate-results`).set('Accept', 'application/json');
    assert.equal(res.body.success, true, JSON.stringify(res.body));
    assert.equal(get('ContestEntry', rows[0].entry._id).rank, 1);
    assert.equal(get('User', rows[0].user._id).winnings_balance, 50);
    await admin.post(`/api/performance/${contest._id}/calculate-results`).set('Accept', 'application/json');
    assert.equal(get('User', rows[0].user._id).winnings_balance, 50, 'not credited twice');
    const viewer = await login('viewer@test.local');
    assert.equal((await viewer.post(`/api/performance/${contest._id}/calculate-results`).set('Accept', 'application/json')).status, 403);
  });
});

// ─── RUN ALL ─────────────────────────────────────────────────────────────────

describe('RUN ALL (PHP RunAllController + RunAllJob)', () => {
  let fakeNow;
  const realClock = { ...runAll.clock };
  beforeEach(() => {
    reset();
    fakeNow = new Date('2026-10-26T04:00:00Z'); // 09:30 IST
    runAll.clock.now = () => new Date(fakeNow);
    runAll.clock.sleep = async (ms) => { fakeNow = new Date(fakeNow.getTime() + ms); };
  });
  test.after?.(() => Object.assign(runAll.clock, realClock));

  test('full run: waits, start prices, LIVE, end prices, pays this contest, completes — with the PHP log', async () => {
    const { session, contest, rows } = contestFixture({ sessionStatus: 'upcoming', withPrices: false });
    const other = { _id: new ObjectId(), league_session_id: session._id, category: 'mega', status: 'upcoming', entry_fee: 10 };
    db.Contest.push(other);
    rows.forEach((r, i) => { feedPrices[r.sym] = 100; });
    const admin = await login();
    const res = await admin.post(`/api/run-all/${contest._id}`).send({ start_time: '09:31', end_time: '09:33' });
    assert.equal(res.status, 200, res.text);
    assert.deepEqual([res.body.start, res.body.end], ['09:31:00', '09:33:00']);
    // end prices differ so there are winners
    const job = runAll._running;
    rows.forEach((r, i) => { feedPrices[r.sym] = 100; });
    const origGet = priceFeed.getPrices;
    let phase = 'start';
    priceFeed.getPrices = async (s, assets) => {
      const prices = new Map(assets.map((a, i) => [a.asset_symbol, phase === 'start' ? 100 : 100 + (10 - Number(a.asset_symbol.slice(1)))]));
      phase = 'end';
      return { prices, unsupported: [] };
    };
    try { await job; } finally { priceFeed.getPrices = origGet; }

    const log = (await admin.get(`/api/run-all-log/${contest._id}`)).body;
    assert.equal(log.status, 'done', JSON.stringify(log));
    ['Job queued!', 'Waiting for start time: 09:31:00 (60s)', 'Phase 1: Fetching start prices for 10 assets...', 'Attempt 1: 10/10 prices saved',
      'All prices saved. Session LIVE', 'Phase 2: Fetching end prices...', 'End prices saved: 10', 'Phase 3a: Calculating scores...',
      'Phase 3b: Distributing prizes...', 'Phase 4: Marking completed...', 'DONE - Session completed!'].forEach((l) => assert.ok(log.log.includes(l), l));
    const s = get('LeagueSession', session._id);
    assert.equal(s.status, 'completed');
    assert.equal(s.run_all_active, false);
    assert.equal(new Date(s.start_time).toISOString(), '2026-10-26T04:01:00.000Z');
    assert.equal(get('Contest', contest._id).prizes_distributed, true);
    assert.equal(get('Contest', other._id).status, 'completed');
    assert.ok(get('User', rows[0].user._id).winnings_balance > 0);
  });

  test('aborts when start prices are still missing after 10 attempts', async () => {
    const { session, contest, rows } = contestFixture({ sessionStatus: 'upcoming', withPrices: false });
    rows.forEach((r, i) => { if (i) feedPrices[r.sym] = 100; }); // S0 never priced
    const admin = await login();
    await admin.post(`/api/run-all/${contest._id}`).send({ start_time: '09:30', end_time: '09:40' });
    await runAll._running;
    const log = (await admin.get(`/api/run-all-log/${contest._id}`)).body;
    assert.equal(log.status, 'failed');
    assert.ok(log.log.includes('Attempt 10: 9/10 prices saved'));
    assert.ok(log.log.includes('Error: Could not fetch all start prices after 10 attempts. Got 9/10. Aborting.'));
    assert.equal(get('LeagueSession', session._id).status, 'upcoming');
    assert.equal(get('LeagueSession', session._id).run_all_active, false);
  });

  test('Stop really stops the job; a second job for the same contest is refused while one runs', async () => {
    const { session, contest } = contestFixture({ sessionStatus: 'upcoming', withPrices: false });
    const admin = await login();
    let stopped = false;
    runAll.clock.sleep = async (ms) => {
      if (!stopped) {
        stopped = true;
        const dup = await admin.post(`/api/run-all/${contest._id}`).send({ start_time: '10:00', end_time: '10:30' });
        assert.equal(dup.status, 409);
        assert.equal((await admin.post(`/api/run-all-stop/${contest._id}`)).body.message, 'Job stopped');
      }
      fakeNow = new Date(fakeNow.getTime() + ms);
    };
    await admin.post(`/api/run-all/${contest._id}`).send({ start_time: '10:00', end_time: '10:30' });
    await runAll._running;
    const log = (await admin.get(`/api/run-all-log/${contest._id}`)).body;
    assert.equal(log.status, 'failed');
    assert.equal(log.log.filter((l) => l === 'Job manually stopped by admin.').length, 1);
    assert.ok(!log.log.some((l) => l.startsWith('Phase 1')), 'never reached phase 1');
    assert.equal(get('LeagueSession', session._id).status, 'upcoming');
    assert.equal(get('LeagueSession', session._id).run_all_active, false);
  });

  test('validation, permissions and a job lost to a restart', async () => {
    const { contest } = contestFixture({ sessionStatus: 'upcoming', withPrices: false });
    const admin = await login();
    assert.equal((await admin.post(`/api/run-all/${contest._id}`).send({ start_time: '10:00' })).status, 422);
    assert.equal((await admin.post(`/api/run-all/${contest._id}`).send({ start_time: '10:00', end_time: '09:00' })).status, 422);
    const viewer = await login('viewer@test.local');
    assert.equal((await viewer.post(`/api/run-all/${contest._id}`).set('Accept', 'application/json').send({ start_time: '10:00', end_time: '11:00' })).status, 403);
    assert.equal((await viewer.get(`/api/run-all-log/${contest._id}`)).body.status, 'not_started');

    db.RunAllJob.push({ _id: String(contest._id), status: 'running', log: ['Job queued!'], heartbeat_at: new Date(fakeNow.getTime() - 10 * 60000) });
    const log = (await admin.get(`/api/run-all-log/${contest._id}`)).body;
    assert.equal(log.status, 'failed');
    assert.match(log.log[log.log.length - 1], /interrupted/);
  });
});
