'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: Asset, Market Category & Session redesign (client feedback).
 * Covers: Market Categories admin (market type, name, description, minimum assets, status),
 * the server-side session assignment rules, the price feed choosing its provider from the
 * session's market, and the data migration plan — against an in-memory store.
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

mongoose.set('bufferCommands', false);

const axios = require('axios');
const bcrypt = require('bcryptjs');
const request = require('supertest');
const logger = require('../../src/config/logger');
const models = {
  User: require('../../src/models/user.model'),
  AdminRole: require('../../src/models/admin-role.model'),
  MarketTypeCategory: require('../../src/models/market-type-category.model'),
  Asset: require('../../src/models/asset.model'),
  LeagueSession: require('../../src/models/league-session.model'),
  SessionTemplate: require('../../src/models/session-template.model'),
};
const adminApp = require('../../src/admin/app');
const markets = require('../../src/services/markets');
const sessionAssets = require('../../src/services/session-assets.service');
const priceFeed = require('../../src/services/contest-automation/price-feed');
const twelveData = require('../../src/services/market-data/twelve-data');
const migration = require('../../scripts/migration/redesign-asset-categories');

logger.silent = true;
const { ObjectId } = mongoose.Types;

// ─── In-memory store ─────────────────────────────────────────────────────────

let db;
const same = (a, b) => (a == null && b == null) || String(a) === String(b);
function matches(doc, filter = {}) {
  return Object.entries(filter).every(([key, cond]) => {
    if (key === '$or') return cond.some((f) => matches(doc, f));
    const val = doc[key];
    if (cond instanceof RegExp) return cond.test(val == null ? '' : String(val));
    if (cond && typeof cond === 'object' && !(cond instanceof ObjectId) && !(cond instanceof Date)) {
      return Object.entries(cond).every(([op, arg]) => {
        if (op === '$in') return arg.some((a) => same(val, a));
        if (op === '$ne') return !same(val, arg);
        if (op === '$type') return typeof val === arg;
        if (op === '$exists') return (val !== undefined) === arg;
        throw new Error(`unsupported ${op}`);
      });
    }
    return same(val, cond);
  });
}
function query(value) {
  const q = { select: () => q, lean: () => q, sort: () => q, skip: () => q, limit: () => q, then: (a, b) => Promise.resolve(value).then(a, b) };
  return q;
}
function stub(name) {
  const M = models[name];
  const all = () => db[name];
  const one = (f) => all().find((d) => matches(d, f)) || null;
  M.find = (f) => query(all().filter((d) => matches(d, f || {})).map((d) => ({ ...d })));
  M.findOne = (f) => {
    const q = query(null);
    q.sort = (spec) => { const [[k, dir]] = Object.entries(spec); const rows = all().filter((d) => matches(d, f)).sort((x, y) => (x[k] - y[k]) * dir); q.then = (a, b) => Promise.resolve(rows[0] || null).then(a, b); return q; };
    q.then = (a, b) => Promise.resolve(one(f) ? { ...one(f) } : null).then(a, b);
    return q;
  };
  M.findById = (id) => query(one({ _id: id }));
  M.countDocuments = async (f) => all().filter((d) => matches(d, f || {})).length;
  M.aggregate = async () => all().map((d) => ({ ...d }));
  M.create = async (doc) => { const d = { _id: new ObjectId(), ...doc }; all().push(d); return d; };
  M.updateOne = async (f, u) => {
    const d = one(f);
    if (d) { Object.assign(d, u.$set || {}); Object.keys(u.$unset || {}).forEach((k) => delete d[k]); }
    return { modifiedCount: d ? 1 : 0 };
  };
  M.updateMany = async (f, u) => {
    const ds = all().filter((d) => matches(d, f));
    ds.forEach((d) => { Object.assign(d, u.$set || {}); Object.keys(u.$unset || {}).forEach((k) => delete d[k]); });
    return { modifiedCount: ds.length };
  };
  M.deleteMany = async (f) => { const n = all().length; db[name] = all().filter((d) => !matches(d, f)); return { deletedCount: n - db[name].length }; };
  M.findByIdAndDelete = async (id) => { db[name] = all().filter((d) => !same(d._id, id)); };
}
Object.keys(models).forEach(stub);

