'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 * Social links managed from admin → Settings and served by GET /api/v1/social-links.
 * Runs the real admin and API apps against an in-memory store.
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

mongoose.set('bufferCommands', false);

const bcrypt = require('bcryptjs');
const request = require('supertest');
const logger = require('../../src/config/logger');
const User = require('../../src/models/user.model');
const Setting = require('../../src/models/setting.model');
const adminApp = require('../../src/admin/app');
const apiApp = require('../../src/app');
const auth = require('../../src/admin/controllers/auth.controller');
const social = require('../../src/services/social-links.service');

logger.silent = true;
const { ObjectId } = mongoose.Types;

let db;
const same = (a, b) => String(a) === String(b);
const matches = (doc, f = {}) => Object.entries(f).every(([k, v]) => (k === '$or' ? v.some((x) => matches(doc, x)) : same(doc[k], v)));
const query = (value) => {
  const q = { select: () => q, sort: () => q, lean: () => q, skip: () => q, limit: () => q, populate: () => q, then: (a, b) => Promise.resolve(value).then(a, b) };
  return q;
};
const copy = (d) => (d ? JSON.parse(JSON.stringify(d)) : d);
[[User, 'users'], [Setting, 'settings']].forEach(([M, name]) => {
  const one = (f) => db[name].find((d) => matches(d, f)) || null;
  M.find = (f) => query(db[name].filter((d) => matches(d, f || {})).map(copy));
  M.findOne = (f) => query(copy(one(f)));
  M.findById = (id) => query(copy(one({ _id: id })));
  M.findOneAndUpdate = async (f, u, opts = {}) => {
    let d = one(f);
    if (!d && opts.upsert) { d = { _id: new ObjectId(), ...f }; db[name].push(d); }
    if (d) Object.assign(d, u.$set || u);
    return d;
  };
});

const HASH = bcrypt.hashSync('secret123', 4);
function reset() {
  auth._resetLoginThrottle();
  db = {
    users: [{ _id: new ObjectId(), name: 'super', email: 'super@test.local', password: HASH, is_admin: true, is_super_admin: true }],
    settings: [],
  };
}
async function admin() {
  const agent = request.agent(adminApp);
  await agent.post('/login').type('form').send({ email: 'super@test.local', password: 'secret123' });
  return agent;
}
const stored = () => (db.settings.find((s) => s.key === 'social_links') || {}).value;

describe('Social links (admin → Settings)', () => {
  beforeEach(reset);

  test('before any save the website\'s current links are used', async () => {
    const page = await (await admin()).get('/settings');
    assert.equal(page.status, 200);
    assert.match(page.text, /Social Links/);
    assert.match(page.text, /https:\/\/t\.me\/ProbTradeOfficial/);
    const api = await request(apiApp).get('/api/v1/social-links');
    assert.equal(api.status, 200);
    assert.deepEqual(api.body.social_links.map((l) => l.platform), ['instagram', 'telegram', 'youtube', 'facebook', 'tiktok']);
  });

  test('saving updates the links; switched-off and empty ones are not served', async () => {
    const agent = await admin();
    const res = await agent.post('/settings/social-links').type('form').send({
      'links[instagram][url]': 'https://instagram.com/new', 'links[instagram][enabled]': '1',
      'links[telegram][url]': 'https://t.me/new', // not switched on
      'links[x][url]': 'https://x.com/probtrade', 'links[x][enabled]': '1',
    });
    assert.equal(res.status, 302);
    assert.equal(stored().links.instagram.url, 'https://instagram.com/new');
    assert.equal(stored().links.telegram.enabled, false);
    const api = await request(apiApp).get('/api/v1/social-links');
    assert.deepEqual(api.body.social_links, [
      { platform: 'instagram', label: 'Instagram', icon: 'instagram', url: 'https://instagram.com/new' },
      { platform: 'x', label: 'X (Twitter)', icon: 'twitter-x', url: 'https://x.com/probtrade' },
    ]);
  });

  test('invalid links are rejected and nothing is saved', async () => {
    const agent = await admin();
    const bad = await agent.post('/settings/social-links').type('form').send({
      'links[instagram][url]': 'javascript:alert(1)', 'links[instagram][enabled]': '1',
      'links[youtube][enabled]': '1',
    });
    assert.equal(bad.status, 422);
    assert.match(bad.text, /Instagram: enter a full link starting with https:\/\//);
    assert.match(bad.text, /YouTube: add a link or switch it off\./);
    assert.equal(stored(), undefined);
  });

  test('an unsafe stored URL is never served', () => {
    const merged = social.merge({ links: { instagram: { url: 'javascript:alert(1)', enabled: true } } });
    assert.deepEqual(merged.links.instagram, { url: '', enabled: false });
    assert.equal(social.cleanUrl('ftp://x.com'), null);
    assert.equal(social.cleanUrl('https://x.com/a'), 'https://x.com/a');
  });
});
