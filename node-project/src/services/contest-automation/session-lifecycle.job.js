'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: Contest Automation (port of the PHP scheduled commands)
 * Purpose: Move sessions upcoming → live → completed and capture their prices.
 * Origin: Port of PHP `league:update-status` (UpdateLeagueSessionStatus, every 30s).
 * Note: This feature must remain distinguishable from PHP-converted code.
 *
 * Per tick:
 *   1. upcoming → live when start_time ≤ now < end_time; live → completed when end_time ≤ now.
 *   2. Live sessions without captured start prices: contests → live, fetch missing start
 *      prices into session.assets, copy them to each entry's starting_prices, and store
 *      the prize preview. Marked done with start_prices_captured_at.
 *   3. Recently completed sessions: contests → completed, fetch missing end prices,
 *      copy them to each entry's ending_prices. Marked done with end_prices_captured_at.
 *
 * Safety differences from PHP:
 *   - Prices are only fetched within FETCH_WINDOW of the start/end time; a price taken
 *     hours late would be wrong. Failed fetches are retried every tick in that window.
 *   - Existing prices are never overwritten, and no fake prices are invented.
 *   - Cancelled contests are never moved back to live/completed (PHP updated all).
 *   - Only sessions the automation captured are later auto-scored, so historical
 *     (migrated) sessions are never touched.
 */

const LeagueSession = require('../../models/league-session.model');
const Contest = require('../../models/contest.model');
const ContestEntry = require('../../models/contest-entry.model');
const logger = require('../../config/logger');
const { keysOf } = require('../../helpers/mobile-compat');
const priceFeed = require('./price-feed');
const scoring = require('./contest-scoring');

const FETCH_WINDOW_MS = 30 * 60 * 1000;

const hasPrice = (asset, field) => Number(asset[field]) > 0;

/**
 * Fills missing `field` prices on the session's assets. Returns the updated session and
 * whether every asset that can be priced now has a price.
 */
async function fillMissingPrices(session, field, now) {
  const missing = (session.assets || []).filter((a) => a.asset_symbol && !hasPrice(a, field));
  if (!missing.length) return { session, complete: true, priced: 0 };

  const { prices, unsupported } = await priceFeed.getPrices(session, missing);
  const fresh = await LeagueSession.findById(session._id).lean(); // never overwrite a price set meanwhile
  const assets = (fresh.assets || []).map((asset) => {
    if (hasPrice(asset, field) || !prices.has(asset.asset_symbol)) return asset;
    return { ...asset, [field]: prices.get(asset.asset_symbol), [`${field}_fetched_at`]: now };
  });
  if (prices.size) await LeagueSession.updateOne({ _id: session._id }, { $set: { assets } });

  const stillMissing = assets.filter((a) => a.asset_symbol && !hasPrice(a, field) && !unsupported.includes(a.asset_symbol));
  return { session: { ...fresh, assets }, complete: stillMissing.length === 0, priced: prices.size };
}

/** Copies session prices into each entry (only the symbols in that entry's basket). */
async function copyToEntries(session, pricesBySymbol, field, timeField, now) {
  let updated = 0;
  for (const contest of await scoring.sessionContests(session)) {
    const entries = await scoring.contestEntries(contest);
    const baskets = await scoring.basketsFor(entries);
    for (const entry of entries) {
      const map = {};
      scoring.basketSymbols(baskets.get(String(entry.basket_id))).forEach((sym) => {
        if (pricesBySymbol[sym] > 0) map[sym] = pricesBySymbol[sym];
      });
      if (!Object.keys(map).length) continue;
      await ContestEntry.updateOne({ _id: entry._id }, { $set: { [field]: map, [timeField]: now } });
      updated += 1;
    }
  }
  return updated;
}

async function captureStart(session, now) {
  await Contest.updateMany(
    { league_session_id: { $in: keysOf(session) }, status: { $nin: ['cancelled', 'completed', 'live'] } },
    { $set: { status: 'live' } },
  );
  const allPriced = (session.assets || []).every((a) => !a.asset_symbol || hasPrice(a, 'start_price'));
  const inWindow = now - new Date(session.start_time) <= FETCH_WINDOW_MS;
  // Prices are only fetched inside the window; afterwards the session is finalised with
  // whatever start prices it already has (or skipped if it has none).
  const result = !allPriced && inWindow ? await fillMissingPrices(session, 'start_price', now) : { session, complete: allPriced };
  const { start } = scoring.sessionPriceMaps(result.session);
  if (!Object.keys(start).length) {
    logger.debug(`[contest-automation] session ${session._id}: no start prices${inWindow ? ' yet' : ' and fetch window passed; not auto-processed'}`);
    return false;
  }

  await copyToEntries(result.session, start, 'starting_prices', 'contest_started_at', now);
  if (!result.complete && inWindow) return false; // retry missing prices next tick

  for (const contest of await scoring.sessionContests(result.session)) {
    if (scoring.isFixedPrize(contest)) continue;
    const participants = await scoring.countParticipants(contest);
    if (participants > 0) await scoring.savePrizeRows(contest, participants); // prize preview, as PHP
  }
  await LeagueSession.updateOne({ _id: session._id }, { $set: { start_prices_captured_at: now } });
  logger.info(`[contest-automation] session ${session._id} started: ${Object.keys(start).length} start prices captured`);
  return true;
}

async function captureEnd(session, now) {
  await Contest.updateMany(
    { league_session_id: { $in: keysOf(session) }, status: { $nin: ['cancelled', 'completed'] } },
    { $set: { status: 'completed' } },
  );
  const result = await fillMissingPrices(session, 'end_price', now);
  const { end } = scoring.sessionPriceMaps(result.session);
  const windowOver = now - new Date(session.end_time) > FETCH_WINDOW_MS;
  if (!result.complete && !windowOver) return false;     // retry missing prices next tick
  if (!Object.keys(end).length) {
    logger.error(`[contest-automation] session ${session._id}: no end prices could be fetched; results need manual review`);
    return false;
  }
  await copyToEntries(result.session, end, 'ending_prices', 'contest_ended_at', now);
  await LeagueSession.updateOne({ _id: session._id }, { $set: { end_prices_captured_at: now } });
  logger.info(`[contest-automation] session ${session._id} ended: ${Object.keys(end).length} end prices captured`);
  return true;
}

async function runSessionLifecycle(now = new Date()) {
  const toLive = await LeagueSession.updateMany(
    { status: 'upcoming', start_time: { $lte: now }, end_time: { $gt: now } },
    { $set: { status: 'live' } },
  );
  const toCompleted = await LeagueSession.updateMany(
    { status: 'live', end_time: { $lte: now } },
    { $set: { status: 'completed' } },
  );

  let started = 0;
  for (const session of await LeagueSession.find({ status: 'live', start_prices_captured_at: null }).lean()) {
    if (await captureStart(session, now)) started += 1;
  }

  let ended = 0;
  const recent = await LeagueSession.find({
    status: 'completed',
    start_prices_captured_at: { $ne: null },
    end_prices_captured_at: null,
    end_time: { $gte: new Date(now.getTime() - FETCH_WINDOW_MS - 5 * 60 * 1000) },
  }).lean();
  for (const session of recent) {
    if (await captureEnd(session, now)) ended += 1;
  }

  return { to_live: toLive.modifiedCount || 0, to_completed: toCompleted.modifiedCount || 0, started, ended };
}

module.exports = { runSessionLifecycle, FETCH_WINDOW_MS };
