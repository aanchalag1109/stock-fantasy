'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: Asset, Market Category & Session redesign (client feedback)
 * Purpose: Assign master-list assets to market categories inside one session, and
 *          enforce the rules on the server (not only in the browser):
 *            - the session has one market (Indian Stock / US Stock / Crypto);
 *            - every chosen category is active and belongs to that market;
 *            - every asset is an active asset of that market;
 *            - an asset sits in only one category of the session (it can be in a
 *              different category in another session);
 *            - each category gets at least its configured minimum number of assets, and no
 *              more than its maximum (when one is set).
 * Origin: Newly implemented in node-project; not directly converted
 *          from the original PHP implementation.
 *
 * Important: Keep this implementation distinguishable from the
 * original PHP project when comparing functionality in the future.
 *
 * Used by session create/edit and template edit. Forms post the assignment as
 * asset_selection[] = "<categoryId>:<SYMBOL>" (a value encoding that survives every
 * body parser) and session_categories[] = "<categoryId>" for chosen categories.
 * Category ids are the numeric old_id, as stored in session assets and app baskets.
 */

const Asset = require('../models/asset.model');
const MarketTypeCategory = require('../models/market-type-category.model');
const { ensureOldId } = require('../helpers/mobile-compat');
const markets = require('./markets');

const categoryRef = (category) => (category.old_id != null ? category.old_id : String(category._id));
const minOf = (category) => Math.max(1, parseInt(category.min_assets, 10) || 1);
// NEW IMPLEMENTATION — NODE.JS PROJECT: maximum assets per category; null = no limit (older categories)
const maxOf = (category) => {
  const max = parseInt(category.max_assets, 10);
  return Number.isFinite(max) && max >= 1 ? Math.max(max, minOf(category)) : null;
};

/** Gives categories without a numeric id one (sessions and baskets store numeric ids). */
async function withNumericIds(categories) {
  for (const category of categories) {
    if (category.old_id == null) await ensureOldId(MarketTypeCategory, category);
  }
  return categories;
}

/** Active categories of a market (for the session form), each with id, name and minimum. */
async function activeCategories(market) {
  const keys = markets.marketsFor(market);
  if (!keys.length) return [];
  const rows = await MarketTypeCategory.find({ market: { $in: keys }, status: 'active' }).sort({ name: 1, _id: 1 }).lean();
  return withNumericIds(rows);
}

/** Active master-list assets of a market. */
function activeAssets(market) {
  const keys = markets.marketsFor(market);
  if (!keys.length) return Promise.resolve([]);
  return Asset.find({ market: { $in: keys }, status: { $ne: 'inactive' } }).sort({ symbol: 1, _id: 1 }).lean();
}

/**
 * Reads the posted assignment. Returns { selection: Map(categoryId → [symbols]), categoryIds: [ids] }.
 * Also accepts the older shapes: stocks[<id>][] / cryptos[<id>][] maps.
 */
function parseSelection(body = {}) {
  const selection = new Map();
  const add = (categoryId, symbol) => {
    const id = String(categoryId || '').trim();
    const sym = String(symbol || '').trim();
    if (!id || !sym) return;
    const list = selection.get(id) || [];
    if (!list.includes(sym)) list.push(sym);
    selection.set(id, list);
  };
  [].concat(body.asset_selection || body['asset_selection[]'] || []).forEach((value) => {
    const match = String(value).match(/^([^:]+):(.+)$/);
    if (match) add(match[1], match[2]);
  });
  ['stocks', 'cryptos'].forEach((field) => {
    const input = body[field];
    if (input && typeof input === 'object') {
      Object.entries(input).forEach(([id, list]) => {
        if (list != null) [].concat(list).forEach((sym) => add(id, sym));
      });
    }
    const pattern = new RegExp(`^${field}\\[([^\\]]+)\\](?:\\[\\])?$`);
    Object.entries(body).forEach(([key, list]) => {
      const match = key.match(pattern);
      if (match) [].concat(list).forEach((sym) => add(match[1], sym));
    });
  });
  const categoryIds = [...new Set([
    ...[].concat(body.session_categories || body['session_categories[]'] || []).map((v) => String(v).trim()).filter(Boolean),
    ...selection.keys(),
  ])];
  return { selection, categoryIds };
}

