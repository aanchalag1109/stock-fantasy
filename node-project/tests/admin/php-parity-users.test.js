'use strict';

/**
 * PHP PARITY tests — Players → Create (PHP Admin\UserController::store): validation, unique email,
 * country code prepended to the mobile, duplicate mobile rejected.
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

mongoose.set('bufferCommands', false);

const bcrypt = require('bcryptjs');
const request = require('supertest');
const logger = require('../../src/config/logger');
const User = require('../../src/models/user.model');
const adminApp = require('../../src/admin/app');

logger.silent = true;
const { ObjectId } = mongoose.Types;

let db;
const q = (v) => { const o = { select: () => o, sort: () => o, lean: () => o, then: (a, b) => Promise.resolve(v).then(a, b) }; return o; };
const match = (u, f) => Object.entries(f).every(([k, c]) => (k === '$or' ? c.some((x) => match(u, x)) : String(u[k]) === String(c)));
User.findOne = (f) => q(db.find((u) => match(u, f)) || null);
User.findById = (id) => q(db.find((u) => String(u._id) === String(id)) || null);
User.exists = async (f) => (db.find((u) => match(u, f)) ? { _id: 1 } : null);
User.create = async (doc) => { const d = { _id: new ObjectId(), ...doc }; db.push(d); return d; };
User.aggregate = async () => [];
User.countDocuments = async () => db.length;

const HASH = bcrypt.hashSync('secret123', 4);
function reset() {
  db = [
    { _id: new ObjectId(), email: 'super@test.local', password: HASH, is_admin: true, is_super_admin: true },
    { _id: new ObjectId(), name: 'Existing', email: 'taken@x.com', mobile: '+919876543210' },
  ];
}
async function login() {
  const agent = request.agent(adminApp);
  await agent.post('/login').type('form').send({ email: 'super@test.local', password: 'secret123' });
  return agent;
}
const VALID = { name: 'Asha', email: 'Asha@X.com', mobile: '9811122233', country_code: '+91', password: 'password123', password_confirmation: 'password123' };

describe('Players → Create (PHP UserController::store)', () => {
  beforeEach(reset);

  test('saves country code + mobile and a lowercase email', async () => {
    const admin = await login();
    const res = await admin.post('/users').type('form').send(VALID);
    assert.equal(res.headers.location, '/users');
    const created = db.find((u) => u.email === 'asha@x.com');
    assert.equal(created.mobile, '+919811122233');
    assert.ok(bcrypt.compareSync('password123', created.password));
  });

  test('rejects what PHP rejects, creating nothing', async () => {
    const admin = await login();
    const cases = [
      [{ name: '' }, 'The name field is required.'],
      [{ email: 'not-an-email' }, 'The email must be a valid email address.'],
      [{ email: 'TAKEN@x.com' }, 'The email has already been taken.'],
      [{ mobile: '' }, 'The mobile field is required.'],
      [{ mobile: '12345' }, 'The mobile must be at least 10 characters.'],
      [{ mobile: '1234567890123456' }, 'The mobile must not be greater than 15 characters.'],
      [{ country_code: '' }, 'The country code field is required.'],
      [{ password: 'short', password_confirmation: 'short' }, 'Password must be at least 8 characters'],
      [{ mobile: '9876543210' }, 'This mobile number is already registered.'],
    ];
    for (const [override, message] of cases) {
      const before = db.length;
      const res = await admin.post('/users').type('form').send({ ...VALID, ...override });
      assert.equal(res.headers.location, '/users/create', message);
      const page = await admin.get('/users/create');
      assert.ok(page.text.includes(message), message);
      assert.equal(db.length, before);
    }
  });
});