const HASH = bcrypt.hashSync('secret123', 4);
function reset() {
  db = {
    AdminRole: [],
    User: [{ _id: new ObjectId(), email: 'super@test.local', password: HASH, is_admin: true, is_super_admin: true }],
    MarketTypeCategory: [
      { _id: new ObjectId(), old_id: 22, name: 'Large Cap Indian', category_type: 'stock', market: 'indian_stock', min_assets: 10, status: 'active' },
      { _id: new ObjectId(), old_id: 30, name: 'Old Indian', category_type: 'stock', market: 'indian_stock', min_assets: 1, status: 'inactive' },
    ],
    Asset: [
      { _id: new ObjectId(), symbol: 'RELIANCE', name: 'Reliance', market: 'indian_stock', status: 'active' },
      { _id: new ObjectId(), symbol: 'YESBANK', name: 'Yes Bank', market: 'indian_stock', status: 'inactive' },
    ],
    LeagueSession: [],
    SessionTemplate: [],
  };
}
async function login() {
  const agent = request.agent(adminApp);
  await agent.post('/login').type('form').send({ email: 'super@test.local', password: 'secret123' });
  return agent;
}
const post = (agent, url, body) => agent.post(url).type('form').send(body);

// ─── Market Categories admin ─────────────────────────────────────────────────

describe('Market Categories: dynamic categories per market type', () => {
  beforeEach(reset);

  test('the form offers Indian Stock / US Stock / Crypto and a minimum assets field', async () => {
    const admin = await login();
    const page = (await admin.get('/market_type_categories/create')).text;
    assert.match(page, /<option value="indian_stock" >Indian Stock<\/option>/);
    assert.match(page, /<option value="us_stock" >US Stock<\/option>/);
    assert.match(page, /<option value="crypto" >Crypto<\/option>/);
    assert.match(page, /name="min_assets"/);
    assert.match(page, /name="max_assets"/);
    assert.match(page, /name="description"/);
    assert.doesNotMatch(page, /Stock Market|value="stock"/, 'no "Stock Market + country" any more');
  });

  test('creates any category with a minimum; gets a numeric id; listed with its market and minimum', async () => {
    const admin = await login();
    const res = await post(admin, '/market_type_categories', { market: 'crypto', name: 'Top Cryptocurrencies', description: 'Top coins by market cap', min_assets: '5', max_assets: '12', status: 'active' });
    assert.equal(res.status, 302);
    const created = db.MarketTypeCategory.find((c) => c.name === 'Top Cryptocurrencies');
    assert.equal(created.market, 'crypto');
    assert.equal(created.category_type, 'crypto');
    assert.equal(created.min_assets, 5);
    assert.equal(created.max_assets, 12);
    assert.equal(created.description, 'Top coins by market cap');
    assert.equal(created.old_id, 31, 'numeric id, as sessions and app baskets store');
    const list = (await admin.get('/market_type_categories?market=crypto')).text;
    assert.match(list, /Top Cryptocurrencies/);
    assert.doesNotMatch(list, /Large Cap Indian/, 'filtered by market');
  });

  test('validation: market, name, minimum 1–500, unique name per market; the form keeps the input', async () => {
    const admin = await login();
    const cases = [
      [{ market: '', name: 'X', min_assets: '1', max_assets: '5' }, 'Choose a market type'],
      [{ market: 'uk', name: 'X', min_assets: '1', max_assets: '5' }, 'Choose a market type'],
      [{ market: 'us_stock', name: '', min_assets: '1', max_assets: '5' }, 'The category name is required.'],
      [{ market: 'us_stock', name: 'X', min_assets: '0', max_assets: '5' }, 'Minimum stocks a player must pick must be a whole number from 1 to 500.'],
      [{ market: 'us_stock', name: 'X', min_assets: '2.5', max_assets: '5' }, 'Minimum stocks a player must pick must be a whole number'],
      [{ market: 'us_stock', name: 'X', min_assets: '1' }, 'Maximum stocks a player can pick must be a whole number from 1 to 500.'],
      [{ market: 'us_stock', name: 'X', min_assets: '1', max_assets: '501' }, 'Maximum stocks a player can pick must be a whole number from 1 to 500.'],
      [{ market: 'us_stock', name: 'X', min_assets: '6', max_assets: '5' }, 'Maximum stocks a player can pick cannot be less than the minimum.'],
      [{ market: 'indian_stock', name: 'large cap indian', min_assets: '3', max_assets: '5' }, 'A Indian Stock category named &#34;large cap indian&#34; already exists.'],
    ];
    for (const [body, message] of cases) {
      const res = await post(admin, '/market_type_categories', { status: 'active', ...body });
      assert.equal(res.status, 422, message);
      assert.ok(res.text.includes(message), message);
    }
    assert.match((await post(admin, '/market_type_categories', { market: 'us_stock', name: 'Typed', min_assets: '0', status: 'active' })).text, /value="Typed"/);
    // Same name in another market is fine.
    await post(admin, '/market_type_categories', { market: 'us_stock', name: 'Large Cap Indian', min_assets: '1', max_assets: '1', status: 'active' });
    assert.equal(db.MarketTypeCategory.filter((c) => c.name === 'Large Cap Indian').length, 2);
  });

  test('editing changes name/minimum/maximum/status', async () => {
    const admin = await login();
    const cat = db.MarketTypeCategory[0];
    await post(admin, `/market_type_categories/${cat._id}?_method=PUT`, { market: 'indian_stock', name: 'Large Cap India', min_assets: '8', max_assets: '15', status: 'inactive', description: '' });
    assert.equal(cat.name, 'Large Cap India');
    assert.equal(cat.min_assets, 8);
    assert.equal(cat.max_assets, 15);
    assert.equal(cat.status, 'inactive');
  });
});

