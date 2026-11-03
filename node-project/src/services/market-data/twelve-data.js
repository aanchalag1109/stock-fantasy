'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: US stock prices via Twelve Data (https://twelvedata.com)
 * Purpose: Prices for "… Cap US" assets (session start/end prices, live scores, refetch,
 *          app/admin live quotes). Indian stocks stay on RapidAPI, crypto on CoinMarketCap.
 *
 * Plan limits: every symbol costs 1 API credit. The Basic (free) plan allows 8 credits per
 * minute and 800 per day; UK (LSE) symbols need a paid plan, so only US is routed here.
 * A shared limiter keeps each process inside TWELVE_DATA_CREDITS_PER_MINUTE; if Twelve Data
 * still answers "rate limit" (429), the request waits for the next minute and retries once.
 *
 * Never throws: a failed symbol is simply missing from the result (no invented prices).
 */

const axios = require('axios');
const config = require('../../config/env');
const logger = require('../../config/logger');

const BASE_URL = 'https://api.twelvedata.com';
const WINDOW_MS = 60 * 1000;

// Test hooks: the clock and sleep can be replaced so tests do not wait real minutes.
const clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

const creditsPerMinute = () => Math.max(1, config.TWELVE_DATA_CREDITS_PER_MINUTE || 8);
const isConfigured = () => Boolean(config.TWELVE_DATA_API_KEY);

// Timestamps of credits spent in the last minute (shared by every caller in this process).
let spent = [];
let queue = Promise.resolve();

/** Waits until `credits` can be spent without passing the per-minute limit, then records them. */
function takeCredits(credits) {
  const run = async () => {
    const limit = creditsPerMinute();
    for (;;) {
      const now = clock.now();
      spent = spent.filter((t) => now - t < WINDOW_MS);
      if (spent.length + credits <= limit) {
        for (let i = 0; i < credits; i += 1) spent.push(now);
        return;
      }
      const freeAt = spent[spent.length + credits - limit - 1] + WINDOW_MS;
      await clock.sleep(Math.max(50, freeAt - now + 50));
    }
  };
  const turn = queue.then(run, run);
  queue = turn.catch(() => {});
  return turn;
}

const positive = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};

async function call(path, params, credits) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await takeCredits(credits);
    let response;
    try {
      response = await axios.get(`${BASE_URL}${path}`, {
        params: { ...params, apikey: config.TWELVE_DATA_API_KEY },
        timeout: (config.PRICE_FETCH_TIMEOUT || 10) * 1000,
        validateStatus: () => true,
      });
    } catch (err) {
      logger.warn(`[twelve-data] ${path} request failed: ${err.message}`);
      return null;
    }
    const body = response.data || {};
    const limited = response.status === 429 || Number(body.code) === 429;
    if (!limited) {
      if (response.status >= 200 && response.status < 300 && body.status !== 'error') return body;
      logger.warn(`[twelve-data] ${path} ${params.symbol}: ${body.message || `HTTP ${response.status}`}`);
      return null;
    }
    logger.warn(`[twelve-data] rate limited: ${body.message || 'HTTP 429'}`);
    if (attempt === 0) await clock.sleep(WINDOW_MS + 1000);
  }
  return null;
}

/**
 * Latest prices for US symbols, e.g. ["AAPL", "BRK.B"].
 * @returns {Promise<Map<string, number>>} symbol → price > 0 (missing when unavailable)
 */
async function getUsPrices(symbols) {
  const prices = new Map();
  const list = [...new Set((symbols || []).map((s) => String(s || '').trim()).filter(Boolean))];
  if (!list.length) return prices;
  if (!isConfigured()) {
    logger.warn('[twelve-data] TWELVE_DATA_API_KEY is not set; US stock prices unavailable');
    return prices;
  }
  const size = creditsPerMinute();
  for (let i = 0; i < list.length; i += size) {
    const chunk = list.slice(i, i + size);
    const body = await call('/price', { symbol: chunk.join(',') }, chunk.length);
    if (!body) continue;
    // One symbol → { price }; several → { AAPL: { price }, MSFT: { code, message, status: 'error' } }
    const rows = chunk.length === 1 ? { [chunk[0]]: body } : body;
    chunk.forEach((symbol) => {
      const row = rows[symbol];
      const price = positive(row && row.status !== 'error' && row.price);
      if (price) prices.set(symbol, price);
      else if (row && row.message) logger.warn(`[twelve-data] ${symbol}: ${row.message}`);
    });
  }
  return prices;
}

/**
 * Full quote for one US symbol (for the app/admin live-price endpoints).
 * @returns {Promise<null|{symbol, name, price, change, change_percent, volume, source}>}
 */
async function getUsQuote(symbol) {
  if (!symbol || !isConfigured()) return null;
  const body = await call('/quote', { symbol: String(symbol).trim() }, 1);
  const price = positive(body && body.close);
  if (!price) return null;
  return {
    symbol: body.symbol || symbol,
    name: body.name || symbol,
    price,
    change: Number(body.change) || 0,
    change_percent: Number(body.percent_change) || 0,
    volume: Number(body.volume) || 0,
    source: 'Twelve Data',
  };
}

/**
 * Checks that a symbol is listed on a US exchange (Admin → Assets, to catch typos).
 * Uses the /stocks reference endpoint, which costs no price credits.
 * @returns {Promise<{found:true, name, exchange} | {found:false} | {error:string}>}
 */
async function lookupUsSymbol(symbol) {
  if (!isConfigured()) return { error: 'TWELVE_DATA_API_KEY is not set' };
  try {
    const response = await axios.get(`${BASE_URL}/stocks`, {
      params: { symbol: String(symbol).trim(), country: 'United States', apikey: config.TWELVE_DATA_API_KEY },
      timeout: (config.PRICE_FETCH_TIMEOUT || 10) * 1000,
      validateStatus: () => true,
    });
    const body = response.data || {};
    if (response.status < 200 || response.status >= 300 || body.status === 'error') {
      return { error: body.message || `HTTP ${response.status}` };
    }
    const wanted = String(symbol).trim().toUpperCase();
    const match = (Array.isArray(body.data) ? body.data : []).find((row) => String(row.symbol).toUpperCase() === wanted);
    return match ? { found: true, name: match.name || '', exchange: match.exchange || '' } : { found: false };
  } catch (err) {
    return { error: err.message };
  }
}

function _reset() { spent = []; queue = Promise.resolve(); }

module.exports = { getUsPrices, getUsQuote, lookupUsSymbol, isConfigured, clock, _reset };
