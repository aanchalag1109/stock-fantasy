'use strict';

/**
 * Saved Templates edit (PHP Admin\TemplateController::update): name fields plus the template's
 * assets, stored in PHP's assets_data format.
 * NEW IMPLEMENTATION — NODE.JS PROJECT (client feedback): a template has a market type and its
 * category ↔ asset assignment is validated like a session's (market, minimum assets, one
 * category per asset).
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
function matches(doc, filter = {}) {
  return Object.entries(filter).every(([key, cond]) => {
    const val = doc[key];
    if (cond && typeof cond === 'object' && !(cond instanceof ObjectId)) {
      return Object.entries(cond).every(([op, arg]) => {
        if (op === '$in') return arg.some((x) => same(x, val));
        if (op === '$ne') return !same(val, arg);
        throw new Error(`unsupported ${op}`);
      });
    }
    return same(val, cond);
  });
}
User.findOne = (f) => q(db.users.find((u) => u.email === (f.$or ? f.$or[0].email : f.email)) || null);
User.findById = (id) => q(db.users.find((u) => same(u._id, id)) || null);
AdminRole.findById = (id) => q(db.roles.find((r) => same(r._id, id)) || null);
SessionTemplate.findById = (id) => q(db.templates.find((t) => same(t._id, id)) || null);
SessionTemplate.findByIdAndUpdate = async (id, set) => { const t = db.templates.find((x) => same(x._id, id)); Object.assign(t, set); return t; };
MarketTypeCategory.find = (f) => q(db.categories.filter((c) => matches(c, f)));
MarketTypeCategory.findOne = (f) => q(db.categories.find((c) => matches(c, f)) || null);
Asset.find = (f) => q(db.assets.filter((a) => matches(a, f)));

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
      { _id: new ObjectId(), old_id: 22, name: 'Large Cap Indian', category_type: 'stock', market: 'indian_stock', min_assets: 2, status: 'active' },
      { _id: new ObjectId(), old_id: 19, name: 'Mid Cap Indian', category_type: 'stock', market: 'indian_stock', min_assets: 1, status: 'active' },
      { _id: new ObjectId(), old_id: 23, name: 'Large Cap US', category_type: 'stock', market: 'us_stock', min_assets: 1, status: 'active' },
    ],
    assets: [
      { symbol: 'RELIANCE', name: 'Reliance Industries Ltd.', market: 'indian_stock', status: 'active' },
      { symbol: 'TCS', name: 'Tata Consultancy Services Ltd.', market: 'indian_stock', status: 'active' },
      { symbol: 'ZOMATO', name: 'Zomato Ltd.', market: 'indian_stock', status: 'active' },
    ],
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
const save = (agent, extra) => agent.post(`/templates/${ids.template}?_method=PUT`).type('form')
  .send(`template_name=Morning+v2&name=Nifty+50&market=indian_stock&max_stocks=6&assets_loaded=1${extra}`);

describe('Saved Templates → Edit', () => {
  beforeEach(reset);

  test('edit page loads the picker with the market and saved assignment', async () => {
    const admin = await login();
    const page = await admin.get(`/templates/${ids.template}/edit`);
    assert.equal(page.status, 200);
    assert.match(page.text, /market: "indian_stock"/, 'legacy template market derived from its categories');
    assert.match(page.text, /selection: \{"22":\["RELIANCE"\]\}/);
    assert.match(page.text, /name="assets_loaded"/);
    assert.match(page.text, /<option value="indian_stock" selected>Indian Stock<\/option>/);
  });

  test('saving rebuilds assets_data in PHP format (grouped by category, names looked up)', async () => {
    const admin = await login();
    const res = await save(admin, '&asset_selection%5B%5D=22%3ARELIANCE&asset_selection%5B%5D=22%3ATCS&asset_selection%5B%5D=19%3AZOMATO');
    assert.equal(res.headers.location, '/templates');
    assert.equal(tpl().template_name, 'Morning v2');
    assert.equal(tpl().max_stocks, 6);
    assert.equal(tpl().market, 'indian_stock');
    assert.equal(tpl().market_type, 'stock');
    assert.deepEqual(tpl().assets_data, {
      'Large Cap Indian': [
        { asset_symbol: 'RELIANCE', asset_name: 'Reliance Industries Ltd.', category_name: 'Large Cap Indian', category_id: '22' },
        { asset_symbol: 'TCS', asset_name: 'Tata Consultancy Services Ltd.', category_name: 'Large Cap Indian', category_id: '22' },
      ],
      'Mid Cap Indian': [{ asset_symbol: 'ZOMATO', asset_name: 'Zomato Ltd.', category_name: 'Mid Cap Indian', category_id: '19' }],
    });
  });

  test('the same rules as a session: minimum, market, one category per asset; nothing saved on error', async () => {
    const admin = await login();
    const cases = [
      ['&asset_selection%5B%5D=22%3ARELIANCE', /Large Cap Indian: players must pick at least 2, so add at least 2 assets\. Currently added: 1\./],
      ['&asset_selection%5B%5D=23%3AAAPL', /Large Cap US is not a Indian Stock category\./],
      ['&asset_selection%5B%5D=22%3ARELIANCE&asset_selection%5B%5D=22%3ATCS&asset_selection%5B%5D=19%3ARELIANCE', /RELIANCE is assigned to both Large Cap Indian and Mid Cap Indian/],
      ['', /Select at least one market category/],
    ];
    for (const [extra, message] of cases) {
      const res = await save(admin, extra);
      assert.equal(res.headers.location, `/templates/${ids.template}/edit`);
      assert.match((await admin.get(`/templates/${ids.template}/edit`)).text, message);
    }
    assert.equal(tpl().template_name, 'Morning', 'nothing saved');
    assert.equal(tpl().assets_data['Large Cap Indian'].length, 1);
  });

  test('a save without the picker loaded keeps the assets', async () => {
    const admin = await login();
    await admin.post(`/templates/${ids.template}?_method=PUT`).type('form').send('template_name=Morning&name=Nifty+50&market=indian_stock&max_stocks=5&assets_loaded=0');
    assert.equal(tpl().assets_data['Large Cap Indian'].length, 1, 'kept when the picker never loaded');
  });

  test('template editors can load the category/asset pickers (new market keys and legacy stock/crypto)', async () => {
    const editor = await login('editor@test.local');
    const indian = await editor.get('/api/categories/indian_stock').set('Accept', 'application/json');
    assert.equal(indian.status, 200);
    assert.deepEqual(indian.body.map((c) => [c.id, c.min_assets, c.market]).sort(), [[19, 1, 'indian_stock'], [22, 2, 'indian_stock']]);
    const legacy = await editor.get('/api/categories/stock').set('Accept', 'application/json');
    assert.deepEqual(legacy.body.map((c) => c.id).sort(), [19, 22, 23]);
    const assets = await editor.get('/api/assets/market/indian_stock').set('Accept', 'application/json');
    assert.deepEqual(assets.body.map((a) => a.symbol).sort(), ['RELIANCE', 'TCS', 'ZOMATO']);
    const byCategory = await editor.get('/api/assets/22').set('Accept', 'application/json');
    assert.deepEqual(byCategory.body.map((a) => a.symbol).sort(), ['RELIANCE', 'TCS', 'ZOMATO'], 'old per-category URL returns the category market\'s assets');
  });
});

// NEW IMPLEMENTATION — NODE.JS PROJECT (client feedback): change or remove the image on Edit Template /
// Edit Session (shared upload helper, admin/helpers/session-image-upload.js).
describe('Edit Template / Edit Session → image', () => {
  const fs = require('fs');
  const path = require('path');
  const { UPLOAD_DIR } = require('../../src/admin/helpers/session-image-upload');
  const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');
  const created = [];
  const cleanup = () => created.splice(0).forEach((f) => fs.rmSync(path.join(UPLOAD_DIR, path.basename(f)), { force: true }));
  beforeEach(() => { reset(); cleanup(); });

  const multipart = (agent, fields, file) => {
    let req = agent.post(`/templates/${ids.template}?_method=PUT`);
    Object.entries(fields).forEach(([k, v]) => { req = req.field(k, v); });
    return file ? req.attach('session_image', file.buffer, { filename: file.name, contentType: file.type }) : req;
  };
  const base = { template_name: 'Morning', name: 'Nifty 50', market: 'indian_stock', max_stocks: '5' };

  test('the edit page shows the current image with replace and remove options', async () => {
    tpl().image_url = 'uploads/sessions/old.png';
    const page = await (await login()).get(`/templates/${ids.template}/edit`);
    assert.match(page.text, /enctype="multipart\/form-data"/);
    assert.match(page.text, /<img src="\/uploads\/sessions\/old\.png"/);
    assert.match(page.text, /name="session_image"/);
    assert.match(page.text, /name="remove_image"/);
  });

  test('uploading a new image replaces it; the assets are kept', async () => {
    tpl().image_url = 'uploads/sessions/old.png';
    const res = await multipart(await login(), base, { buffer: PNG, name: 'nifty.png', type: 'image/png' });
    assert.equal(res.headers.location, '/templates');
    assert.match(tpl().image_url, /^uploads\/sessions\/\d+_nifty\.png$/);
    created.push(tpl().image_url);
    assert.ok(fs.existsSync(path.join(UPLOAD_DIR, path.basename(tpl().image_url))));
    assert.equal(tpl().assets_data['Large Cap Indian'].length, 1, 'assets untouched');
    cleanup();
  });

  test('remove clears the image; saving without a file keeps it', async () => {
    tpl().image_url = 'uploads/sessions/old.png';
    const admin = await login();
    await multipart(admin, base);
    assert.equal(tpl().image_url, 'uploads/sessions/old.png');
    await multipart(admin, { ...base, remove_image: '1' });
    assert.equal(tpl().image_url, null);
  });

  test('a file that is not an image is refused and nothing changes', async () => {
    tpl().image_url = 'uploads/sessions/old.png';
    const admin = await login();
    const res = await multipart(admin, { ...base, template_name: 'Changed' }, { buffer: Buffer.from('x'), name: 'evil.php', type: 'application/x-php' });
    assert.equal(res.headers.location, `/templates/${ids.template}/edit`);
    assert.match((await admin.get(`/templates/${ids.template}/edit`)).text, /The session image must be a file of type: jpeg, png, jpg, gif\./);
    assert.equal(tpl().image_url, 'uploads/sessions/old.png');
    assert.equal(tpl().template_name, 'Morning');
  });

  test('Edit Session uses the same upload (route is guarded and goes back to the edit page)', () => {
    const router = require('../../src/admin/routes/sessions.routes');
    const layer = router.stack.find((l) => l.route && l.route.path === '/:id' && l.route.methods.put);
    assert.equal(layer.route.stack.length, 4, 'requireAdmin, permission, image upload, update');
    const view = fs.readFileSync(path.join(__dirname, '../../src/admin/views/sessions/edit.ejs'), 'utf8');
    assert.match(view, /enctype="multipart\/form-data"/);
    assert.match(view, /include\('\.\.\/partials\/session_image_field', \{ imageUrl: session\.image_url \}\)/);
  });
});
