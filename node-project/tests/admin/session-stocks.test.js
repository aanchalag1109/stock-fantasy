'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 * Session stock list (client feedback): live price and +/- % of every session stock, 5-minute history, final
 * gain/loss — app API and admin pages, on in-memory models.
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

mongoose.set('bufferCommands', false);

const bcrypt = require('bcryptjs');
const request = require('supertest');
const logger = require('../../src/config/logger');
const config = require('../../src/config/env');
const User = require('../../src/models/user.model');
const AdminRole = require('../../src/models/admin-role.model');
const LeagueSession = require('../../src/models/league-session.model');
const Asset = require('../../src/models/asset.model');
const Contest = require('../../src/models/contest.model');
const Reading = require('../../src/models/session-price-reading.model');
const priceFeed = require('../../src/services/contest-automation/price-feed');
const liveScores = require('../../src/services/contest-automation/live-scores.job');
const svc = require('../../src/services/session-stocks.service');
const { scoreAssets, sqlDate } = require('../../src/helpers/mobile-compat');
const app = require('../../src/app');
const adminApp = require('../../src/admin/app');

logger.silent = true;
const { ObjectId } = mongoose.Types;
const HASH = bcrypt.hashSync('secret123', 4);
const min = (n) => new Date(Date.now() + n * 60000);

// ─── In-memory store ─────────────────────────────────────────────────────────

let db;
let failReadings;
const same = (a, b) => a != null && b != null && String(a) === String(b);
const matches = (doc, f = {}) => Object.entries(f).every(([k, c]) => {
  if (k === '$or') return c.some((x) => matches(doc, x));
  if (c && c.$in) return c.$in.some((x) => same(doc[k], x));
  if (c && c.$ne !== undefined) return !same(doc[k], c.$ne);
  return same(doc[k], c);
});
function chain(rows, one) {
  const q = { select: () => q, lean: () => q, sort: () => q, populate: () => q, then: (a, b) => Promise.resolve(one ? (rows[0] ? { ...rows[0] } : null) : rows.map((d) => ({ ...d }))).then(a, b) };
  return q;
}
[[User, 'users'], [AdminRole, 'roles'], [LeagueSession, 'sessions'], [Asset, 'assets'], [Contest, 'contests']].forEach(([M, name]) => {
  M.find = (f) => chain(db[name].filter((d) => matches(d, f)));
  M.findOne = (f) => chain(db[name].filter((d) => matches(d, f)), true);
  M.findById = (id) => chain(db[name].filter((d) => same(d._id, id)), true);
  M.updateOne = async () => ({ modifiedCount: 0 });
});
LeagueSession.updateOne = async (f, u) => {
  const s = db.sessions.find((d) => same(d._id, f._id));
  Object.entries(u.$set).forEach(([k, v]) => {
    if (!k.startsWith('assets.$.')) { s[k] = v; return; }
    s.assets.find((a) => a.asset_symbol === f['assets.asset_symbol'])[k.slice(9)] = v;
  });
};
Reading.updateOne = async (f, u) => {
  if (failReadings) throw new Error('disk full');
  const old = db.readings.find((r) => same(r.session_id, f.session_id) && +r.at === +f.at);
  if (old) Object.assign(old, u.$set); else db.readings.push({ ...f, ...u.$set });
};
Reading.find = (f, projection) => ({
  sort: () => ({
    lean: async () => db.readings
      .filter((r) => same(r.session_id, f.session_id) && (!f['prices.symbol'] || r.prices.some((p) => p.symbol === f['prices.symbol'])))
      .sort((a, b) => a.at - b.at)
      .map((r) => ({ at: r.at, prices: projection.prices === 1 ? r.prices : r.prices.filter((p) => p.symbol === projection.prices.$elemMatch.symbol) })),
  }),
});
Reading.countDocuments = async (f) => db.readings.filter((r) => same(r.session_id, f.session_id)).length;
Reading.aggregate = async ([{ $match }]) => $match.session_id.$in.map((id) => ({ _id: id, n: db.readings.filter((r) => same(r.session_id, id)).length })).filter((r) => r.n);

