'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: "Import missing assets" (client feedback) — admin → Assets.
 * Purpose: Fetch the list of stocks / coins of a market and add the ones the master list does not have
 *          yet, as INACTIVE assets (the admin switches on the ones to use; the Assets page filters by
 *          status). Existing assets are never changed or deleted; sessions are never touched.
 *
 * Sources (one request per import):
 *   indian_stock — official NSE equity list (public CSV, no key, no API quota). Series EQ and BE.
 *                  (The RapidAPI provider we use for prices has no documented list endpoint; if one is
 *                  added later it can replace this fetcher.)
 *   us_stock     — Twelve Data /stocks (common stocks on NYSE and NASDAQ).
 *   crypto       — CoinMarketCap /v1/cryptocurrency/listings/latest (top coins by market cap),
 *                  stored as "BTC-USD" like the existing crypto assets.
 *
 * preview(market) → what would be added; importMissing(market) → adds them.
 */

const axios = require('axios');
const config = require('../../config/env');
const logger = require('../../config/logger');
const Asset = require('../../models/asset.model');
const markets = require('../markets');
const { defaultLogoUrl } = require('./logos');

const NSE_LIST_URL = process.env.ASSET_IMPORT_NSE_URL || 'https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv';
const NSE_SERIES = ['EQ', 'BE'];
const US_EXCHANGES = ['NYSE', 'NASDAQ'];
const CRYPTO_LIMIT = 300;
const TIMEOUT = 30000;
const SYMBOL_RE = /^[A-Z0-9.\-&^]{1,25}$/;

class ImportSourceError extends Error {}

/** Minimal CSV line parser (handles quoted fields with commas / doubled quotes). */
function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i += 1; } else if (ch === '"') quoted = false; else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function parseNseCsv(text) {
  const lines = String(text || '').split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const header = parseCsvLine(lines[0]).map((h) => h.toUpperCase());
  const iSymbol = header.indexOf('SYMBOL');
  const iName = header.indexOf('NAME OF COMPANY');
  const iSeries = header.indexOf('SERIES');
  if (iSymbol < 0 || iName < 0) throw new ImportSourceError('The NSE list has an unexpected format.');
  return lines.slice(1).map(parseCsvLine)
    .filter((row) => iSeries < 0 || NSE_SERIES.includes(String(row[iSeries] || '').toUpperCase()))
    .map((row) => ({ symbol: String(row[iSymbol] || '').toUpperCase(), name: row[iName] || '' }));
}

