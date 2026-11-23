'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 * Market category min / max = how many stocks a PLAYER picks from each category (client feedback).
 * The session keeps the limits in `categories`; every basket save / edit endpoint enforces them.
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

mongoose.set('bufferCommands', false);

const request = require('supertest');
const logger = require('../../src/config/logger');
const User = require('../../src/models/user.model');
const LeagueSession = require('../../src/models/league-session.model');
const SavedBasket = require('../../src/models/saved-basket.model');
const app = require('../../src/app');
const { basketLimits, checkBasket } = require('../../src/services/session-assets.service');

logger.silent = true;
const { ObjectId } = mongoose.Types;

let db;
const same = (a, b) => (a == null && b == null) || String(a) === String(b);
const matches = (doc, f = {}) => Object.entries(f).every(([k, v]) => {
  if (v && typeof v === 'object' && !(v instanceof ObjectId)) {
    if ('$in' in v) return v.$in.some((x) => same(doc[k], x));
    if ('$ne' in v) return !same(doc[k], v.$ne);
    if ('$type' in v) return typeof doc[k] === 'number';
  }
  return same(doc[k], v);
});
const hydrate = (name, d) => (d ? Object.assign(Object.create({
  toObject() { return { ...this }; },
  async save() { Object.assign(db[name].find((x) => same(x._id, this._id)), { ...this }); return this; },
}), d) : null);
const query = (value) => {
  const q = { select: () => q, sort: () => q, lean: () => q, then: (a, b) => Promise.resolve(value).then(a, b) };
  return q;
};
[[User, 'users'], [LeagueSession, 'sessions'], [SavedBasket, 'baskets']].forEach(([M, name]) => {
  const one = (f) => db[name].find((d) => matches(d, f)) || null;
  M.findOne = (f) => query(hydrate(name, one(f)));
  M.findById = (id) => query(hydrate(name, one({ _id: id })));
  M.find = (f) => query(db[name].filter((d) => matches(d, f)));
  M.create = async (doc) => { const d = { _id: new ObjectId(), ...doc }; db[name].push(d); return hydrate(name, d); };
  M.updateOne = async (f, u) => { const d = one(f); if (d) Object.assign(d, u.$set || {}); return { modifiedCount: d ? 1 : 0 }; };
});

const ids = {};
function reset() {
  ids.user = new ObjectId();
  ids.session = new ObjectId();
  db = {
    users: [{ _id: ids.user, old_id: 5, name: 'Asha' }],
    sessions: [{
      _id: ids.session,
      old_id: 9,
      status: 'upcoming',
      assets: [
        { category_id: 1, category_name: 'Large Cap', asset_symbol: 'RELIANCE' },
        { category_id: 1, category_name: 'Large Cap', asset_symbol: 'TCS' },
        { category_id: 1, category_name: 'Large Cap', asset_symbol: 'INFY' },
        { category_id: 2, category_name: 'Mid Cap', asset_symbol: 'TATAPOWER' },
        { category_id: 2, category_name: 'Mid Cap', asset_symbol: 'IRCTC' },
      ],
      categories: [
        { category_id: 1, category_name: 'Large Cap', min_assets: 1, max_assets: 2 },
        { category_id: 2, category_name: 'Mid Cap', min_assets: 1, max_assets: null },
      ],
    }],
    baskets: [],
  };
}
const pick = (...symbols) => symbols.map((s) => ({ symbol: s, name: s }));
const session = () => db.sessions[0];

describe('basket pick limits (rule)', () => {
  beforeEach(reset);

  test('the app gets min_select / max_select and how many stocks each category has', () => {
    assert.deepEqual(basketLimits(session()), [
      { category_id: 1, category_name: 'Large Cap', min_select: 1, max_select: 2, pool_count: 3 },
      { category_id: 2, category_name: 'Mid Cap', min_select: 1, max_select: null, pool_count: 2 },
    ]);
  });

  test('within the limits passes; below min, above max and foreign stocks fail', () => {
    assert.deepEqual(checkBasket(session(), pick('RELIANCE', 'tcs', 'IRCTC')), []);
    assert.deepEqual(checkBasket(session(), pick('RELIANCE', 'TCS', 'INFY', 'IRCTC')), ['Large Cap: pick at most 2 stocks (you picked 3).']);
    assert.deepEqual(checkBasket(session(), pick('RELIANCE')), ['Mid Cap: pick at least 1 stock (you picked 0).']);
    assert.deepEqual(checkBasket(session(), pick('RELIANCE', 'IRCTC', 'AAPL')), ['AAPL is not part of this session.']);
    assert.deepEqual(checkBasket(session(), pick('RELIANCE', 'RELIANCE', 'IRCTC')), [], 'duplicates count once');
  });

  test('sessions created before the limits (no categories snapshot) are not checked', () => {
    delete session().categories;
    assert.deepEqual(basketLimits(session()), []);
    assert.deepEqual(checkBasket(session(), pick('ANYTHING')), []);
  });
});

