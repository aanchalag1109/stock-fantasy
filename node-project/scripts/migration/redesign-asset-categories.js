#!/usr/bin/env node
'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: Asset, Market Category & Session redesign (client feedback)
 * Purpose: One-off data migration to the new model:
 *   1. Market categories get `market` (indian_stock | us_stock | crypto | uk), `min_assets`
 *      (default 1) and `description`; each keeps its name and numeric id. UK categories are
 *      set inactive (no UK market for new sessions).
 *   2. Assets become an independent master list: one row per (market, symbol). The copies of a
 *      symbol that existed once per category (e.g. AAPL in Small/Mid/Large Cap US) are merged
 *      into one, the global `category_id` is removed, and `market` + `type` are set. UK assets
 *      are kept but set inactive.
 *   3. Sessions and templates get `market` (from their market_type and category names) and
 *      sessions get a `categories` snapshot. Their asset ↔ category rows are NOT changed, so
 *      existing sessions, contests, baskets and scores are untouched.
 *
 * Safe to run more than once. Dry run by default; nothing is written without --apply, and with
 * --apply a JSON backup of the affected collections is written first.
 *
 *   node scripts/migration/redesign-asset-categories.js            # report only
 *   node scripts/migration/redesign-asset-categories.js --apply    # backup + migrate
 */

const path = require('path');
const fs = require('fs');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const config = require('../../src/config/env');
const Asset = require('../../src/models/asset.model');
const MarketTypeCategory = require('../../src/models/market-type-category.model');
const LeagueSession = require('../../src/models/league-session.model');
const SessionTemplate = require('../../src/models/session-template.model');
const markets = require('../../src/services/markets');

const APPLY = process.argv.includes('--apply');

function pickKeeper(rows) {
  // Keep the oldest row (lowest numeric id, then creation order) so existing ids stay valid.
  return rows.slice().sort((a, b) => ((a.old_id ?? Infinity) - (b.old_id ?? Infinity))
    || (new Date(a.created_at || 0) - new Date(b.created_at || 0)) || String(a._id).localeCompare(String(b._id)))[0];
}

const goodLogo = (url) => url && !/localhost|127\.0\.0\.1/.test(url);

async function plan() {
  const categories = await MarketTypeCategory.find({}).lean();
  const byKey = new Map();
  categories.forEach((c) => { byKey.set(String(c._id), c); if (c.old_id != null) byKey.set(String(c.old_id), c); });

  // 1. Categories
  const categoryUpdates = categories.map((c) => {
    const market = markets.isKnownMarket(c.market) ? c.market : markets.marketFromLegacyCategory(c.name, c.category_type);
    const set = {
      market,
      category_type: markets.typeOf(market),
      min_assets: Number.isInteger(c.min_assets) && c.min_assets >= 1 ? c.min_assets : 1,
      description: typeof c.description === 'string' ? c.description : '',
    };
    if (market === 'uk') set.status = 'inactive';
    return { _id: c._id, name: c.name, set };
  });
  const marketOfCategory = new Map();
  categoryUpdates.forEach((u) => {
    const c = categories.find((x) => String(x._id) === String(u._id));
    marketOfCategory.set(String(c._id), u.set.market);
    if (c.old_id != null) marketOfCategory.set(String(c.old_id), u.set.market);
  });

  // 2. Assets: group by (market, SYMBOL)
  const assets = await Asset.find({}).lean();
  const groups = new Map();
  assets.forEach((a) => {
    const market = (markets.isKnownMarket(a.market) && a.market)
      || (a.category_id != null && marketOfCategory.get(String(a.category_id)))
      || markets.marketFromSymbol(a.symbol)
      || 'indian_stock';
    const key = `${market}|${String(a.symbol).trim().toUpperCase()}`;
    if (!groups.has(key)) groups.set(key, { market, rows: [] });
    groups.get(key).rows.push(a);
  });
  const assetUpdates = [];
  const assetDeletes = [];
  groups.forEach(({ market, rows }) => {
    const keep = pickKeeper(rows);
    const anyActive = rows.some((r) => r.status !== 'inactive');
    const logo = [keep, ...rows].map((r) => r.image_url).find(goodLogo) || keep.image_url || null;
    const name = [keep, ...rows].map((r) => r.name).find((n) => n && String(n).trim()) || keep.symbol;
    assetUpdates.push({
      _id: keep._id,
      symbol: keep.symbol,
      set: {
        market,
        type: markets.typeOf(market),
        symbol: String(keep.symbol).trim().toUpperCase(),
        name,
        image_url: logo,
        status: market === 'uk' ? 'inactive' : (anyActive ? 'active' : 'inactive'),
      },
      unsetCategory: keep.category_id !== undefined,
    });
    rows.filter((r) => String(r._id) !== String(keep._id)).forEach((r) => assetDeletes.push(r._id));
  });

  // 3. Sessions and templates
  const minByCategory = new Map();
  categoryUpdates.forEach((u) => {
    const c = categories.find((x) => String(x._id) === String(u._id));
    minByCategory.set(String(c.old_id != null ? c.old_id : c._id), u.set.min_assets);
  });
  const sessions = await LeagueSession.find({}).select('market market_type assets.category_id assets.category_name categories').lean();
  const sessionUpdates = sessions.map((s) => {
    const market = markets.marketOfSession(s);
    const set = { market, market_type: markets.typeOf(market) };
    if (!Array.isArray(s.categories) || !s.categories.length) {
      const seen = new Map();
      (s.assets || []).forEach((a) => {
        if (a.category_id == null || seen.has(String(a.category_id))) return;
        seen.set(String(a.category_id), { category_id: a.category_id, category_name: a.category_name || '', min_assets: minByCategory.get(String(a.category_id)) || 1 });
      });
      set.categories = [...seen.values()];
    }
    return { _id: s._id, set };
  }).filter((u) => true);
  const templates = await SessionTemplate.find({}).lean();
  const templateUpdates = templates.map((t) => {
    const market = markets.marketOfSession(t);
    return { _id: t._id, name: t.template_name, set: { market, market_type: markets.typeOf(market) } };
  });

  return { categories, assets, categoryUpdates, assetUpdates, assetDeletes, sessionUpdates, templateUpdates, groups };
}