const FETCHERS = {
  async indian_stock() {
    let res;
    try {
      res = await axios.get(NSE_LIST_URL, { timeout: TIMEOUT, responseType: 'text', headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/csv,*/*' }, validateStatus: () => true });
    } catch (err) {
      throw new ImportSourceError(`Could not reach the NSE list (${err.message}).`);
    }
    if (res.status !== 200) throw new ImportSourceError(`The NSE list answered HTTP ${res.status}.`);
    return parseNseCsv(res.data);
  },

  async us_stock() {
    if (!config.TWELVE_DATA_API_KEY) throw new ImportSourceError('Twelve Data is not configured (TWELVE_DATA_API_KEY).');
    let res;
    try {
      res = await axios.get('https://api.twelvedata.com/stocks', {
        params: { country: 'United States', type: 'Common Stock', apikey: config.TWELVE_DATA_API_KEY },
        timeout: TIMEOUT,
        validateStatus: () => true,
      });
    } catch (err) {
      throw new ImportSourceError(`Could not reach Twelve Data (${err.message}).`);
    }
    const body = res.data || {};
    if (res.status !== 200 || body.status === 'error' || !Array.isArray(body.data)) {
      throw new ImportSourceError(`Twelve Data: ${body.message || `HTTP ${res.status}`}`);
    }
    return body.data
      .filter((s) => US_EXCHANGES.includes(String(s.exchange || '').toUpperCase()))
      .map((s) => ({ symbol: String(s.symbol || '').toUpperCase(), name: s.name || '' }));
  },

  async crypto() {
    if (!config.CMC_API_KEY) throw new ImportSourceError('CoinMarketCap is not configured (CMC_API_KEY).');
    let res;
    try {
      res = await axios.get('https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest', {
        headers: { 'X-CMC_PRO_API_KEY': config.CMC_API_KEY, Accept: 'application/json' },
        params: { start: 1, limit: CRYPTO_LIMIT, convert: 'USD' },
        timeout: TIMEOUT,
        validateStatus: () => true,
      });
    } catch (err) {
      throw new ImportSourceError(`Could not reach CoinMarketCap (${err.message}).`);
    }
    const body = res.data || {};
    if (res.status !== 200 || !Array.isArray(body.data)) {
      throw new ImportSourceError(`CoinMarketCap: ${(body.status && body.status.error_message) || `HTTP ${res.status}`}`);
    }
    return body.data.map((c) => ({ symbol: `${String(c.symbol || '').toUpperCase()}-USD`, name: c.name || '' }));
  },
};

const SOURCE_LABEL = {
  indian_stock: 'NSE equity list (EQ/BE)',
  us_stock: 'Twelve Data — NYSE & NASDAQ common stocks',
  crypto: `CoinMarketCap — top ${CRYPTO_LIMIT} coins`,
};

/** Clean, de-duplicated candidates with a valid symbol and a name. */
function clean(rows) {
  const seen = new Set();
  return rows.filter((r) => {
    if (!r.symbol || !SYMBOL_RE.test(r.symbol) || !r.name || seen.has(r.symbol)) return false;
    seen.add(r.symbol);
    return true;
  }).map((r) => ({ symbol: r.symbol, name: String(r.name).trim().slice(0, 255) }));
}

async function missingFor(market) {
  if (!markets.isMarket(market) || !FETCHERS[market]) throw new ImportSourceError('Choose a market: Indian Stock, US Stock or Crypto.');
  const candidates = clean(await FETCHERS[market]());
  const existing = await Asset.find({ market }).select('symbol').lean();
  const have = new Set(existing.map((a) => String(a.symbol).toUpperCase()));
  const missing = candidates.filter((c) => !have.has(c.symbol));
  return { market, source: SOURCE_LABEL[market], found: candidates.length, existing: candidates.length - missing.length, missing };
}

/** What an import would add (nothing is saved). */
function preview(market) {
  return missingFor(market);
}

/**
 * Adds every missing asset of the market as INACTIVE, with the market's standard logo.
 * @returns {Promise<{ added:number, found:number, existing:number, skipped:number, source:string }>}
 */
async function importMissing(market) {
  const { missing, found, existing, source } = await missingFor(market);
  if (!missing.length) return { added: 0, found, existing, skipped: 0, source };
  const latest = await Asset.findOne({ old_id: { $type: 'number' } }).sort({ old_id: -1 }).select('old_id').lean();
  let nextId = ((latest && latest.old_id) || 0) + 1;
  const provider = markets.providerOf(market);
  const docs = missing.map((m) => ({
    old_id: nextId++,
    symbol: m.symbol,
    name: m.name,
    type: markets.typeOf(market),
    market,
    image_url: defaultLogoUrl(provider, m.symbol),
    status: 'inactive',
  }));
  let added = docs.length;
  try {
    await Asset.insertMany(docs, { ordered: false });
  } catch (err) {
    // A symbol added meanwhile (unique market+symbol index) is skipped; the rest are saved.
    const failed = (err && err.writeErrors && err.writeErrors.length) || 0;
    if (!failed && !(err && err.code === 11000)) throw err;
    added = (err.insertedDocs && err.insertedDocs.length) || Math.max(0, docs.length - failed);
  }
  logger.info(`[asset-import] ${market}: ${added} new inactive assets added from ${source}`);
  return { added, found, existing, skipped: docs.length - added, source };
}

module.exports = { preview, importMissing, parseNseCsv, ImportSourceError, SOURCE_LABEL, FETCHERS };
