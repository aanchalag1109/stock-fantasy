'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: Automated Notifications — FCM device tokens
 * Covers device-token.service and the /auth/fcm-token endpoints with the User
 * model stubbed in memory, so no database or network is needed.
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const User = require('../../src/models/user.model');
const deviceTokens = require('../../src/services/notifications/device-token.service');
const auth = require('../../src/controllers/auth.controller');

const originals = { updateMany: User.updateMany, updateOne: User.updateOne, findOne: User.findOne, findById: User.findById };
let users;

const matches = (doc, filter) => Object.entries(filter).every(([key, cond]) => {
  if (cond && typeof cond === 'object' && '$ne' in cond) return String(doc[key]) !== String(cond.$ne);
  return String(doc[key]) === String(cond);
});

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function setUp() {
  users = [
    { _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', old_id: 101, fcm_token: null },
    { _id: 'bbbbbbbbbbbbbbbbbbbbbbbb', old_id: 102, fcm_token: 'shared-phone-token' },
  ];
  User.updateMany = async (filter, update) => { users.filter((u) => matches(u, filter)).forEach((u) => Object.assign(u, update.$set)); };
  User.updateOne = async (filter, update) => { const u = users.find((d) => matches(d, filter)); if (u) Object.assign(u, update.$set); };
  User.findOne = async (filter) => users.find((u) => matches(u, filter)) || null;
  User.findById = async (id) => users.find((u) => u._id === String(id)) || null;
}
const tearDown = () => Object.assign(User, originals);

describe('device-token.service', () => {
  beforeEach(setUp);
  afterEach(tearDown);

  test('parseToken rejects empty, non-string and whitespace values', () => {
    assert.equal(deviceTokens.parseToken('  abc:DEF_123  '), 'abc:DEF_123');
    assert.equal(deviceTokens.parseToken(''), null);
    assert.equal(deviceTokens.parseToken('has space'), null);
    assert.equal(deviceTokens.parseToken(12345), null);
    assert.equal(deviceTokens.parseToken('x'.repeat(deviceTokens.MAX_TOKEN_LENGTH + 1)), null);
  });

  test('assignToken moves a token from the previous account to the new one', async () => {
    await deviceTokens.assignToken(users[0], 'shared-phone-token');
    assert.equal(users[0].fcm_token, 'shared-phone-token');
    assert.equal(users[1].fcm_token, null);
  });

  test('clearToken with a token only clears it while it still matches', async () => {
    await deviceTokens.clearToken(users[1], 'some-other-token');
    assert.equal(users[1].fcm_token, 'shared-phone-token');
    await deviceTokens.clearToken(users[1], 'shared-phone-token');
    assert.equal(users[1].fcm_token, null);
  });
});

describe('POST /api/v1/auth/fcm-token', () => {
  beforeEach(setUp);
  afterEach(tearDown);

  test('accepts the numeric user id returned by the mobile login', async () => {
    const res = mockRes();
    await auth.updateFcmToken({ body: { user_id: '101', fcm_token: 'new-token' } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(users[0].fcm_token, 'new-token');
  });

  test('accepts a Mongo id', async () => {
    const res = mockRes();
    await auth.updateFcmToken({ body: { user_id: 'aaaaaaaaaaaaaaaaaaaaaaaa', fcm_token: 'new-token' } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(users[0].fcm_token, 'new-token');
  });

  test('returns 404 for an unknown user and 400 without a token', async () => {
    const missing = mockRes();
    await auth.updateFcmToken({ body: { user_id: '999', fcm_token: 'new-token' } }, missing);
    assert.equal(missing.statusCode, 404);
    const invalid = mockRes();
    await auth.updateFcmToken({ body: { user_id: '101', fcm_token: '' } }, invalid);
    assert.equal(invalid.statusCode, 400);
  });

  test('remove clears the token on logout', async () => {
    const res = mockRes();
    await auth.removeFcmToken({ body: { user_id: '102', fcm_token: 'shared-phone-token' } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(users[1].fcm_token, null);
  });
});
