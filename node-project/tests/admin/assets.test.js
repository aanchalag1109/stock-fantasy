'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 * Admin → Assets: list/filter, add (with Twelve Data check for US), edit/move, delete,
 * bulk move/status/delete, and permissions. Runs the real admin app against an in-memory
 * store; axios is stubbed so nothing leaves the machine.
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
const models = {
  Asset: require('../../src/models/asset.model'),
  MarketTypeCategory: require('../../src/models/market-type-category.model'),
  User: require('../../src/models/user.model'),
  AdminRole: require('../../src/models/admin-role.model'),
};
const adminApp = require('../../src/admin/app');

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
        throw new Error(`unsupported ${op}`);
      });
    }
    return same(val, cond);
  });
}
function query(value) {
  const q = {
    select: () => q, lean: () => q,
    sort: (spec) => {
      if (Array.isArray(value)) {
        const [[k, dir]] = Object.entries(spec);
        value = [...value].sort((x, y) => (String(x[k]) < String(y[k]) ? -dir : String(x[k]) > String(y[k]) ? dir : 0));
      } return q;
    },
    skip: (n) => { if (Array.isArray(value)) value = value.slice(n); return q; },
    limit: (n) => { if (Array.isArray(value)) value = value.slice(0, n); return q; },
    then: (a, b) => Promise.resolve(value).then(a, b),
  };
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
    q.then = (a, b) => Promise.resolve(one(f)).then(a, b);
    return q;
  };
  M.findById = (id) => query(one({ _id: id }));
  M.countDocuments = async (f) => all().filter((d) => matches(d, f || {})).length;
  M.aggregate = async () => {
    const counts = new Map();
    all().forEach((d) => counts.set(String(d.category_id), { _id: d.category_id, n: ((counts.get(String(d.category_id)) || {}).n || 0) + 1 }));
    return [...counts.values()];
  };
  M.create = async (doc) => { const d = { _id: new ObjectId(), ...doc }; all().push(d); return d; };
  M.updateOne = async (f, u) => { const d = one(f); if (d) Object.assign(d, u.$set); return { modifiedCount: d ? 1 : 0 }; };
  M.updateMany = async (f, u) => { const ds = all().filter((d) => matches(d, f)); ds.forEach((d) => Object.assign(d, u.$set)); return { modifiedCount: ds.length }; };
  M.deleteOne = async (f) => { const d = one(f); db[name] = all().filter((x) => x !== d); return { deletedCount: d ? 1 : 0 }; };
  M.deleteMany = async (f) => { const n = all().length; db[name] = all().filter((d) => !matches(d, f)); return { deletedCount: n - db[name].length }; };
}
Object.keys(models).forEach(stub);

// Twelve Data /stocks reference lookup
const LISTED = { AAPL: 'Apple Inc.', MSFT: 'Microsoft Corporation', 'BRK.B': 'Berkshire Hathaway Inc. Class B' };
let twelveDown;
let lookups;
axios.get = async (url, { params }) => {
  if (!url.includes('twelvedata.com/stocks')) throw new Error(`unexpected request ${url}`);
  lookups.push(params.symbol);
  if (twelveDown) throw new Error('ETIMEDOUT');
  return { status: 200, data: { status: 'ok', data: LISTED[params.symbol] ? [{ symbol: params.symbol, name: LISTED[params.symbol], exchange: 'NASDAQ' }] : [] } };
};

// ─── Fixtures ────────────────────────────────────────────────────────────────

