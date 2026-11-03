'use strict';

/**
 * PHP PARITY tests — smaller admin gaps: Cron Check AJAX refresh (CronLogController::index),
 * Banner store validation, Profile update / password validation, Ticket reply status,
 * and the real DOB / gender / address on the player profile.
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

mongoose.set('bufferCommands', false);

const bcrypt = require('bcryptjs');
const request = require('supertest');
const logger = require('../../src/config/logger');
const User = require('../../src/models/user.model');
const Ticket = require('../../src/models/ticket.model');
const Banner = require('../../src/models/banner.model');
const CronLog = require('../../src/models/cron-log.model');
const adminApp = require('../../src/admin/app');

logger.silent = true;
const { ObjectId } = mongoose.Types;

let db;
const same = (a, b) => String(a) === String(b);
const q = (v) => {
  const o = { select: () => o, sort: (s) => { o.sorted = s; return o; }, skip: (n) => { o.skipped = n; return o; }, limit: (n) => { o.limited = n; return o; }, lean: () => o, populate: () => o, then: (a, b) => Promise.resolve(v).then(a, b) };
  return o;
};
const match = (u, f) => Object.entries(f).every(([k, c]) => {
  if (k === '$or') return c.some((x) => match(u, x));
  if (c && c.$ne !== undefined) return !same(u[k], c.$ne);
  return same(u[k], c);
});
User.findOne = (f) => q(db.users.find((u) => match(u, f)) || null);
User.findById = (id) => q(db.users.find((u) => same(u._id, id)) || null);
User.exists = async (f) => (db.users.find((u) => match(u, f)) ? { _id: 1 } : null);
User.findByIdAndUpdate = async (id, set) => { Object.assign(db.users.find((u) => same(u._id, id)), set); return {}; };
Ticket.findById = (id) => q(db.tickets.find((t) => same(t._id, id)) || null);
Banner.create = async (doc) => { db.banners.push(doc); return doc; };
let lastCronQuery;
CronLog.find = () => { lastCronQuery = q(db.cron); return lastCronQuery; };
CronLog.countDocuments = async () => db.cron.length;

const HASH = bcrypt.hashSync('secret123', 4);
const ids = {};
function reset() {
  ['admin', 'other', 'player', 'ticket'].forEach((k) => { ids[k] = new ObjectId(); });
  const save = async function () { return this; };
  db = {
    users: [
      { _id: ids.admin, name: 'Super', email: 'super@test.local', password: HASH, is_admin: true, is_super_admin: true, save },
      { _id: ids.other, name: 'Other', email: 'other@test.local' },
      { _id: ids.player, name: 'Player', mobile: '+919800000000', date_of_birth: new Date('1995-03-07T00:00:00Z'), gender: 'female', address: '12 MG Road, Pune' },
    ],
    tickets: [{ _id: ids.ticket, status: 'open', replies: [], save }],
    banners: [],
    cron: [{ _id: new ObjectId(), type: 'live-scores', run_time: new Date(), response: 'updated 4 contests' }],
  };
}
async function login() {
  const agent = request.agent(adminApp);
  await agent.post('/login').type('form').send({ email: 'super@test.local', password: 'secret123' });
  return agent;
}
const flashOf = async (agent) => (await agent.get('/profile')).text;

describe('Cron Check (PHP CronLogController::index)', () => {
  beforeEach(reset);

  test('newest run_time first, 50 per page', async () => {
    const admin = await login();
    const page = await admin.get('/cron-logs');
    assert.equal(page.status, 200);
    assert.deepEqual(lastCronQuery.sorted, { run_time: -1, created_at: -1 });
    assert.equal(lastCronQuery.limited, 50);
    assert.match(page.text, /id="logsTableBody"/);
    assert.match(page.text, /setInterval\(fetchLogs, 20000\)/);
    assert.match(page.text, /updated 4 contests/);
  });

  test('AJAX polls get { html, last_updated }', async () => {
    const admin = await login();
    const res = await admin.get('/cron-logs').set('X-Requested-With', 'XMLHttpRequest');
    assert.match(res.body.html, /updated 4 contests/);
    assert.doesNotMatch(res.body.html, /<html|sidebar/i);
    assert.match(res.body.last_updated, /^\d{2}:\d{2}:\d{2}$/);
  });
});

describe('Banners → Create (PHP BannerController::store)', () => {
  beforeEach(reset);

  test('saves the chosen status', async () => {
    const admin = await login();
    const res = await admin.post('/banners').field('title', 'Diwali').field('status', 'inactive').field('image_url', 'https://x/b.png');
    assert.equal(res.headers.location, '/banners');
    assert.equal(db.banners[0].status, 'inactive');
    assert.match(await flashOf(admin), /Banner created successfully\./);
  });

  test('rejects a missing title or status', async () => {
    const admin = await login();
    for (const [fields, message] of [[{ status: 'active' }, 'The title field is required.'], [{ title: 'X' }, 'The status field is required.'], [{ title: 'X', status: 'paused' }, 'The selected status is invalid.']]) {
      let r = admin.post('/banners');
      for (const [k, v] of Object.entries(fields)) r = r.field(k, v);
      assert.equal((await r).headers.location, '/banners/create');
      assert.ok((await flashOf(admin)).includes(message), message);
    }
    assert.equal(db.banners.length, 0);
  });
});

describe('Profile (PHP ProfileController::update / SettingsController::updatePassword)', () => {
  beforeEach(reset);

  test('update validates name/email and uniqueness', async () => {
    const admin = await login();
    for (const [body, message] of [[{ name: '', email: 'a@b.co' }, 'The name field is required.'], [{ name: 'A', email: 'nope' }, 'The email must be a valid email address.'], [{ name: 'A', email: 'OTHER@test.local' }, 'The email has already been taken.']]) {
      await admin.put('/profile').type('form').send(body);
      assert.ok((await flashOf(admin)).includes(message), message);
    }
    assert.equal(db.users[0].name, 'Super');
    await admin.put('/profile').type('form').send({ name: 'Renamed', email: 'super@test.local' });
    assert.equal(db.users[0].name, 'Renamed');
    assert.match(await flashOf(admin), /Profile updated successfully\./);
  });

  test('password needs at least 8 characters', async () => {
    const admin = await login();
    await admin.put('/settings/password').type('form').send({ current_password: 'secret123', password: 'short1', password_confirmation: 'short1' });
    assert.match(await flashOf(admin), /The password must be at least 8 characters\./);
    assert.equal(db.users[0].password, HASH);
    await admin.put('/settings/password').type('form').send({ current_password: 'secret123', password: 'longenough', password_confirmation: 'longenough' });
    assert.ok(bcrypt.compareSync('longenough', db.users[0].password));
  });
});

describe('Tickets → Reply (PHP TicketController::reply)', () => {
  beforeEach(reset);

  test('replying to an open ticket marks it pending; empty message is rejected', async () => {
    const admin = await login();
    await admin.post(`/tickets/${ids.ticket}/reply`).type('form').send({ message: '   ' });
    assert.equal(db.tickets[0].replies.length, 0);
    assert.match(await flashOf(admin), /The message field is required\./);

    await admin.post(`/tickets/${ids.ticket}/reply`).type('form').send({ message: 'Looking into it' });
    assert.equal(db.tickets[0].replies[0].message, 'Looking into it');
    assert.equal(db.tickets[0].status, 'pending');
  });

  test('a closed ticket stays closed', async () => {
    db.tickets[0].status = 'closed';
    const admin = await login();
    await admin.post(`/tickets/${ids.ticket}/reply`).type('form').send({ message: 'Follow-up' });
    assert.equal(db.tickets[0].status, 'closed');
  });
});

describe('Players → Show (PHP users/show.blade.php)', () => {
  beforeEach(reset);

  test('shows date of birth, gender and address', async () => {
    const admin = await login();
    const page = await admin.get(`/users/${ids.player}`);
    assert.match(page.text, /Mar 07, 1995/);
    assert.match(page.text, /Female/);
    assert.match(page.text, /12 MG Road, Pune/);
  });
});
