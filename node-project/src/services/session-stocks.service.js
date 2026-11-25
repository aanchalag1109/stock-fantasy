'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT (client feedback)
 *
 * Feature: Session stock list — like the players' points list of a fantasy match: every stock of the
 *          session with its price and +/- % from the session start, refreshed by the 5-minute live price
 *          call, its readings from start to end, and the final gain/loss. The app (GET /session-stats)
 *          and the admin (Session Stocks) use the same calculation.
 *
 *   - % and points use the prices the contest result uses: assets[].start_price and, once the session
 *     has ended, assets[].end_price. While it is live: assets[].live_price (live-scores job).
 *   - A price that could not be fetched is never invented: the last known one stays, with its time.
 *   - points = what an UP pick without a multiplier scores (scoreAssets(), as the leaderboard).
 */

const Asset = require('../models/asset.model');
const LeagueSession = require('../models/league-session.model');
const SessionPriceReading = require('../models/session-price-reading.model');
const logger = require('../config/logger');
const markets = require('./markets');
const { istDay, csvCell, istDateTime } = require('./admin-user-export.service');
const { MARKETS, SESSION_STATUSES, PAGE_SIZES, queryString, idOf } = require('./league-contests.service');
const { num, absoluteUrl, scoreAssets } = require('../helpers/mobile-compat');

/** Missing end prices are retried this long (session-lifecycle.job.js); after it they stay missing. */
const END_PRICE_WINDOW_MS = 30 * 60 * 1000;
const REFRESH_SECONDS = 300; // the live-scores job

const PHASES = {
  not_started: 'Not started',
  live: 'Live',
  finalising: 'Waiting for final prices',
  final: 'Final',
  cancelled: 'Cancelled',
};
const DIRECTIONS = { up: 'Gainers', down: 'Losers', flat: 'No change', no_price: 'Price missing' };
const STOCK_SORTS = { gain: 'Biggest gain first', loss: 'Biggest loss first', name: 'Name', category: 'Category' };

const round = (n, digits) => Number(Number(n).toFixed(digits));
/** Price difference: 4 decimals; more for coins that cost a fraction of a unit. */
const roundPrice = (n, price) => round(n, Math.abs(price) < 1 ? 10 : 4);

// ── Saving the readings ─────────────────────────────────────────────────────

/** Keeps one live price call. Never throws: a failure here must not stop the live scores. */
async function saveReading(session, prices, at) {
  try {
    const list = [...prices].filter(([symbol, price]) => symbol && num(price) > 0).map(([symbol, price]) => ({ symbol, price: num(price) }));
    if (!list.length) return false;
    await SessionPriceReading.updateOne({ session_id: session._id, at }, { $set: { prices: list } }, { upsert: true });
    return true;
  } catch (err) {
    logger.warn(`[session-stocks] session ${session._id}: price reading not saved: ${err.message}`);
    return false;
  }
}

// ── The list ────────────────────────────────────────────────────────────────

const isEnded = (session) => ['completed', 'completing'].includes(session.status);
const hasStarted = (phase) => phase !== 'not_started' && phase !== 'cancelled';

function phaseOf(session, now = new Date()) {
  if (session.status === 'cancelled') return 'cancelled';
  if (session.status === 'live') return session.end_time && now >= new Date(session.end_time) ? 'finalising' : 'live';
  if (!isEnded(session)) return 'not_started';
  if (session.end_prices_captured_at) return 'final';
  const priced = (session.assets || []).filter((a) => a.asset_symbol && num(a.start_price) > 0);
  const ended = priced.filter((a) => num(a.end_price) > 0);
  if (!ended.length) return 'finalising';
  return ended.length === priced.length || now - new Date(session.end_time) > END_PRICE_WINDOW_MS ? 'final' : 'finalising';
}

/** Price, +/- and points of `price` against `start`. (+ 0 turns -0 into 0.) */
function change(symbol, start, price) {
  const percent = round(((price - start) / start) * 100, 4) + 0;
  const { total } = scoreAssets([{ symbol }], [{ multiplier: 1, prediction: 'UP' }], { start: { [symbol]: start }, end: { [symbol]: price }, started: true });
  return {
    change_amount: roundPrice(price - start, start) + 0,
    change_percent: percent,
    points: round(total, 0) + 0,
    direction: percent > 0 ? 'up' : percent < 0 ? 'down' : 'flat',
  };
}

/**
 * Every stock of the session once (a symbol listed twice uses its first row that has a start price).
 * Stocks without a start price are included with has_start_price: false (they score 0).
 */