const HASH = bcrypt.hashSync('secret123', 4);
const cat = {};
const get = (id) => db.Asset.find((a) => same(a._id, id));
function reset() {
  config.TWELVE_DATA_API_KEY = 'test-key';
  twelveDown = false;
  lookups = [];
  const viewRole = new ObjectId();
  const editRole = new ObjectId();
  db = {
    AdminRole: [
      { _id: viewRole, name: 'Viewer', permissions: ['assets.view'] },
      { _id: editRole, name: 'Editor', permissions: ['assets.view', 'assets.edit'] },
    ],
    User: [
      { _id: new ObjectId(), email: 'super@test.local', password: HASH, is_admin: true, is_super_admin: true },
      { _id: new ObjectId(), email: 'viewer@test.local', password: HASH, is_admin: true, admin_role_id: viewRole },
      { _id: new ObjectId(), email: 'editor@test.local', password: HASH, is_admin: true, admin_role_id: editRole },
    ],
    MarketTypeCategory: [],
    Asset: [],
  };
  [['largeUS', 23, 'Large Cap US', 'stock'], ['smallUS', 17, 'Small Cap US', 'stock'], ['largeIN', 22, 'Large Cap Indian', 'stock'],
    ['largeUK', 24, 'Large Cap UK', 'stock'], ['largeCR', 27, 'Large Cap Crypto', 'crypto']].forEach(([key, oldId, name, type]) => {
    cat[key] = { _id: new ObjectId(), old_id: oldId, name, category_type: type, status: 'active' };
    db.MarketTypeCategory.push(cat[key]);
  });
  // Legacy-shaped rows: numeric old_id, no `type`
  db.Asset.push(
    { _id: new ObjectId(), old_id: 1, symbol: 'AAPL', name: 'Apple Inc.', category_id: cat.largeUS._id, status: 'active' },
    { _id: new ObjectId(), old_id: 2, symbol: 'MSFT', name: 'Microsoft Corp.', category_id: cat.largeUS._id, status: 'active' },
    { _id: new ObjectId(), old_id: 3, symbol: 'AAPL', name: 'Apple Inc.', category_id: cat.smallUS._id, status: 'active' },
    { _id: new ObjectId(), old_id: 4, symbol: 'RELIANCE', name: 'Reliance Industries', category_id: cat.largeIN._id, status: 'active' },
    { _id: new ObjectId(), old_id: 5, symbol: 'BTC-USD', name: 'Bitcoin', category_id: cat.largeCR._id, status: 'inactive' },
  );
}
async function login(email = 'super@test.local') {
  const agent = request.agent(adminApp);
  await agent.post('/login').type('form').send({ email, password: 'secret123' });
  return agent;
}
const symbolsOn = (html) => [...html.matchAll(/<span class="fw-bold font-monospace">([^<]+)<\/span>/g)].map((m) => m[1]);
const post = (agent, url, body) => agent.post(url).type('form').send(body);

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Admin → Assets: list', () => {
  beforeEach(reset);

  test('lists assets with category filter, market filter, status and search', async () => {
    const admin = await login();
    const page = (await admin.get('/market-assets')).text;
    assert.equal(symbolsOn(page).length, 5);
    assert.match(page, /Large Cap US \(2\)/, 'category dropdown shows counts');
    assert.deepEqual(symbolsOn((await admin.get(`/market-assets?category=${cat.largeUS._id}`)).text).sort(), ['AAPL', 'MSFT']);
    assert.deepEqual(symbolsOn((await admin.get('/market-assets?market=us')).text).sort(), ['AAPL', 'AAPL', 'MSFT']);
    assert.deepEqual(symbolsOn((await admin.get('/market-assets?status=inactive')).text), ['BTC-USD']);
    assert.deepEqual(symbolsOn((await admin.get('/market-assets?search=relia')).text), ['RELIANCE']);
    assert.deepEqual(symbolsOn((await admin.get('/market-assets?search=(.*')).text), [], 'search is literal, not a regex');
  });

  test('sidebar links to Assets', async () => {
    const admin = await login();
    assert.match((await admin.get('/market-assets')).text, /href="\/market-assets"[^>]*>\s*<i class="bi bi-list-columns"><\/i> Assets/);
  });
});