// ─── Session assignment rules (service) ──────────────────────────────────────

describe('Session assignment rules', () => {
  beforeEach(reset);

  const run = (selection, categoryIds, market = 'indian_stock') => sessionAssets.buildAssignment({
    market, selection: new Map(Object.entries(selection)), categoryIds: categoryIds || Object.keys(selection),
  });

  test('only active categories of the market; only active assets of the market', async () => {
    db.MarketTypeCategory[0].min_assets = 1;
    let r = await run({ 30: ['RELIANCE'] });
    assert.deepEqual(r.errors, ['Old Indian is inactive and can\'t be used.']);
    r = await run({ 22: ['YESBANK'] });
    assert.ok(r.errors.includes('YESBANK is not an active Indian Stock asset.'));
    r = await run({ 22: ['reliance'] });
    assert.deepEqual(r.errors, []);
    assert.deepEqual(r.rows, [{ category_id: 22, category_name: 'Large Cap Indian', asset_symbol: 'RELIANCE', asset_name: 'Reliance' }]);
    assert.deepEqual(r.categories, [{ category_id: 22, category_name: 'Large Cap Indian', min_assets: 1, max_assets: null }]);
  });

  // NEW IMPLEMENTATION — NODE.JS PROJECT (client feedback): the maximum is how many stocks a PLAYER may
  // pick — the admin may add more assets than that; the limits are kept on the session for the app.
  test('the maximum does not limit the admin; it is kept on the session as the player limit', async () => {
    const cat = db.MarketTypeCategory[0];
    cat.min_assets = 1;
    cat.max_assets = 1;
    db.Asset.push({ _id: new ObjectId(), symbol: 'TCS', name: 'TCS', market: 'indian_stock', status: 'active' });
    const r = await run({ 22: ['RELIANCE', 'TCS'] });
    assert.deepEqual(r.errors, []);
    assert.equal(r.rows.length, 2);
    assert.deepEqual(r.categories, [{ category_id: 22, category_name: 'Large Cap Indian', min_assets: 1, max_assets: 1 }]);
  });

  test('the client example message, and a chosen category with no assets fails its minimum', async () => {
    const r = await run({}, ['22']);
    assert.deepEqual(r.errors, ['Large Cap Indian: players must pick at least 10, so add at least 10 assets. Currently added: 0.']);
    assert.deepEqual((await run({}, [])).errors, ['Select at least one market category for this session.']);
    assert.deepEqual((await run({ 22: ['RELIANCE'] }, null, 'stock')).errors, ['Choose a market type: Indian Stock, US Stock or Crypto.']);
  });

  test('the posted value format survives every body parser', () => {
    const { selection, categoryIds } = sessionAssets.parseSelection({ 'asset_selection[]': ['22:RELIANCE', '22:TCS', '19:M&M'], session_categories: ['22', '40'] });
    assert.deepEqual(Object.fromEntries(selection), { 22: ['RELIANCE', 'TCS'], 19: ['M&M'] });
    assert.deepEqual(categoryIds.sort(), ['19', '22', '40']);
  });
});

