'use strict';

/**
 * PHP PARITY — Performance contest page tools that were missed in the conversion:
 *   verifyHistoricalPrices — PHP Admin\HistoricalPriceController ("🔍 Verify All Prices via API")
 *   analyzePriceErrors     — PHP Admin\PriceErrorAnalysisController ("🔍 Analyze Error Reasons")
 *   diagnostics            — the "How It Works" modal: system checks, step-by-step pool/prize
 *                            calculation, user-wise prizes, leaderboard and price-timing validation
 *                            (computed inline in PHP performance/show.blade.php)
 *
 * Notes kept from PHP: despite its name, "Verify Historical Prices" compares saved prices with
 * CURRENT market prices (CoinMarketCap → CoinGecko history → CoinGecko current; NSE → BSE), and
 * each result is labelled with its source.
 * Fix over PHP: PHP's BTC/ETH "extreme value" ranges were in rupees while prices are in USD, so
 * BTC was always reported as extreme; every coin now uses the general crypto range.
 */

const axios = require('axios');
const mongoose = require('mongoose');
const LeagueSession = require('../models/league-session.model');
const config = require('../config/env');
const { num } = require('../helpers/mobile-compat');

const NSE_HOST = 'indian-stock-market-data-nse-bse-bcd-mcx-cds-nfo.p.rapidapi.com';
const isOid = (v) => String(v).length === 24 && mongoose.isValidObjectId(String(v));

async function findSession(id) {
  const text = String(id || '');
  if (isOid(text)) { const s = await LeagueSession.findById(text).lean(); if (s) return s; }
  if (/^\d+$/.test(text)) return LeagueSession.findOne({ old_id: Number(text) }).lean();
  return null;
}

const ok = (response) => response && response.status >= 200 && response.status < 300;
const get = (url, opts) => axios.get(url, { timeout: 10000, validateStatus: () => true, ...opts });

// ─── Verify historical prices ────────────────────────────────────────────────

async function cryptoReferencePrice(symbol, at) {
  const clean = symbol.replace(/-USD$/i, '').toUpperCase();
  const lower = clean.toLowerCase();
  try {
    const cmc = await get('https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest', { headers: { 'X-CMC_PRO_API_KEY': config.CMC_API_KEY }, params: { symbol: clean } });
    const row = ok(cmc) && cmc.data && cmc.data.data ? cmc.data.data[clean] : null;
    const entry = Array.isArray(row) ? row[0] : row;
    const price = entry && entry.quote && entry.quote.USD && entry.quote.USD.price;
    if (price) return { price: num(price), source: 'CoinMarketCap (Current)', error: null };

    const d = new Date(at);
    const date = `${String(d.getUTCDate()).padStart(2, '0')}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${d.getUTCFullYear()}`;
    const hist = await get(`https://api.coingecko.com/api/v3/coins/${lower}/history`, { params: { date, localization: false } });
    const histPrice = ok(hist) && hist.data && hist.data.market_data && hist.data.market_data.current_price && hist.data.market_data.current_price.usd;
    if (histPrice) return { price: num(histPrice), source: 'CoinGecko Historical', error: null };

    const cur = await get('https://api.coingecko.com/api/v3/simple/price', { params: { ids: lower, vs_currencies: 'usd' }, timeout: 5000 });
    const curPrice = ok(cur) && cur.data && cur.data[lower] && cur.data[lower].usd;
    if (curPrice) return { price: num(curPrice), source: 'CoinGecko Current', error: null };
    return { price: 0, source: 'Multiple APIs', error: `No price data available for ${clean}` };
  } catch (err) {
    return { price: 0, source: 'Crypto APIs', error: err.message };
  }
}

async function stockReferencePrice(symbol, asset = {}) {
  // NEW IMPLEMENTATION — NODE.JS PROJECT: US assets are checked against Twelve Data
  const priceFeed = require('./contest-automation/price-feed');
  if (priceFeed.isUsStock(asset)) {
    const quote = await priceFeed.stockQuote(symbol, { market: 'us' });
    return quote ? { price: quote.price, source: 'Twelve Data (Current)', error: null } : { price: 0, source: 'Twelve Data', error: `No price data available for ${symbol}` };
  }
  if (priceFeed.isUkStock(asset)) return { price: 0, source: 'None', error: `No price provider for UK stock ${symbol}` };
  try {
    for (const exchange of ['NSE', 'BSE']) {
      const res = await get(`https://${NSE_HOST}/v1/rapidapi/stock/quote`, {
        headers: { 'x-rapidapi-host': NSE_HOST, 'x-rapidapi-key': config.RAPIDAPI_KEY },
        params: { tradingSymbol: symbol, exchange },
      });
      const price = ok(res) && res.data && num(res.data.lastPrice);
      if (price > 0) return { price, source: `RapidAPI ${exchange} (Current)`, error: null };
    }
    return { price: 0, source: 'RapidAPI', error: `No price data available for ${symbol}` };
  } catch (err) {
    return { price: 0, source: 'RapidAPI', error: err.message };
  }
}

