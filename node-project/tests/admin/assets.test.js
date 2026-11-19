'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 * Admin → Assets: the central master list (client feedback: no categories on assets) — list/filter,
 * add (with Twelve Data check for US), edit, delete, bulk status/delete, and permissions. Runs the real admin app against an in-memory
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
    all().forEach((d) => counts.set(String(d.market), { _id: d.market, n: ((counts.get(String(d.market)) || {}).n || 0) + 1 }));
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
  // Master list after the redesign migration: one row per (market, symbol), no category.
  db.Asset.push(
    { _id: new ObjectId(), old_id: 1, symbol: 'AAPL', name: 'Apple Inc.', market: 'us_stock', type: 'stock', status: 'active' },
    { _id: new ObjectId(), old_id: 2, symbol: 'MSFT', name: 'Microsoft Corp.', market: 'us_stock', type: 'stock', status: 'active' },
    { _id: new ObjectId(), old_id: 3, symbol: 'RELIANCE', name: 'Reliance Industries', market: 'indian_stock', type: 'stock', status: 'active' },
    { _id: new ObjectId(), old_id: 4, symbol: 'BTC-USD', name: 'Bitcoin', market: 'crypto', type: 'crypto', status: 'inactive' },
    { _id: new ObjectId(), old_id: 5, symbol: 'SHEL.L', name: 'Shell plc', market: 'uk', type: 'stock', status: 'inactive' },
  );
}
async function login(email = 'super@test.local') {
  const agent = request.agent(adminApp);
  await agent.post('/login').type('form').send({ email, password: 'secret123' });
  return agent;
}
const symbolsOn = (html) => [...html.matchAll(/<span class="fw-bold font-monospace"[^>]*>([^<]+)<\/span>/g)].map((m) => m[1]);
const post = (agent, url, body) => agent.post(url).type('form').send(body);

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Admin → Assets: list', () => {
  beforeEach(reset);

  test('shows only Symbol, Name and Status columns, with market/status/search filters', async () => {
    const admin = await login();
    const page = (await admin.get('/market-assets')).text;
    assert.equal(symbolsOn(page).length, 5);
    const headers = [...page.match(/<thead class="table-light">([\s\S]*?)<\/thead>/)[1].matchAll(/<th[^>]*>([^<]*)<\/th>/g)].map((m) => m[1].trim()).filter(Boolean);
    assert.deepEqual(headers, ['Symbol', 'Name', 'Status', 'Actions']);
    assert.doesNotMatch(page, /Move to category|name="target_category"/, 'no category assignment');
    assert.match(page, /US Stock \(2\)/, 'market filter shows counts');
    assert.deepEqual(symbolsOn((await admin.get('/market-assets?market=us_stock')).text).sort(), ['AAPL', 'MSFT']);
    assert.deepEqual(symbolsOn((await admin.get('/market-assets?status=inactive')).text).sort(), ['BTC-USD', 'SHEL.L']);
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
    const res = await post(admin, '/market-assets', { market: 'us_stock', symbol: 'brk.b', name: '', status: 'active' });
    assert.equal(res.status, 302);
    const created = db.Asset.find((a) => a.symbol === 'BRK.B');
    assert.equal(created.name, 'Berkshire Hathaway Inc. Class B');
    assert.equal(created.market, 'us_stock');
    assert.equal(created.type, 'stock');
    assert.equal(created.category_id, undefined, 'assets have no category');
    assert.equal(created.old_id, 6, 'gets the next numeric id like migrated assets');
    assert.deepEqual(lookups, ['BRK.B']);
  });

  test('a US typo is rejected and nothing is saved', async () => {
    const admin = await login();
    const before = db.Asset.length;
    const res = await post(admin, '/market-assets', { market: 'us_stock', symbol: 'APPL', name: 'Apple', status: 'active' });
    assert.equal(res.status, 200, 'form is shown again');
    assert.match(res.text, /APPL was not found on any US exchange/);
    assert.match(res.text, /value="APPL"/, 'keeps what the admin typed');
    assert.equal(db.Asset.length, before);
  });

  test('if Twelve Data is unreachable the asset is saved with a warning', async () => {
    twelveDown = true;
    const admin = await login();
    await post(admin, '/market-assets', { market: 'us_stock', symbol: 'NVDA', name: 'NVIDIA', status: 'active' });
    assert.ok(db.Asset.find((a) => a.symbol === 'NVDA'));
    assert.match((await admin.get('/market-assets')).text, /NVDA could not be verified with Twelve Data/);
  });

  test('format and duplicate rules per market; non-US symbols are not sent to Twelve Data', async () => {
    const admin = await login();
    const cases = [
      [{ market: 'us_stock', symbol: 'AAPL', name: 'x' }, 'AAPL is already in the US Stock list.'],
      [{ market: 'crypto', symbol: 'ETH', name: 'Ether' }, 'Crypto symbols must look like BTC-USD.'],
      [{ market: 'indian_stock', symbol: 'SHEL.L', name: 'Shell' }, 'SHEL.L is not a Indian Stock symbol.'],
      [{ market: 'indian_stock', symbol: 'TCS', name: '' }, 'The name field is required.'],
      [{ market: '', symbol: 'TCS', name: 'TCS' }, 'Please choose a market'],
      [{ market: 'uk', symbol: 'BP.L', name: 'BP' }, 'Please choose a market', 'UK is no longer a market for new assets'],
      [{ market: 'indian_stock', symbol: 'BAD SYMBOL', name: 'x' }, 'may only contain'],
    ];
    for (const [body, message] of cases) {
      const res = await post(admin, '/market-assets', { status: 'active', ...body });
      assert.ok(res.text.includes(message), message);
    }
    await post(admin, '/market-assets', { market: 'indian_stock', symbol: 'tcs', name: 'Tata Consultancy', status: 'active' });
    await post(admin, '/market-assets', { market: 'crypto', symbol: 'eth-usd', name: 'Ethereum', status: 'active' });
    assert.equal(db.Asset.find((a) => a.symbol === 'TCS').market, 'indian_stock');
    assert.equal(db.Asset.find((a) => a.symbol === 'ETH-USD').type, 'crypto');
    assert.deepEqual(lookups, [], 'no Twelve Data lookups for duplicates or non-US');
  });

  test('a symbol is unique per market, but may exist in another market', async () => {
    const admin = await login();
    await post(admin, '/market-assets', { market: 'indian_stock', symbol: 'AAPL', name: 'Apple (NSE listing)', status: 'active' });
    assert.equal(db.Asset.filter((a) => a.symbol === 'AAPL').length, 2);
  });
});