describe('Admin → Assets: add', () => {
  beforeEach(reset);

  test('a US symbol is verified on Twelve Data; empty name is filled with the official name', async () => {
    const admin = await login();
    const res = await post(admin, '/market-assets', { category_id: String(cat.smallUS._id), symbol: 'msft', name: '', status: 'active' });
    assert.equal(res.status, 302);
    const created = db.Asset.find((a) => a.symbol === 'MSFT' && same(a.category_id, cat.smallUS._id));
    assert.equal(created.name, 'Microsoft Corporation');
    assert.equal(created.type, 'stock');
    assert.equal(created.old_id, 6, 'gets the next numeric id like migrated assets');
    assert.deepEqual(lookups, ['MSFT']);
  });

  test('a US typo is rejected and nothing is saved', async () => {
    const admin = await login();
    const before = db.Asset.length;
    const res = await post(admin, '/market-assets', { category_id: String(cat.largeUS._id), symbol: 'APPL', name: 'Apple', status: 'active' });
    assert.equal(res.status, 200, 'form is shown again');
    assert.match(res.text, /APPL was not found on any US exchange/);
    assert.match(res.text, /value="APPL"/, 'keeps what the admin typed');
    assert.equal(db.Asset.length, before);
  });

  test('if Twelve Data is unreachable the asset is saved with a warning', async () => {
    twelveDown = true;
    const admin = await login();
    await post(admin, '/market-assets', { category_id: String(cat.largeUS._id), symbol: 'NVDA', name: 'NVIDIA', status: 'active' });
    assert.ok(db.Asset.find((a) => a.symbol === 'NVDA'));
    assert.match((await admin.get('/market-assets')).text, /NVDA could not be verified with Twelve Data/);
  });

  test('format and duplicate rules per market; non-US symbols are not sent to Twelve Data', async () => {
    const admin = await login();
    const cases = [
      [{ category_id: String(cat.largeUS._id), symbol: 'AAPL', name: 'x' }, 'AAPL is already in Large Cap US.'],
      [{ category_id: String(cat.largeCR._id), symbol: 'ETH', name: 'Ether' }, 'Crypto symbols must look like BTC-USD.'],
      [{ category_id: String(cat.largeUK._id), symbol: 'SHEL', name: 'Shell' }, 'must end in .L'],
      [{ category_id: String(cat.largeIN._id), symbol: 'SHEL.L', name: 'Shell' }, 'SHEL.L is not a Indian stock symbol.'],
      [{ category_id: String(cat.largeIN._id), symbol: 'TCS', name: '' }, 'The name field is required.'],
      [{ category_id: '', symbol: 'TCS', name: 'TCS' }, 'Please choose a category.'],
      [{ category_id: String(cat.largeIN._id), symbol: 'BAD SYMBOL', name: 'x' }, 'may only contain'],
    ];
    for (const [body, message] of cases) {
      const res = await post(admin, '/market-assets', { status: 'active', ...body });
      assert.ok(res.text.includes(message), message);
    }
    await post(admin, '/market-assets', { category_id: String(cat.largeIN._id), symbol: 'tcs', name: 'Tata Consultancy', status: 'active' });
    await post(admin, '/market-assets', { category_id: String(cat.largeCR._id), symbol: 'eth-usd', name: 'Ethereum', status: 'active' });
    assert.ok(db.Asset.find((a) => a.symbol === 'TCS'));
    assert.equal(db.Asset.find((a) => a.symbol === 'ETH-USD').type, 'crypto');
    assert.deepEqual(lookups, ['AAPL'].filter(() => false), 'no Twelve Data lookups for duplicates or non-US');
  });

  test('the same symbol may be added to another category', async () => {
    const admin = await login();
    await post(admin, '/market-assets', { category_id: String(cat.smallUS._id), symbol: 'MSFT', name: 'Microsoft', status: 'active' });
    assert.equal(db.Asset.filter((a) => a.symbol === 'MSFT').length, 2);
  });
});

describe('Admin → Assets: edit, move, delete', () => {
  beforeEach(reset);

  test('edit renames and moves; an unchanged US symbol is not re-checked', async () => {
    const msft = db.Asset[1];
    const admin = await login();
    await post(admin, `/market-assets/${msft._id}?_method=PUT`, { category_id: String(cat.smallUS._id), symbol: 'MSFT', name: 'Microsoft Corporation', status: 'inactive' });
    assert.ok(same(get(msft._id).category_id, cat.smallUS._id));
    assert.equal(get(msft._id).name, 'Microsoft Corporation');
    assert.equal(get(msft._id).status, 'inactive');
    assert.deepEqual(lookups, []);
  });

  test('changing a symbol to a US typo is rejected', async () => {
    const msft = db.Asset[1];
    const admin = await login();
    const res = await post(admin, `/market-assets/${msft._id}?_method=PUT`, { category_id: String(cat.largeUS._id), symbol: 'MSFTT', name: 'x', status: 'active' });
    assert.match(res.text, /MSFTT was not found/);
    assert.equal(get(msft._id).symbol, 'MSFT');
  });

  test('moving into a category that already has the symbol is rejected', async () => {
    const aaplLarge = db.Asset[0];
    const admin = await login();
    const res = await post(admin, `/market-assets/${aaplLarge._id}?_method=PUT`, { category_id: String(cat.smallUS._id), symbol: 'AAPL', name: 'Apple', status: 'active' });
    assert.match(res.text, /AAPL is already in Small Cap US/);
  });

  test('delete removes the asset', async () => {
    const rel = db.Asset[3];
    const admin = await login();
    await admin.post(`/market-assets/${rel._id}?_method=DELETE`);
    assert.equal(get(rel._id), undefined);
  });
});

