'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 * US stock prices via Twelve Data: response parsing, plan rate limit (credits per minute),
 * 429 retry, missing key, and symbol → market routing for the live-quote endpoints.
 * axios and the clock are stubbed; nothing leaves the machine and no test waits.
 */

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const mongoose = require('mongoose');

mongoose.set('bufferCommands', false);

const config = require('../../src/config/env');
const logger = require('../../src/config/logger');
const twelve = require('../../src/services/market-data/twelve-data');
const feed = require('../../src/services/contest-automation/price-feed');
const Asset = require('../../src/models/asset.model');
const MarketTypeCategory = require('../../src/models/market-type-category.model');

logger.silent = true;

let calls;
let responder;
let now;
let sleeps;
axios.get = async (url, opts) => { calls.push({ url, params: opts.params, at: now }); return responder(url, opts); };
twelve.clock.now = () => now;
twelve.clock.sleep = async (ms) => { sleeps.push(ms); now += ms; };

beforeEach(() => {
  calls = []; sleeps = []; now = 1_000_000;
  config.TWELVE_DATA_API_KEY = 'test-key';
  config.TWELVE_DATA_CREDITS_PER_MINUTE = 8;
  twelve._reset();
  feed._resetMarketCache();
});

const priceBody = (params) => Object.fromEntries(params.symbol.split(',').map((s, i) => [s, { price: String(100 + i) }]));

test('batched /price request with the API key; single-symbol and per-symbol error shapes', async () => {
  responder = () => ({ status: 200, data: { AAPL: { price: '339.10999' }, FAKE: { code: 404, message: 'symbol not found', status: 'error' }, MSFT: { price: '0' } } });
  const prices = await twelve.getUsPrices(['AAPL', 'FAKE', 'MSFT', 'AAPL']);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.twelvedata.com/price');
  assert.deepEqual(calls[0].params, { symbol: 'AAPL,FAKE,MSFT', apikey: 'test-key' });
  assert.deepEqual(Object.fromEntries(prices), { AAPL: 339.10999 }, 'errors and zero prices are dropped, never invented');

  responder = () => ({ status: 200, data: { price: '557.22998' } });
  assert.deepEqual(Object.fromEntries(await twelve.getUsPrices(['BRK.B'])), { 'BRK.B': 557.22998 });
});

test('stays inside the plan limit: 20 symbols at 8/min → 3 requests a minute apart', async () => {
  responder = (url, { params }) => ({ status: 200, data: priceBody(params) });
  const symbols = Array.from({ length: 20 }, (_, i) => `S${i}`);
  const prices = await twelve.getUsPrices(symbols);
  assert.equal(prices.size, 20);
  assert.deepEqual(calls.map((c) => c.params.symbol.split(',').length), [8, 8, 4]);
  assert.ok(calls[1].at - calls[0].at >= 60_000 && calls[2].at - calls[1].at >= 60_000);

  // A paid plan just raises the setting.
  calls = []; twelve._reset(); config.TWELVE_DATA_CREDITS_PER_MINUTE = 55;
  await twelve.getUsPrices(symbols);
  assert.equal(calls.length, 1);
});

test('separate callers share the same per-minute budget', async () => {
  responder = (url, { params }) => ({ status: 200, data: priceBody(params) });
  await Promise.all([twelve.getUsPrices(['A', 'B', 'C', 'D', 'E']), twelve.getUsPrices(['F', 'G', 'H', 'I'])]);
  assert.equal(calls.length, 2);
  assert.ok(calls[1].at - calls[0].at >= 60_000, 'second batch waited for the next minute');
});

test('a 429 from Twelve Data waits a minute and retries once', async () => {
  let n = 0;
  responder = () => (n++ === 0
    ? { status: 200, data: { code: 429, message: 'You have run out of API credits for the current minute.', status: 'error' } }
    : { status: 200, data: { price: '10' } });
  const prices = await twelve.getUsPrices(['AAPL']);
  assert.equal(calls.length, 2);
  assert.ok(sleeps.some((ms) => ms >= 60_000));
  assert.equal(prices.get('AAPL'), 10);
});

test('no API key → no request, no price', async () => {
  config.TWELVE_DATA_API_KEY = '';
  responder = () => { throw new Error('should not be called'); };
  assert.equal((await twelve.getUsPrices(['AAPL'])).size, 0);
  assert.equal(await twelve.getUsQuote('AAPL'), null);
  assert.equal(calls.length, 0);
});

test('getUsQuote maps /quote to the common quote shape', async () => {
  responder = () => ({ status: 200, data: { symbol: 'AAPL', name: 'Apple Inc', close: '339.11', change: '2.5', percent_change: '0.74', volume: '1200' } });
  assert.deepEqual(await twelve.getUsQuote('AAPL'), { symbol: 'AAPL', name: 'Apple Inc', price: 339.11, change: 2.5, change_percent: 0.74, volume: 1200, source: 'Twelve Data' });
  assert.equal(calls[0].url, 'https://api.twelvedata.com/quote');
});

test('stockQuote routes a bare symbol by its admin category: US → Twelve Data, Indian → NSE, UK → none', async () => {
  const us = new mongoose.Types.ObjectId(); const indian = new mongoose.Types.ObjectId();
  const q = (v) => ({ select: () => ({ lean: async () => v }) });
  MarketTypeCategory.find = () => q([{ _id: us, name: 'Large Cap US' }, { _id: indian, old_id: 22, name: 'Large Cap Indian' }]);
  Asset.find = () => q([{ symbol: 'AAPL', category_id: us }, { symbol: 'TCS', category_id: 22 }]);
  responder = (url) => (url.includes('twelvedata')
    ? { status: 200, data: { symbol: 'AAPL', name: 'Apple Inc', close: '339.11' } }
    : { status: 200, data: { tradingSymbol: 'TCS', companyName: 'Tata Consultancy', lastPrice: 3500 } });

  assert.equal((await feed.stockQuote('AAPL')).source, 'Twelve Data');
  assert.equal((await feed.stockQuote('TCS')).source, 'RapidAPI NSE');
  assert.equal((await feed.stockQuote('UNKNOWN')).source, 'RapidAPI NSE', 'unknown symbols keep the old NSE behaviour');
  assert.equal(await feed.stockQuote('SHEL.L'), null);
  assert.equal((await feed.stockQuote('XYZ', { market: 'us' })).source, 'Twelve Data', 'explicit market wins');
});