// ─── Price feed: provider from the session market ────────────────────────────

describe('Price feed uses the session market (category names are free text)', () => {
  test('US Stock session with a custom category name → Twelve Data; Indian → NSE; UK → unsupported', async () => {
    const originalUs = twelveData.getUsPrices;
    const originalGet = axios.get;
    const nse = [];
    try {
      twelveData.getUsPrices = async (symbols) => new Map(symbols.map((s) => [s, 111]));
      axios.get = async (url, { params }) => { nse.push(params.tradingSymbol); return { status: 200, data: { lastPrice: 222 } }; };
      const us = await priceFeed.getPrices({ market: 'us_stock', market_type: 'stock' }, [{ asset_symbol: 'AAPL', category_name: 'Top Tech' }]);
      assert.equal(us.prices.get('AAPL'), 111);
      assert.deepEqual(nse, [], 'US symbols are not sent to NSE even without "US" in the category name');
      const indian = await priceFeed.getPrices({ market: 'indian_stock', market_type: 'stock' }, [{ asset_symbol: 'TCS', category_name: 'Top Tech' }]);
      assert.equal(indian.prices.get('TCS'), 222);
      const uk = await priceFeed.getPrices({ market: 'uk', market_type: 'stock' }, [{ asset_symbol: 'SHEL.L', category_name: 'Large Cap UK' }]);
      assert.deepEqual(uk.unsupported, ['SHEL.L']);
      // A session saved before the redesign (no market) keeps the old category-name detection.
      const legacy = await priceFeed.getPrices({ market_type: 'stock' }, [{ asset_symbol: 'MSFT', category_name: 'Large Cap US' }]);
      assert.equal(legacy.prices.get('MSFT'), 111);
    } finally {
      twelveData.getUsPrices = originalUs;
      axios.get = originalGet;
    }
  });
});

// ─── Migration ───────────────────────────────────────────────────────────────