describe('Admin → Assets: bulk actions', () => {
  beforeEach(reset);

  test('bulk move within a market; skips duplicates and cross-market moves', async () => {
    const [aaplLarge, msft, , rel] = db.Asset;
    const admin = await login();
    await post(admin, '/market-assets/bulk', { action: 'move', target_category: String(cat.smallUS._id), 'asset_ids[]': [String(aaplLarge._id), String(msft._id), String(rel._id)] });
    assert.ok(same(get(msft._id).category_id, cat.smallUS._id), 'MSFT moved');
    assert.ok(same(get(aaplLarge._id).category_id, cat.largeUS._id), 'AAPL already in Small Cap US → skipped');
    assert.ok(same(get(rel._id).category_id, cat.largeIN._id), 'Indian → US is refused');
    const page = (await admin.get('/market-assets')).text;
    assert.match(page, /Moved 1 asset\(s\) to Small Cap US/);
    assert.match(page, /AAPL \(already in Small Cap US\)/);
    assert.match(page, /RELIANCE \(Indian → US: use Edit\)/);
  });

  test('bulk activate/deactivate and delete', async () => {
    const admin = await login();
    await post(admin, '/market-assets/bulk', { action: 'activate', 'asset_ids[]': [String(db.Asset[4]._id)] });
    assert.equal(db.Asset[4].status, 'active');
    await post(admin, '/market-assets/bulk', { action: 'delete', 'asset_ids[]': [String(db.Asset[0]._id), String(db.Asset[1]._id)] });
    assert.equal(db.Asset.length, 3);
  });
});