let feed;
priceFeed.getPrices = async () => ({ prices: new Map(Object.entries(feed)), unsupported: [] });

let LIVE;
let DONE;
function reset() {
  config.APP_URL = 'http://206.189.133.192:8000';
  failReadings = false;
  const asset = (symbol, x) => ({ asset_symbol: symbol, asset_name: null, category_id: 1, category_name: 'Large Cap', start_price: 100, start_price_fetched_at: min(-30), end_price: null, live_price: null, live_price_at: null, ...x });
  LIVE = {
    _id: new ObjectId(), old_id: 301, name: 'Morning', market: 'indian_stock', market_type: 'stock', status: 'live', start_time: min(-30), end_time: min(30), start_prices_captured_at: min(-30),
    assets: [asset('TCS', { start_price: 3500 }), asset('M&M', { start_price: 1500, category_name: 'Auto', category_id: 2 }), asset('INFY'), asset('NOSTART', { start_price: null, start_price_fetched_at: null })],
  };
  DONE = {
    _id: new ObjectId(), old_id: 302, name: 'Yesterday', market: 'indian_stock', market_type: 'stock', status: 'completed', start_time: min(-1500), end_time: min(-1400), end_prices_captured_at: min(-1399),
    assets: [asset('TCS', { start_price: 3500, live_price: 9999, end_price: 3552.5, end_price_fetched_at: min(-1400) }), asset('INFY', { end_price: 99.2, end_price_fetched_at: min(-1400) }), asset('NOEND', { live_price: 140 })],
  };
  const role = { _id: new ObjectId(), name: 'Viewer', permissions: ['session_stocks.view'] };
  db = {
    roles: [role],
    users: [
      { _id: new ObjectId(), name: 'Super', email: 'super@a.test', password: HASH, is_admin: true, is_super_admin: true },
      { _id: new ObjectId(), name: 'Viewer', email: 'viewer@a.test', password: HASH, is_admin: true, admin_role_id: role._id },
    ],
    sessions: [LIVE, DONE, { _id: new ObjectId(), old_id: 303, name: 'Tomorrow', market: 'crypto', market_type: 'crypto', status: 'upcoming', start_time: min(900), end_time: min(960), assets: [asset('BTC-USD', { start_price: null })] }],
    assets: [{ symbol: 'TCS', name: 'Tata Consultancy', market: 'indian_stock', image_url: 'uploads/assets/tcs.png' }, { symbol: 'TCS', name: 'US listing', market: 'us_stock', image_url: 'https://x.test/us.png' }],
    contests: [],
    readings: [],
  };
  feed = {};
}
const api = (url) => request(app).get(`/api/v1/session-stats/${url}`);
async function login(who = 'super') {
  const agent = request.agent(adminApp);
  await agent.post('/login').type('form').send({ email: `${who}@a.test`, password: 'secret123' });
  return agent;
}
const reading = (session, at, prices) => db.readings.push({ session_id: session._id, at, prices: Object.entries(prices).map(([symbol, price]) => ({ symbol, price })) });

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('live scores job saves the readings', () => {
  beforeEach(reset);

  test('one reading per price call; the app then shows those prices', async () => {
    feed = { TCS: 3552.5, 'M&M': 1488 };
    await liveScores.refreshSession(LIVE, min(-10));
    feed = { TCS: 3465 };
    await liveScores.refreshSession(LIVE, min(-5));
    assert.deepEqual(db.readings.map((r) => r.prices), [[{ symbol: 'TCS', price: 3552.5 }, { symbol: 'M&M', price: 1488 }], [{ symbol: 'TCS', price: 3465 }]]);
    const { body } = await api('301');
    assert.deepEqual(body.stats.map((s) => [s.symbol, s.current_price, s.change_percent, s.change_amount, s.direction, s.points]), [
      ['INFY', 100, 0, 0, 'flat', 0], ['M&M', 1488, -0.8, -12, 'down', -80], ['TCS', 3465, -1, -35, 'down', -100],
    ]);
    assert.equal(body.stats[1].last_updated, sqlDate(LIVE.assets[1].live_price_at), 'a failed price keeps the last one and its time');
  });

  test('saving the reading can fail without stopping the live scores', async () => {
    failReadings = true;
    feed = { TCS: 3600 };
    await liveScores.refreshSession(LIVE, min(-5));
    assert.equal(LIVE.assets[0].live_price, 3600);
  });
});

