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
 * Differences from PHP (deliberate):
 *   - No fake fallback price. PHP returned rand(1000, 5000) on errors, which would
 *     score contests on invented prices; here a failed fetch is simply "no price".
 *   - Crypto symbols are fetched in one batched request (PHP made one call per
 *     symbol per entry), which also removes the top-100 limit of /listings/latest.
 *   - US/UK stocks are not priced yet (the NSE API cannot quote them). They are
 *     reported as unsupported; plug the coming international provider into
 *     `internationalStockPrice` below and nothing else needs to change.
 *
 * getPrices(session, symbols) → Map(symbol → price > 0). Never throws.
 */

const axios = require('axios');
const config = require('../../config/env');
const logger = require('../../config/logger');

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

/**
 * Placeholder for US/UK stocks. Replace with the international provider when it is
 * integrated: return a positive price, or null when unavailable.
 */
// eslint-disable-next-line no-unused-vars
async function internationalStockPrice(symbol) {
  return null;
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

/** US/UK listings: category names like "Large Cap US" / "Mid Cap UK", or LSE ".L" symbols. */
function isInternationalStock(asset) {
  const category = String((asset && asset.category_name) || '');
  return /\b(US|UK)\b/.test(category) || /\.L$/i.test(String((asset && asset.asset_symbol) || ''));
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

  const delay = Number.isFinite(config.STOCK_PRICE_REQUEST_DELAY_MS) ? config.STOCK_PRICE_REQUEST_DELAY_MS : 500;
  for (let i = 0; i < list.length; i += 1) {
    const asset = list[i];
    const international = isInternationalStock(asset);
    const price = international ? await internationalStockPrice(asset.asset_symbol) : await indianStockPrice(asset.asset_symbol);
    if (price) prices.set(asset.asset_symbol, price);
    else if (international) unsupported.push(asset.asset_symbol);
    if (delay > 0 && i < list.length - 1) await sleep(delay); // same pacing as PHP (usleep 0.5s)
  }
  if (unsupported.length) logger.warn(`[price-feed] no price provider yet for US/UK stocks: ${unsupported.join(', ')}`);
  return { prices, unsupported };
}

module.exports = { getPrices, indianStockPrice, internationalStockPrice, cryptoPrices, isInternationalStock };
