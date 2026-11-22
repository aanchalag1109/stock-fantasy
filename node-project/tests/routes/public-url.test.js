'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 * Image / return links never point at localhost when APP_URL was left at its default.
 */

const { test, describe, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const config = require('../../src/config/env');
const { requestContext, publicBaseUrl } = require('../../src/helpers/public-url');
const { absoluteUrl } = require('../../src/helpers/mobile-compat');

const original = config.APP_URL;
const probe = express();
probe.use(requestContext);
probe.get('/x', (req, res) => setImmediate(() => res.json({ url: absoluteUrl('uploads/sessions/a.png'), base: publicBaseUrl() })));

describe('public URL for links', () => {
  afterEach(() => { config.APP_URL = original; });

  test('APP_URL left at localhost → the address the request came in on', async () => {
    config.APP_URL = 'http://localhost:8000';
    const res = await request(probe).get('/x').set('Host', '206.189.133.192:8000');
    assert.equal(res.body.url, 'http://206.189.133.192:8000/uploads/sessions/a.png');
  });

  test('behind a proxy the forwarded protocol and host are used', async () => {
    config.APP_URL = '';
    const res = await request(probe).get('/x').set('X-Forwarded-Proto', 'https').set('X-Forwarded-Host', 'api.probtrade.com');
    assert.equal(res.body.base, 'https://api.probtrade.com');
  });

  test('a real APP_URL always wins; absolute URLs are left alone', async () => {
    config.APP_URL = 'https://api.probtrade.com/';
    const res = await request(probe).get('/x').set('Host', 'evil.example');
    assert.equal(res.body.url, 'https://api.probtrade.com/uploads/sessions/a.png');
    assert.equal(absoluteUrl('https://cdn.x/y.png'), 'https://cdn.x/y.png');
  });

  test('outside a request (cron jobs) APP_URL is used as configured', () => {
    config.APP_URL = 'http://localhost:8000';
    assert.equal(publicBaseUrl(), 'http://localhost:8000');
  });
});