describe('Admin → Assets: edit, delete', () => {
  beforeEach(reset);

  test('edit renames and changes status; an unchanged US symbol is not re-checked', async () => {
    const msft = db.Asset[1];
    const admin = await login();
    await post(admin, `/market-assets/${msft._id}?_method=PUT`, { market: 'us_stock', symbol: 'MSFT', name: 'Microsoft Corporation', status: 'inactive' });
    assert.equal(get(msft._id).name, 'Microsoft Corporation');
    assert.equal(get(msft._id).status, 'inactive');
    assert.deepEqual(lookups, []);
  });

  test('changing a symbol to a US typo is rejected', async () => {
    const msft = db.Asset[1];
    const admin = await login();
    const res = await post(admin, `/market-assets/${msft._id}?_method=PUT`, { market: 'us_stock', symbol: 'MSFTT', name: 'x', status: 'active' });
    assert.match(res.text, /MSFTT was not found/);
    assert.equal(get(msft._id).symbol, 'MSFT');
  });

  test('renaming into a symbol the market already has is rejected', async () => {
    const msft = db.Asset[1];
    const admin = await login();
    const res = await post(admin, `/market-assets/${msft._id}?_method=PUT`, { market: 'us_stock', symbol: 'AAPL', name: 'Apple', status: 'active' });
    assert.match(res.text, /AAPL is already in the US Stock list/);
  });

  test('a legacy UK asset can still be edited in its own market', async () => {
    const shel = db.Asset[4];
    const admin = await login();
    await post(admin, `/market-assets/${shel._id}?_method=PUT`, { market: 'uk', symbol: 'SHEL.L', name: 'Shell', status: 'inactive' });
    assert.equal(get(shel._id).name, 'Shell');
    const rel = db.Asset[2];
    const res = await post(admin, `/market-assets/${rel._id}?_method=PUT`, { market: 'uk', symbol: 'RELIANCE', name: 'x', status: 'active' });
    assert.match(res.text, /Please choose a market/, 'nothing can be moved into UK');
  });

  test('delete removes the asset', async () => {
    const rel = db.Asset[2];
    const admin = await login();
    await admin.post(`/market-assets/${rel._id}?_method=DELETE`);
    assert.equal(get(rel._id), undefined);
  });
});