function rowsOf(session, phase, info = new Map()) {
  const bySymbol = new Map();
  (session.assets || []).forEach((a) => {
    if (!a.asset_symbol) return;
    const known = bySymbol.get(a.asset_symbol);
    if (!known || (!(num(known.start_price) > 0) && num(a.start_price) > 0)) bySymbol.set(a.asset_symbol, a);
  });
  return [...bySymbol.values()].map((a) => {
    const asset = info.get(a.asset_symbol) || {};
    const start = num(a.start_price) > 0 ? num(a.start_price) : null;
    const base = {
      symbol: a.asset_symbol,
      name: a.asset_name || asset.name || a.asset_symbol,
      category_id: a.category_id != null ? a.category_id : null,
      category_name: a.category_name || null,
      image_url: asset.image_url ? absoluteUrl(asset.image_url) : null,
      has_start_price: start != null,
      start_price: start,
      start_at: a.start_price_fetched_at || session.start_time || null,
    };
    if (start == null) {
      return { ...base, current_price: null, change_amount: null, change_percent: null, points: 0, direction: 'no_price', price_type: 'none', is_final: false, price_at: null };
    }
    const end = num(a.end_price) > 0 ? num(a.end_price) : null;
    const live = num(a.live_price) > 0 ? num(a.live_price) : null;
    let shown;
    if (end != null) shown = ['end', end, a.end_price_fetched_at || session.end_time];
    // After the result, a stock without an end price scored 0: its last live price is not its result.
    else if (phase === 'final') shown = ['missing', start, null];
    else if (live != null) shown = ['live', live, a.live_price_at];
    else shown = ['start', start, base.start_at];
    const [type, price, at] = shown;
    const row = { ...base, current_price: price, ...change(a.asset_symbol, start, price), price_type: type, is_final: phase === 'final' && type === 'end', price_at: at || null };
    return type === 'missing' ? { ...row, direction: 'no_price' } : row;
  });
}

const byName = (a, b) => String(a.name).localeCompare(String(b.name));
const SORTERS = {
  gain: (a, b) => b.change_percent - a.change_percent || byName(a, b),
  loss: (a, b) => a.change_percent - b.change_percent || byName(a, b),
  name: byName,
  category: (a, b) => String(a.category_name || '~').localeCompare(String(b.category_name || '~')) || SORTERS.gain(a, b),
};
/** Stocks without a price always come last. */
const sortRows = (rows, sort) => [...rows].sort((a, b) => Number(a.direction === 'no_price') - Number(b.direction === 'no_price') || SORTERS[sort](a, b));

/** Master-list details (name, logo). A symbol listed in two markets uses the session's own market. */
async function assetInfo(session) {
  const symbols = [...new Set((session.assets || []).map((a) => a.asset_symbol).filter(Boolean))];
  const assets = symbols.length ? await Asset.find({ symbol: { $in: symbols } }).select('symbol name image_url market').lean() : [];
  const market = markets.marketOfSession(session);
  const map = new Map();
  assets.forEach((a) => {
    const known = map.get(a.symbol);
    if (!known || (known.market !== market && a.market === market)) map.set(a.symbol, a);
  });
  return map;
}

/** @returns {Promise<{ phase:string, rows:object[], currency:string, updated_at:Date|null }>} */
async function board(session, now = new Date()) {
  const phase = phaseOf(session, now);
  const rows = rowsOf(session, phase, await assetInfo(session));
  const latest = Math.max(0, ...rows.map((r) => (r.price_at ? new Date(r.price_at).getTime() : 0)));
  return {
    phase,
    rows,
    currency: (markets.ALL_MARKETS[markets.marketOfSession(session)] || {}).currency || '',
    updated_at: latest ? new Date(latest) : null,
  };
}

function countsOf(rows) {
  const counts = { all: rows.length };
  Object.keys(DIRECTIONS).forEach((k) => { counts[k] = rows.filter((r) => r.direction === k).length; });
  return counts;
}

// ── One stock, start to end ─────────────────────────────────────────────────

/** Start price, every 5-minute reading, and the final price. Oldest first. */
function pointsOf(session, row, readings) {
  if (!row.has_start_price) return [];
  const end = session.end_time ? new Date(session.end_time).getTime() : Infinity;
  const point = (type, at, price) => ({ type, at, price, ...change(row.symbol, row.start_price, price) });
  const live = readings
    .filter((r) => new Date(r.at).getTime() < end)
    .map((r) => ({ at: r.at, price: num(((r.prices || []).find((p) => p.symbol === row.symbol) || {}).price) }))
    .filter((r) => r.price > 0)
    .map((r) => point('live', r.at, r.price));
  return [point('start', row.start_at, row.start_price), ...live, ...(row.is_final ? [point('final', row.price_at, row.current_price)] : [])];
}