function report(p) {
  const count = (list, fn) => list.reduce((acc, x) => { const k = fn(x); acc[k] = (acc[k] || 0) + 1; return acc; }, {});
  console.log('\n=== Market categories ===');
  p.categoryUpdates.forEach((u) => console.log(`  ${u.name.padEnd(20)} → ${u.set.market.padEnd(13)} min ${u.set.min_assets}${u.set.status === 'inactive' ? '  (set inactive)' : ''}`));
  console.log('\n=== Assets ===');
  console.log(`  rows now: ${p.assets.length}`);
  console.log(`  master list after merge: ${p.assetUpdates.length}`, JSON.stringify(count(p.assetUpdates, (u) => u.set.market)));
  console.log(`  duplicate rows merged away: ${p.assetDeletes.length}`);
  console.log(`  inactive after merge: ${p.assetUpdates.filter((u) => u.set.status === 'inactive').length} (UK + previously inactive)`);
  console.log('\n=== Sessions ===');
  console.log(`  ${p.sessionUpdates.length} sessions →`, JSON.stringify(count(p.sessionUpdates, (u) => u.set.market)));
  console.log('\n=== Templates ===');
  p.templateUpdates.forEach((u) => console.log(`  ${u.name} → ${u.set.market}`));
}

async function backup() {
  const dir = path.resolve(__dirname, 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `asset-categories-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  const data = {
    created_at: new Date().toISOString(),
    market_type_categories: await MarketTypeCategory.find({}).lean(),
    assets: await Asset.find({}).lean(),
    league_sessions: await LeagueSession.find({}).select('_id old_id market market_type categories').lean(),
    session_templates: await SessionTemplate.find({}).select('_id old_id market market_type').lean(),
  };
  fs.writeFileSync(file, JSON.stringify(data));
  return file;
}

async function apply(p) {
  for (const u of p.categoryUpdates) await MarketTypeCategory.updateOne({ _id: u._id }, { $set: u.set });
  if (p.assetDeletes.length) await Asset.deleteMany({ _id: { $in: p.assetDeletes } });
  for (const u of p.assetUpdates) {
    await Asset.updateOne({ _id: u._id }, { $set: u.set, ...(u.unsetCategory ? { $unset: { category_id: '' } } : {}) });
  }
  // Rows without a category never had one; make sure no category_id is left anywhere.
  await Asset.updateMany({ category_id: { $exists: true } }, { $unset: { category_id: '' } });
  for (const u of p.sessionUpdates) await LeagueSession.updateOne({ _id: u._id }, { $set: u.set });
  for (const u of p.templateUpdates) await SessionTemplate.updateOne({ _id: u._id }, { $set: u.set });
}

async function main() {
  await mongoose.connect(config.MONGODB_URI || process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  const p = await plan();
  report(p);
  if (!APPLY) {
    console.log('\nDry run — nothing was changed. Re-run with --apply to back up and migrate.');
  } else {
    const file = await backup();
    console.log(`\nBackup written: ${file}`);
    await apply(p);
    console.log('Migration applied.');
  }
  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch((err) => { console.error('Migration failed:', err); process.exit(1); });
}

module.exports = { plan, apply };
