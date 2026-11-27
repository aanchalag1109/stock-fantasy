'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: Contest Automation (port of the PHP scheduled commands)
 * Purpose: Scoring, ranking and prize-structure helpers shared by the live-score
 *          job, the results job and the Pending Prizes payout.
 * Origin: Ports calculateScores()/assignRanks()/generatePrizeStructure() from the PHP
 *          CalculateContestPerformance command and PendingPrizesController.
 * Note: This feature must remain distinguishable from PHP-converted code.
 *
 * Scoring reuses scoreAssets() from helpers/mobile-compat.js — the same function the
 * app's leaderboard uses — and prize rows reuse buildDynamicPrizeDistribution(), which
 * PHP's payout calls "EXACT copy of app's buildDynamicPrizeDistribution". So what users
 * see in the app, what the automation calculates and what is paid always agree.
 */

const mongoose = require('mongoose');
const Contest = require('../../models/contest.model');
const ContestEntry = require('../../models/contest-entry.model');
const SavedBasket = require('../../models/saved-basket.model');
const ContestPerformancePrize = require('../../models/contest-performance-prize.model');
const {
  keysOf, publicId, num, round2, scoreAssets, buildDynamicPrizeDistribution, asPrizeArray,
} = require('../../helpers/mobile-compat');
const formats = require('../contest-formats');

const isOid = (v) => String(v).length === 24 && mongoose.isValidObjectId(String(v));

/** Session asset prices as { start: {symbol: price}, end: {symbol: price} }. */
function sessionPriceMaps(session) {
  const start = {};
  const end = {};
  (session.assets || []).forEach((a) => {
    if (!a.asset_symbol) return;
    if (num(a.start_price) > 0) start[a.asset_symbol] = num(a.start_price);
    if (num(a.end_price) > 0) end[a.asset_symbol] = num(a.end_price);
  });
  return { start, end };
}

/** Non-cancelled contests of a session. */
function sessionContests(session, extra = {}) {
  return Contest.find({ league_session_id: { $in: keysOf(session) }, status: { $ne: 'cancelled' }, ...extra }).lean();
}

const contestEntries = (contest) => ContestEntry.find({ contest_id: { $in: keysOf(contest) } }).lean();
const countParticipants = (contest) => ContestEntry.countDocuments({ contest_id: { $in: keysOf(contest) } });

/** Loads the baskets of the given entries, keyed by String(basket_id). */
async function basketsFor(entries) {
  const ids = [...new Set(entries.map((e) => e.basket_id).filter((id) => id != null).map(String))];
  const oids = ids.filter(isOid);
  const olds = ids.filter((id) => /^\d+$/.test(id) && id.length < 24).map(Number);
  const clauses = [];
  if (oids.length) clauses.push({ _id: { $in: oids } });
  if (olds.length) clauses.push({ old_id: { $in: olds } });
  const baskets = clauses.length ? await SavedBasket.find({ $or: clauses }).select('assets multipliers old_id').lean() : [];
  const map = new Map();
  baskets.forEach((b) => {
    map.set(String(b._id), b);
    if (b.old_id != null) map.set(String(b.old_id), b);
  });
  return map;
}

const basketSymbols = (basket) => (Array.isArray(basket && basket.assets) ? basket.assets : [])
  .map((a) => a && (a.symbol || a.name))
  .filter(Boolean);

/** Start prices for an entry: its own starting_prices, else the session's (as PHP). */
function entryStartPrices(entry, sessionStart) {
  const own = entry.starting_prices && typeof entry.starting_prices === 'object' ? entry.starting_prices : {};
  return Object.keys(own).length ? own : sessionStart;
}

/**
 * Scores every entry with the given end prices and writes total_score.
 * Returns the entries with their new scores.
 */
async function scoreEntries(entries, sessionStart, endPrices) {
  const baskets = await basketsFor(entries);
  const scored = [];
  for (const entry of entries) {
    const basket = baskets.get(String(entry.basket_id));
    const prices = { start: entryStartPrices(entry, sessionStart), end: endPrices, started: true };
    const total = round2(scoreAssets(basket && basket.assets, basket && basket.multipliers, prices).total);
    await ContestEntry.updateOne({ _id: entry._id }, { $set: { total_score: total } });
    scored.push({ ...entry, total_score: total });
  }
  return scored;
}

/**
 * Ranks by score (desc), then join time (asc); equal scores share a rank and the next
 * rank is skipped (1, 2, 2, 4), as in PHP assignRanks(). Writes rank; returns entries.
 */
async function assignRanks(entries) {
  const ordered = entries.slice().sort((a, b) => (num(b.total_score) - num(a.total_score))
    || (new Date(a.created_at || 0) - new Date(b.created_at || 0)));
  let rank = 1;
  let previous = null;
  for (let i = 0; i < ordered.length; i += 1) {
    const score = num(ordered[i].total_score);
    if (previous === null || score !== previous) rank = i + 1;
    ordered[i].rank = rank;
    previous = score;
    await ContestEntry.updateOne({ _id: ordered[i]._id }, { $set: { rank } });
  }
  return ordered;
}

