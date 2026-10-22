'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: Contest Automation (port of the PHP scheduled commands)
 * Purpose: Refresh scores and ranks of contests in live sessions.
 * Origin: Port of PHP `contest:update-live-scores` (UpdateLiveScores, every 15 min).
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

const hasStartPrices = (entry) => entry.starting_prices && typeof entry.starting_prices === 'object'
  && Object.keys(entry.starting_prices).length > 0;

async function runLiveScores() {
  const sessions = await LeagueSession.find({ status: 'live', start_prices_captured_at: { $ne: null } }).lean();
  let contestsUpdated = 0;
  for (const session of sessions) {
    const { prices } = await priceFeed.getPrices(session, session.assets || []);
    if (!prices.size) {
      logger.warn(`[contest-automation] live scores: no current prices for session ${session._id}`);
      continue;
    }
    const current = Object.fromEntries(prices);
    const { start } = scoring.sessionPriceMaps(session);
    for (const contest of await scoring.sessionContests(session)) {
      const entries = await scoring.contestEntries(contest);
      const withStart = entries.filter(hasStartPrices);
      if (!withStart.length) continue;
      const scored = new Map((await scoring.scoreEntries(withStart, start, current)).map((e) => [String(e._id), e]));
      await scoring.assignRanks(entries.map((e) => scored.get(String(e._id)) || e));
      contestsUpdated += 1;
    }
  }
  return { sessions: sessions.length, contests_updated: contestsUpdated };
}

module.exports = { runLiveScores };
