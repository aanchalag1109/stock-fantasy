'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: Contest Automation (port of the PHP scheduled commands)
 * Price feed: provider routing, response parsing, batching and "no fake prices".
 * axios is stubbed; nothing leaves the machine.
 */

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const config = require('../../src/config/env');
const logger = require('../../src/config/logger');
const feed = require('../../src/services/contest-automation/price-feed');

logger.silent = true;
config.STOCK_PRICE_REQUEST_DELAY_MS = 0;

let calls;
let responder;
axios.get = async (url, opts) => { calls.push({ url, params: opts.params }); return responder(url, opts); };

beforeEach(() => { calls = []; });

test('Indian stocks are quoted on NSE; failures give no price (never a fake one)', async () => {
  responder = (url, { params }) => {
    if (params.tradingSymbol === 'TCS') return { status: 500, data: {} };
    if (params.tradingSymbol === 'INFY') throw new Error('timeout');
    return { status: 200, data: { lastPrice: 2500.5 } };
  };
  const session = { market_type: 'stock' };
  const { prices } = await feed.getPrices(session, [{ asset_symbol: 'RELIANCE' }, { asset_symbol: 'TCS' }, { asset_symbol: 'INFY' }]);
  assert.deepEqual([...prices], [['RELIANCE', 2500.5]]);
  assert.ok(calls.every((c) => c.params.exchange === 'NSE'));
});

test('US/UK stocks are reported unsupported and never sent to the NSE API', async () => {
  responder = () => ({ status: 200, data: { lastPrice: 10 } });
  const { prices, unsupported } = await feed.getPrices({ market_type: 'stock' }, [
    { asset_symbol: 'AAPL', category_name: 'Large Cap US' },
    { asset_symbol: 'SHEL.L', category_name: 'Large Cap UK' },
    { asset_symbol: 'TCS', category_name: 'Large Cap Indian' },
  ]);
  assert.deepEqual(unsupported, ['AAPL', 'SHEL.L']);
  assert.deepEqual([...prices.keys()], ['TCS']);
  assert.deepEqual(calls.map((c) => c.params.tradingSymbol), ['TCS']);
});

test('crypto prices come from one batched CoinMarketCap quotes request', async () => {
  responder = () => ({
    status: 200,
    data: { data: { BTC: { quote: { USD: { price: 65000 } } }, GALA: [{ quote: { USD: { price: 0.03 } } }], DOGE: { quote: { USD: { price: 0 } } } } },
  });
  const { prices } = await feed.getPrices({ market_type: 'crypto' }, [{ asset_symbol: 'BTC-USD' }, { asset_symbol: 'GALA-USD' }, { asset_symbol: 'DOGE-USD' }, { asset_symbol: 'BTC-USD' }]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].params.symbol, 'BTC,GALA,DOGE');
  assert.deepEqual(Object.fromEntries(prices), { 'BTC-USD': 65000, 'GALA-USD': 0.03 });
});
