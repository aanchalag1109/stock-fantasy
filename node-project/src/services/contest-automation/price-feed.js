'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: Contest Automation (port of the PHP scheduled commands)
 * Purpose: Fetch current asset prices for session start/end and live scores.
 * Origin: Ports getStockPrice()/getCryptoPrice() from the PHP commands
 *          (UpdateLeagueSessionStatus, UpdateLiveScores, CalculateContestPerformance).
 * Note: This feature must remain distinguishable from PHP-converted code.
 *
 * Same providers as PHP:
 *   Indian stocks — "Indian Stock Market Data (NSE/BSE)" on RapidAPI, exchange NSE
 *   Crypto        — CoinMarketCap /v1/cryptocurrency/quotes/latest
 *   US stocks     — Twelve Data /price (NEW: not in PHP)
 * Differences from PHP (deliberate):
 *   - No fake fallback price. PHP returned rand(1000, 5000) on errors, which would
 *     score contests on invented prices; here a failed fetch is simply "no price".
 *   - Crypto symbols are fetched in one batched request (PHP made one call per
 *     symbol per entry), which also removes the top-100 limit of /listings/latest.
 *   - US stocks are priced by Twelve Data (services/market-data/twelve-data.js), batched
 *     and kept inside the plan's per-minute credit limit.
 *   - UK stocks are still not priced (Twelve Data needs a paid plan for LSE); they are
 *     reported as unsupported.
 *
 * getPrices(session, symbols) → Map(symbol → price > 0). Never throws.
 */

const axios = require('axios');
const config = require('../../config/env');
const logger = require('../../config/logger');
const twelveData = require('../market-data/twelve-data');

const NSE_HOST = 'indian-stock-market-data-nse-bse-bcd-mcx-cds-nfo.p.rapidapi.com';
const CMC_BATCH = 100;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const positive = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Indian stock (NSE). Returns a price or null. */
async function indianStockPrice(symbol) {
  try {
    const response = await axios.get(`https://${NSE_HOST}/v1/rapidapi/stock/quote`, {
      headers: { 'x-rapidapi-host': NSE_HOST, 'x-rapidapi-key': config.RAPIDAPI_KEY },
      params: { tradingSymbol: symbol, exchange: 'NSE' },
      timeout: (config.PRICE_FETCH_TIMEOUT || 10) * 1000,
      validateStatus: () => true,
    });
    if (response.status < 200 || response.status >= 300) return null;
    return positive(response.data && response.data.lastPrice);
  } catch (err) {
    logger.warn(`[price-feed] NSE quote failed for ${symbol}: ${err.message}`);
    return null;
  }
}

/** US stock via Twelve Data. Returns a price or null. (UK symbols are not supported.) */
async function internationalStockPrice(symbol) {
  if (/\.L$/i.test(String(symbol || ''))) return null;
  return (await twelveData.getUsPrices([symbol])).get(String(symbol).trim()) || null;
}

/** Crypto via CoinMarketCap, batched. Symbols arrive as "BTC-USD". Returns Map. */
async function cryptoPrices(symbols) {
  const prices = new Map();
  const bare = [...new Set(symbols.map((s) => String(s).replace(/-USD$/i, '').toUpperCase()))];
  for (let i = 0; i < bare.length; i += CMC_BATCH) {
    const chunk = bare.slice(i, i + CMC_BATCH);
    try {
      const response = await axios.get('https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest', {
        headers: { 'X-CMC_PRO_API_KEY': config.CMC_API_KEY, Accept: 'application/json' },
        params: { symbol: chunk.join(','), convert: 'USD', skip_invalid: true },
        timeout: (config.PRICE_FETCH_TIMEOUT || 10) * 1000,
        validateStatus: () => true,
      });
      const data = (response.status >= 200 && response.status < 300 && response.data && response.data.data) || {};
      chunk.forEach((sym) => {
        const row = Array.isArray(data[sym]) ? data[sym][0] : data[sym];
        const price = positive(row && row.quote && row.quote.USD && row.quote.USD.price);
        if (price) prices.set(`${sym}-USD`, price);
      });
    } catch (err) {
      logger.warn(`[price-feed] CoinMarketCap batch failed: ${err.message}`);
    }
  }
  return prices;
}

/** UK listings: "… Cap UK" categories or LSE ".L" symbols. */
function isUkStock(asset) {
  return /\bUK\b/.test(String((asset && asset.category_name) || '')) || /\.L$/i.test(String((asset && asset.asset_symbol) || ''));
}

/** US listings: "… Cap US" categories. */
function isUsStock(asset) {
  return !isUkStock(asset) && /\bUS\b/.test(String((asset && asset.category_name) || ''));
}

/** US/UK listings: category names like "Large Cap US" / "Mid Cap UK", or LSE ".L" symbols. */
function isInternationalStock(asset) {
  return isUsStock(asset) || isUkStock(asset);
}

/**
 * Prices for the given session assets (objects with asset_symbol / category_name).
 * Returns { prices: Map(symbol → price), unsupported: [symbols] }.
 */
