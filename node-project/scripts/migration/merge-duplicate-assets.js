#!/usr/bin/env node
'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Purpose: Remove duplicate assets left over from the PHP data, then make the database refuse
 *          new ones.
 *
 * Why duplicates exist: in PHP an asset row belonged to one category, so a stock offered in 3
 * categories was stored 3 times (crypto coins re-imported later have 5 copies). The migration
 * copied every PHP row. Assets no longer have categories, so the copies are pure duplicates.
 *
 * What it does:
 *   1. Groups assets by (market, SYMBOL). In each group it keeps the row with the lowest old_id,
 *      gives it the best name/logo of the group, keeps it active if any copy was active, and
 *      deletes the other copies.
 *      Safe: nothing references an asset by its id — sessions, templates, baskets, entries and
 *      price feeds all store the symbol — so no other collection needs changing.
 *   2. Replaces the plain { market, symbol } index with a UNIQUE one.
 *
 * Dry run by default. With --apply a JSON backup of all assets is written first.
 *
 *   node scripts/migration/merge-duplicate-assets.js            # report only
 *   node scripts/migration/merge-duplicate-assets.js --apply    # backup + merge + unique index
 */

const path = require('path');
const fs = require('fs');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const config = require('../../src/config/env');
const Asset = require('../../src/models/asset.model');

const APPLY = process.argv.includes('--apply');
const INDEX_KEY = { market: 1, symbol: 1 };

const goodLogo = (url) => url && !/localhost|127\.0\.0\.1/.test(url);

function pickKeeper(rows) {
  // Lowest numeric id first (the original PHP row), then oldest, then _id.
  return rows.slice().sort((a, b) => ((a.old_id ?? Infinity) - (b.old_id ?? Infinity))
    || (new Date(a.created_at || 0) - new Date(b.created_at || 0))
    || String(a._id).localeCompare(String(b._id)))[0];
}

/** Pure: builds the merge plan from a list of asset rows. */
function planMerge(assets) {
  const groups = new Map();
  assets.forEach((a) => {
    const key = `${a.market || ''}|${String(a.symbol || '').trim().toUpperCase()}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(a);
  });
  const updates = [];
  const deletes = [];
  groups.forEach((rows) => {
    if (rows.length < 2) return;
    const keep = pickKeeper(rows);
    const ordered = [keep, ...rows.filter((r) => r !== keep)];
    updates.push({
      _id: keep._id,
      old_id: keep.old_id,
      symbol: String(keep.symbol).trim().toUpperCase(),
      market: keep.market,
      copies: rows.length,
      set: {
        symbol: String(keep.symbol).trim().toUpperCase(),
        name: ordered.map((r) => r.name).find((n) => n && String(n).trim()) || keep.symbol,
        image_url: ordered.map((r) => r.image_url).find(goodLogo) || keep.image_url || null,
        status: rows.some((r) => r.status !== 'inactive') ? 'active' : 'inactive',
      },
    });
    rows.filter((r) => r !== keep).forEach((r) => deletes.push(r._id));
  });
  return { total: assets.length, groups: groups.size, updates, deletes };
}

function report(p) {
  const byMarket = {};
  p.updates.forEach((u) => { byMarket[u.market] = (byMarket[u.market] || 0) + (u.copies - 1); });
  console.log(`Assets now:                 ${p.total}`);
  console.log(`Symbols with duplicates:    ${p.updates.length}`);
  console.log(`Duplicate rows to delete:   ${p.deletes.length}`, JSON.stringify(byMarket));
  console.log(`Assets after merge:         ${p.groups}`);
  console.log('Examples:');
  p.updates.slice(0, 5).forEach((u) => console.log(`  ${u.market} ${u.symbol}: ${u.copies} copies → keep old_id ${u.old_id}`));
}

async function backup() {
  const dir = path.resolve(__dirname, 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `assets-before-merge-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(file, JSON.stringify({ created_at: new Date().toISOString(), assets: await Asset.find({}).lean() }));
  return file;
}

async function makeIndexUnique() {
  const indexes = await Asset.collection.indexes();
  const existing = indexes.find((i) => JSON.stringify(i.key) === JSON.stringify(INDEX_KEY));
  if (existing && existing.unique) return 'already unique';
  if (existing) await Asset.collection.dropIndex(existing.name);
  await Asset.collection.createIndex(INDEX_KEY, { unique: true, name: 'market_1_symbol_1' });
  return 'created';
}

async function main() {
  await mongoose.connect(config.MONGODB_URI || process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  const p = planMerge(await Asset.find({}).lean());
  report(p);
  if (!APPLY) {
    console.log('\nDry run — nothing was changed. Re-run with --apply to back up, merge and add the unique index.');
  } else {
    console.log(`\nBackup written: ${await backup()}`);
    if (p.deletes.length) await Asset.deleteMany({ _id: { $in: p.deletes } });
    for (const u of p.updates) await Asset.updateOne({ _id: u._id }, { $set: { ...u.set, updated_at: new Date() } });
    console.log(`Deleted ${p.deletes.length} duplicate rows; ${await Asset.countDocuments()} assets remain.`);
    console.log(`Unique { market, symbol } index: ${await makeIndexUnique()}.`);
  }
  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch((err) => { console.error('Merge failed:', err); process.exit(1); });
}

module.exports = { planMerge, pickKeeper };