describe('Admin → Assets: bulk actions', () => {
  beforeEach(reset);

  test('bulk activate/deactivate and delete; category moves no longer exist', async () => {
    const admin = await login();
    await post(admin, '/market-assets/bulk', { action: 'activate', 'asset_ids[]': [String(db.Asset[3]._id)] });
    assert.equal(db.Asset[3].status, 'active');
    await post(admin, '/market-assets/bulk', { action: 'move', 'asset_ids[]': [String(db.Asset[0]._id)] });
    assert.match((await admin.get('/market-assets')).text, /Unknown action/);
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
    assert.equal((await post(viewer, '/market-assets', { market: 'indian_stock', symbol: 'TCS', name: 'TCS' }).set('Accept', 'application/json')).status, 403);
    assert.equal((await post(viewer, '/market-assets/bulk', { action: 'delete', 'asset_ids[]': [String(db.Asset[0]._id)] }).set('Accept', 'application/json')).status, 403);
    assert.equal(db.Asset.length, 5);
  });

  test('an editor can change status but not bulk-delete', async () => {
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
    const ok = (await admin.get('/market-assets/check-symbol?symbol=brk.b&market=us_stock')).body;
    assert.equal(ok.found, true);
    assert.equal(ok.name, 'Berkshire Hathaway Inc. Class B');
    assert.equal((await admin.get('/market-assets/check-symbol?symbol=XXXX&market=us_stock')).body.found, false);
    assert.equal((await admin.get('/market-assets/check-symbol?symbol=TCS&market=indian_stock')).body.checked, false);
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
    await post(admin, '/market-assets', { market: 'indian_stock', symbol: 'TCS', name: 'Tata Consultancy', image_url: '', status: 'active' });
    await post(admin, '/market-assets', { market: 'indian_stock', symbol: 'INFY', name: 'Infosys', image_url: 'https://cdn.example.com/infy.png', status: 'active' });
    assert.equal(db.Asset.find((a) => a.symbol === 'TCS').image_url, 'https://financialmodelingprep.com/image-stock/TCS.NS.png');
    assert.equal(db.Asset.find((a) => a.symbol === 'INFY').image_url, 'https://cdn.example.com/infy.png');
  });

  test('saving a legacy asset replaces its localhost logo', async () => {
    const rel = db.Asset[2];
    rel.image_url = 'http://localhost/storage/stocks/RELIANCE.png';
    const admin = await login();
    await post(admin, `/market-assets/${rel._id}?_method=PUT`, { market: 'indian_stock', symbol: 'RELIANCE', name: 'Reliance Industries', image_url: rel.image_url, status: 'active' });
    assert.equal(get(rel._id).image_url, 'https://financialmodelingprep.com/image-stock/RELIANCE.NS.png');
  });

  test('"Fix broken logos" repairs every missing/localhost logo and leaves good ones alone', async () => {
    db.Asset[2].image_url = 'http://localhost/storage/stocks/RELIANCE.png';
    db.Asset[3].image_url = null; // BTC-USD
    db.Asset[0].image_url = 'https://financialmodelingprep.com/image-stock/AAPL.png';
    db.Asset[1].image_url = 'https://cdn.example.com/msft.png';
    db.Asset[4].image_url = 'https://financialmodelingprep.com/image-stock/SHEL.L.png';
    const admin = await login();
    assert.match((await admin.get('/market-assets')).text, /<strong>2<\/strong> asset\(s\) have a missing or broken logo/);
    await admin.post('/market-assets/fix-logos');
    assert.equal(db.Asset[2].image_url, 'https://financialmodelingprep.com/image-stock/RELIANCE.NS.png');
    assert.equal(db.Asset[3].image_url, 'https://assets.coincap.io/assets/icons/btc@2x.png');
    assert.equal(db.Asset[1].image_url, 'https://cdn.example.com/msft.png');
    const page = (await admin.get('/market-assets')).text;
    assert.match(page, /Fixed 2 logo\(s\)\./);
    assert.doesNotMatch(page, /have a missing or broken logo/);
  });

  test('view-only admins cannot fix logos', async () => {
    db.Asset[2].image_url = 'http://localhost/storage/stocks/RELIANCE.png';
    const viewer = await login('viewer@test.local');
    assert.doesNotMatch((await viewer.get('/market-assets')).text, /action="\/market-assets\/fix-logos"/);
    assert.equal((await viewer.post('/market-assets/fix-logos').set('Accept', 'application/json')).status, 403);
    assert.equal(db.Asset[2].image_url, 'http://localhost/storage/stocks/RELIANCE.png');
  });
});