async function getPrices(session, assets) {
  const prices = new Map();
  const unsupported = [];
  const list = assets.filter((a) => a && a.asset_symbol);
  if (!list.length) return { prices, unsupported };

  if (session.market_type === 'crypto') {
    return { prices: await cryptoPrices(list.map((a) => a.asset_symbol)), unsupported };
  }

  // US stocks: one batched Twelve Data request per plan-minute of credits.
  const us = list.filter(isUsStock);
  if (us.length) {
    const usPrices = await twelveData.getUsPrices(us.map((a) => a.asset_symbol));
    us.forEach((a) => { const p = usPrices.get(String(a.asset_symbol).trim()); if (p) prices.set(a.asset_symbol, p); });
  }
  list.filter(isUkStock).forEach((a) => unsupported.push(a.asset_symbol));

  const indian = list.filter((a) => !isInternationalStock(a));
  const delay = Number.isFinite(config.STOCK_PRICE_REQUEST_DELAY_MS) ? config.STOCK_PRICE_REQUEST_DELAY_MS : 500;
  for (let i = 0; i < indian.length; i += 1) {
    const price = await indianStockPrice(indian[i].asset_symbol);
    if (price) prices.set(indian[i].asset_symbol, price);
    if (delay > 0 && i < indian.length - 1) await sleep(delay); // same pacing as PHP (usleep 0.5s)
  }
  if (unsupported.length) logger.warn(`[price-feed] no price provider for UK stocks: ${unsupported.join(', ')}`);
  return { prices, unsupported };
}

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT: which stock market a bare symbol belongs to, from the
 * admin's asset list (Assets → "… Cap US/UK/Indian" categories). Cached for 10 minutes.
 * Used by endpoints that only receive a symbol (app/admin live quotes, legacy price saves).
 */
const MARKET_CACHE_MS = 10 * 60 * 1000;
let marketCache = { at: 0, map: new Map() };

async function stockMarketOf(symbol) {
  const sym = String(symbol || '').trim();
  if (!sym) return 'indian';
  if (/\.L$/i.test(sym)) return 'uk';
  if (Date.now() - marketCache.at > MARKET_CACHE_MS) {
    try {
      const Asset = require('../../models/asset.model');
      const MarketTypeCategory = require('../../models/market-type-category.model');
      const [categories, assets] = await Promise.all([
        MarketTypeCategory.find({}).select('_id old_id name').lean(),
        Asset.find({}).select('symbol category_id').lean(),
      ]);
      const nameOf = new Map();
      categories.forEach((c) => { nameOf.set(String(c._id), c.name); if (c.old_id != null) nameOf.set(String(c.old_id), c.name); });
      const map = new Map();
      assets.forEach((a) => {
        const name = nameOf.get(String(a.category_id)) || '';
        const market = /\bUK\b/.test(name) ? 'uk' : /\bUS\b/.test(name) ? 'us' : /crypto/i.test(name) ? 'crypto' : 'indian';
        const markets = map.get(a.symbol) || new Set();
        markets.add(market);
        map.set(a.symbol, markets);
      });
      marketCache = { at: Date.now(), map };
    } catch (err) {
      logger.warn(`[price-feed] could not load asset markets: ${err.message}`);
    }
  }
  const markets = marketCache.map.get(sym);
  // A symbol listed only under US categories is a US stock; anything else stays on NSE as before.
  return markets && markets.has('us') && !markets.has('indian') ? 'us' : 'indian';
}

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT: one quote shape for every stock, whatever the provider.
 * @param {string} symbol
 * @param {{market?: 'us'|'indian'}} [opts] market when the caller knows it; looked up otherwise
 * @returns {Promise<null|{symbol, name, price, change, change_percent, volume, source}>}
 */
async function stockQuote(symbol, { market } = {}) {
  const which = market === 'us' || market === 'indian' ? market : await stockMarketOf(symbol);
  if (which === 'us') return twelveData.getUsQuote(symbol);
  if (which === 'uk') return null;
  try {
    const response = await axios.get(`https://${NSE_HOST}/v1/rapidapi/stock/quote`, {
      headers: { 'x-rapidapi-host': NSE_HOST, 'x-rapidapi-key': config.RAPIDAPI_KEY },
      params: { tradingSymbol: symbol, exchange: 'NSE' },
      timeout: 30000,
      validateStatus: () => true,
    });
    const data = response.status >= 200 && response.status < 300 ? response.data : null;
    const price = positive(data && data.lastPrice);
    if (!price) return null;
    return {
      symbol: data.tradingSymbol || symbol,
      name: data.companyName || symbol,
      price,
      change: data.change || 0,
      change_percent: data.pChange || 0,
      volume: data.totalTradedVolume || 0,
      source: 'RapidAPI NSE',
    };
  } catch (err) {
    logger.warn(`[price-feed] NSE quote failed for ${symbol}: ${err.message}`);
    return null;
  }
}

function _resetMarketCache() { marketCache = { at: 0, map: new Map() }; }

module.exports = {
  getPrices, indianStockPrice, internationalStockPrice, cryptoPrices,
  isInternationalStock, isUsStock, isUkStock, stockMarketOf, stockQuote, _resetMarketCache,
};
