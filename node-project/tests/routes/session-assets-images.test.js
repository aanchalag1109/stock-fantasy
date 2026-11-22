'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 * GET /api/v1/league-session-assets/:id and /session-assets-grouped/:id return each asset's image.
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

mongoose.set('bufferCommands', false);

const request = require('supertest');
const logger = require('../../src/config/logger');
const config = require('../../src/config/env');
const LeagueSession = require('../../src/models/league-session.model');
const Asset = require('../../src/models/asset.model');
const app = require('../../src/app');

logger.silent = true;
const { ObjectId } = mongoose.Types;

let db;
const query = (value) => {
  const q = { select: () => q, sort: () => q, lean: () => q, then: (a, b) => Promise.resolve(value).then(a, b) };
  return q;
};
LeagueSession.findOne = (f) => query(db.sessions.find((s) => s.old_id === f.old_id) || null);
LeagueSession.findById = (id) => query(db.sessions.find((s) => String(s._id) === String(id)) || null);
Asset.find = (f) => query(db.assets.filter((a) => f.symbol.$in.includes(a.symbol)));

beforeEach(() => {
  config.APP_URL = 'http://206.189.133.192:8000';
  db = {
    sessions: [{
      _id: new ObjectId(),
      old_id: 586,
      market: 'indian_stock',
      assets: [
        { category_id: 1, category_name: 'Large Cap', asset_symbol: 'RELIANCE', asset_name: 'Reliance' },
        { category_id: 1, category_name: 'Large Cap', asset_symbol: 'TCS' },
        { category_id: 2, category_name: 'Mid Cap', asset_symbol: 'NOLOGO' },
      ],
    }],
    assets: [
      { symbol: 'RELIANCE', name: 'Reliance Industries', type: 'stock', market: 'indian_stock', image_url: 'uploads/assets/reliance.png' },
      // same symbol in another market: the session's market wins
      { symbol: 'TCS', name: 'TCS US listing', type: 'stock', market: 'us_stock', image_url: 'https://cdn.example/us-tcs.png' },
      { symbol: 'TCS', name: 'Tata Consultancy', type: 'stock', market: 'indian_stock', image_url: 'https://cdn.example/tcs.png' },
      { symbol: 'NOLOGO', name: 'No Logo Ltd', type: 'stock', market: 'indian_stock', image_url: null },
    ],
  };
});

describe('session assets include images', () => {
  test('GET /league-session-assets/:id', async () => {
    const res = await request(app).get('/api/v1/league-session-assets/586');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.assets, [
      { symbol: 'RELIANCE', name: 'Reliance Industries', type: 'stock', category_name: 'Large Cap', category_id: 1, image_url: 'http://206.189.133.192:8000/uploads/assets/reliance.png' },
      { symbol: 'TCS', name: 'Tata Consultancy', type: 'stock', category_name: 'Large Cap', category_id: 1, image_url: 'https://cdn.example/tcs.png' },
      { symbol: 'NOLOGO', name: 'No Logo Ltd', type: 'stock', category_name: 'Mid Cap', category_id: 2, image_url: null },
    ]);
  });

  test('GET /session-assets-grouped/:id', async () => {
    const res = await request(app).get('/api/v1/session-assets-grouped/586');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.assets.map((a) => a.image_url), [
      'http://206.189.133.192:8000/uploads/assets/reliance.png',
      'https://cdn.example/tcs.png',
      null,
    ]);
  });

  test('unknown session → empty list', async () => {
    assert.deepEqual((await request(app).get('/api/v1/league-session-assets/999')).body, { assets: [] });
  });
});
