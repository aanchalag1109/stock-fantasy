'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { planMerge } = require('../../scripts/migration/merge-duplicate-assets');

const row = (id, old_id, market, symbol, extra = {}) => ({ _id: id, old_id, market, symbol, name: symbol, status: 'active', image_url: null, ...extra });

test('keeps the lowest old_id per (market, symbol) and deletes the other copies', () => {
  const p = planMerge([
    row('a', 629, 'indian_stock', 'TCS'),
    row('b', 499, 'indian_stock', 'tcs'),
    row('c', 630, 'indian_stock', 'TCS'),
    row('d', 576, 'indian_stock', 'HAL'),
    row('e', 931, 'us_stock', 'HAL'), // same symbol, different market: not a duplicate
    row('f', 1, 'crypto', 'BTC-USD'),
  ]);
  assert.strictEqual(p.groups, 4);
  assert.strictEqual(p.updates.length, 1);
  assert.strictEqual(p.updates[0]._id, 'b');
  assert.strictEqual(p.updates[0].set.symbol, 'TCS');
  assert.deepStrictEqual(p.deletes.sort(), ['a', 'c']);
});

test('merged asset takes a working logo and stays active if any copy was active', () => {
  const p = planMerge([
    row('a', 1, 'us_stock', 'AAPL', { status: 'inactive', image_url: 'http://localhost/storage/stocks/aapl.png' }),
    row('b', 2, 'us_stock', 'AAPL', { image_url: 'https://logo.example/aapl.png' }),
  ]);
  assert.strictEqual(p.updates[0]._id, 'a');
  assert.strictEqual(p.updates[0].set.status, 'active');
  assert.strictEqual(p.updates[0].set.image_url, 'https://logo.example/aapl.png');
  assert.deepStrictEqual(p.deletes, ['b']);
});