describe('Migration: redesign-asset-categories', () => {
  beforeEach(() => {
    const cats = {
      lcIN: { _id: new ObjectId(), old_id: 22, name: 'Large Cap Indian', category_type: 'stock', status: 'active' },
      scIN: { _id: new ObjectId(), old_id: 16, name: 'Small Cap Indian', category_type: 'stock', status: 'active' },
      lcUS: { _id: new ObjectId(), old_id: 23, name: 'Large Cap US', category_type: 'stock', status: 'active' },
      scUS: { _id: new ObjectId(), old_id: 17, name: 'Small Cap US', category_type: 'stock', status: 'active' },
      lcUK: { _id: new ObjectId(), old_id: 24, name: 'Large Cap UK', category_type: 'stock', status: 'active' },
      lcCR: { _id: new ObjectId(), old_id: 27, name: 'Large Cap Crypto', category_type: 'crypto', status: 'active' },
    };
    db = {
      ...db,
      MarketTypeCategory: Object.values(cats),
      Asset: [
        { _id: new ObjectId(), old_id: 10, symbol: 'AAPL', name: 'Apple', category_id: cats.lcUS._id, status: 'active', image_url: 'http://localhost/storage/AAPL.png' },
        { _id: new ObjectId(), old_id: 11, symbol: 'AAPL', name: 'Apple Inc.', category_id: cats.scUS._id, status: 'active', image_url: 'https://cdn/aapl.png' },
        { _id: new ObjectId(), old_id: 12, symbol: 'RELIANCE', name: 'Reliance', category_id: cats.lcIN._id, status: 'inactive' },
        { _id: new ObjectId(), old_id: 13, symbol: 'RELIANCE', name: 'Reliance', category_id: cats.scIN._id, status: 'active' },
        { _id: new ObjectId(), old_id: 14, symbol: 'SHEL.L', name: 'Shell', category_id: cats.lcUK._id, status: 'active' },
        { _id: new ObjectId(), old_id: 15, symbol: 'BTC-USD', name: 'Bitcoin', category_id: cats.lcCR._id, status: 'active' },
      ],
      LeagueSession: [
        { _id: new ObjectId(), market_type: 'stock', assets: [{ category_id: 23, category_name: 'Large Cap US', asset_symbol: 'AAPL' }] },
        { _id: new ObjectId(), market_type: 'stock', assets: [{ category_id: 22, category_name: 'Large Cap Indian', asset_symbol: 'RELIANCE' }, { category_id: 16, category_name: 'Small Cap Indian', asset_symbol: 'TCS' }] },
        { _id: new ObjectId(), market_type: 'crypto', assets: [] },
        { _id: new ObjectId(), market_type: 'stock', assets: [] },
      ],
      SessionTemplate: [{ _id: new ObjectId(), template_name: 'US Tech', market_type: 'stock', assets_data: { 'Large Cap US': [{ asset_symbol: 'AAPL', category_id: '23' }] } }],
    };
  });

  test('merges per-category copies into one asset per market, removes the category link, keeps sessions', async () => {
    const p = await migration.plan();
    await migration.apply(p);
    const bySymbol = (s) => db.Asset.filter((a) => a.symbol === s);
    assert.equal(db.Asset.length, 4, 'AAPL ×2 and RELIANCE ×2 merged');
    const aapl = bySymbol('AAPL')[0];
    assert.equal(aapl.old_id, 10, 'the oldest row is kept (its id stays valid)');
    assert.equal(aapl.market, 'us_stock');
    assert.equal(aapl.image_url, 'https://cdn/aapl.png', 'a working logo wins over a localhost one');
    assert.equal(bySymbol('RELIANCE')[0].status, 'active', 'active if any copy was active');
    assert.equal(bySymbol('SHEL.L')[0].status, 'inactive', 'UK kept but hidden');
    assert.equal(bySymbol('BTC-USD')[0].type, 'crypto');
    assert.ok(db.Asset.every((a) => !('category_id' in a)), 'no global category link left');

    const cat = (n) => db.MarketTypeCategory.find((c) => c.name === n);
    assert.deepEqual([cat('Large Cap US').market, cat('Large Cap US').min_assets], ['us_stock', 1]);
    assert.equal(cat('Large Cap UK').status, 'inactive');
    assert.equal(cat('Large Cap Crypto').market, 'crypto');

    assert.deepEqual(db.LeagueSession.map((s) => s.market), ['us_stock', 'indian_stock', 'crypto', 'indian_stock']);
    assert.deepEqual(db.LeagueSession[1].categories, [
      { category_id: 22, category_name: 'Large Cap Indian', min_assets: 1 },
      { category_id: 16, category_name: 'Small Cap Indian', min_assets: 1 },
    ]);
    assert.equal(db.LeagueSession[1].assets.length, 2, 'session asset rows untouched');
    assert.equal(db.SessionTemplate[0].market, 'us_stock');

    // Running it again changes nothing.
    const again = await migration.plan();
    assert.equal(again.assetDeletes.length, 0);
    await migration.apply(again);
    assert.equal(db.Asset.length, 4);
  });

  test('markets helper maps legacy names and sessions', () => {
    assert.equal(markets.marketFromLegacyCategory('Mid Cap US', 'stock'), 'us_stock');
    assert.equal(markets.marketFromLegacyCategory('Small Cap Crypto', 'crypto'), 'crypto');
    assert.equal(markets.marketFromLegacyCategory('Large Cap UK', 'stock'), 'uk');
    assert.equal(markets.marketFromLegacyCategory('Banking', 'stock'), 'indian_stock');
    assert.equal(markets.marketOfSession({ market: 'us_stock', market_type: 'stock' }), 'us_stock');
    assert.deepEqual(markets.marketsFor('stock'), ['indian_stock', 'us_stock']);
    assert.equal(markets.typeOf('crypto'), 'crypto');
  });
});