async function verifyHistoricalPrices(sessionId) {
  const session = await findSession(sessionId);
  if (!session) return { success: false, error: 'Session not found' };
  const priced = (session.assets || []).filter((a) => a.asset_symbol && (num(a.start_price) > 0 || num(a.end_price) > 0));
  if (!priced.length) return { success: false, error: 'No saved prices found for this session' };

  const results = [];
  for (const asset of priced) {
    for (const [type, field, at] of [['start', 'start_price', session.start_time], ['end', 'end_price', session.end_time]]) {
      const ours = num(asset[field]);
      if (!(ours > 0)) continue;
      const ref = /-USD$/i.test(asset.asset_symbol) ? await cryptoReferencePrice(asset.asset_symbol, at) : await stockReferencePrice(asset.asset_symbol, asset);
      const row = {
        asset_symbol: asset.asset_symbol,
        price_type: type,
        our_price: ours,
        api_price: ref.price,
        api_source: ref.source,
        api_error: ref.error,
        timestamp: at ? new Date(at).toISOString() : null,
        difference_amount: 0,
        difference_percent: 0,
      };
      if (!ref.error && ref.price > 0) {
        row.difference_amount = ref.price - ours;
        row.difference_percent = (row.difference_amount / ours) * 100;
      }
      results.push(row);
    }
  }
  return {
    success: true,
    verification_results: results,
    session_details: { start_time: session.start_time, end_time: session.end_time, status: session.status },
  };
}

// ─── Analyze price errors ────────────────────────────────────────────────────

const RANGES = { stock: { min: 0.1, max: 100000 }, crypto: { min: 0.00000001, max: 1000000 } };

function analyzeOne(asset, type, value, fetchedAt, expected) {
  const label = `${type.charAt(0).toUpperCase()}${type.slice(1)} Price`;
  const errors = [];
  if (!(num(value) > 0)) {
    return [{
      asset_symbol: asset.asset_symbol, price_type: label, error_category: 'critical', error_title: 'Missing or Invalid Price',
      our_price: num(value), expected_price: null, difference_percent: 100,
      root_cause: 'API endpoint returned null/zero value or database constraint failed',
      impact_level: 'High - Contest calculations will be incorrect', timestamp: fetchedAt || new Date(),
      solutions: ['Check API endpoint connectivity and response format', 'Verify database constraints and data types', 'Implement fallback price sources', 'Add price validation before saving'],
      technical_details: `Price value: ${value == null ? 'NULL' : value}, Expected: > 0`,
    }];
  }
  if (fetchedAt && expected) {
    const diffMin = Math.floor(Math.abs(new Date(fetchedAt) - new Date(expected)) / 60000);
    if (diffMin > 30) {
      errors.push({
        asset_symbol: asset.asset_symbol, price_type: label, error_category: 'timing', error_title: 'Significant Timing Deviation',
        our_price: num(value), expected_price: null, difference_percent: 0,
        root_cause: `Price fetched ${diffMin} minutes ${new Date(fetchedAt) > new Date(expected) ? 'after' : 'before'} expected time`,
        impact_level: 'Medium - May affect contest fairness', timestamp: fetchedAt,
        solutions: ['Optimize cron job scheduling and execution time', 'Implement price caching with proper TTL', 'Add buffer time for API calls', 'Monitor system performance and API response times'],
        technical_details: `Expected: ${new Date(expected).toISOString()}, Actual: ${new Date(fetchedAt).toISOString()}`,
      });
    }
  }
  const range = /-USD$/i.test(asset.asset_symbol) ? RANGES.crypto : RANGES.stock;
  if (num(value) > range.max || num(value) < range.min) {
    errors.push({
      asset_symbol: asset.asset_symbol, price_type: label, error_category: 'data', error_title: 'Extreme Price Value',
      our_price: num(value), expected_price: (range.min + range.max) / 2, difference_percent: 0,
      root_cause: 'Price outside normal range - possible API data corruption or wrong symbol mapping',
      impact_level: 'High - Unrealistic price affects all calculations', timestamp: fetchedAt || new Date(),
      solutions: ['Verify asset symbol mapping in API calls', 'Implement price range validation', 'Add historical price comparison checks', 'Set up alerts for extreme price movements'],
      technical_details: `Price: ${value}, Expected range: ${range.min} - ${range.max}`,
    });
  }
  if (type === 'end' && num(asset.start_price) > 0 && Math.abs(num(value) - num(asset.start_price)) < 0.01) {
    errors.push({
      asset_symbol: asset.asset_symbol, price_type: 'End Price', error_category: 'api', error_title: 'No Price Movement Detected',
      our_price: num(value), expected_price: num(asset.start_price), difference_percent: 0,
      root_cause: 'End price identical to start price - API may not have updated or market was closed',
      impact_level: 'Medium - Zero returns for all participants', timestamp: fetchedAt || new Date(),
      solutions: ['Check if market was open during session time', 'Verify API is returning real-time data', 'Implement market hours validation', 'Add minimum price movement threshold'],
      technical_details: `Start: ${asset.start_price}, End: ${value}, Difference: ${Math.abs(num(value) - num(asset.start_price))}`,
    });
  }
  return errors;
}