// NEW IMPLEMENTATION — NODE.JS PROJECT: contest type rules live in services/contest-formats.js
const isFixedPrize = (contest) => formats.isFixedPool(contest);

/**
 * Dynamic prize rows (PHP PendingPrizesController::generatePrizeStructure):
 * free contests use the fixed prize pool; paid ones pool entry fees minus the platform fee.
 */
function dynamicPrizeRows(contest, participants) {
  const entryFee = num(contest.entry_fee);
  const platformFeePct = contest.platform_fee == null ? 30 : num(contest.platform_fee);
  let totalPool;
  let prizePool;
  if (entryFee === 0) {
    totalPool = num(contest.prize_pool) || num(contest.fixed_prize_pool);
    prizePool = totalPool;
  } else {
    totalPool = participants * entryFee;
    prizePool = totalPool - totalPool * (platformFeePct / 100);
  }
  if (prizePool <= 0 || participants <= 0) return { rows: [], totalPool, prizePool, winners: 0 };
  // NEW IMPLEMENTATION — NODE.JS PROJECT: per-type winners (h2h/WTA: 1, multiplier: joined ÷ N)
  const winners = formats.winnersFor(contest, participants, 50);
  if (winners <= 0) return { rows: [], totalPool, prizePool, winners: 0 };
  // NEW IMPLEMENTATION — NODE.JS PROJECT (client feedback): an Nx winner gets exactly N × entry fee; the
  // pool paid out is winners × that, the rest stays with the platform.
  const paid = formats.payablePool(contest, participants, prizePool);
  return { rows: buildDynamicPrizeDistribution(winners, paid, contest.category || 'mega'), totalPool, prizePool: paid, winners };
}

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT (client feedback): prize per winner shown BEFORE the session starts —
 * exactly the amount saved by the admin form (its "adjusted last" rule, rounded down). Recomputing it as
 * pool × % ÷ winners ignored that rule: a 6-winner mega contest showed 495 for rank 6 instead of 99.
 * Rows saved without an amount (older contests) keep the % calculation.
 */
function advertisedPerWinner(row, pool, isFixed) {
  const saved = row.per_winner ?? row.perWinner ?? row.per_winner_amount;
  if (isFixed || (saved != null && saved !== '')) return num(saved);
  const percent = num(row.percent ?? row.percentage ?? row.prize_percent);
  const winners = parseInt(row.winners || row.winners_count || 1, 10) || 1;
  return ((pool * percent) / 100) / winners;
}

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT (client feedback): the prize shown on a contest CARD, identical to
 * the contest detail screen and to the payout. Every card API uses this.
 *   - fixed-prize formats (guaranteed, practice): the stored prize, always;
 *   - flexible formats (mega, equal, winner takes all, h2h, multiplier) before the session starts:
 *     the advertised (stored) prize;
 *   - flexible formats once the session is live / completed: actual joins × entry fee − platform fee,
 *     first prize and winners from the same rows the payout pays (dynamicPrizeRows).
 * @param {object} contest  lean contest
 * @param {string} sessionStatus
 * @param {number} joined   entries in the contest
 * @returns {{ prize_pool:number, first_prize:number, total_pool:number|null, winners:number|null, is_flexible_prize:boolean, is_live_prize:boolean, rows?:object[] }}
 */
function cardPrize(contest, sessionStatus, joined) {
  const isFixed = formats.isFixedPool(contest);
  const started = ['live', 'completed'].includes(sessionStatus);
  if (!isFixed && started) {
    const live = dynamicPrizeRows(contest, Number(joined) || 0);
    return {
      prize_pool: round2(live.prizePool),
      first_prize: round2(live.rows.length ? live.rows[0].per_winner_amount : 0),
      total_pool: round2(live.totalPool),
      winners: live.winners,
      is_flexible_prize: true,
      is_live_prize: true,
      rows: live.rows, // NEW IMPLEMENTATION — NODE.JS PROJECT (client feedback): the live prize table
    };
  }
  // Stored (advertised) prize — first prize as the detail screen shows it before the start.
  const pool = num(contest.prize_pool);
  const stored = asPrizeArray(contest.prize_distribution);
  const first = stored.length ? advertisedPerWinner(stored[0], pool, isFixed) : 0;
  return { prize_pool: round2(pool), first_prize: round2(first), total_pool: null, winners: null, is_flexible_prize: !isFixed, is_live_prize: false };
}

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT (client feedback): admin lists showed the prize pool saved at creation
 * (the full-house, advertised one) even for live and completed contests. This sets, on each lean contest,
 *   prize_pool            — the pool as the app shows it and the payout pays it (cardPrize: actual joins once
 *                           the session is live; 0 for a cancelled contest),
 *   advertised_prize_pool — the stored pool,
 *   joined_count          — entries (all ids of the contest),
 *   is_live_prize         — true when prize_pool comes from actual joins.
 * Display only — never save these objects back.
 * @param {object[]} contests  lean contests (all fields, or at least the prize fields)
 */
