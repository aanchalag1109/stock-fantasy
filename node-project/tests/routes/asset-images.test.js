'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 * Every asset in an /api response gets its logo: basket stocks, alpha/beta multiplier picks, session
 * assets, quotes … (helpers/asset-images.js).
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const config = require('../../src/config/env');
const Asset = require('../../src/models/asset.model');
const logger = require('../../src/config/logger');
const { assetImagesMiddleware, _resetCache } = require('../../src/helpers/asset-images');
const { requestContext } = require('../../src/helpers/public-url');

logger.silent = true;
config.APP_URL = 'http://206.189.133.192:8000';

let assets;
let queries;
Asset.find = () => {
  queries += 1;
  const q = { select: () => q, lean: async () => assets };
  return q;
};

function appWith(body) {
  const app = express();
  app.use(requestContext);
  app.use('/api', assetImagesMiddleware);
  app.get('/api/x', (req, res) => res.json(JSON.parse(JSON.stringify(body))));
  return app;
}

function reset() {
  _resetCache();
  queries = 0;
  assets = [
    { symbol: 'RELIANCE', name: 'Reliance Industries', market: 'indian_stock', image_url: 'uploads/assets/reliance.png' },
    { symbol: 'TCS', name: 'Tata Consultancy', market: 'indian_stock', image_url: 'https://cdn.example/tcs-in.png' },
    { symbol: 'TCS', name: 'TCS US', market: 'us_stock', image_url: 'https://cdn.example/tcs-us.png' },
    { symbol: 'NOLOGO', name: 'No Logo', market: 'indian_stock', image_url: null },
  ];
  Asset.find = () => {
    queries += 1;
    const q = { select: () => q, lean: async () => assets };
    return q;
  };
}

describe('asset logos in API responses', () => {
  beforeEach(reset);

  test('basket stocks and alpha/beta multiplier picks get image_url', async () => {
    const res = await request(appWith({
      success: true,
      data: [{
        market: 'indian_stock',
        assets: [{ symbol: 'RELIANCE', name: 'RELIANCE', points: 12 }, { symbol: 'TCS', name: 'TCS' }, { symbol: 'NOLOGO' }],
        multipliers: [
          { index: 0, asset_name: 'RELIANCE', multiplier: 2, prediction: 'UP' }, // alpha (by symbol)
          { index: 1, asset_name: 'Tata Consultancy', multiplier: 1.5 }, // beta (by company name)
        ],
      }],
    })).get('/api/x');
    const [basket] = res.body.data;
    assert.deepEqual(basket.assets.map((a) => a.image_url), [
      'http://206.189.133.192:8000/uploads/assets/reliance.png',
      'https://cdn.example/tcs-in.png', // the session's market wins over the US listing
      null,
    ]);
    assert.deepEqual(basket.multipliers.map((m) => m.image_url), [
      'http://206.189.133.192:8000/uploads/assets/reliance.png',
      'https://cdn.example/tcs-in.png',
    ]);
    assert.equal(basket.assets[0].points, 12, 'other fields untouched');
  });

  test('session assets (asset_symbol), nested market, existing image_url kept', async () => {
    const res = await request(appWith({
      sessions: [{ market: 'us_stock', assets: [{ asset_symbol: 'TCS' }, { asset_symbol: 'RELIANCE', image_url: 'https://keep.me/x.png' }] }],
    })).get('/api/x');
    assert.deepEqual(res.body.sessions[0].assets.map((a) => a.image_url), ['https://cdn.example/tcs-us.png', 'https://keep.me/x.png']);
  });

  test('non-asset objects are left alone; the logo list is cached', async () => {
    const app = appWith({ user: { id: 5, name: 'Asha' }, settings: { a: 1 } });
    const res = await request(app).get('/api/x');
    assert.deepEqual(res.body, { user: { id: 5, name: 'Asha' }, settings: { a: 1 } });
    await request(app).get('/api/x');
    assert.equal(queries, 1, 'one asset query for both requests');
  });

  test('if the logos cannot be loaded the response is sent unchanged', async () => {
    Asset.find = () => { throw new Error('db down'); };
    const res = await request(appWith({ assets: [{ symbol: 'RELIANCE' }] })).get('/api/x');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { assets: [{ symbol: 'RELIANCE' }] });
  });
});
