'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: Automated Notifications and Notification Management
 * FCM HTTP v1 sender: service-account JWT, message shape, error classification.
 * Uses a throwaway RSA key and a stubbed axios; nothing leaves the machine.
 */

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const axios = require('axios');
const config = require('../../src/config/env');
const logger = require('../../src/config/logger');
const fcm = require('../../src/services/notifications/fcm.service');

logger.silent = true;

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const ACCOUNT = {
  project_id: 'demo-project',
  client_email: 'push@demo-project.iam.gserviceaccount.com',
  private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
};

let calls;
let sendResponse;
axios.post = async (url, body, options) => {
  calls.push({ url, body, options });
  if (url.includes('oauth2')) return { data: { access_token: 'ya29.token', expires_in: 3600 } };
  if (sendResponse instanceof Error) throw sendResponse;
  return { status: 200, data: { name: 'projects/demo-project/messages/1' } };
};
const httpError = (status, error) => Object.assign(new Error(`HTTP ${status}`), { response: { status, data: { error } } });

beforeEach(() => {
  calls = [];
  sendResponse = null;
  config.FCM.serviceAccountJson = JSON.stringify(ACCOUNT);
  config.FCM.serviceAccountPath = null;
  fcm._reset();
});

test('disabled when no service account is configured', async () => {
  config.FCM.serviceAccountJson = null;
  fcm._reset();
  assert.equal(fcm.isConfigured(), false);
  assert.deepEqual(await fcm.send('tok', { title: 't', body: 'b' }), { status: 'disabled' });
  assert.equal(calls.length, 0);
});

test('signs a valid service-account JWT and sends an HTTP v1 message with string data', async () => {
  const result = await fcm.send('device-token', { title: 'Hello', body: 'World', data: { amount: 50, skip: null } });
  assert.deepEqual(result, { status: 'sent' });

  const assertion = new URLSearchParams(calls[0].body).get('assertion');
  const [header, claims, signature] = assertion.split('.');
  const ok = crypto.createVerify('RSA-SHA256').update(`${header}.${claims}`).verify(publicKey, Buffer.from(signature, 'base64url'));
  assert.ok(ok, 'JWT signature verifies with the service-account public key');
  const payload = JSON.parse(Buffer.from(claims, 'base64url').toString());
  assert.equal(payload.iss, ACCOUNT.client_email);
  assert.equal(payload.scope, 'https://www.googleapis.com/auth/firebase.messaging');

  assert.equal(calls[1].url, 'https://fcm.googleapis.com/v1/projects/demo-project/messages:send');
  assert.equal(calls[1].options.headers.Authorization, 'Bearer ya29.token');
  assert.deepEqual(calls[1].body.message, { token: 'device-token', notification: { title: 'Hello', body: 'World' }, data: { amount: '50' } });

  await fcm.send('device-token', { title: 'Again', body: 'x' });
  assert.equal(calls.filter((c) => c.url.includes('oauth2')).length, 1, 'access token is cached');
});

test('classifies FCM errors', async () => {
  sendResponse = httpError(404, { message: 'Requested entity was not found.', details: [{ errorCode: 'UNREGISTERED' }] });
  assert.equal((await fcm.send('t', { title: 'a', body: 'b' })).status, 'invalid_token');

  sendResponse = httpError(503, { message: 'Unavailable' });
  assert.deepEqual(await fcm.send('t', { title: 'a', body: 'b' }), { status: 'failed', retryable: true, error: 'Unavailable' });

  sendResponse = httpError(400, { message: 'Invalid JSON payload', details: [{ errorCode: 'INVALID_ARGUMENT' }] });
  assert.equal((await fcm.send('t', { title: 'a', body: 'b' })).retryable, false);

  sendResponse = new Error('socket hang up');
  assert.equal((await fcm.send('t', { title: 'a', body: 'b' })).retryable, true);
});
