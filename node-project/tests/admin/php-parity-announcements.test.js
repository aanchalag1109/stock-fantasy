'use strict';

/**
 * PHP PARITY tests — Announcements create (PHP Admin\AnnouncementController::store):
 * validation, all/specific recipients, one in-app notification per recipient, FCM push.
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
const Announcement = require('../../src/models/announcement.model');
const Notification = require('../../src/models/notification.model');
const fcm = require('../../src/services/notifications/fcm.service');
const announcementService = require('../../src/services/announcement.service');
const adminApp = require('../../src/admin/app');

logger.silent = true;
const { ObjectId } = mongoose.Types;

let db;
let pushes;
let fcmResult;
const same = (a, b) => String(a) === String(b);
const matchUser = (u, f = {}) => Object.entries(f).every(([k, c]) => {
  if (k === '_id' && c && c.$in) return c.$in.some((x) => same(x, u._id));
  if (k === '_id') return same(c, u._id);
  if (k === 'fcm_token' && c && c.$nin) return !c.$nin.includes(u.fcm_token == null ? null : u.fcm_token) && u.fcm_token != null;
  if (k === 'email') return u.email === c;
  if (k === '$or') return c.some((x) => matchUser(u, x));
  return same(u[k], c);
});
const q = (v) => { const o = { select: () => o, sort: () => o, lean: () => o, then: (a, b) => Promise.resolve(v).then(a, b) }; return o; };
User.find = (f) => q(db.users.filter((u) => matchUser(u, f)));
User.findOne = (f) => q(db.users.find((u) => matchUser(u, f)) || null);
User.findById = (id) => q(db.users.find((u) => same(u._id, id)) || null);
User.updateOne = async (f, u) => { const d = db.users.find((x) => matchUser(x, f)); if (d) Object.assign(d, u.$set); return {}; };
AdminRole.findById = (id) => q(db.roles.find((r) => same(r._id, id)) || null);
Announcement.create = async (doc) => {
  const err = new Announcement(doc).validateSync();
  if (err) throw err;
  const d = { _id: new ObjectId(), ...doc };
  db.announcements.push(d);
  return d;
};
Announcement.find = () => q(db.announcements.slice());
Notification.insertMany = async (docs) => { db.notifications.push(...docs); return docs; };
fcm.send = async (token, msg) => { pushes.push({ token, ...msg }); return typeof fcmResult === 'function' ? fcmResult(token) : fcmResult; };

const HASH = bcrypt.hashSync('secret123', 4);
const ids = {};
function reset() {
  pushes = [];
  fcmResult = { status: 'sent' };
  ids.viewerRole = new ObjectId();
  db = {
    roles: [{ _id: ids.viewerRole, name: 'Viewer', permissions: ['announcements.view'] }],
    users: [], announcements: [], notifications: [],
  };
  const add = (key, extra) => { ids[key] = new ObjectId(); db.users.push({ _id: ids[key], name: key, mobile: `9${key.length}`, ...extra }); };
  add('super', { email: 'super@test.local', password: HASH, is_admin: true, is_super_admin: true });
  add('viewer', { email: 'viewer@test.local', password: HASH, is_admin: true, admin_role_id: ids.viewerRole });
  add('asha', { fcm_token: 'tok-asha' });
  add('ravi', { fcm_token: 'tok-ravi' });
  add('notoken', {});
}
async function login(email = 'super@test.local') {
  const agent = request.agent(adminApp);
  await agent.post('/login').type('form').send({ email, password: 'secret123' });
  return agent;
}
async function flash(agent) {
  const page = await agent.get('/announcements');
  const m = page.text.match(/alert alert-(success|danger)[^>]*>[\s\S]*?<\/i>\s*([^<]+)/);
  return m ? m[2].trim() : null;
}

describe('Announcements → Create (PHP AnnouncementController::store)', () => {
  beforeEach(reset);

  test('the form offers PHP fields and every user for "Specific Users"', async () => {
    const admin = await login();
    const page = await admin.get('/announcements/create');
    assert.equal(page.status, 200);
    ['name="description"', 'value="update"', 'value="alert"', 'value="promo"', 'name="send_to"', 'Specific Users', `value="${ids.asha}"`, 'Select All Users']
      .forEach((t) => assert.ok(page.text.includes(t), t));
  });

  test('send to all: announcement saved, a notification for every user, push to every token', async () => {
    const admin = await login();
    const res = await admin.post('/announcements').type('form').send({ title: 'Diwali Bonus', description: 'Double prizes tonight', type: 'promo', send_to: 'all' });
    assert.equal(res.headers.location, '/announcements');
    assert.equal(await flash(admin), 'Announcement created and sent to all users!');
    assert.equal(db.announcements.length, 1);
    assert.deepEqual(db.announcements[0].description, 'Double prizes tonight');
    assert.equal(db.notifications.length, db.users.length, 'every user, as PHP');
    assert.ok(db.notifications.every((n) => n.type === 'promo' && n.title === 'Diwali Bonus'));
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(pushes.map((p) => p.token).sort(), ['tok-asha', 'tok-ravi']);
    assert.equal(pushes[0].data.type, 'announcement');
    assert.equal(pushes[0].data.announcement_id, String(db.announcements[0]._id));
  });

  test('send to specific users: only they are notified and pushed', async () => {
    const admin = await login();
    await admin.post('/announcements').type('form').send(`title=Maintenance&description=Down+at+2am&type=alert&send_to=specific&user_ids%5B%5D=${ids.asha}&user_ids%5B%5D=${ids.notoken}`);
    assert.equal(await flash(admin), 'Announcement created and sent to 2 users!');
    assert.deepEqual(db.notifications.map((n) => String(n.user_id)).sort(), [String(ids.asha), String(ids.notoken)].sort());
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(pushes.map((p) => p.token), ['tok-asha']);
  });

  test('validation matches PHP and saves nothing on error', async () => {
    const admin = await login();
    const cases = [
      [{ title: '', description: 'x', type: 'update', send_to: 'all' }, 'The title field is required.'],
      [{ title: 't', description: '', type: 'update', send_to: 'all' }, 'The description field is required.'],
      [{ title: 't', description: 'x', type: 'info', send_to: 'all' }, 'The selected type is invalid.'],
      [{ title: 't', description: 'x', type: 'update', send_to: 'specific' }, 'The user ids field is required when send to is specific.'],
      [{ title: 't', description: 'x', type: 'update', send_to: 'specific', 'user_ids[]': String(new ObjectId()) }, 'The selected user ids is invalid.'],
    ];
    for (const [body, message] of cases) {
      const res = await admin.post('/announcements').type('form').send(body);
      assert.equal(res.headers.location, '/announcements/create');
      const page = await admin.get('/announcements/create');
      assert.ok(page.text.includes(message), message);
    }
    assert.equal(db.announcements.length, 0);
    assert.equal(db.notifications.length, 0);
  });

  test('push clears unregistered tokens and stops when FCM is not configured', async () => {
    fcmResult = (token) => (token === 'tok-ravi' ? { status: 'invalid_token' } : { status: 'sent' });
    const result = await announcementService.pushToUsers([ids.asha, ids.ravi], { _id: new ObjectId(), title: 't', description: 'd', type: 'update' });
    assert.equal(result.sent, 1);
    assert.equal(db.users.find((u) => same(u._id, ids.ravi)).fcm_token, null);

    pushes = [];
    fcmResult = { status: 'disabled' };
    const disabled = await announcementService.pushToUsers([ids.asha], { _id: new ObjectId(), title: 't', description: 'd', type: 'update' });
    assert.equal(disabled.sent, 0);
  });

  test('view-only admins cannot create', async () => {
    const viewer = await login('viewer@test.local');
    const res = await viewer.post('/announcements').set('Accept', 'application/json').send({ title: 't', description: 'd', type: 'update', send_to: 'all' });
    assert.equal(res.status, 403);
    assert.equal(db.announcements.length, 0);
  });
});