/** The session's readings, oldest first; of one symbol only when given. */
function readingsOf(session, symbol) {
  const query = symbol
    ? SessionPriceReading.find({ session_id: session._id, 'prices.symbol': symbol }, { at: 1, prices: { $elemMatch: { symbol } } })
    : SessionPriceReading.find({ session_id: session._id }, { at: 1, prices: 1 });
  return query.sort({ at: 1 }).lean();
}

/** null when the session does not have this stock. */
async function stockHistory(session, symbol, now = new Date()) {
  const wanted = String(symbol || '').trim();
  const data = await board(session, now);
  const row = data.rows.find((r) => r.symbol === wanted) || data.rows.find((r) => r.symbol.toLowerCase() === wanted.toLowerCase());
  if (!row) return null;
  const points = hasStarted(data.phase) ? pointsOf(session, row, await readingsOf(session, row.symbol)) : [];
  return { ...data, row, points };
}

// ── Admin ───────────────────────────────────────────────────────────────────

const str = (v) => (typeof v === 'string' ? v.trim() : '');
const pick = (query, name, allowed) => (Object.prototype.hasOwnProperty.call(allowed, str(query[name])) ? str(query[name]) : '');

function sessionFilters(q = {}) {
  const f = {
    status: pick(q, 'status', SESSION_STATUSES),
    search: str(q.search).slice(0, 100),
    market: pick(q, 'market', MARKETS),
    from: istDay(str(q.from)) ? str(q.from) : '',
    to: istDay(str(q.to)) ? str(q.to) : '',
    per_page: PAGE_SIZES.includes(Number(q.per_page)) ? Number(q.per_page) : PAGE_SIZES[0],
  };
  if (f.from && f.to && f.from > f.to) [f.from, f.to] = [f.to, f.from];
  return f;
}
const stockFilters = (q = {}) => ({
  search: str(q.search).slice(0, 100),
  direction: pick(q, 'direction', DIRECTIONS),
  category: str(q.category).slice(0, 100),
  sort: pick(q, 'sort', STOCK_SORTS) || 'gain',
});

async function findSession(id) {
  const text = String(id == null ? '' : id).trim();
  if (/^[0-9a-f]{24}$/i.test(text)) return LeagueSession.findOne({ _id: text }).lean();
  if (/^\d{1,15}$/.test(text)) return LeagueSession.findOne({ old_id: Number(text) }).lean();
  return null;
}

const statusOf = (s) => (s.status === 'completing' ? 'completed' : s.status || 'upcoming');
const marketLabel = (s) => markets.labelOf(markets.marketOfSession(s));
const timeOf = (value) => new Date(value || 0).getTime() || 0;

