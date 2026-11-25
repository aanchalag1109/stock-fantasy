'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: Contest Automation (port of the PHP scheduled commands)
 * Purpose: Refresh scores and ranks of contests in live sessions.
 * Origin: Port of PHP `contest:update-live-scores` (UpdateLiveScores; runs every 5 min as PHP's live score phase did).
 * Note: This feature must remain distinguishable from PHP-converted code.
 *
 * Entries with starting prices are scored against current prices, then every entry of
 * the contest is re-ranked. Difference from PHP: each symbol's price is fetched once
 * per session per run (PHP fetched it again for every asset of every entry).
 */

const LeagueSession = require('../../models/league-session.model');
const logger = require('../../config/logger');
const priceFeed = require('./price-feed');
const scoring = require('./contest-scoring');
// NEW IMPLEMENTATION — NODE.JS PROJECT (client feedback): 5-minute price history of every session stock
const { saveReading } = require('../session-stocks.service');

const hasStartPrices = (entry) => entry.starting_prices && typeof entry.starting_prices === 'object'
  && Object.keys(entry.starting_prices).length > 0;

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT: keeps the latest prices on the session (assets[].live_price),
 * so the app's contest screen can show live points per stock. One atomic update per symbol, so a
 * start/end price written at the same moment by the lifecycle job is never overwritten.
 */
async function saveLivePrices(session, prices, now) {
  for (const [symbol, price] of prices) {
    await LeagueSession.updateOne(
      { _id: session._id, 'assets.asset_symbol': symbol },
      { $set: { 'assets.$.live_price': price, 'assets.$.live_price_at': now } },
    );
  }
  await LeagueSession.updateOne({ _id: session._id }, { $set: { live_prices_at: now } });
}

/** Fetches current prices for one live session, stores them, and re-scores and re-ranks its contests. */
async function refreshSession(session, now = new Date()) {
  const { prices } = await priceFeed.getPrices(session, session.assets || []);
  if (!prices.size) {
    logger.warn(`[contest-automation] live scores: no current prices for session ${session._id}`);
    return 0;
  }
  await saveLivePrices(session, prices, now);
  await saveReading(session, prices, now); // NEW IMPLEMENTATION — NODE.JS PROJECT: never throws
  const current = Object.fromEntries(prices);
  const { start } = scoring.sessionPriceMaps(session);
  let contestsUpdated = 0;
  for (const contest of await scoring.sessionContests(session)) {
    const entries = await scoring.contestEntries(contest);
    const withStart = entries.filter(hasStartPrices);
    if (!withStart.length) continue;
    const scored = new Map((await scoring.scoreEntries(withStart, start, current)).map((e) => [String(e._id), e]));
    await scoring.assignRanks(entries.map((e) => scored.get(String(e._id)) || e));
    contestsUpdated += 1;
  }
  return contestsUpdated;
}

async function runLiveScores(now = new Date()) {
  const sessions = await LeagueSession.find({ status: 'live', start_prices_captured_at: { $ne: null }, run_all_active: { $ne: true } }).lean();
  let contestsUpdated = 0;
  for (const session of sessions) {
    try {
      contestsUpdated += await refreshSession(session, now);
    } catch (err) {
      logger.error(`[contest-automation] live scores: session ${session._id} failed: ${err.message}`);
    }
  }
  return { sessions: sessions.length, contests_updated: contestsUpdated };
}

module.exports = { runLiveScores, refreshSession, saveLivePrices };