describe('GET /session-stats/:id', () => {
  beforeEach(reset);

  test('live: every field the old API had, plus the new ones', async () => {
    Object.assign(LIVE.assets[0], { live_price: 3552.5, live_price_at: min(-5) });
    const { body } = await api('301');
    assert.deepEqual([body.success, body.session_id, body.session_name, body.status, body.phase, body.is_final, body.filter, body.total, body.currency, body.refresh_seconds, body.unread_notifications], [true, 301, 'Morning', 'live', 'live', false, 'all', 3, '₹', 300, 0]);
    assert.deepEqual(body.counts, { all: 3, positive: 1, negative: 0, unchanged: 2, price_missing: 0 });
    assert.deepEqual(body.stats[0], {
      symbol: 'TCS', name: 'Tata Consultancy', start_price: 3500, current_price: 3552.5, change_percent: 1.5, change_amount: 52.5, direction: 'up', last_updated: sqlDate(LIVE.assets[0].live_price_at), points: 150,
      category_id: 1, category_name: 'Large Cap', image_url: 'http://206.189.133.192:8000/uploads/assets/tcs.png', price_type: 'live', price_missing: false, is_final: false,
    });
    assert.deepEqual(body.not_priced.map((s) => s.symbol), ['NOSTART']);
    assert.equal(body.last_updated, sqlDate(LIVE.assets[0].live_price_at));
  });

  test('final: end prices (never the live price), gain/loss filters and order', async () => {
    let { body } = await api('302');
    assert.deepEqual([body.phase, body.is_final, body.refresh_seconds], ['final', true, null]);
    assert.deepEqual(body.stats.map((s) => [s.symbol, s.current_price, s.change_percent, s.is_final, s.price_missing]), [
      ['TCS', 3552.5, 1.5, true, false], ['INFY', 99.2, -0.8, true, false], ['NOEND', 100, 0, false, true],
    ]);
    body = (await api('302?filter=positive')).body;
    assert.deepEqual([body.filter, body.total, body.counts.all], ['positive', 1, 3]);
    assert.deepEqual((await api('302?filter=negative')).body.stats.map((s) => s.symbol), ['INFY']);
    assert.equal((await api('302?filter[$ne]=x')).body.filter, 'all');
  });

  test('stages: not started, waiting for final prices, cancelled, unknown', async () => {
    let { body } = await api('303');
    assert.deepEqual([body.phase, body.stats, body.message], ['not_started', [], 'Stats available once session goes live.']);
    Object.assign(DONE, { end_prices_captured_at: null, end_time: min(-1) });
    body = (await api('302')).body;
    assert.deepEqual([body.phase, body.is_final, body.stats.find((s) => s.symbol === 'NOEND').current_price], ['finalising', false, 140], 'last live price while the final one is fetched');
    assert.match(body.message, /Waiting for the final prices/);
    DONE.end_time = min(-31);
    assert.equal((await api('302')).body.phase, 'final', 'not retried any more');
    DONE.assets.forEach((a) => { a.end_price = null; });
    assert.equal((await api('302')).body.phase, 'finalising', 'no end price at all is not a result');
    LIVE.end_time = min(-1);
    assert.equal((await api('301')).body.phase, 'finalising');
    LIVE.status = 'cancelled';
    body = (await api('301')).body;
    assert.deepEqual([body.phase, body.stats, body.message], ['cancelled', [], 'This session was cancelled.']);
    assert.equal((await api('999')).status, 404);
    LIVE.status = 'live';
    LIVE.assets.forEach((a) => { a.start_price = null; });
    assert.match((await api('301')).body.message, /Start prices are being fetched/);
  });

  test('points and % are what the contest result uses; small coins keep their digits', () => {
    const session = { status: 'completed', end_prices_captured_at: min(-1), assets: [{ asset_symbol: 'A', start_price: 333.33, end_price: 347.91 }, { asset_symbol: 'S', start_price: 0.00001234, end_price: 0.00001271 }, { asset_symbol: 'A', start_price: 1, end_price: 2 }] };
    const rows = svc.rowsOf(session, 'final');
    assert.equal(rows.length, 2, 'a symbol listed twice is shown once');
    rows.forEach((r) => {
      const prices = { start: { [r.symbol]: r.start_price }, end: { [r.symbol]: r.current_price }, started: true };
      assert.ok(Math.abs(r.points - scoreAssets([{ symbol: r.symbol }], [{ multiplier: 1, prediction: 'UP' }], prices).total) < 1e-6);
    });
    assert.deepEqual([rows[0].points, rows[1].change_amount, rows[1].change_percent], [437, 0.0000003700, 2.9984]);
  });
});

