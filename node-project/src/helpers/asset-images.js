'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: Stock / crypto logos everywhere the app is sent an asset (client feedback: basket stocks,
 *          alpha/beta multiplier picks, session assets, contest baskets, live prices, …).
 * How: an /api middleware wraps res.json. Before the response is sent it walks the JSON and gives
 *      every asset object an `image_url` (absolute URL, or null when the asset has no logo):
 *        - objects with `symbol` or `asset_symbol` (basket assets, session assets, quotes …);
 *        - multiplier picks: objects with `multiplier` and `asset_name` (the alpha / beta stocks).
 *      An image_url that is already set is never changed. When a symbol exists in two markets, the
 *      nearest `market` in the response (e.g. the session's) decides; otherwise the one with a logo.
 * The logo list (Assets admin page) is cached for CACHE_MS, so normal requests make no extra query.
 * Never fails a response: any error leaves the body as it was.
 */

const Asset = require('../models/asset.model');
const logger = require('../config/logger');
const { publicBaseUrl } = require('./public-url');

const CACHE_MS = 60 * 1000;
const MAX_NODES = 200000; // safety limit for very large responses
let cache = { at: 0, bySymbol: new Map(), byName: new Map(), loading: null };

const MARKET_ALIASES = { indian: 'indian_stock', us: 'us_stock', stock: null };

async function logoIndex() {
  if (Date.now() - cache.at < CACHE_MS) return cache;
  if (cache.loading) return cache.loading;
  cache.loading = (async () => {
    try {
      const rows = await Asset.find({}).select('symbol name market image_url').lean();
      const bySymbol = new Map();
      const byName = new Map();
      (Array.isArray(rows) ? rows : []).forEach((a) => {
        if (!a || !a.symbol) return;
        const key = String(a.symbol).trim().toUpperCase();
        const list = bySymbol.get(key) || [];
        const entry = { market: a.market || null, image_url: a.image_url || null };
        list.push(entry);
        bySymbol.set(key, list);
        if (a.name) {
          const nameKey = String(a.name).trim().toUpperCase();
          byName.set(nameKey, [...(byName.get(nameKey) || []), entry]);
        }
      });
      cache = { at: Date.now(), bySymbol, byName, loading: null };
    } catch (err) {
      logger.warn(`[asset-images] could not load asset logos: ${err.message}`);
      cache = { ...cache, at: Date.now(), loading: null };
    }
    return cache;
  })();
  return cache.loading;
}

function absolute(url) {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return `${publicBaseUrl()}/${String(url).replace(/^\/+/, '')}`;
}

function pick(list, market) {
  if (!list || !list.length) return null;
  const m = MARKET_ALIASES[market] !== undefined ? MARKET_ALIASES[market] : market;
  const inMarket = m ? list.find((a) => a.market === m && a.image_url) : null;
  const any = inMarket || list.find((a) => a.image_url);
  return any ? absolute(any.image_url) : null;
}

/** The symbol an asset-like object stands for, or null. */
function symbolOf(obj) {
  if (typeof obj.symbol === 'string' && obj.symbol.trim()) return obj.symbol;
  if (typeof obj.asset_symbol === 'string' && obj.asset_symbol.trim()) return obj.asset_symbol;
  if ('multiplier' in obj && typeof obj.asset_name === 'string' && obj.asset_name.trim()) return obj.asset_name;
  return null;
}

/** Adds image_url in place. Returns how many objects were given one. */
function addImages(body, index) {
  let visited = 0;
  let added = 0;
  const walk = (node, market) => {
    if (visited++ > MAX_NODES || node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach((item) => walk(item, market)); return; }
    const here = typeof node.market === 'string' && node.market ? node.market : market;
    const sym = symbolOf(node);
    if (sym && (node.image_url === undefined || node.image_url === null || node.image_url === '')) {
      const key = sym.trim().toUpperCase();
      // multiplier picks may hold the company name instead of the symbol
      const url = pick(index.bySymbol.get(key), here) || ('multiplier' in node ? pick(index.byName.get(key), here) : null);
      if (url || node.image_url === undefined) { node.image_url = url; added += 1; }
    }
    Object.keys(node).forEach((k) => { const v = node[k]; if (v && typeof v === 'object') walk(v, here); });
  };
  walk(body, null);
  return added;
}

/** Express middleware for the app API. */
function assetImagesMiddleware(req, res, next) {
  const original = res.json.bind(res);
  res.json = (body) => {
    if (!body || typeof body !== 'object') return original(body);
    logoIndex()
      .then((index) => { if (index.bySymbol.size) addImages(body, index); })
      .catch(() => {})
      .then(() => original(body));
    return res;
  };
  next();
}

function _resetCache() { cache = { at: 0, bySymbol: new Map(), byName: new Map(), loading: null }; }

module.exports = { assetImagesMiddleware, addImages, logoIndex, _resetCache };