async function withCurrentPools(contests) {
  if (!contests.length) return contests;
  const LeagueSession = require('../../models/league-session.model');
  const sessionKeys = [...new Set(contests.map((c) => String(c.league_session_id)))];
  const sessions = await LeagueSession.find({
    $or: [
      { _id: { $in: sessionKeys.filter(isOid) } },
      { old_id: { $in: sessionKeys.filter((k) => /^\d+$/.test(k) && k.length < 24).map(Number) } },
    ],
  }).select('_id old_id status').lean();
  const statusOf = new Map();
  sessions.forEach((s) => keysOf(s).forEach((k) => statusOf.set(String(k), s.status)));
  const rows = await ContestEntry.aggregate([
    { $match: { contest_id: { $in: contests.flatMap(keysOf) } } },
    { $group: { _id: '$contest_id', count: { $sum: 1 } } },
  ]);
  const counts = new Map(rows.map((r) => [String(r._id), r.count]));
  contests.forEach((c) => {
    const joined = keysOf(c).reduce((sum, k) => sum + (counts.get(String(k)) || 0), 0);
    const prize = c.status === 'cancelled' ? null : cardPrize(c, statusOf.get(String(c.league_session_id)) || 'upcoming', joined);
    c.advertised_prize_pool = num(c.prize_pool);
    c.prize_pool = prize ? prize.prize_pool : 0;
    c.joined_count = joined;
    c.is_live_prize = !!(prize && prize.is_live_prize);
  });
  return contests;
}

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT (client feedback): the prize rows a flexible contest was actually PAID
 * with — saved by the payout (savePrizeRows) at the time. Contests paid before the whole-number rule keep
 * showing what their winners received; null when the contest is unpaid, fixed-prize, or has no saved rows.
 */
async function paidPrizeRows(contest) {
  if (!contest || !contest.prizes_distributed || isFixedPrize(contest)) return null;
  const keys = keysOf(contest);
  const rows = await ContestPerformancePrize.find({
    $or: [
      { contest_id: { $in: [...keys, ...keys.map(String)] } },
      ...(contest.old_id != null ? [{ contest_old_id: contest.old_id }] : []),
    ],
  }).sort({ rank_start: 1 }).lean();
  if (!rows.length) return null;
  return rows.map((r) => ({
    rank_label: r.rank_label || `Rank ${r.rank_start} to ${r.rank_end}`,
    rank_start: num(r.rank_start),
    rank_end: num(r.rank_end),
    winners_count: num(r.winners_count) || (num(r.rank_end) - num(r.rank_start) + 1),
    percentage: num(r.percentage),
    prize_amount: num(r.prize_amount),
    per_winner_amount: num(r.per_winner_amount),
  }));
}

/** Replaces the stored ContestPerformancePrize rows for a contest. */
async function savePrizeRows(contest, participants) {
  const { rows, totalPool, prizePool, winners } = dynamicPrizeRows(contest, participants);
  if (!rows.length) return [];
  await ContestPerformancePrize.deleteMany({
    $or: [{ contest_id: { $in: keysOf(contest) } }, ...(contest.old_id != null ? [{ contest_old_id: contest.old_id }] : [])],
  });
  const now = new Date();
  const docs = rows.map((row) => ({
    ...row,
    contest_id: publicId(contest),
    contest_old_id: contest.old_id != null ? contest.old_id : null,
    total_pool: totalPool,
    platform_fee: totalPool - prizePool,
    prize_pool: prizePool,
    total_participants: participants,
    total_winners: winners,
    created_at: now,
    updated_at: now,
  }));
  await ContestPerformancePrize.insertMany(docs);
  return docs;
}

/**
 * Prize rows used for payout: a fixed contest's stored prize_distribution, otherwise
 * freshly generated dynamic rows (PHP processDistribution step 4).
 */
async function payoutPrizeRows(contest, participants) {
  if (isFixedPrize(contest) && Array.isArray(contest.prize_distribution) && contest.prize_distribution.length) {
    return contest.prize_distribution.map((item) => {
      const start = parseInt(item.rank_start || 1, 10);
      return {
        rank_start: start,
        rank_end: parseInt(item.rank_end || start, 10),
        per_winner_amount: num(item.per_winner != null ? item.per_winner : (item.perWinner != null ? item.perWinner : item.per_winner_amount)),
      };
    });
  }
  return (await savePrizeRows(contest, participants)).map((r) => ({
    rank_start: r.rank_start, rank_end: r.rank_end, per_winner_amount: num(r.per_winner_amount),
  }));
}

module.exports = {
  sessionPriceMaps, sessionContests, contestEntries, countParticipants, basketsFor, basketSymbols,
  scoreEntries, assignRanks, savePrizeRows, payoutPrizeRows, isFixedPrize, dynamicPrizeRows, cardPrize, advertisedPerWinner,
  withCurrentPools, paidPrizeRows,
};