// NEW IMPLEMENTATION — NODE.JS PROJECT: TradingView chart pop-up on stock click
describe('Admin → TradingView chart on stock click', () => {
  beforeEach(() => { reset(); require('../../src/services/contest-automation/price-feed')._resetMarketCache(); });

  test('admin pages include the chart pop-up; asset symbols open it with their market', async () => {
    const admin = await login();
    const page = (await admin.get('/market-assets')).text;
    assert.match(page, /id="tvChartModal"/);
    assert.match(page, /s3\.tradingview\.com\/external-embedding\/embed-widget-advanced-chart\.js/);
    assert.match(page, /data-tv-symbol="AAPL" data-tv-market="us"/);
    assert.match(page, /data-tv-symbol="RELIANCE" data-tv-market="indian"/);
    assert.match(page, /data-tv-symbol="BTC-USD" data-tv-market="crypto"/);
  });

  test('/api/asset-markets resolves markets from each asset market', async () => {
    const admin = await login();
    const res = await admin.get('/api/asset-markets?symbols=AAPL,RELIANCE,SHEL.L,BTC-USD');
    assert.deepEqual(res.body.markets, { AAPL: 'us', RELIANCE: 'indian', 'SHEL.L': 'uk', 'BTC-USD': 'crypto' });
    const viewer = await login('viewer@test.local');
    assert.equal((await viewer.get('/api/asset-markets?symbols=AAPL')).status, 200, 'assets.view is enough');
  });

  test('our symbols map to the right TradingView symbols', async () => {
    const admin = await login();
    const page = (await admin.get('/market-assets')).text;
    const source = page.match(/function tvSymbol\(symbol, market, exchange\) \{[\s\S]*?\n  \}/)[0];
    const tvSymbol = new Function(`${source}; return tvSymbol;`)();
    assert.equal(tvSymbol('RELIANCE', 'indian'), 'BSE:RELIANCE');
    assert.equal(tvSymbol('RELIANCE', 'indian', 'NSE'), 'NSE:RELIANCE');
    assert.equal(tvSymbol('BAJAJ-AUTO', 'indian', 'NSE'), 'NSE:BAJAJ_AUTO');
    assert.equal(tvSymbol('M&M', 'indian', 'NSE'), 'NSE:M_M');
    assert.equal(tvSymbol('AAPL', 'us'), 'AAPL');
    assert.equal(tvSymbol('BRK.B', 'us'), 'BRK.B');
    assert.equal(tvSymbol('SHEL.L', 'uk'), 'LSE:SHEL');
    assert.equal(tvSymbol('BTC-USD', 'crypto'), 'BINANCE:BTCUSDT');
    assert.equal(tvSymbol('USDT-USD', 'crypto'), 'CRYPTOCAP:USDT');
  });

  test('NSE and LSE are not used in the embedded chart (TradingView refuses them); UK opens on TradingView instead', async () => {
    const admin = await login();
    const page = (await admin.get('/market-assets')).text;
    assert.match(page, /function embeddable\(market\) \{ return market !== 'uk'; \}/);
    assert.match(page, /London Stock Exchange charts can.{1,2}t be shown here/);
    assert.doesNotMatch(page, /data-tv-exchange="NSE"/, 'no NSE switch');
    assert.match(page, /shown\.bs\.modal/, 'the chart is drawn once the pop-up is open (full height)');
  });
});