describe('GET /session-stats/:id/history', () => {
  beforeEach(reset);

  test('start, every reading, final — oldest first; readings after the end are left out', async () => {
    reading(DONE, min(-1440), { TCS: 3510.5 });
    reading(DONE, min(-1450), { TCS: 3496.5, INFY: 101 });
    reading(DONE, min(-1445), { INFY: 102 }); // TCS price failed
    reading(DONE, min(-1390), { TCS: 5000 });
    reading(LIVE, min(-10), { TCS: 3000 }); // another session
    const { body } = await api('302/history?symbol=TCS');
    assert.deepEqual(body.history.map((h) => [h.type, h.price, h.change_percent, h.points]), [['start', 3500, 0, 0], ['live', 3496.5, -0.1, -10], ['live', 3510.5, 0.3, 30], ['final', 3552.5, 1.5, 150]]);
    assert.deepEqual([body.phase, body.is_final, body.stock.symbol, body.total, body.currency], ['final', true, 'TCS', 4, '₹']);
    assert.equal(body.history[1].time, sqlDate(db.readings[1].at));
  });

  test('live, special characters, and stocks without prices', async () => {
    reading(LIVE, min(-10), { 'M&M': 1515 });
    let { body } = await api(`301/history?symbol=${encodeURIComponent('M&M')}`);
    assert.deepEqual(body.history.map((h) => [h.type, h.price]), [['start', 1500], ['live', 1515]]);
    body = (await api('301/history?symbol=NOSTART')).body;
    assert.deepEqual([body.stock, body.history], [null, []]);
    assert.match(body.message, /start price/);
    body = (await api('302/history?symbol=NOEND')).body;
    assert.deepEqual(body.history.map((h) => h.type), ['start'], 'no final price is invented');
    body = (await api('303/history?symbol=BTC-USD')).body;
    assert.deepEqual([body.success, body.stock, body.history], [true, null, []]);
  });

  test('bad requests', async () => {
    assert.equal((await api('301/history')).status, 400);
    assert.equal((await api('301/history?symbol[$ne]=x')).status, 400);
    assert.equal((await api('301/history?symbol=XYZ')).status, 404);
    assert.equal((await api('999/history?symbol=TCS')).status, 404);
  });
});

