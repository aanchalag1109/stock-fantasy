'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: Admin → Assets — list, add, edit, delete and move the stocks/crypto offered in
 *          each market category (the lists sessions are built from). Not in the PHP admin.
 *
 * Rules:
 *   - A symbol is unique within a category (the same symbol may sit in Small/Mid/Large Cap).
 *   - Symbol format follows the market so prices can be fetched: crypto "BTC-USD",
 *     UK "SHEL.L", US/Indian plain tickers.
 *   - US symbols are checked on Twelve Data (free reference lookup, no price credits) so
 *     typos are caught; an empty name is filled with the official company name. If Twelve Data
 *     cannot be reached the asset is saved with a warning instead of blocking the admin.
 *   - Moving is limited to categories of the same market (e.g. Small → Large Cap US); a
 *     cross-market change goes through Edit so the symbol is validated again.
 *   - Sessions and templates keep their own copy of each asset, so editing or deleting here
 *     never changes an existing session.
 *   - An empty or broken logo (e.g. the PHP data's http://localhost/storage/stocks/*.png) is
 *     replaced with the market's standard logo URL (services/market-data/logos.js).
 */

const mongoose = require('mongoose');
const Asset = require('../../models/asset.model');
const MarketTypeCategory = require('../../models/market-type-category.model');
const { render } = require('../helpers/render');
const { ensureOldId } = require('../../helpers/mobile-compat');
const twelveData = require('../../services/market-data/twelve-data');
const priceFeed = require('../../services/contest-automation/price-feed');
const adminAccess = require('../../services/admin-access.service');
const { defaultLogoUrl, isBrokenLogo, BROKEN_LOGO_FILTER } = require('../../services/market-data/logos');

const PAGE_SIZE = 25;
const SYMBOL_RE = /^[A-Z0-9][A-Z0-9.&^-]{0,24}$/;

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isOid = (v) => String(v).length === 24 && mongoose.isValidObjectId(String(v));

/** "us" | "uk" | "indian" | "crypto" — which price provider a category's assets use. */
function marketOf(category) {
  if (!category) return null;
  if (category.category_type === 'crypto' || /crypto/i.test(category.name)) return 'crypto';
  if (/\bUS\b/.test(category.name)) return 'us';
  if (/\bUK\b/.test(category.name)) return 'uk';
  return 'indian';
}
const MARKET_LABELS = { us: 'US', uk: 'UK', indian: 'Indian', crypto: 'Crypto' };

async function loadCategories() {
  const categories = await MarketTypeCategory.find({}).sort({ category_type: -1, old_id: 1, _id: 1 }).lean();
  const byKey = new Map();
  categories.forEach((c) => {
    c.market = marketOf(c);
    byKey.set(String(c._id), c);
    if (c.old_id != null) byKey.set(String(c.old_id), c);
  });
  return { categories, byKey };
}

const keysOfCategory = (c) => [c._id, ...(c.old_id != null ? [c.old_id, String(c.old_id)] : [])];

async function findAsset(id) {
  const value = String(id || '');
  if (isOid(value)) return Asset.findById(value).lean();
  if (/^\d+$/.test(value)) return Asset.findOne({ old_id: Number(value) }).lean();
  return null;
}

function back(req, fallback) {
  const ref = req.get('Referer') || '';
  return /\/market-assets(\?|$)/.test(ref) ? ref.replace(/^https?:\/\/[^/]+/, '') : fallback;
}

/** Validates the form. Returns { values, error, warning }. */
async function validateForm(body, { byKey, existing = null }) {
  const category = byKey.get(String(body.category_id || ''));
  const symbol = String(body.symbol || '').trim().toUpperCase();
  let name = String(body.name || '').trim();
  const imageUrl = String(body.image_url || '').trim();
  const status = body.status === 'inactive' ? 'inactive' : 'active';
  const values = { category_id: body.category_id || '', symbol, name, image_url: imageUrl, status };

  if (!category) return { values, error: 'Please choose a category.' };
  if (!symbol) return { values, error: 'The symbol field is required.' };
  if (!SYMBOL_RE.test(symbol)) return { values, error: 'The symbol may only contain letters, numbers and . - & ^ (max 25 characters).' };
  const market = category.market;
  if (market === 'crypto' && !/^[A-Z0-9]+-USD$/.test(symbol)) return { values, error: 'Crypto symbols must look like BTC-USD.' };
  if (market === 'uk' && !/\.L$/.test(symbol)) return { values, error: 'UK (London Stock Exchange) symbols must end in .L, e.g. SHEL.L.' };
  if ((market === 'us' || market === 'indian') && (/\.L$/.test(symbol) || /-USD$/.test(symbol))) {
    return { values, error: `${symbol} is not a ${MARKET_LABELS[market]} stock symbol.` };
  }
  if (name.length > 255) return { values, error: 'The name must not be greater than 255 characters.' };
  if (imageUrl && !/^https?:\/\/\S+$/i.test(imageUrl) && !/^\/?uploads\/\S+$/.test(imageUrl)) {
    return { values, error: 'The image URL must start with http:// or https://.' };
  }

  const duplicate = await Asset.findOne({
    symbol: new RegExp(`^${escapeRegex(symbol)}$`, 'i'),
    category_id: { $in: keysOfCategory(category) },
    ...(existing ? { _id: { $ne: existing._id } } : {}),
  }).select('_id').lean();
  if (duplicate) return { values, error: `${symbol} is already in ${category.name}.` };

  // US symbols: check on Twelve Data unless the symbol is unchanged on an existing US asset.
  let warning = null;
  const unchanged = existing && existing.symbol === symbol && marketOf(byKey.get(String(existing.category_id))) === 'us';
  if (market === 'us' && !unchanged) {
    const check = await twelveData.lookupUsSymbol(symbol);
    if (check.found === false) {
      return { values, error: `${symbol} was not found on any US exchange (Twelve Data). Please check the symbol.` };
    }
    if (check.error) warning = `${symbol} could not be verified with Twelve Data (${check.error}). Saved anyway; please double-check it.`;
    if (check.found && !name) { name = check.name; values.name = name; }
  }
  if (!name) return { values, error: 'The name field is required.' };

  return { values: { ...values, name }, category, warning };
}

const assets = {
  index: async (req, res) => {
    const { categories, byKey } = await loadCategories();
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const q = {
      category: byKey.has(String(req.query.category || '')) ? String(req.query.category) : '',
      market: MARKET_LABELS[req.query.market] ? req.query.market : '',
      status: ['active', 'inactive'].includes(req.query.status) ? req.query.status : '',
      search: String(req.query.search || '').trim().slice(0, 50),
    };
    const filter = {};
    if (q.category) filter.category_id = { $in: keysOfCategory(byKey.get(q.category)) };
    else if (q.market) filter.category_id = { $in: categories.filter((c) => c.market === q.market).flatMap(keysOfCategory) };
    if (q.status) filter.status = q.status === 'active' ? { $ne: 'inactive' } : 'inactive';
    if (q.search) {
      const re = new RegExp(escapeRegex(q.search), 'i');
      filter.$or = [{ symbol: re }, { name: re }];
    }
    const [rows, total, perCategory, brokenLogos] = await Promise.all([
      Asset.find(filter).sort({ symbol: 1, _id: 1 }).skip((page - 1) * PAGE_SIZE).limit(PAGE_SIZE).lean(),
      Asset.countDocuments(filter),
      Asset.aggregate([{ $group: { _id: '$category_id', n: { $sum: 1 } } }]),
      Asset.countDocuments(BROKEN_LOGO_FILTER),
    ]);
    const counts = new Map();
    perCategory.forEach((row) => {
      const c = byKey.get(String(row._id));
      if (c) counts.set(String(c._id), (counts.get(String(c._id)) || 0) + row.n);
    });
    const params = new URLSearchParams(Object.entries(q).filter(([, v]) => v));
    await render(res, 'assets/index', {
      title: 'Assets',
      assets: rows.map((a) => ({ ...a, category: byKey.get(String(a.category_id)) || null })),
      categories: categories.map((c) => ({ ...c, count: counts.get(String(c._id)) || 0 })),
      marketLabels: MARKET_LABELS,
      q,
      total,
      page,
      pages: Math.ceil(total / PAGE_SIZE),
      pageSize: PAGE_SIZE,
      queryString: params.toString(),
      brokenLogos,
      admin: req.session.admin,
    });
  },

  /** POST /market-assets/fix-logos — give every asset with a missing/broken logo its standard logo. */
  fixLogos: async (req, res) => {
    const { byKey } = await loadCategories();
    const broken = await Asset.find(BROKEN_LOGO_FILTER).select('_id symbol category_id').lean();
    let fixed = 0;
    for (const asset of broken) {
      const category = byKey.get(String(asset.category_id));
      const url = category && defaultLogoUrl(category.market, asset.symbol);
      if (!url) continue;
      await Asset.updateOne({ _id: asset._id }, { $set: { image_url: url, updated_at: new Date() } });
      fixed += 1;
    }
    req.flash('success', `Fixed ${fixed} logo(s).` + (broken.length > fixed ? ` ${broken.length - fixed} asset(s) have no category and were skipped.` : ''));
    res.redirect(back(req, '/market-assets'));
  },

  create: async (req, res) => {
    const { categories } = await loadCategories();
    await render(res, 'assets/form', {
      title: 'Add Asset', asset: null, categories, marketLabels: MARKET_LABELS,
      values: { category_id: String(req.query.category || ''), symbol: '', name: '', image_url: '', status: 'active' },
      admin: req.session.admin,
    });
  },

  store: async (req, res) => {
    const { categories, byKey } = await loadCategories();
    const { values, category, error, warning } = await validateForm(req.body, { byKey });
    if (error) {
      // Re-render with the admin's input; flash would only show on the next page.
      return render(res, 'assets/form', { error: [error], title: 'Add Asset', asset: null, categories, marketLabels: MARKET_LABELS, values, admin: req.session.admin });
    }
    const doc = await Asset.create({
      symbol: values.symbol,
      name: values.name,
      type: category.category_type === 'crypto' ? 'crypto' : 'stock',
      category_id: category._id,
      image_url: isBrokenLogo(values.image_url) ? defaultLogoUrl(category.market, values.symbol) : values.image_url,
      status: values.status,
    });
    await ensureOldId(Asset, doc);
    priceFeed._resetMarketCache();
    if (warning) req.flash('warning', warning);
    req.flash('success', `${values.symbol} added to ${category.name}.`);
    res.redirect(`/market-assets?category=${category._id}`);
  },

  edit: async (req, res) => {
    const asset = await findAsset(req.params.id);
    if (!asset) { req.flash('error', 'Asset not found'); return res.redirect('/market-assets'); }
    const { categories, byKey } = await loadCategories();
    const category = byKey.get(String(asset.category_id));
    await render(res, 'assets/form', {
      title: 'Edit Asset', asset, categories, marketLabels: MARKET_LABELS,
      values: { category_id: category ? String(category._id) : '', symbol: asset.symbol, name: asset.name, image_url: asset.image_url || '', status: asset.status || 'active' },
      admin: req.session.admin,
    });
  },

  update: async (req, res) => {
    const asset = await findAsset(req.params.id);
    if (!asset) { req.flash('error', 'Asset not found'); return res.redirect('/market-assets'); }
    const { categories, byKey } = await loadCategories();
    const { values, category, error, warning } = await validateForm(req.body, { byKey, existing: asset });
    if (error) {
      // Re-render with the admin's input; flash would only show on the next page.
      return render(res, 'assets/form', { error: [error], title: 'Edit Asset', asset, categories, marketLabels: MARKET_LABELS, values, admin: req.session.admin });
    }
    // Atomic update: migrated assets may not satisfy every schema rule (e.g. missing `type`).
    await Asset.updateOne({ _id: asset._id }, {
      $set: {
        symbol: values.symbol,
        name: values.name,
        type: category.category_type === 'crypto' ? 'crypto' : 'stock',
        category_id: category._id,
        image_url: isBrokenLogo(values.image_url) ? defaultLogoUrl(category.market, values.symbol) : values.image_url,
        status: values.status,
        updated_at: new Date(),
      },
    });
    priceFeed._resetMarketCache();
    if (warning) req.flash('warning', warning);
    req.flash('success', `${values.symbol} updated.`);
    res.redirect(`/market-assets?category=${category._id}`);
  },

  destroy: async (req, res) => {
    const asset = await findAsset(req.params.id);
    if (asset) await Asset.deleteOne({ _id: asset._id });
    priceFeed._resetMarketCache();
    req.flash('success', asset ? `${asset.symbol} deleted.` : 'Asset not found');
    res.redirect(back(req, '/market-assets'));
  },

  /** Bulk actions on selected assets: move | activate | deactivate | delete. */
  bulk: async (req, res) => {
    const ids = [].concat(req.body.asset_ids || req.body['asset_ids[]'] || []).map(String).filter(isOid);
    const action = String(req.body.action || '');
    const redirectTo = back(req, '/market-assets');
    if (!ids.length) { req.flash('error', 'Select at least one asset.'); return res.redirect(redirectTo); }
    const neededPermission = { move: 'assets.edit', activate: 'assets.edit', deactivate: 'assets.edit', delete: 'assets.delete' }[action];
    if (!neededPermission) { req.flash('error', 'Unknown action.'); return res.redirect(redirectTo); }
    if (!adminAccess.hasPermission(req.adminAccess, [neededPermission])) {
      req.flash('error', 'You do not have permission for this action.');
      return res.redirect(redirectTo);
    }
    const selected = await Asset.find({ _id: { $in: ids } }).lean();

    if (action === 'delete') {
      await Asset.deleteMany({ _id: { $in: selected.map((a) => a._id) } });
      req.flash('success', `Deleted ${selected.length} asset(s).`);
    } else if (action === 'activate' || action === 'deactivate') {
      const status = action === 'activate' ? 'active' : 'inactive';
      await Asset.updateMany({ _id: { $in: selected.map((a) => a._id) } }, { $set: { status, updated_at: new Date() } });
      req.flash('success', `${selected.length} asset(s) marked ${status}.`);
    } else {
      const { byKey } = await loadCategories();
      const target = byKey.get(String(req.body.target_category || ''));
      if (!target) { req.flash('error', 'Choose the category to move the assets to.'); return res.redirect(redirectTo); }
      const existingInTarget = new Set((await Asset.find({ category_id: { $in: keysOfCategory(target) } }).select('symbol').lean())
        .map((a) => String(a.symbol).toUpperCase()));
      const moved = [];
      const skipped = [];
      for (const asset of selected) {
        const from = byKey.get(String(asset.category_id));
        const sym = String(asset.symbol).toUpperCase();
        if (from && String(from._id) === String(target._id)) continue;
        if (from && from.market !== target.market) { skipped.push(`${asset.symbol} (${MARKET_LABELS[from.market]} → ${MARKET_LABELS[target.market]}: use Edit)`); continue; }
        if (existingInTarget.has(sym)) { skipped.push(`${asset.symbol} (already in ${target.name})`); continue; }
        existingInTarget.add(sym);
        moved.push(asset._id);
      }
      if (moved.length) {
        await Asset.updateMany({ _id: { $in: moved } }, {
          $set: { category_id: target._id, type: target.category_type === 'crypto' ? 'crypto' : 'stock', updated_at: new Date() },
        });
      }
      req.flash('success', `Moved ${moved.length} asset(s) to ${target.name}.`);
      if (skipped.length) req.flash('error', `Not moved: ${skipped.join(', ')}`);
    }
    priceFeed._resetMarketCache();
    res.redirect(redirectTo);
  },

  /** GET /market-assets/check-symbol?symbol=&category_id= — live check used by the form. */
  checkSymbol: async (req, res) => {
    const { byKey } = await loadCategories();
    const category = byKey.get(String(req.query.category_id || ''));
    const symbol = String(req.query.symbol || '').trim().toUpperCase();
    if (!symbol) return res.status(400).json({ success: false, message: 'Enter a symbol first.' });
    if (!category || category.market !== 'us') {
      return res.json({ success: true, checked: false, message: 'Online check is available for US stocks only.' });
    }
    const check = await twelveData.lookupUsSymbol(symbol);
    if (check.error) return res.json({ success: false, checked: false, message: `Could not reach Twelve Data: ${check.error}` });
    if (!check.found) return res.json({ success: true, checked: true, found: false, message: `${symbol} was not found on any US exchange.` });
    return res.json({ success: true, checked: true, found: true, name: check.name, exchange: check.exchange, message: `${symbol}: ${check.name} (${check.exchange})` });
  },
};

module.exports = { assets, marketOf };
