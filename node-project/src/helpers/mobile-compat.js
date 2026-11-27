'use strict';

const mongoose = require('mongoose');
const config = require('../config/env');
const Notification = require('../models/notification.model');
// NEW IMPLEMENTATION — NODE.JS PROJECT: Fantasy contest formats (equal-split types)
const { isEqualSplitCategory } = require('../services/contest-formats');

function isOid(value) {
  const text = String(value || '');
  return text.length === 24 && mongoose.isValidObjectId(text);
}

function keysOf(doc) {
  if (!doc) return [];
  const keys = [doc._id];
  if (doc.old_id != null) keys.push(doc.old_id);
  return keys;
}

function publicId(doc) {
  if (!doc) return null;
  return doc.old_id != null ? Number(doc.old_id) : doc._id;
}

function sqlDate(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(value)) {
    return value.replace('T', ' ').slice(0, 19);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type) => (parts.find((part) => part.type === type) || {}).value || '';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
}

function absoluteUrl(filePath) {
  if (!filePath) return null;
  if (/^https?:\/\//i.test(filePath)) return filePath;
  // NEW IMPLEMENTATION — NODE.JS PROJECT: never a localhost link when APP_URL was left at its default
  return `${require('./public-url').publicBaseUrl()}/${String(filePath).replace(/^\//, '')}`;
}

function num(value) {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function walletOf(user) {
  return num(user && user.deposit_balance) + num(user && user.winnings_balance);
}

async function unreadCount(userOrId) {
  if (!userOrId) return 0;
  const keys = userOrId._id ? keysOf(userOrId) : [userOrId];
  if (!keys.length) return 0;
  return Notification.countDocuments({ user_id: { $in: keys }, is_read: false });
}

async function findByPublicId(Model, id) {
  if (id == null || id === '') return null;
  const text = String(id);
  if (/^\d+$/.test(text)) return Model.findOne({ old_id: Number(text) });
  if (isOid(text)) return Model.findById(text);
  return null;
}

async function ensureOldId(Model, doc) {
  if (!doc || doc.old_id != null) return doc;
  const latest = await Model.findOne({ old_id: { $type: 'number' } }).sort({ old_id: -1 }).select('old_id').lean();
  const oldId = ((latest && latest.old_id) || 0) + 1;
  await Model.updateOne({ _id: doc._id }, { $set: { old_id: oldId } });
  doc.old_id = oldId;
  return doc;
}

function priceMaps(session) {
  const start = {};
  const end = {};
  const live = {};
  (session && session.assets ? session.assets : []).forEach((asset) => {
    if (!asset.asset_symbol) return;
    if (asset.start_price != null) start[asset.asset_symbol] = num(asset.start_price);
    if (asset.end_price != null) end[asset.asset_symbol] = num(asset.end_price);
    if (num(asset.live_price) > 0) live[asset.asset_symbol] = num(asset.live_price);
  });
  // NEW IMPLEMENTATION — NODE.JS PROJECT: while a session is live it has no end prices yet, so the app
  // showed 0 scores / no ranks. Use the live-scores job's latest prices then (PHP stored them as
  // end_price). Real end prices always win; display only — settlement uses contest-scoring.
  if (!Object.keys(end).length && Object.keys(live).length && session && ['live', 'completing'].includes(session.status)) {
    return { start, end: live, started: true, live: true };
  }
  return { start, end, started: Object.keys(end).length > 0, live: false };
}

function scoreAssets(assets, multipliers, prices) {
  const list = Array.isArray(assets) ? assets : [];
  const mults = Array.isArray(multipliers) ? multipliers : [];
  let total = 0;
  const rows = list.map((asset, index) => {
    const symbol = asset.symbol || asset.name || null;
    const raw = mults[index];
    const data = raw && typeof raw === 'object' ? raw : { multiplier: raw == null ? 1 : raw, prediction: 'UP' };
    const multiplier = num(data.multiplier == null ? 1 : data.multiplier) || 1;
    const prediction = String(data.prediction || 'UP').toUpperCase();
    let points = 0;
    if (prices.started && symbol && prices.start[symbol] != null && prices.end[symbol] != null && prices.start[symbol] > 0) {
      const change = ((prices.end[symbol] - prices.start[symbol]) / prices.start[symbol]) * 100;
      const directional = prediction === 'UP'
        ? (change > 0 ? change : -Math.abs(change))
        : (change < 0 ? Math.abs(change) : -change);
      points = (Math.round(directional * multiplier * 100) / 100) * 100;
    }
    total += points;
    return { ...asset, multiplier, prediction, points };
  });
  return { rows, total };
}

function selectedMultipliers(multipliers) {
  if (!Array.isArray(multipliers) || !multipliers.length) return [];
  if (multipliers[0] && typeof multipliers[0] === 'object' && Object.prototype.hasOwnProperty.call(multipliers[0], 'selected')) {
    return multipliers.filter((item) => item.selected === true || item.selected === 1 || item.selected === '1');
  }
  return multipliers.slice();
}

const PRIZE_TABLES = {
  10: [[1, 1, 30], [2, 2, 18], [3, 3, 11], [4, 5, 13.5], [6, 10, 27.5]],
  25: [[1, 1, 24], [2, 2, 14], [3, 3, 9], [4, 5, 12.375], [6, 10, 18.125], [11, 25, 22.5]],
  50: [[1, 1, 23], [2, 2, 13], [3, 3, 9], [4, 5, 8.1], [6, 10, 15], [11, 25, 16.4], [26, 50, 15.5]],
  100: [[1, 1, 18], [2, 2, 10], [3, 3, 8], [4, 5, 6.576], [6, 10, 10], [11, 25, 15.4], [26, 50, 16.524], [51, 100, 15.5]],
  250: [[1, 1, 14], [2, 2, 9], [3, 3, 7], [4, 5, 5.169], [6, 10, 8.602], [11, 25, 13.323], [26, 50, 13.031], [51, 100, 13.375], [101, 250, 16.5]],
  500: [[1, 1, 14], [2, 2, 9], [3, 3, 7], [4, 5, 3.1], [6, 10, 6.628], [11, 25, 10.576], [26, 50, 10.102], [51, 100, 12.469], [101, 250, 13.625], [251, 500, 13.5]],
  1000: [[1, 1, 12], [2, 2, 8], [3, 3, 5], [4, 5, 2.399], [6, 10, 4.931], [11, 25, 9.11], [26, 50, 8.813], [51, 100, 10.418], [101, 250, 11.891], [251, 500, 12.188], [501, 1000, 15.25]],
  2500: [[1, 1, 10], [2, 2, 7], [3, 3, 5], [4, 5, 1.8], [6, 10, 3.5], [11, 25, 7.386], [26, 50, 7.229], [51, 100, 8.972], [101, 250, 10.629], [251, 500, 11.172], [501, 1000, 12.562], [1001, 2500, 14.75]],
  5000: [[1, 1, 10], [2, 2, 7], [3, 3, 5], [4, 5, 1.75], [6, 10, 3], [11, 25, 5.314], [26, 50, 5.355], [51, 100, 7.14], [101, 250, 8.853], [251, 500, 9.471], [501, 1000, 10.961], [1001, 2500, 12.281], [2501, 5000, 13.875]],
  10000: [[1, 1, 10], [2, 2, 7], [3, 3, 5], [4, 5, 1.6], [6, 10, 2.049], [11, 25, 4.283], [26, 50, 4.31], [51, 100, 5.08], [101, 500, 8.774], [501, 1000, 10.365], [1001, 2500, 12.82], [2501, 5000, 12.094], [5001, 10000, 16.625]],
  25000: [[1, 1, 8], [2, 2, 6], [3, 3, 4.5], [4, 5, 1.4], [6, 10, 1.7], [11, 25, 3.164], [26, 50, 3.422], [51, 100, 4.229], [101, 500, 6.262], [501, 1000, 7.339], [1001, 5000, 12.172], [5001, 10000, 12.562], [10001, 25000, 29.25]],
  50000: [[1, 1, 8], [2, 2, 6], [3, 3, 4.5], [4, 5, 1.2], [6, 10, 1.7], [11, 25, 2.903], [26, 50, 3.043], [51, 100, 3.89], [101, 500, 6.187], [501, 1000, 6.916], [1001, 5000, 8.555], [5001, 10000, 10], [10001, 25000, 17.431], [25001, 50000, 19.675]],
  100000: [[1, 1, 8], [2, 2, 6], [3, 3, 4.5], [4, 5, 1.052], [6, 10, 1.502], [11, 25, 2.737], [26, 50, 2.65], [51, 100, 3.533], [101, 500, 5.377], [501, 1000, 5.1], [1001, 5000, 7.893], [5001, 10000, 8.45], [10001, 25000, 11.031], [25001, 50000, 12.375], [50001, 100000, 19.8]],
  250000: [[1, 1, 6.5], [2, 2, 5], [3, 3, 4], [4, 5, 1.076], [6, 10, 1.8], [11, 25, 2.53], [26, 50, 2.507], [51, 100, 3.11], [101, 500, 5], [501, 1000, 6], [1001, 5000, 7.075], [5001, 10000, 7.766], [10001, 25000, 8.355], [25001, 100000, 13.281], [100001, 250000, 26]],
  500000: [[1, 1, 6.5], [2, 2, 5], [3, 3, 4], [4, 5, 1.005], [6, 10, 1.673], [11, 25, 2.831], [26, 50, 2.375], [51, 100, 2.9], [101, 500, 4.6], [501, 1000, 5.6], [1001, 5000, 6.788], [5001, 10000, 7.532], [10001, 25000, 7.734], [25001, 100000, 9.312], [100001, 250000, 12.75], [250001, 500000, 19.4]],
  1000000: [[1, 1, 5.5], [2, 2, 4.2], [3, 3, 3.5], [4, 5, 0.941], [6, 10, 1.621], [11, 25, 2.194], [26, 50, 2.159], [51, 100, 2.812], [101, 500, 4.538], [501, 1000, 5.2], [1001, 5000, 6.555], [5001, 10000, 7.407], [10001, 25000, 7.709], [25001, 100000, 8.945], [100001, 250000, 11.594], [250001, 500000, 13.125], [500001, 1000000, 12]],
};

function round2(value) {
  return Math.round(num(value) * 100) / 100;
}

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT (client feedback): prize rows for `totalWinners` winners sharing
 * `prizePool`. Every prize is a whole number (rounded down, as the admin form shows it) and the rows add
 * up to the whole pool: the coins left over from rounding go to rank 1. Equal-split formats (equal, H2H,
 * winner takes all, Nx) give every winner the same whole amount; the leftover (under 1 coin per winner)
 * stays with the platform so the split stays equal.
 *
 * Mega tiers come from PRIZE_TABLES (the table nearest to the winner count, cut at the last winner). The
 * group that reaches the last winner is now divided by its real number of winners — PHP divided it by the
 * size of that group in the full table, so with fewer winners part of the pool was never paid (380 winners
 * of a 25,000 pool got 23,380.55; 3 winners of 450 got 225.90). The tiers are then scaled to the pool.
 */
function buildDynamicPrizeDistribution(totalWinners, prizePool, category = 'mega') {
  totalWinners = Math.floor(num(totalWinners));
  prizePool = num(prizePool);
  if (totalWinners <= 0 || prizePool <= 0) return [];
  // NEW IMPLEMENTATION — NODE.JS PROJECT: h2h, winner_takes_all and multiplier also split equally
  if (isEqualSplitCategory(category)) {
    const perWinner = wholeCoins(prizePool / totalWinners);
    if (perWinner <= 0) return [];
    return [{
      rank_label: totalWinners === 1 ? 'Rank 1' : `Rank 1 to ${totalWinners}`,
      rank_start: 1,
      rank_end: totalWinners,
      winners_count: totalWinners,
      percentage: 100,
      prize_amount: perWinner * totalWinners,
      per_winner_amount: perWinner,
    }];
  }
  const keys = Object.keys(PRIZE_TABLES).map(Number).sort((a, b) => a - b);
  let chosenKey = keys[0];
  let minDiff = Infinity;
  keys.forEach((key) => {
    const diff = Math.abs(key - totalWinners);
    if (diff < minDiff) {
      minDiff = diff;
      chosenKey = key;
    }
  });
  const isHigher = chosenKey > totalWinners;
  const tiers = PRIZE_TABLES[chosenKey];
  const rows = [];
  let previousPerWin = Infinity;
  for (let index = 0; index < tiers.length; index += 1) {
    const [start, endRaw, pct] = tiers[index];
    if (start > totalWinners) break;
    const isLast = index === tiers.length - 1;
    const end = isLast && !isHigher ? totalWinners : Math.min(endRaw, totalWinners);
    const count = end - start + 1;
    let perWin = ((prizePool * pct) / 100) / count;
    // a lower rank never gets more than the rank above it
    if (perWin > previousPerWin) perWin = previousPerWin * 0.95;
    rows.push({ start, end, count, perWin });
    previousPerWin = perWin;
    if (end >= totalWinners) break;
  }
  const raw = rows.reduce((sum, r) => sum + r.perWin * r.count, 0);
  if (!(raw > 0)) return [];
  const scale = prizePool / raw;
  const dist = rows.map((r) => ({ ...r, per: wholeCoins(r.perWin * scale) }));
  const leftover = wholeCoins(prizePool) - dist.reduce((sum, r) => sum + r.per * r.count, 0);
  if (leftover > 0 && dist[0].count === 1) dist[0].per += leftover;
  return dist.filter((r) => r.per > 0).map((r) => ({
    rank_label: `Rank ${r.start} to ${r.end}`,
    rank_start: r.start,
    rank_end: r.end,
    winners_count: r.count,
    percentage: Math.round(((r.per * r.count) / prizePool) * 100 * 10000) / 10000,
    prize_amount: r.per * r.count,
    per_winner_amount: r.per,
  }));
}

/** Whole coins, rounded down (a tiny epsilon keeps 413.99999999 from becoming 413). */
function wholeCoins(value) {
  return Math.max(0, Math.floor(num(value) + 1e-6));
}

function asPrizeArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
  }
  return [];
}

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT: wallet amounts are ProbCoins.
 *   probcoinLabel(1500)            → "1,500 ProbCoins"
 *   currencyLabel(500, 'INR')      → "₹500"    currencyLabel(5.5, 'USDT') → "5.5 USDT"
 */
function probcoinLabel(n) {
  return `${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })} ProbCoins`;
}
function currencyLabel(n, currency) {
  const value = Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  return String(currency || '').toUpperCase() === 'INR' ? `₹${value}` : `${value} ${String(currency || '').toUpperCase()}`.trim();
}
/** Extra fields for a transaction in the app: unit, amount label and the real-money side if any. */
function transactionLabels(tx) {
  const extra = { unit: 'ProbCoins', amount_label: probcoinLabel(tx.amount) };
  if (tx.currency && tx.currency_amount != null) {
    extra.currency = tx.currency;
    extra.currency_amount = num(tx.currency_amount);
    extra.currency_label = currencyLabel(tx.currency_amount, tx.currency);
  }
  return extra;
}

module.exports = {
  probcoinLabel,
  currencyLabel,
  transactionLabels,
  isOid,
  keysOf,
  publicId,
  sqlDate,
  absoluteUrl,
  num,
  walletOf,
  unreadCount,
  findByPublicId,
  ensureOldId,
  priceMaps,
  scoreAssets,
  selectedMultipliers,
  buildDynamicPrizeDistribution,
  wholeCoins,
  asPrizeArray,
  round2,
};
