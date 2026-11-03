'use strict';

/**
 * PHP PARITY tests — Testing: manual "Create Basket" page (PHP TestingController::showCreateBasket)
 * and "Select Basket" assignment (PHP /api/assign-basket-to-contest).
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
const Contest = require('../../src/models/contest.model');
const LeagueSession = require('../../src/models/league-session.model');
const SavedBasket = require('../../src/models/saved-basket.model');
const adminApp = require('../../src/admin/app');

logger.silent = true;
const { ObjectId } = mongoose.Types;

let db;
const same = (a, b) => String(a) === String(b);
const q = (v) => { const o = { select: () => o, sort: () => o, lean: () => o, limit: (n) => { if (Array.isArray(v)) v = v.slice(0, n); return o; }, then: (a, b) => Promise.resolve(v).then(a, b) }; return o; };
const userMatch = (u, f) => Object.entries(f).every(([k, c]) => {
  if (k === '$or') return c.some((x) => userMatch(u, x));
  if (c && c.$in) return c.$in.some((x) => same(x, u[k]));
  return k === 'email' ? u.email === c : same(u[k], c);
});
User.find = (f) => q(db.users.filter((u) => userMatch(u, f)));
User.findOne = (f) => q(db.users.find((u) => userMatch(u, f)) || null);
User.findById = (id) => q(db.users.find((u) => same(u._id, id)) || null);
AdminRole.findById = (id) => q(db.roles.find((r) => same(r._id, id)) || null);
Contest.findById = (id) => q(db.contests.find((c) => same(c._id, id)) || null);
Contest.findOne = () => q(null);
LeagueSession.findById = (id) => q(db.sessions.find((s) => same(s._id, id)) || null);
LeagueSession.findOne = () => q(null);
SavedBasket.findById = (id) => q(db.baskets.find((b) => same(b._id, id)) || null);
SavedBasket.findOne = (f) => q(db.baskets.filter((b) => same(b.user_id, f.user_id)).slice(-1)[0] || null);
SavedBasket.find = (f) => q(db.baskets.filter((b) => same(b.user_id, f.user_id)));
SavedBasket.create = async (doc) => { const d = { _id: new ObjectId(), ...doc }; db.baskets.push(d); return d; };
SavedBasket.updateOne = async (f, u) => { const b = db.baskets.find((x) => same(x._id, f._id)); Object.assign(b, u.$set); return {}; };

const HASH = bcrypt.hashSync('secret123', 4);
const ids = {};
function reset() {
  ['session', 'contest', 't1', 't2', 'player', 'viewerRole'].forEach((k) => { ids[k] = new ObjectId(); });
  db = {
    roles: [{ _id: ids.viewerRole, name: 'Viewer', permissions: ['testing.view'] }],
    users: [
      { _id: new ObjectId(), email: 'super@test.local', password: HASH, is_admin: true, is_super_admin: true },
      { _id: new ObjectId(), email: 'viewer@test.local', password: HASH, is_admin: true, admin_role_id: ids.viewerRole },
      { _id: ids.t1, name: 'Test User 1', mobile: '91', is_test_user: true },
      { _id: ids.t2, name: 'Test User 2', mobile: '92', is_test_user: true },
      { _id: ids.player, name: 'Real Player', mobile: '93', is_test_user: false },
    ],
    sessions: [{
      _id: ids.session, name: 'Nifty 50', max_stocks: 3,
      assets: [
        { asset_symbol: 'RELIANCE', asset_name: 'Reliance', category_name: 'Large Cap Indian', category_id: 22 },
        { asset_symbol: 'TCS', asset_name: 'TCS', category_name: 'Large Cap Indian', category_id: 22 },
        { asset_symbol: 'ZOMATO', asset_name: 'Zomato', category_name: 'Mid Cap Indian', category_id: 19 },
      ],
    }],
    contests: [{ _id: ids.contest, league_session_id: ids.session, category: 'mega' }],
    baskets: [],
  };
}
async function login(email = 'super@test.local') {
  const agent = request.agent(adminApp);
  await agent.post('/login').type('form').send({ email, password: 'secret123' });
  return agent;
}

describe('Testing → Create Basket (PHP showCreateBasket)', () => {
  beforeEach(reset);

  test('page lists the session assets by category and defaults to the first test user', async () => {
    const admin = await login();
    const page = await admin.get(`/testing/create-basket?contest=${ids.contest}&session=${ids.session}`);
    assert.equal(page.status, 200);
    assert.match(page.text, /var maxAssets = 3;/);
    assert.match(page.text, new RegExp(`var USER_IDS = \\["${ids.t1}"\\]`));
    assert.match(page.text, /"name":"Large Cap Indian"/);
    assert.match(page.text, /"name":"Mid Cap Indian"/);
    assert.match(page.text, /fetch\('\/testing\/create-basket'/, 'saves through the Node endpoint, not 127.0.0.1');
    assert.doesNotMatch(page.text, /127\.0\.0\.1/);
  });

  test('"Create Baskets for Selected" passes the selected test users (non-test users are ignored)', async () => {
    const admin = await login();
    const page = await admin.get(`/testing/create-basket?contest=${ids.contest}&session=${ids.session}&users=${ids.t1},${ids.t2},${ids.player}`);
    const users = JSON.parse(page.text.match(/var USER_IDS = (\[[^\]]*\])/)[1]);
    assert.deepEqual(users.sort(), [String(ids.t1), String(ids.t2)].sort());
  });

  test('the page saves a standalone basket with predictions and multipliers via /testing/create-basket', async () => {
    const admin = await login();
    const res = await admin.post('/testing/create-basket').set('Accept', 'application/json').send({
      user_id: String(ids.t1), session_id: String(ids.session), is_standalone: 1,
      assets: [{ name: 'RELIANCE', symbol: 'RELIANCE', sector: 'Large Cap Indian', category_id: 22, prediction: 'UP' }, { name: 'ZOMATO', symbol: 'ZOMATO', sector: 'Mid Cap Indian', category_id: 19, prediction: 'DOWN' }],
      multipliers: [{ index: 0, asset_name: 'RELIANCE', multiplier: 2, prediction: 'UP', selected: true }],
    });
    assert.equal(res.body.success, true);
    assert.equal(res.body.serial_no, 'B1');
    assert.equal(db.baskets[0].is_standalone, true);
    assert.deepEqual(db.baskets[0].assets.map((a) => a.prediction), ['UP', 'DOWN']);
  });

  test('contest detail shows "Create Basket" and "Create Baskets"', async () => {
    const fs = require('fs');
    const view = fs.readFileSync(require('path').join(__dirname, '../../src/admin/views/testing/contest_detail.ejs'), 'utf8');
    assert.match(view, /\/testing\/create-basket\?contest=/);
    assert.match(view, /createBasketsForSelected\(\)/);
  });

  test('view-only admins cannot open the builder', async () => {
    const viewer = await login('viewer@test.local');
    assert.equal((await viewer.get(`/testing/create-basket?contest=${ids.contest}&session=${ids.session}`).set('Accept', 'application/json')).status, 403);
  });
});

describe('Testing → Select Basket (PHP /api/assign-basket-to-contest)', () => {
  beforeEach(reset);

  test('assigns a basket to a contest (no longer standalone); validates input like PHP', async () => {
    db.baskets.push({ _id: new ObjectId(), user_id: String(ids.t1), session_id: ids.session, contest_id: null, is_standalone: true, assets: [] });
    const admin = await login();
    const ok = await admin.post('/testing/assign-basket').send({ basket_id: String(db.baskets[0]._id), contest_id: String(ids.contest) });
    assert.equal(ok.body.message, 'Basket assigned to contest successfully');
    assert.ok(same(db.baskets[0].contest_id, ids.contest));
    assert.equal(db.baskets[0].is_standalone, false);

    assert.equal((await admin.post('/testing/assign-basket').send({ contest_id: String(ids.contest) })).status, 400);
    assert.equal((await admin.post('/testing/assign-basket').send({ basket_id: String(new ObjectId()), contest_id: String(ids.contest) })).body.message, 'Basket not found');
    assert.equal((await admin.post('/testing/assign-basket').send({ basket_id: String(db.baskets[0]._id), contest_id: String(new ObjectId()) })).body.message, 'Contest not found');
  });

  test('user-session page has the Select Basket button and modal', async () => {
    const fs = require('fs');
    const view = fs.readFileSync(require('path').join(__dirname, '../../src/admin/views/testing/user_session_contests.ejs'), 'utf8');
    assert.match(view, /openSelectBasket\('<%= contest._id %>'\)/);
    assert.match(view, /fetch\('\/testing\/assign-basket'/);
  });
});
