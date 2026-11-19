'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Sets `market` (indian_stock | us_stock | crypto | uk) on assets that have none. Nothing else is
 * changed — no merging, deleting, status, type or category changes.
 *
 * The market comes from the asset's old category (e.g. "Large Cap US" → us_stock, a crypto category
 * → crypto), else from the symbol (BTC-USD → crypto, SHEL.L → uk). Assets whose market cannot be
 * worked out are listed and left alone. Assets that already have a market are never touched.
 *
 * Dry run (default, writes nothing):  node scripts/migration/set-asset-markets.js
 * Apply:                              node scripts/migration/set-asset-markets.js --apply
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const markets = require('../../src/services/markets');

const APPLY = process.argv.includes('--apply');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/proborzs_prob');
  const db = mongoose.connection.db;

  const categoryMarket = new Map();
  for (const c of await db.collection('markettypecategories').find({}).toArray()) {
    const market = markets.isKnownMarket(c.market) ? c.market : markets.marketFromLegacyCategory(c.name, c.category_type);
    categoryMarket.set(String(c._id), market);
    if (c.old_id != null) categoryMarket.set(String(c.old_id), market);
  }

  const assets = await db.collection('assets').find({ $or: [{ market: null }, { market: { $exists: false } }] })
    .project({ _id: 1, symbol: 1, category_id: 1 }).toArray();
  const plan = [];
  const unknown = [];
  for (const a of assets) {
    const market = (a.category_id != null && categoryMarket.get(String(a.category_id))) || markets.marketFromSymbol(a.symbol);
    if (market) plan.push({ _id: a._id, market });
    else unknown.push(`${a.symbol} (category_id ${a.category_id ?? '-'})`);
  }

  const count = plan.reduce((acc, p) => ({ ...acc, [p.market]: (acc[p.market] || 0) + 1 }), {});
  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'}: ${assets.length} asset(s) without market → ${JSON.stringify(count)}`);
  if (unknown.length) console.log(`  could not work out (left unchanged): ${unknown.join(', ')}`);

  if (APPLY) {
    let updated = 0;
    for (const p of plan) {
      // only while market is still empty — never overwrites a market set meanwhile
      const res = await db.collection('assets').updateOne({ _id: p._id, $or: [{ market: null }, { market: { $exists: false } }] }, { $set: { market: p.market } });
      updated += res.modifiedCount;
    }
    console.log(`Done: market set on ${updated} asset(s).`);
  } else {
    console.log('Nothing written. Re-run with --apply to save.');
  }
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