/** Sessions with their stock counts and best / worst stock. */
async function listSessions(query = {}) {
  const f = sessionFilters(query);
  const all = await LeagueSession.find({}).select('old_id name market market_type status start_time').lean();
  const needle = f.search.replace(/^#/, '').toLowerCase();
  const from = f.from ? istDay(f.from, false).getTime() : -Infinity;
  const to = f.to ? istDay(f.to, true).getTime() : Infinity;
  const matching = all.filter((s) => (!needle || String(s.name || '').toLowerCase().includes(needle) || String(idOf(s)) === needle || String(s._id) === needle)
    && (!f.market || s.market === f.market || (!s.market && markets.typeOf(f.market) === s.market_type))
    && timeOf(s.start_time) >= from && timeOf(s.start_time) <= to);
  const counts = { '': matching.length };
  Object.keys(SESSION_STATUSES).forEach((k) => { counts[k] = matching.filter((s) => statusOf(s) === k).length; });
  const list = matching
    .filter((s) => !f.status || statusOf(s) === f.status)
    .sort((a, b) => timeOf(b.start_time) - timeOf(a.start_time) || String(b._id).localeCompare(String(a._id)));
  const pages = Math.max(Math.ceil(list.length / f.per_page), 1);
  const page = Math.min(Math.max(parseInt(query.page, 10) || 1, 1), pages);
  const ids = list.slice((page - 1) * f.per_page, page * f.per_page).map((s) => s._id);
  const [docs, readingCounts] = await Promise.all([
    ids.length ? LeagueSession.find({ _id: { $in: ids } }).lean() : [],
    ids.length ? SessionPriceReading.aggregate([{ $match: { session_id: { $in: ids } } }, { $group: { _id: '$session_id', n: { $sum: 1 } } }]) : [],
  ]);
  const byId = new Map(docs.map((d) => [String(d._id), d]));
  const readings = new Map(readingCounts.map((r) => [String(r._id), r.n]));
  const now = new Date();
  const rows = ids.map((id) => byId.get(String(id))).filter(Boolean).map((session) => {
    const phase = phaseOf(session, now);
    const stocks = rowsOf(session, phase);
    const ranked = hasStarted(phase) ? sortRows(stocks.filter((r) => r.direction !== 'no_price'), 'gain') : [];
    return {
      session,
      id: idOf(session),
      status: statusOf(session),
      phase,
      market: marketLabel(session),
      counts: countsOf(stocks),
      best: ranked[0] || null,
      worst: ranked.length > 1 ? ranked[ranked.length - 1] : null,
      readings: readings.get(String(session._id)) || 0,
    };
  });
  return { filters: f, counts, rows, total: list.length, pages, page };
}

async function filteredStocks(session, query) {
  const f = stockFilters(query);
  const data = await board(session);
  const needle = f.search.toLowerCase();
  const rows = sortRows(data.rows.filter((r) => (!needle || r.symbol.toLowerCase().includes(needle) || String(r.name).toLowerCase().includes(needle))
    && (!f.direction || r.direction === f.direction)
    && (!f.category || r.category_name === f.category)), f.sort);
  return { ...data, filters: f, all: data.rows, rows };
}

async function sessionStocks(id, query = {}) {
  const session = await findSession(id);
  if (!session) return null;
  const data = await filteredStocks(session, query);
  return {
    ...data,
    session,
    id: idOf(session),
    market: marketLabel(session),
    started: hasStarted(data.phase),
    counts: countsOf(data.all),
    categories: [...new Set(data.all.map((r) => r.category_name).filter(Boolean))].sort(),
    readings: await SessionPriceReading.countDocuments({ session_id: session._id }),
  };
}

async function stockPage(id, symbol) {
  const session = await findSession(id);
  const data = session ? await stockHistory(session, symbol) : null;
  return data && { ...data, history: data.points, filters: {}, session, id: idOf(session), market: marketLabel(session), started: hasStarted(data.phase) };
}

// ── Export ──────────────────────────────────────────────────────────────────

const line = (cells) => `${cells.map(csvCell).join(',')}\r\n`;
const BOM = '﻿';

async function exportStocks(id, query, write) {
  const session = await findSession(id);
  const { rows, phase, currency } = await filteredStocks(session, query);
  write(BOM + line(['Session ID', 'Session', 'Market', 'Stage', 'Symbol', 'Name', 'Category', 'Currency', 'Start price', 'Start time (IST)', phase === 'final' ? 'End price' : 'Current price', 'Price time (IST)', 'Change', 'Change %', 'Points (UP pick)', 'Final']));
  rows.forEach((r) => {
    const shown = hasStarted(phase) && r.direction !== 'no_price';
    write(line([
      idOf(session), session.name, marketLabel(session), PHASES[phase], r.symbol, r.name, r.category_name, currency,
      r.start_price, r.has_start_price ? istDateTime(r.start_at) : '', shown ? r.current_price : '', shown ? istDateTime(r.price_at) : '',
      shown ? r.change_amount : '', shown ? r.change_percent : '', shown ? r.points : '', r.is_final ? 'Yes' : 'No',
    ]));
  });
  return rows.length;
}

/** Every reading of every stock (or of one), start to end. */
async function exportHistory(id, query, write) {
  const session = await findSession(id);
  const { rows, phase, currency } = await board(session);
  const wanted = str(query.symbol);
  const list = sortRows(wanted ? rows.filter((r) => r.symbol === wanted) : rows, 'name');
  write(BOM + line(['Session ID', 'Session', 'Symbol', 'Name', 'Category', 'Time (IST)', 'Reading', 'Currency', 'Price', 'Change from start', 'Change %', 'Points (UP pick)']));
  if (!hasStarted(phase) || !list.length) return 0;
  const bySymbol = new Map(list.map((r) => [r.symbol, []]));
  (await readingsOf(session, wanted || null)).forEach((r) => (r.prices || []).forEach((p) => {
    if (bySymbol.has(p.symbol)) bySymbol.get(p.symbol).push({ at: r.at, prices: [p] });
  }));
  let written = 0;
  list.forEach((row) => pointsOf(session, row, bySymbol.get(row.symbol)).forEach((p) => {
    written += 1;
    write(line([
      idOf(session), session.name, row.symbol, row.name, row.category_name, istDateTime(p.at), { start: 'Start', live: 'Live', final: 'Final' }[p.type],
      currency, p.price, p.change_amount, p.change_percent, p.points,
    ]));
  }));
  return written;
}

module.exports = {
  PHASES, DIRECTIONS, STOCK_SORTS, SESSION_STATUSES, MARKETS, PAGE_SIZES, REFRESH_SECONDS,
  saveReading, phaseOf, rowsOf, board, stockHistory, countsOf, sortRows, hasStarted,
  listSessions, sessionStocks, stockPage, exportStocks, exportHistory, findSession, queryString, idOf,
};