async function analyzePriceErrors(sessionId) {
  const session = await findSession(sessionId);
  if (!session) return { success: false, error: 'Session not found' };
  const results = [];
  (session.assets || []).filter((a) => a.asset_symbol).forEach((asset) => {
    // PHP analysed only rows that had a price; an asset with no price at all is flagged as missing.
    if (asset.start_price != null || asset.end_price == null) results.push(...analyzeOne(asset, 'start', asset.start_price, asset.start_price_fetched_at, session.start_time));
    if (asset.end_price != null) results.push(...analyzeOne(asset, 'end', asset.end_price, asset.end_price_fetched_at, session.end_time));
  });
  return { success: true, analysis_results: results };
}

// ─── "How It Works" diagnostics ──────────────────────────────────────────────

function timing(asset, field, expected, label) {
  const at = asset[`${field}_fetched_at`];
  if (!at) return { type: 'warning', asset: asset.asset_symbol, price_type: label, expected_time: expected, actual_time: null, difference: 'unknown', message: 'Fetch time not recorded' };
  const diff = Math.floor(Math.abs(new Date(at) - new Date(expected)) / 60000);
  const late = new Date(at) > new Date(expected);
  const base = { asset: asset.asset_symbol, price_type: label, expected_time: expected, actual_time: at, difference: `${diff} minutes ${late ? 'late' : 'early'}` };
  if (diff > 30) return { ...base, type: 'error', message: `${label} taken ${diff} minutes ${late ? 'after' : 'before'} session ${label === 'Start Price' ? 'start' : 'end'}` };
  if (diff > 10) return { ...base, type: 'warning', message: `${label} timing acceptable but not optimal` };
  return { ...base, type: 'success', message: 'Perfect timing - within acceptable range' };
}

/**
 * Everything the "How It Works" modal shows, computed from the data the page already loads.
 * @param {object} p { contest, session, participants, stats, flexibleDistribution, transactionCount }
 */