describe('basket endpoints enforce the limits', () => {
  beforeEach(reset);

  test('POST /save-standalone-basket', async () => {
    const bad = await request(app).post('/api/v1/save-standalone-basket').send({ user_id: 5, session_id: 9, assets: pick('RELIANCE', 'TCS', 'INFY', 'IRCTC') });
    assert.equal(bad.status, 422);
    assert.equal(bad.body.message, 'Large Cap: pick at most 2 stocks (you picked 3).');
    assert.equal(db.baskets.length, 0);
    const ok = await request(app).post('/api/v1/save-standalone-basket').send({ user_id: 5, session_id: 9, assets: pick('RELIANCE', 'IRCTC') });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(db.baskets.length, 1);
  });

  test('POST /save-basket (new and update)', async () => {
    const bad = await request(app).post('/api/v1/save-basket').send({ user_id: 5, session_id: 9, is_standalone: 1, assets: pick('RELIANCE') });
    assert.equal(bad.status, 422);
    assert.deepEqual(bad.body.errors, ['Mid Cap: pick at least 1 stock (you picked 0).']);
    assert.equal((await request(app).post('/api/v1/save-basket').send({ user_id: 5, session_id: 9, is_standalone: 1, assets: pick('TCS', 'IRCTC') })).status, 200);
  });

  test('POST /edit-basket checks the basket\'s own session and leaves the basket unchanged on error', async () => {
    db.baskets.push({ _id: new ObjectId(), old_id: 70, user_id: ids.user, session_id: 9, assets: pick('RELIANCE', 'IRCTC'), multipliers: [] });
    const bad = await request(app).post('/api/v1/edit-basket').send({ user_id: 5, basket_id: 70, assets: pick('RELIANCE', 'TCS', 'INFY', 'IRCTC') });
    assert.equal(bad.status, 422);
    assert.equal(db.baskets[0].assets.length, 2);
    const ok = await request(app).post('/api/v1/edit-basket').send({ user_id: 5, basket_id: 70, assets: pick('RELIANCE', 'TCS', 'IRCTC') });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(db.baskets[0].assets.length, 3);
  });

  test('POST /baskets/save', async () => {
    const bad = await request(app).post('/api/v1/baskets/save').send({ user_id: String(ids.user), session_id: 9, is_standalone: true, assets: pick('IRCTC') });
    assert.equal(bad.status, 422);
    assert.match(bad.body.message, /Large Cap: pick at least 1/);
  });
});

// NEW IMPLEMENTATION — NODE.JS PROJECT: basket preview — stocks per market category (client feedback)
describe('basket preview: category_summary', () => {
  const { basketCategorySummary } = require('../../src/services/session-assets.service');
  beforeEach(reset);

  test('every session category is listed with selected / min / max / pool and a status', () => {
    const s = basketCategorySummary(session(), pick('RELIANCE', 'TCS', 'INFY'));
    assert.deepEqual(s.categories, [
      { category_id: 1, category_name: 'Large Cap', selected: 3, min_select: 1, max_select: 2, pool_count: 3, status: 'above_max' },
      { category_id: 2, category_name: 'Mid Cap', selected: 0, min_select: 1, max_select: null, pool_count: 2, status: 'below_min' },
    ]);
    assert.deepEqual([s.total_selected, s.other_count, s.complete], [3, 0, false]);
    const ok = basketCategorySummary(session(), pick('RELIANCE', 'IRCTC', 'TATAPOWER'));
    assert.deepEqual(ok.categories.map((c) => [c.selected, c.status]), [[1, 'ok'], [2, 'ok']]);
    assert.equal(ok.complete, true);
  });

  test('stocks outside the session are counted as other; older sessions list categories without limits', () => {
    assert.equal(basketCategorySummary(session(), pick('RELIANCE', 'IRCTC', 'AAPL')).other_count, 1);
    delete session().categories;
    const s = basketCategorySummary(session(), pick('RELIANCE', 'IRCTC'));
    assert.deepEqual(s.categories.map((c) => [c.category_name, c.selected, c.min_select, c.max_select, c.pool_count, c.status]), [
      ['Large Cap', 1, null, null, 3, 'ok'], ['Mid Cap', 1, null, null, 2, 'ok'],
    ]);
    assert.equal(s.complete, true);
  });

  test('GET /saved-baskets returns category_summary for each basket', async () => {
    db.baskets.push({ _id: new ObjectId(), old_id: 71, user_id: ids.user, session_id: 9, is_standalone: true, serial_no: 'B1', assets: pick('RELIANCE', 'TCS', 'IRCTC'), multipliers: [], created_at: new Date() });
    SavedBasket.find = (f) => { const rows = db.baskets.filter((d) => matches(d, f)); const q = { sort: () => q, lean: () => q, then: (a, b) => Promise.resolve(rows).then(a, b) }; return q; };
    const res = await request(app).get('/api/v1/saved-baskets?user_id=5');
    assert.equal(res.status, 200, res.text);
    const summary = res.body.data[0].category_summary;
    assert.deepEqual(summary.categories.map((c) => [c.category_name, c.selected, c.max_select]), [['Large Cap', 2, 2], ['Mid Cap', 1, null]]);
    assert.equal(summary.complete, true);
  });
});
