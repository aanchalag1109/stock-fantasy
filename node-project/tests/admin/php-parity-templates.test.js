'use strict';

/**
 * PHP PARITY tests — Saved Templates edit (PHP Admin\TemplateController::update): name fields
 * plus the template's assets, rebuilt in PHP's assets_data format.
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
const SessionTemplate = require('../../src/models/session-template.model');
const MarketTypeCategory = require('../../src/models/market-type-category.model');
const Asset = require('../../src/models/asset.model');
const adminApp = require('../../src/admin/app');

logger.silent = true;
const { ObjectId } = mongoose.Types;

let db;
const same = (a, b) => String(a) === String(b);
const q = (v) => { const o = { select: () => o, sort: () => o, lean: () => o, then: (a, b) => Promise.resolve(v).then(a, b) }; return o; };
const inList = (val, cond) => (cond && cond.$in ? cond.$in.some((x) => same(x, val)) : same(val, cond));
User.findOne = (f) => q(db.users.find((u) => u.email === (f.$or ? f.$or[0].email : f.email)) || null);
User.findById = (id) => q(db.users.find((u) => same(u._id, id)) || null);
AdminRole.findById = (id) => q(db.roles.find((r) => same(r._id, id)) || null);
SessionTemplate.findById = (id) => q(db.templates.find((t) => same(t._id, id)) || null);
SessionTemplate.findByIdAndUpdate = async (id, set) => { const t = db.templates.find((x) => same(x._id, id)); Object.assign(t, set); return t; };
MarketTypeCategory.find = (f) => q(db.categories.filter((c) => (f.old_id ? inList(c.old_id, f.old_id) : true) && (f.category_type ? c.category_type === f.category_type : true)));
Asset.find = (f) => q(db.assets.filter((a) => inList(a.symbol, f.symbol)));

const HASH = bcrypt.hashSync('secret123', 4);
const ids = {};
function reset() {
  ids.template = new ObjectId();
  ids.editorRole = new ObjectId();
  db = {
    roles: [{ _id: ids.editorRole, name: 'Templates', permissions: ['templates.edit'] }],
    users: [
      { _id: new ObjectId(), email: 'super@test.local', password: HASH, is_admin: true, is_super_admin: true },
      { _id: new ObjectId(), email: 'editor@test.local', password: HASH, is_admin: true, admin_role_id: ids.editorRole },
    ],
    categories: [
      { _id: new ObjectId(), old_id: 22, name: 'Large Cap Indian', category_type: 'stock', status: 'active' },
      { _id: new ObjectId(), old_id: 19, name: 'Mid Cap Indian', category_type: 'stock', status: 'active' },
    ],
    assets: [{ symbol: 'RELIANCE', name: 'Reliance Industries Ltd.' }, { symbol: 'TCS', name: 'Tata Consultancy Services Ltd.' }],
    templates: [{
      _id: ids.template, name: 'Nifty 50', template_name: 'Morning', market_type: 'stock', max_stocks: 5,
      assets_data: { 'Large Cap Indian': [{ asset_symbol: 'RELIANCE', asset_name: 'Reliance Industries Ltd.', category_name: 'Large Cap Indian', category_id: '22' }] },
    }],
  };
}
async function login(email = 'super@test.local') {
  const agent = request.agent(adminApp);
  await agent.post('/login').type('form').send({ email, password: 'secret123' });
  return agent;
}
const tpl = () => db.templates[0];

describe('Saved Templates → Edit (PHP TemplateController::update)', () => {
  beforeEach(reset);

  test('edit page pre-ticks the saved assets', async () => {
    const admin = await login();
    const page = await admin.get(`/templates/${ids.template}/edit`);
    assert.equal(page.status, 200);
    assert.match(page.text, /var SELECTED = new Set\(\["RELIANCE"\]\)/);
    assert.match(page.text, /name="assets_loaded"/);
  });

  test('saving rebuilds assets_data in PHP format (grouped by category, names looked up)', async () => {
    const admin = await login();
    const res = await admin.post(`/templates/${ids.template}?_method=PUT`).type('form').send(
      'template_name=Morning+v2&name=Nifty+50&market_type=stock&max_stocks=6&assets_loaded=1'
      + '&asset_selection%5B%5D=22%3ARELIANCE&asset_selection%5B%5D=22%3ATCS&asset_selection%5B%5D=19%3AZOMATO&asset_selection%5B%5D=99%3AX',
    );
    assert.equal(res.headers.location, '/templates');
    assert.equal(tpl().template_name, 'Morning v2');
    assert.equal(tpl().max_stocks, 6);
    assert.deepEqual(tpl().assets_data, {
      'Large Cap Indian': [
        { asset_symbol: 'RELIANCE', asset_name: 'Reliance Industries Ltd.', category_name: 'Large Cap Indian', category_id: '22' },
        { asset_symbol: 'TCS', asset_name: 'Tata Consultancy Services Ltd.', category_name: 'Large Cap Indian', category_id: '22' },
      ],
      'Mid Cap Indian': [{ asset_symbol: 'ZOMATO', asset_name: 'ZOMATO', category_name: 'Mid Cap Indian', category_id: '19' }],
    }, 'unknown category 99 skipped, unknown asset name falls back to the symbol (PHP)');
  });

  test('unticking everything clears the assets (PHP); a save without the picker loaded keeps them', async () => {
    const admin = await login();
    await admin.post(`/templates/${ids.template}?_method=PUT`).type('form').send('template_name=Morning&name=Nifty+50&market_type=stock&max_stocks=5&assets_loaded=0');
    assert.equal(tpl().assets_data['Large Cap Indian'].length, 1, 'kept when the picker never loaded');
    await admin.post(`/templates/${ids.template}?_method=PUT`).type('form').send('template_name=Morning&name=Nifty+50&market_type=stock&max_stocks=5&assets_loaded=1');
    assert.deepEqual(tpl().assets_data, {});
  });

  test('template editors can load the category/asset pickers', async () => {
    const editor = await login('editor@test.local');
    const cats = await editor.get('/api/categories/stock').set('Accept', 'application/json');
    assert.equal(cats.status, 200);
    assert.deepEqual(cats.body.map((c) => c.id).sort(), [19, 22]);
  });
});