function diagnostics({ contest, session, participants, stats, flexibleDistribution, transactionCount }) {
  const checks = [];
  const add = (type, title, message) => checks.push({ type, title, message });
  const status = contest.session_status;
  const dist = flexibleDistribution || [];
  const participantCount = participants.length;

  add(contest && contest._id ? 'success' : 'error', contest && contest._id ? 'Contest Data Valid' : 'Contest Data Missing',
    contest && contest._id ? `Contest ID: ${contest.old_id != null ? contest.old_id : contest._id} loaded successfully` : 'Contest object is null or missing ID');
  if (['upcoming', 'live', 'completed'].includes(status)) add('success', 'Session Status Valid', `Status: ${String(status).toUpperCase()}`);
  else add('error', 'Invalid Session Status', `Status: "${status || 'NULL'}" is not valid. Expected: upcoming/live/completed`);
  if (participantCount === 0) add('warning', 'No Participants', 'Contest has 0 participants. This may be normal for new contests.');
  else add('success', 'Participants Found', `${participantCount} participants joined this contest`);
  if (!dist.length) add('error', 'Prize Distribution Missing', 'No prize distribution structure found. Winners cannot be determined.');
  else {
    const total = dist.reduce((s, d) => s + num(d.percent), 0);
    if (total > 105 || total < 95) add('warning', 'Prize Distribution Issue', `Total distribution: ${total.toFixed(2)}%. Should be ~100%`);
    else add('success', 'Prize Distribution Valid', `${dist.length} prize groups, Total: ${total.toFixed(2)}%`);
  }
  const entryFee = num(contest.entry_fee);
  const expectedPool = stats.total_participants * entryFee;
  if (Math.abs(expectedPool - num(stats.total_pool_generated)) > 1) add('error', 'Pool Calculation Error', `Expected: ₹${expectedPool}, Actual: ₹${stats.total_pool_generated}`);
  else add('success', 'Pool Calculation Correct', `Pool: ₹${num(stats.total_pool_generated)} (${stats.total_participants} × ₹${entryFee})`);
  const assets = ((session && session.assets) || []).filter((a) => a.asset_symbol);
  const startCount = assets.filter((a) => num(a.start_price) > 0).length;
  const endCount = assets.filter((a) => num(a.end_price) > 0).length;
  if (status === 'live' && startCount === 0) add('error', 'Missing Start Prices', 'Session is LIVE but no start prices found. Scores cannot be calculated.');
  else if (status === 'completed' && endCount === 0) add('error', 'Missing End Prices', 'Session is COMPLETED but no end prices found. Final scores may be incorrect.');
  else add('success', 'Price Data Available', `Start: ${startCount}, End: ${endCount} prices found`);
  if (participantCount > 0 && !transactionCount) add('warning', 'No Transactions Found', 'Participants exist but no transactions found. Entry fees may not be processed.');
  else add('success', 'Transactions Found', `${transactionCount || 0} transactions found for this contest`);
  const winningPct = contest.winning_percentage == null ? 30 : num(contest.winning_percentage);
  const expectedWinners = Math.ceil((stats.total_participants * winningPct) / 100);
  if (participantCount > 0 && Math.abs(expectedWinners - num(stats.actual_winners)) > 1) add('warning', 'Winner Count Mismatch', `Expected: ${expectedWinners} winners, Actual: ${stats.actual_winners} winners`);
  else add('success', 'Winner Count Valid', `${stats.actual_winners} winners from ${stats.total_participants} participants`);

  // Steps 1–6
  const platformPct = num(contest.platform_fee);
  const totalPool = stats.total_participants * entryFee;
  const platformFee = (totalPool * platformPct) / 100;
  const prizePool = totalPool - platformFee;
  const totalWinners = Math.ceil((stats.total_participants * winningPct) / 100);

  // Step 8: user-wise prizes (ties share a rank)
  const sorted = participants.slice().sort((a, b) => num(b.total_score) - num(a.total_score));
  const winners = [];
  let rank = 1;
  let prev = null;
  sorted.forEach((p, i) => {
    if (prev === null || num(p.total_score) !== prev) rank = i + 1;
    prev = num(p.total_score);
    const group = dist.find((d) => {
      const m = String(d.label || '').match(/Ranks (\d+)-(\d+)/);
      return m && rank >= Number(m[1]) && rank <= Number(m[2]);
    });
    if (group && num(group.perWinner) > 0) winners.push({ rank, user_id: p.user_id, user_name: p.user_name || `User ${p.user_id}`, user_mobile: p.user_mobile || 'N/A', score: num(p.total_score), prize: num(group.perWinner), prize_group: group.label });
  });

  // Step 10: price timing
  const timings = [];
  if (session) {
    assets.forEach((a) => { if (num(a.start_price) > 0) timings.push(timing(a, 'start_price', session.start_time, 'Start Price')); });
    assets.forEach((a) => { if (num(a.end_price) > 0) timings.push(timing(a, 'end_price', session.end_time, 'End Price')); });
  }

  return {
    checks,
    errorCount: checks.filter((c) => c.type === 'error').length,
    warningCount: checks.filter((c) => c.type === 'warning').length,
    steps: { participants: stats.total_participants, entryFee, platformPct, winningPct, totalPool, platformFee, prizePool, totalWinners },
    distributed: dist.reduce((s, d) => s + num(d.perWinner) * num(d.winners), 0),
    winners,
    winnersTotal: winners.reduce((s, w) => s + w.prize, 0),
    leaderboard: sorted.map((p, i) => ({ rank: i + 1, user_id: p.user_id, user_name: p.user_name || `User ${p.user_id}`, user_mobile: p.user_mobile || 'N/A', score: num(p.total_score), winnings_balance: num(p.winnings_balance), winner: i + 1 <= totalWinners })),
    timings,
    timingErrors: timings.filter((t) => t.type === 'error').length,
    timingWarnings: timings.filter((t) => t.type === 'warning').length,
    prices: assets.map((a) => ({
      symbol: a.asset_symbol,
      start: num(a.start_price) > 0 ? num(a.start_price) : null,
      start_at: a.start_price_fetched_at || null,
      end: num(a.end_price) > 0 ? num(a.end_price) : null,
      end_at: a.end_price_fetched_at || null,
    })),
  };
}

module.exports = { verifyHistoricalPrices, analyzePriceErrors, diagnostics };