/**
 * Validates an assignment and builds the session asset rows.
 * @returns {Promise<{ errors: string[], rows: object[], categories: object[] }>}
 *   rows: { category_id, category_name, asset_symbol, asset_name } (session `assets` shape)
 *   categories: { category_id, category_name, min_assets, max_assets } (session `categories` snapshot)
 */
async function buildAssignment({ market, selection, categoryIds }) {
  const errors = [];
  if (!markets.isMarket(market)) {
    return { errors: ['Choose a market type: Indian Stock, US Stock or Crypto.'], rows: [], categories: [] };
  }
  const label = markets.labelOf(market);
  if (!categoryIds.length) {
    return { errors: ['Select at least one market category for this session.'], rows: [], categories: [] };
  }

  const all = await withNumericIds(await MarketTypeCategory.find({}).lean());
  const byKey = new Map();
  all.forEach((c) => { byKey.set(String(c._id), c); if (c.old_id != null) byKey.set(String(c.old_id), c); });

  const chosen = [];
  categoryIds.forEach((id) => {
    const category = byKey.get(String(id));
    if (!category) errors.push('A selected market category no longer exists. Please reload the page.');
    else if (category.market !== market) errors.push(`${category.name} is not a ${label} category.`);
    else if (category.status === 'inactive') errors.push(`${category.name} is inactive and can't be used.`);
    else if (!chosen.includes(category)) chosen.push(category);
  });

  const wanted = [...new Set(chosen.flatMap((c) => selection.get(String(categoryRef(c))) || selection.get(String(c._id)) || []))];
  const assetDocs = wanted.length
    ? await Asset.find({ market, status: { $ne: 'inactive' }, symbol: { $in: wanted.flatMap((s) => [s, s.toUpperCase()]) } }).lean()
    : [];
  const assetBySymbol = new Map(assetDocs.map((a) => [String(a.symbol).toUpperCase(), a]));

  const rows = [];
  const snapshot = [];
  const placedIn = new Map(); // SYMBOL → category name
  chosen.forEach((category) => {
    const symbols = selection.get(String(categoryRef(category))) || selection.get(String(category._id)) || [];
    let count = 0;
    symbols.forEach((raw) => {
      const asset = assetBySymbol.get(String(raw).toUpperCase());
      if (!asset) { errors.push(`${raw} is not an active ${label} asset.`); return; }
      const key = String(asset.symbol).toUpperCase();
      if (placedIn.has(key)) {
        if (placedIn.get(key) !== category.name) errors.push(`${asset.symbol} is assigned to both ${placedIn.get(key)} and ${category.name}. An asset can be in only one category per session.`);
        return;
      }
      placedIn.set(key, category.name);
      count += 1;
      rows.push({ category_id: categoryRef(category), category_name: category.name, asset_symbol: asset.symbol, asset_name: asset.name });
    });
    const min = minOf(category);
    const max = maxOf(category);
    if (count < min) errors.push(`${category.name} requires a minimum of ${min} assets. Currently selected: ${count}.`);
    if (max != null && count > max) errors.push(`${category.name} allows a maximum of ${max} assets. Currently selected: ${count}.`);
    snapshot.push({ category_id: categoryRef(category), category_name: category.name, min_assets: min, max_assets: max });
  });
  return { errors: [...new Set(errors)], rows, categories: snapshot };
}

/** Template assets_data ({ "<category name>": [{ asset_symbol, asset_name, category_name, category_id }] }). */
function templateAssetsData(rows) {
  const grouped = {};
  rows.forEach((row) => {
    const key = row.category_name || '';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push({ asset_symbol: row.asset_symbol, asset_name: row.asset_name, category_name: row.category_name, category_id: String(row.category_id) });
  });
  return grouped;
}

/** { "<categoryId>": [symbols] } of a session's (or template's) current assignment, for the form. */
function selectionOf(doc) {
  const out = {};
  const push = (id, sym) => { if (id == null || !sym) return; const k = String(id); (out[k] = out[k] || []).push(sym); };
  (doc.assets || []).forEach((a) => push(a.category_id, a.asset_symbol));
  let data = doc.assets_data;
  if (typeof data === 'string') { try { data = JSON.parse(data); } catch (e) { data = null; } }
  if (data && typeof data === 'object') Object.values(data).flat().forEach((a) => a && push(a.category_id, a.asset_symbol));
  return out;
}

module.exports = {
  activeCategories, activeAssets, parseSelection, buildAssignment, templateAssetsData, selectionOf, categoryRef, minOf, maxOf,
};
