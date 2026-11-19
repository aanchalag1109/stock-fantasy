'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * The app's session/contest detail routes must accept numeric and ObjectId ids. ObjectId ids used to
 * fall through to older handlers with a different response shape (contest: 0 joined; session: no `id`).
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../../src/config/logger').silent = true;

const router = require('../../src/routes/mobile.routes');

const handlerFor = (path) => router.stack.find((layer) => layer.route && layer.route.methods.get && layer.match(path));

test('session and contest detail accept numeric and ObjectId ids', () => {
  for (const base of ['/sessions/', '/contests/']) {
    const numeric = handlerFor(`${base}575`);
    const objectId = handlerFor(`${base}6afe84dcd4c70797bdd36f19`);
    assert.ok(numeric, `${base} numeric`);
    assert.ok(objectId, `${base} ObjectId`);
    assert.equal(numeric.route.path, objectId.route.path, 'same handler for both id forms');
  }
});

test('named routes are not captured as ids', () => {
  assert.notEqual(handlerFor('/contests/session/575')?.route.path, handlerFor('/contests/575').route.path);
  assert.equal(handlerFor('/sessions/live'), undefined, 'left to the sessions router');
  assert.equal(handlerFor('/contests/user'), undefined, 'left to the contests router');
});
