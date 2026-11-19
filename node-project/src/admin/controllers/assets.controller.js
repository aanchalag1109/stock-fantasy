'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: Admin → Assets — the central master list of stocks and coins.
 *          Redesigned (client feedback): assets no longer belong to a category. Each asset has a
 *          market (Indian Stock / US Stock / Crypto), a symbol, a name and a status; categories
 *          are assigned to assets per session (services/session-assets.service.js).
 *
 * Rules:
 *   - A symbol is unique within its market.
 *   - Symbol format follows the market so prices can be fetched: crypto "BTC-USD",
 *     US/Indian plain tickers.
 *   - US symbols are checked on Twelve Data (free reference lookup, no price credits) so
 *     typos are caught; an empty name is filled with the official company name. If Twelve Data
 *     cannot be reached the asset is saved with a warning instead of blocking the admin.
 *   - Sessions and templates keep their own copy of each asset, so editing or deleting here
 *     never changes an existing session.
 *   - An empty or broken logo (e.g. the PHP data's http://localhost/storage/stocks/*.png) is
 *     replaced with the market's standard logo URL (services/market-data/logos.js).
 *   - UK stocks were kept by the migration (inactive, market 'uk'); they can be viewed and
 *     edited but not added, since UK is not a market type for new sessions.
 */

const mongoose = require('mongoose');
const Asset = require('../../models/asset.model');
const { render } = require('../helpers/render');
const { ensureOldId } = require('../../helpers/mobile-compat');
const twelveData = require('../../services/market-data/twelve-data');
const priceFeed = require('../../services/contest-automation/price-feed');
const adminAccess = require('../../services/admin-access.service');
const markets = require('../../services/markets');
const { defaultLogoUrl, isBrokenLogo, BROKEN_LOGO_FILTER } = require('../../services/market-data/logos');

const PAGE_SIZE = 25;
const SYMBOL_RE = /^[A-Z0-9][A-Z0-9.&^-]{0,24}$/;

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isOid = (v) => String(v).length === 24 && mongoose.isValidObjectId(String(v));
const logoFor = (market, symbol, url) => (isBrokenLogo(url) ? defaultLogoUrl(markets.providerOf(market), symbol) : url);

// The unique { market, symbol } index is the final guard (e.g. two saves at the same moment).
const isDuplicateKey = (err) => err && err.code === 11000;
const duplicateMessage = ({ symbol, market }) => `${symbol} is already in the ${markets.labelOf(market)} list.`;

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
async function validateForm(body, { existing = null } = {}) {
  const market = String(body.market || '').trim();
  const symbol = String(body.symbol || '').trim().toUpperCase();
  let name = String(body.name || '').trim();
  const imageUrl = String(body.image_url || '').trim();
  const status = body.status === 'inactive' ? 'inactive' : 'active';
  const values = { market, symbol, name, image_url: imageUrl, status };

  // A legacy (UK) asset keeps its market when edited; nothing can be moved into it.
  const marketOk = markets.isMarket(market) || (existing && existing.market === market && markets.isKnownMarket(market));
  if (!marketOk) return { values, error: 'Please choose a market: Indian Stock, US Stock or Crypto.' };
  if (!symbol) return { values, error: 'The symbol field is required.' };
  if (!SYMBOL_RE.test(symbol)) return { values, error: 'The symbol may only contain letters, numbers and . - & ^ (max 25 characters).' };
  if (market === 'crypto' && !/^[A-Z0-9]+-USD$/.test(symbol)) return { values, error: 'Crypto symbols must look like BTC-USD.' };
  if (market === 'uk' && !/\.L$/.test(symbol)) return { values, error: 'UK (London Stock Exchange) symbols must end in .L, e.g. SHEL.L.' };
  if ((market === 'us_stock' || market === 'indian_stock') && (/\.L$/.test(symbol) || /-USD$/.test(symbol))) {
    return { values, error: `${symbol} is not a ${markets.labelOf(market)} symbol.` };
  }
  if (name.length > 255) return { values, error: 'The name must not be greater than 255 characters.' };
  if (imageUrl && !/^https?:\/\/\S+$/i.test(imageUrl) && !/^\/?uploads\/\S+$/.test(imageUrl)) {
    return { values, error: 'The image URL must start with http:// or https://.' };
  }

  const duplicate = await Asset.findOne({
    market,
    symbol: new RegExp(`^${escapeRegex(symbol)}$`, 'i'),
    ...(existing ? { _id: { $ne: existing._id } } : {}),
  }).select('_id').lean();
  if (duplicate) return { values, error: duplicateMessage(values) };

  // US symbols: check on Twelve Data unless the symbol is unchanged on an existing US asset.
  let warning = null;
  const unchanged = existing && existing.symbol === symbol && existing.market === 'us_stock';
  if (market === 'us_stock' && !unchanged) {
    const check = await twelveData.lookupUsSymbol(symbol);
    if (check.found === false) {
      return { values, error: `${symbol} was not found on any US exchange (Twelve Data). Please check the symbol.` };
    }
    if (check.error) warning = `${symbol} could not be verified with Twelve Data (${check.error}). Saved anyway; please double-check it.`;
    if (check.found && !name) { name = check.name; values.name = name; }
  }
  if (!name) return { values, error: 'The name field is required.' };

  return { values: { ...values, name }, warning };
}

const formView = (res, req, { asset = null, values, error = null }) => render(res, 'assets/form', {
  title: asset ? 'Edit Asset' : 'Add Asset',
  asset,
  values,
  marketOptions: markets.MARKETS,
  allMarkets: markets.ALL_MARKETS,
  ...(error ? { error: [error] } : {}),
  admin: req.session.admin,
});

const assets = {
  index: async (req, res) => {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const q = {
      market: markets.isKnownMarket(req.query.market) ? req.query.market : '',
      status: ['active', 'inactive'].includes(req.query.status) ? req.query.status : '',
      search: String(req.query.search || '').trim().slice(0, 50),
    };
    const filter = {};
    if (q.market) filter.market = q.market;
    if (q.status) filter.status = q.status === 'active' ? { $ne: 'inactive' } : 'inactive';
    if (q.search) {
      const re = new RegExp(escapeRegex(q.search), 'i');
      filter.$or = [{ symbol: re }, { name: re }];
    }
    const [rows, total, perMarket, brokenLogos] = await Promise.all([
      Asset.find(filter).sort({ symbol: 1, _id: 1 }).skip((page - 1) * PAGE_SIZE).limit(PAGE_SIZE).lean(),
      Asset.countDocuments(filter),
      Asset.aggregate([{ $group: { _id: '$market', n: { $sum: 1 } } }]),
      Asset.countDocuments(BROKEN_LOGO_FILTER),
    ]);
    const counts = Object.fromEntries(perMarket.map((row) => [row._id || '', row.n]));
    const params = new URLSearchParams(Object.entries(q).filter(([, v]) => v));
    await render(res, 'assets/index', {
      title: 'Assets',
      assets: rows,
      counts,
      marketOptions: markets.MARKETS,
      allMarkets: markets.ALL_MARKETS,
      providerOf: markets.providerOf,
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
    const broken = await Asset.find(BROKEN_LOGO_FILTER).select('_id symbol market').lean();
    let fixed = 0;
    for (const asset of broken) {
      const url = asset.market && defaultLogoUrl(markets.providerOf(asset.market), asset.symbol);
      if (!url) continue;
      await Asset.updateOne({ _id: asset._id }, { $set: { image_url: url, updated_at: new Date() } });
      fixed += 1;
    }
    req.flash('success', `Fixed ${fixed} logo(s).` + (broken.length > fixed ? ` ${broken.length - fixed} asset(s) have no market and were skipped.` : ''));
    res.redirect(back(req, '/market-assets'));
  },

  create: async (req, res) => {
    const market = markets.isMarket(req.query.market) ? req.query.market : '';
    await formView(res, req, { values: { market, symbol: '', name: '', image_url: '', status: 'active' } });
  },

  store: async (req, res) => {
    const { values, error, warning } = await validateForm(req.body);
    // Re-render with the admin's input; flash would only show on the next page.
    if (error) return formView(res, req, { values, error });
    let doc;
    try {
      doc = await Asset.create({
        symbol: values.symbol,
        name: values.name,
        market: values.market,
        type: markets.typeOf(values.market),
        image_url: logoFor(values.market, values.symbol, values.image_url),
        status: values.status,
      });
    } catch (err) {
      if (isDuplicateKey(err)) return formView(res, req, { values, error: duplicateMessage(values) });
      throw err;
    }
    await ensureOldId(Asset, doc);
    priceFeed._resetMarketCache();
    if (warning) req.flash('warning', warning);
    req.flash('success', `${values.symbol} added to the ${markets.labelOf(values.market)} list.`);
    res.redirect(`/market-assets?market=${values.market}`);
  },

  edit: async (req, res) => {
    const asset = await findAsset(req.params.id);
    if (!asset) { req.flash('error', 'Asset not found'); return res.redirect('/market-assets'); }
    await formView(res, req, {
      asset,
      values: { market: asset.market || '', symbol: asset.symbol, name: asset.name, image_url: asset.image_url || '', status: asset.status || 'active' },
    });
  },

  update: async (req, res) => {
    const asset = await findAsset(req.params.id);
    if (!asset) { req.flash('error', 'Asset not found'); return res.redirect('/market-assets'); }
    const { values, error, warning } = await validateForm(req.body, { existing: asset });
    if (error) return formView(res, req, { asset, values, error });
    // Atomic update: migrated assets may not satisfy every schema rule (e.g. missing `type`).
    try {
      await Asset.updateOne({ _id: asset._id }, {
        $set: {
          symbol: values.symbol,
          name: values.name,
          market: values.market,
          type: markets.typeOf(values.market),
          image_url: logoFor(values.market, values.symbol, values.image_url),
          status: values.status,
          updated_at: new Date(),
        },
      });
    } catch (err) {
      if (isDuplicateKey(err)) return formView(res, req, { asset, values, error: duplicateMessage(values) });
      throw err;
    }
    priceFeed._resetMarketCache();
    if (warning) req.flash('warning', warning);
    req.flash('success', `${values.symbol} updated.`);
    res.redirect(`/market-assets?market=${values.market}`);
  },

  destroy: async (req, res) => {
    const asset = await findAsset(req.params.id);
    if (asset) await Asset.deleteOne({ _id: asset._id });
    priceFeed._resetMarketCache();
    req.flash('success', asset ? `${asset.symbol} deleted.` : 'Asset not found');
    res.redirect(back(req, '/market-assets'));
  },

  /** Bulk actions on selected assets: activate | deactivate | delete. */
  bulk: async (req, res) => {
    const ids = [].concat(req.body.asset_ids || req.body['asset_ids[]'] || []).map(String).filter(isOid);
    const action = String(req.body.action || '');
    const redirectTo = back(req, '/market-assets');
    if (!ids.length) { req.flash('error', 'Select at least one asset.'); return res.redirect(redirectTo); }
    const neededPermission = { activate: 'assets.edit', deactivate: 'assets.edit', delete: 'assets.delete' }[action];
    if (!neededPermission) { req.flash('error', 'Unknown action.'); return res.redirect(redirectTo); }
    if (!adminAccess.hasPermission(req.adminAccess, [neededPermission])) {
      req.flash('error', 'You do not have permission for this action.');
      return res.redirect(redirectTo);
    }
    const selected = await Asset.find({ _id: { $in: ids } }).select('_id').lean();
    if (action === 'delete') {
      await Asset.deleteMany({ _id: { $in: selected.map((a) => a._id) } });
      req.flash('success', `Deleted ${selected.length} asset(s).`);
    } else {
      const status = action === 'activate' ? 'active' : 'inactive';
      await Asset.updateMany({ _id: { $in: selected.map((a) => a._id) } }, { $set: { status, updated_at: new Date() } });
      req.flash('success', `${selected.length} asset(s) marked ${status}.`);
    }
    priceFeed._resetMarketCache();
    res.redirect(redirectTo);
  },

  /** GET /market-assets/check-symbol?symbol=&market= — live check used by the form. */
  checkSymbol: async (req, res) => {
    const symbol = String(req.query.symbol || '').trim().toUpperCase();
    if (!symbol) return res.status(400).json({ success: false, message: 'Enter a symbol first.' });
    if (req.query.market !== 'us_stock') {
      return res.json({ success: true, checked: false, message: 'Online check is available for US stocks only.' });
    }
    const check = await twelveData.lookupUsSymbol(symbol);
    if (check.error) return res.json({ success: false, checked: false, message: `Could not reach Twelve Data: ${check.error}` });
    if (!check.found) return res.json({ success: true, checked: true, found: false, message: `${symbol} was not found on any US exchange.` });
    return res.json({ success: true, checked: true, found: true, name: check.name, exchange: check.exchange, message: `${symbol}: ${check.name} (${check.exchange})` });
  },
};

module.exports = { assets };