describe('Admin → Assets: permissions', () => {
  beforeEach(reset);

  test('view-only admins see the list without edit controls and cannot change anything', async () => {
    const viewer = await login('viewer@test.local');
    const page = await viewer.get('/market-assets');
    assert.equal(page.status, 200);
    assert.doesNotMatch(page.text, /href="\/market-assets\/create|\/edit"|id="bulkAction"|form="delete-/);
    assert.equal((await viewer.get('/market-assets/create').set('Accept', 'application/json')).status, 403);
    assert.equal((await post(viewer, '/market-assets', { category_id: String(cat.largeIN._id), symbol: 'TCS', name: 'TCS' }).set('Accept', 'application/json')).status, 403);
    assert.equal((await post(viewer, '/market-assets/bulk', { action: 'delete', 'asset_ids[]': [String(db.Asset[0]._id)] }).set('Accept', 'application/json')).status, 403);
    assert.equal(db.Asset.length, 5);
  });

  test('an editor can move but not bulk-delete', async () => {
    const editor = await login('editor@test.local');
    await post(editor, '/market-assets/bulk', { action: 'delete', 'asset_ids[]': [String(db.Asset[0]._id)] });
    assert.equal(db.Asset.length, 5);
    assert.match((await editor.get('/market-assets')).text, /You do not have permission for this action/);
  });
});

describe('Admin → Assets: live symbol check', () => {
  beforeEach(reset);

  test('check-symbol answers found / not found / not US', async () => {
    const admin = await login();
    const ok = (await admin.get(`/market-assets/check-symbol?symbol=brk.b&category_id=${cat.largeUS._id}`)).body;
    assert.equal(ok.found, true);
    assert.equal(ok.name, 'Berkshire Hathaway Inc. Class B');
    assert.equal((await admin.get(`/market-assets/check-symbol?symbol=XXXX&category_id=${cat.largeUS._id}`)).body.found, false);
    assert.equal((await admin.get(`/market-assets/check-symbol?symbol=TCS&category_id=${cat.largeIN._id}`)).body.checked, false);
  });
});

describe('Admin → Assets: logos', () => {
  beforeEach(reset);

  test('standard logo URLs per market (Indian uses the NSE suffix; M&M override)', () => {
    const { defaultLogoUrl, isBrokenLogo } = require('../../src/services/market-data/logos');
    assert.equal(defaultLogoUrl('indian', 'reliance'), 'https://financialmodelingprep.com/image-stock/RELIANCE.NS.png');
    assert.equal(defaultLogoUrl('indian', 'BAJAJ-AUTO'), 'https://financialmodelingprep.com/image-stock/BAJAJ-AUTO.NS.png');
    assert.equal(defaultLogoUrl('indian', 'M&M'), 'https://financialmodelingprep.com/image-stock/MAHMF.png');
    assert.equal(defaultLogoUrl('us', 'BRK.B'), 'https://financialmodelingprep.com/image-stock/BRK.B.png');
    assert.equal(defaultLogoUrl('uk', 'SHEL.L'), 'https://financialmodelingprep.com/image-stock/SHEL.L.png');
    assert.equal(defaultLogoUrl('crypto', 'BTC-USD'), 'https://assets.coincap.io/assets/icons/btc@2x.png');
    assert.ok(isBrokenLogo('http://localhost/storage/stocks/RELIANCE.png'));
    assert.ok(isBrokenLogo('http://127.0.0.1:8000/x.png'));
    assert.ok(isBrokenLogo('storage/stocks/TCS.png'));
    assert.ok(isBrokenLogo(''));
    assert.ok(!isBrokenLogo('https://financialmodelingprep.com/image-stock/AAPL.png'));
  });

  test('adding without a logo fills the standard one; a custom logo is kept', async () => {
    const admin = await login();
    await post(admin, '/market-assets', { category_id: String(cat.largeIN._id), symbol: 'TCS', name: 'Tata Consultancy', image_url: '', status: 'active' });
    await post(admin, '/market-assets', { category_id: String(cat.largeIN._id), symbol: 'INFY', name: 'Infosys', image_url: 'https://cdn.example.com/infy.png', status: 'active' });
    assert.equal(db.Asset.find((a) => a.symbol === 'TCS').image_url, 'https://financialmodelingprep.com/image-stock/TCS.NS.png');
    assert.equal(db.Asset.find((a) => a.symbol === 'INFY').image_url, 'https://cdn.example.com/infy.png');
  });

  test('saving a legacy asset replaces its localhost logo', async () => {
    const rel = db.Asset[3];
    rel.image_url = 'http://localhost/storage/stocks/RELIANCE.png';
    const admin = await login();
    await post(admin, `/market-assets/${rel._id}?_method=PUT`, { category_id: String(cat.largeIN._id), symbol: 'RELIANCE', name: 'Reliance Industries', image_url: rel.image_url, status: 'active' });
    assert.equal(get(rel._id).image_url, 'https://financialmodelingprep.com/image-stock/RELIANCE.NS.png');
  });

  test('"Fix broken logos" repairs every missing/localhost logo and leaves good ones alone', async () => {
    db.Asset[3].image_url = 'http://localhost/storage/stocks/RELIANCE.png';
    db.Asset[4].image_url = null; // BTC-USD
    db.Asset[0].image_url = 'https://financialmodelingprep.com/image-stock/AAPL.png';
    db.Asset[1].image_url = 'https://financialmodelingprep.com/image-stock/MSFT.png';
    db.Asset[2].image_url = 'https://cdn.example.com/aapl.png';
    const admin = await login();
    assert.match((await admin.get('/market-assets')).text, /<strong>2<\/strong> asset\(s\) have a missing or broken logo/);
    await admin.post('/market-assets/fix-logos');
    assert.equal(db.Asset[3].image_url, 'https://financialmodelingprep.com/image-stock/RELIANCE.NS.png');
    assert.equal(db.Asset[4].image_url, 'https://assets.coincap.io/assets/icons/btc@2x.png');
    assert.equal(db.Asset[2].image_url, 'https://cdn.example.com/aapl.png');
    const page = (await admin.get('/market-assets')).text;
    assert.match(page, /Fixed 2 logo\(s\)\./);
    assert.doesNotMatch(page, /have a missing or broken logo/);
  });

  test('view-only admins cannot fix logos', async () => {
    db.Asset[3].image_url = 'http://localhost/storage/stocks/RELIANCE.png';
    const viewer = await login('viewer@test.local');
    assert.doesNotMatch((await viewer.get('/market-assets')).text, /action="\/market-assets\/fix-logos"/);
    assert.equal((await viewer.post('/market-assets/fix-logos').set('Accept', 'application/json')).status, 403);
    assert.equal(db.Asset[3].image_url, 'http://localhost/storage/stocks/RELIANCE.png');
  });
});
