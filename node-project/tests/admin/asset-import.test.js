'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 * Admin → Assets → Import Missing Assets: only symbols the market does not have yet are added, all as
 * INACTIVE, with the market's standard logo; existing assets are never changed.
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

mongoose.set('bufferCommands', false);

const bcrypt = require('bcryptjs');
const request = require('supertest');
const logger = require('../../src/config/logger');
const User = require('../../src/models/user.model');
const Asset = require('../../src/models/asset.model');
const adminApp = require('../../src/admin/app');
const auth = require('../../src/admin/controllers/auth.controller');
const importer = require('../../src/services/market-data/asset-import.service');

logger.silent = true;
const { ObjectId } = mongoose.Types;

let db;
let inserted;
const q = (v) => { const o = { select: () => o, sort: () => o, lean: () => o, skip: () => o, limit: () => o, then: (a, b) => Promise.resolve(v).then(a, b) }; return o; };
Asset.find = (f = {}) => q(db.assets.filter((a) => !f.market || a.market === f.market));
Asset.findOne = (f = {}) => q(f.old_id ? [...db.assets].sort((a, b) => (b.old_id || 0) - (a.old_id || 0))[0] || null : null);
Asset.countDocuments = async () => db.assets.length;
Asset.insertMany = async (docs) => { inserted.push(...docs); db.assets.push(...docs); return docs; };
const HASH = bcrypt.hashSync('secret123', 4);
const emailOf = (f) => f.email || (f.$or && (f.$or.find((x) => x.email) || {}).email);
User.findOne = (f) => q(db.users.find((u) => u.email === emailOf(f) || (f._id && String(u._id) === String(f._id))) || null);
User.findById = (id) => q(db.users.find((u) => String(u._id) === String(id)) || null);

const NSE_CSV = [
  'SYMBOL,NAME OF COMPANY, SERIES, DATE OF LISTING',
  'RELIANCE,Reliance Industries Limited,EQ,29-NOV-1995',
  'TCS,Tata Consultancy Services Limited,EQ,25-AUG-2004',
  '"M&M","Mahindra & Mahindra Limited, (M&M)",EQ,01-JAN-2000',
  'SOMEBE,Some Trade-for-Trade Ltd,BE,01-JAN-2010',
  'SOMEBOND,Some Bond 8.5%,N1,01-JAN-2010',
].join('\n');

function reset() {
  auth._resetLoginThrottle();
  inserted = [];
  db = {
    users: [{ _id: new ObjectId(), name: 'super', email: 'super@test.local', password: HASH, is_admin: true, is_super_admin: true }],
    assets: [{ _id: new ObjectId(), old_id: 40, symbol: 'RELIANCE', name: 'Reliance (custom)', market: 'indian_stock', status: 'active', image_url: 'uploads/mine.png' }],
  };
  importer.FETCHERS.indian_stock = async () => importer.parseNseCsv(NSE_CSV);
}

describe('Import missing assets', () => {
  beforeEach(reset);

  test('NSE list: equity series only, quoted names with commas', () => {
    assert.deepEqual(importer.parseNseCsv(NSE_CSV), [
      { symbol: 'RELIANCE', name: 'Reliance Industries Limited' },
      { symbol: 'TCS', name: 'Tata Consultancy Services Limited' },
      { symbol: 'M&M', name: 'Mahindra & Mahindra Limited, (M&M)' },
      { symbol: 'SOMEBE', name: 'Some Trade-for-Trade Ltd' },
    ]);
  });

  test('preview lists only the symbols the market does not have yet', async () => {
    const p = await importer.preview('indian_stock');
    assert.deepEqual([p.found, p.existing], [4, 1]);
    assert.deepEqual(p.missing.map((m) => m.symbol), ['TCS', 'M&M', 'SOMEBE']);
    assert.equal(inserted.length, 0, 'preview saves nothing');
  });

  test('import adds them as INACTIVE with logo and new ids; existing assets untouched', async () => {
    const r = await importer.importMissing('indian_stock');
    assert.equal(r.added, 3);
    assert.deepEqual(inserted.map((a) => [a.symbol, a.status, a.market, a.type, a.old_id]), [
      ['TCS', 'inactive', 'indian_stock', 'stock', 41], ['M&M', 'inactive', 'indian_stock', 'stock', 42], ['SOMEBE', 'inactive', 'indian_stock', 'stock', 43],
    ]);
    assert.match(inserted[0].image_url, /^https:\/\/financialmodelingprep\.com\/image-stock\/TCS\.NS\.png$/);
    assert.deepEqual([db.assets[0].name, db.assets[0].image_url], ['Reliance (custom)', 'uploads/mine.png']);
    assert.equal((await importer.importMissing('indian_stock')).added, 0, 'running again adds nothing');
  });

  test('a source failure is reported and nothing is saved', async () => {
    importer.FETCHERS.indian_stock = async () => { throw new importer.ImportSourceError('The NSE list answered HTTP 403.'); };
    await assert.rejects(importer.importMissing('indian_stock'), /HTTP 403/);
    assert.equal(inserted.length, 0);
    await assert.rejects(importer.preview('uk'), /Choose a market/);
  });

  test('admin pages: preview, import, then land on the Inactive filter', async () => {
    const admin = request.agent(adminApp);
    await admin.post('/login').type('form').send({ email: 'super@test.local', password: 'secret123' });
    const page = await admin.get('/market-assets/import?market=indian_stock');
    assert.equal(page.status, 200);
    assert.match(page.text, /3 new/);
    assert.match(page.text, /Import 3 as Inactive/);
    const res = await admin.post('/market-assets/import').type('form').send({ market: 'indian_stock' });
    assert.equal(res.headers.location, '/market-assets?market=indian_stock&status=inactive');
    assert.equal(inserted.length, 3);
  });
});