describe('admin pages', () => {
  beforeEach(reset);

  test('every page opens, also with odd query strings', async () => {
    reading(DONE, min(-1450), { TCS: 3496.5 });
    const agent = await login();
    const pages = ['/session-stocks', '/session-stocks?status=live&search[$ne]=x&page=99&market=crypto', '/session-stocks/301', `/session-stocks/${LIVE._id}`, '/session-stocks/302?direction=no_price&sort=category&search=((',
      '/session-stocks/303', '/session-stocks/302/stock?symbol=TCS', '/session-stocks/302/stock?symbol=NOEND', '/session-stocks/301/stock?symbol=NOSTART', '/session-stocks/301/stock?symbol=M%26M', '/session-stocks/303/stock?symbol=BTC-USD'];
    for (const url of pages) {
      const res = await agent.get(url);
      assert.equal(res.status, 200, url);
      assert.doesNotMatch(res.text, /Render Error/, url);
    }
    const list = (await agent.get('/session-stocks/302')).text;
    assert.match(list, /Final gain \/ loss/);
    assert.match(list, /\+1\.50%[\s\S]*−0\.80%[\s\S]*End price missing/);
    assert.doesNotMatch(list, /location\.reload/);
    assert.match((await agent.get('/session-stocks/301')).text, /location\.reload/);
    const stock = (await agent.get('/session-stocks/302/stock?symbol=TCS')).text;
    assert.match(stock, /₹3,496\.50[\s\S]*−0\.10%[\s\S]*table-primary[\s\S]*₹3,552\.50/);
    assert.match((await agent.get('/session-stocks')).text, /sidebar-link active"[^>]*>\s*<i class="bi bi-list-ol"><\/i> Session Stocks/);
    for (const url of ['/session-stocks/999', '/session-stocks/301/stock?symbol=XYZ', '/session-stocks/301/stock', '/session-stocks/999/export']) assert.equal((await agent.get(url)).status, 302, url);
  });

  test('session list: filters, best and worst stock', async () => {
    const names = async (q) => (await svc.listSessions(q)).rows.map((r) => r.session.name).join();
    assert.equal(await names({}), 'Tomorrow,Morning,Yesterday');
    assert.equal(await names({ status: 'completed' }), 'Yesterday');
    assert.equal(await names({ search: '#301' }), 'Morning');
    assert.equal(await names({ market: 'crypto' }), 'Tomorrow');
    const [row] = (await svc.listSessions({ status: 'completed' })).rows;
    assert.deepEqual([row.best.symbol, row.worst.symbol, row.counts.all, row.counts.no_price], ['TCS', 'INFY', 3, 1]);
    assert.equal((await svc.listSessions({ status: 'upcoming' })).rows[0].best, null);
  });

  test('exports, only with the export permission', async () => {
    reading(DONE, min(-1450), { TCS: 3496.5, INFY: 101 });
    const agent = await login();
    const list = await agent.get('/session-stocks/302/export?direction=up');
    assert.match(list.headers['content-disposition'], /session_302_stocks_/);
    assert.equal(list.text.trim().split('\r\n').length, 2);
    assert.match(list.text, /TCS,Tata Consultancy,Large Cap,₹,3500,[^,]*,3552\.5,[^,]*,52\.5,1\.5,150,Yes/);
    const all = (await agent.get('/session-stocks/302/history/export')).text.trim().split('\r\n');
    assert.equal(all.length, 1 + 3 + 3 + 1, 'TCS and INFY: start, live, final; NOEND: start');
    assert.equal((await agent.get('/session-stocks/302/history/export?symbol=TCS')).text.trim().split('\r\n').length, 4);
    assert.equal((await agent.get('/session-stocks/303/history/export')).text.trim().split('\r\n').length, 1);
    const viewer = await login('viewer');
    assert.equal((await viewer.get('/session-stocks/302')).status, 200);
    assert.doesNotMatch((await viewer.get('/session-stocks/302')).text, /Export list/);
    for (const url of ['/session-stocks/302/export', '/session-stocks/302/history/export']) assert.equal((await viewer.get(url)).status, 403, url);
    db.roles[0].permissions = ['dashboard.view'];
    assert.equal((await viewer.get('/session-stocks')).status, 403);
    assert.equal((await request(adminApp).get('/session-stocks')).status, 302);
  });
});
