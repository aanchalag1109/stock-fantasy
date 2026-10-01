'use strict';

const mongoose = require('mongoose');
const Contest = require('../models/contest.model');
const ContestEntry = require('../models/contest-entry.model');
const LeagueSession = require('../models/league-session.model');
const SavedBasket = require('../models/saved-basket.model');
const User = require('../models/user.model');
const Transaction = require('../models/transaction.model');
const Notification = require('../models/notification.model');
const logger = require('../config/logger');

async function getUnreadCount(userId) {
  if (!userId) return 0;
  return Notification.countDocuments({ user_id: userId, is_read: false });
}

// ─── Prize distribution tables ───────────────────────────────────────────────
const PRIZE_TABLES = {
  10:   [[1,1,30],[2,2,18],[3,3,11],[4,5,13.5],[6,10,27.5]],
  25:   [[1,1,24],[2,2,14],[3,3,9],[4,5,12.375],[6,10,18.125],[11,25,22.5]],
  50:   [[1,1,23],[2,2,13],[3,3,9],[4,5,8.1],[6,10,15],[11,25,16.4],[26,50,15.5]],
  100:  [[1,1,18],[2,2,10],[3,3,8],[4,5,6.576],[6,10,10],[11,25,15.4],[26,50,16.524],[51,100,15.5]],
  250:  [[1,1,14],[2,2,9],[3,3,7],[4,5,5.169],[6,10,8.602],[11,25,13.323],[26,50,13.031],[51,100,13.375],[101,250,16.5]],
  500:  [[1,1,14],[2,2,9],[3,3,7],[4,5,3.1],[6,10,6.628],[11,25,10.576],[26,50,10.102],[51,100,12.469],[101,250,13.625],[251,500,13.5]],
  1000: [[1,1,12],[2,2,8],[3,3,5],[4,5,2.399],[6,10,4.931],[11,25,9.11],[26,50,8.813],[51,100,10.418],[101,250,11.891],[251,500,12.188],[501,1000,15.25]],
};

function buildDynamicPrizeDistribution(totalWinners, prizePool, category = 'mega') {
  if (totalWinners <= 0 || prizePool <= 0) return [];

  if (category === 'equal') {
    const perWinner = Math.round((prizePool / totalWinners) * 100) / 100;
    return [{
      rank_label: `Rank 1 to ${totalWinners}`,
      rank_start: 1, rank_end: totalWinners,
      winners_count: totalWinners,
      percentage: 100,
      prize_amount: Math.round(prizePool * 100) / 100,
      per_winner_amount: perWinner,
    }];
  }

  const keys = Object.keys(PRIZE_TABLES).map(Number).sort((a, b) => a - b);
  let chosenKey = keys[0];
  let minDiff = Infinity;
  keys.forEach((k) => {
    const diff = Math.abs(k - totalWinners);
    if (diff < minDiff) { minDiff = diff; chosenKey = k; }
  });

  const isHigher = chosenKey > totalWinners;
  const tiers = PRIZE_TABLES[chosenKey];
  const dist = [];
  let previousPerWin = Infinity;

  for (let idx = 0; idx < tiers.length; idx++) {
    const [s, e, pct] = tiers[idx];
    if (s > totalWinners) break;
    const isLast = idx === tiers.length - 1;
    let end = isHigher && isLast ? Math.min(e, totalWinners) : Math.min(e, totalWinners);
    if (!isLast) end = Math.min(e, totalWinners);
    if (end < s) break;
    const cnt = end - s + 1;
    const prize = Math.round(prizePool * pct / 100 * 100) / 100;
    let perWin;
    if (isLast || end >= totalWinners) {
      const lastTier = tiers[tiers.length - 1];
      const structureWinners = lastTier[1] - lastTier[0] + 1;
      const divisor = cnt <= structureWinners ? structureWinners : cnt;
      perWin = divisor > 0 ? Math.round(prize / divisor * 100) / 100 : 0;
      if (perWin > previousPerWin) perWin = Math.round(previousPerWin * 0.95 * 100) / 100;
    } else {
      perWin = cnt > 0 ? Math.round(prize / cnt * 100) / 100 : 0;
    }
    dist.push({
      rank_label: `Rank ${s} to ${end}`,
      rank_start: s, rank_end: end,
      winners_count: cnt,
      percentage: Math.round(pct * 10000) / 10000,
      prize_amount: prize,
      per_winner_amount: perWin,
    });
    previousPerWin = perWin;
    if (end >= totalWinners) break;
  }
  return dist;
}

function calculateAssetPoints(assets, multipliers, startPrices, endPrices) {
  let totalScore = 0;
  const assetsWithPoints = (Array.isArray(assets) ? assets : []).map((asset, index) => {
    const symbol = asset.symbol || asset.name;
    const mData = multipliers[index] || { multiplier: 1, prediction: 'UP' };
    const multiplier = typeof mData === 'object' ? (mData.multiplier || 1) : mData;
    const prediction = (typeof mData === 'object' ? mData.prediction : 'UP').toUpperCase();

    let points = 0;
    const sp = startPrices && startPrices[symbol];
    const ep = endPrices && endPrices[symbol];
    const startPrice = sp ? (sp.start_price || sp.price || 0) : 0;
    const endPrice = ep ? (ep.end_price || ep.price || 0) : 0;

    if (startPrice > 0 && endPrice > 0) {
      const priceChangePct = ((endPrice - startPrice) / startPrice) * 100;
      const directional = prediction === 'UP'
        ? (priceChangePct > 0 ? priceChangePct : -Math.abs(priceChangePct))
        : (priceChangePct < 0 ? Math.abs(priceChangePct) : -priceChangePct);
      points = Math.round(directional * multiplier * 100) / 100 * 100;
    }
    totalScore += points;
    return { ...asset, multiplier, prediction, points };
  });
  return { assetsWithPoints, totalScore };
}

/**
 * GET /api/v1/contests/session/:sessionId
 */
const contestsBySession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.query.user_id;

    const session = await LeagueSession.findById(sessionId).lean();
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const contests = await Contest.find({
      league_session_id: sessionId,
      status: { $ne: 'cancelled' }
    }).sort({ is_pinned: -1, pin_order: 1, prize_pool: -1 }).lean();

    const enriched = await Promise.all(contests.map(async (contest) => {
      const joinedCount = await ContestEntry.countDocuments({ contest_id: contest._id });
      const isFixed = contest.is_fixed_prize || ['guaranteed', 'practice'].includes(contest.category);
      const entryFee = contest.entry_fee || 0;
      const platformFeePct = contest.platform_fee || 0;

      let prizePool = contest.prize_pool || 0;
      if (!isFixed && !['upcoming'].includes(session.status)) {
        const totalPool = joinedCount * entryFee;
        prizePool = totalPool - (totalPool * platformFeePct) / 100;
      }

      // First prize
      let firstPrize = 0;
      const pd = contest.prize_distribution;
      if (pd && Array.isArray(pd) && pd.length > 0) {
        firstPrize = Math.round((pd[0].per_winner || pd[0].per_winner_amount || pd[0].perWinner || 0) * 100) / 100;
      }
      if (!isFixed && ['live', 'completed'].includes(session.status) && prizePool > 0) {
        const winPct = contest.winning_percentage || 30;
        const actualWinners = Math.max(1, Math.floor(joinedCount * winPct / 100));
        const dist = buildDynamicPrizeDistribution(actualWinners, prizePool, contest.category);
        if (dist.length > 0) firstPrize = Math.round((dist[0].per_winner_amount || 0) * 100) / 100;
      }

      let badge = null;
      if (contest.is_pinned) badge = 'Featured';
      else if (contest.category === 'guaranteed') badge = 'Guaranteed';
      else if (contest.category === 'practice') badge = 'Practice';

      return {
        ...contest,
        joined_count: joinedCount,
        prize_pool: Math.round(prizePool * 100) / 100,
        is_flexible_prize: !isFixed,
        is_fixed_prize: isFixed,
        entry_fee: entryFee,
        is_pinned: !!contest.is_pinned,
        badge,
        first_prize: firstPrize,
      };
    }));

    return res.json({
      contests: enriched,
      session: { id: session._id, name: session.name, start_time: session.start_time, end_time: session.end_time, status: session.status },
      redirect_to_home: ['live', 'completed'].includes(session.status),
      unread_notifications: await getUnreadCount(userId),
    });
  } catch (err) {
    logger.error('contestsBySession error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch contests' });
  }
};

/**
 * GET /api/v1/contests/:id?user_id=
 */
const getContest = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.query.user_id;

    const contest = await Contest.findById(id).lean();
    if (!contest) return res.status(404).json({ success: false, message: 'Contest not found' });

    const session = await LeagueSession.findById(contest.league_session_id).lean();

    // Get session asset prices from assets embedded in session
    const startPricesMap = {};
    const endPricesMap = {};
    (session?.assets || []).forEach((a) => {
      if (a.start_price) startPricesMap[a.asset_symbol] = { start_price: a.start_price };
      if (a.end_price) endPricesMap[a.asset_symbol] = { end_price: a.end_price };
    });
    const calculationStarted = Object.keys(endPricesMap).length > 0;

    // Get all entries
    const entries = await ContestEntry.find({ contest_id: id })
      .populate({ path: 'basket_id', model: 'SavedBasket', select: 'assets multipliers serial_no' })
      .populate({ path: 'user_id', model: 'User', select: 'name' })
      .lean();

    const participants = entries.map((entry) => {
      const basket = entry.basket_id || {};
      const assets = Array.isArray(basket.assets) ? basket.assets : [];
      const multipliers = Array.isArray(basket.multipliers) ? basket.multipliers : [];

      const { assetsWithPoints, totalScore } = calculateAssetPoints(assets, multipliers, startPricesMap, endPricesMap);

      return {
        user_id: entry.user_id?._id || entry.user_id,
        user_name: entry.user_id?.name || 'Unknown User',
        basket_id: basket._id,
        serial_no: basket.serial_no,
        total_score: calculationStarted ? (entry.total_score || 0) : 0,
        total_points: Math.round(totalScore * 100) / 100,
        assets: assetsWithPoints,
        multipliers,
      };
    });

    if (calculationStarted) {
      participants.sort((a, b) => b.total_score - a.total_score);
    }

    // Assign ranks
    let currentRank = 1;
    let prevScore = null;
    const ranksMap = participants.map((p, idx) => {
      if (prevScore !== null && p.total_score === prevScore) return currentRank;
      currentRank = idx + 1;
      prevScore = p.total_score;
      return currentRank;
    });

    const joinedCount = entries.length;
    const maxParticipants = contest.participants || 100;
    const sessionStatus = session?.status || 'upcoming';
    const isFixed = contest.is_fixed_prize || ['guaranteed', 'practice'].includes(contest.category);
    const entryFee = contest.entry_fee || 0;
    const platformFeePct = contest.platform_fee || 0;

    let totalPool = contest.total_pool || 0;
    let platformFeeAmount = contest.platform_fee_amount || 0;
    let displayPrizePool = contest.prize_pool || 0;

    if (!isFixed && sessionStatus !== 'upcoming') {
      totalPool = joinedCount * entryFee;
      platformFeeAmount = (totalPool * platformFeePct) / 100;
      displayPrizePool = totalPool - platformFeeAmount;
    }

    // Build prize distribution
    let prizeDistribution = [];
    const pdRaw = contest.prize_distribution;
    if (isFixed && Array.isArray(pdRaw) && pdRaw.length > 0) {
      prizeDistribution = pdRaw.map((item) => {
        const perWinner = item.per_winner || item.per_winner_amount || item.perWinner || 0;
        const wc = item.winners_count || item.winners || 1;
        const rs = item.rank_start || 1;
        const re = item.rank_end || rs;
        return {
          rank_label: item.rank_label || item.label || `Rank ${rs} to ${re}`,
          rank_start: rs, rank_end: re,
          winners_count: wc,
          percentage: Math.round((item.percentage || item.percent || item.prize_percent || 0) * 100) / 100,
          prize_amount: Math.round(perWinner * wc * 100) / 100,
          per_winner_amount: Math.round(perWinner * 100) / 100,
        };
      });
    } else if (displayPrizePool > 0) {
      const winPct = contest.winning_percentage || 30;
      const winners = Math.max(1, Math.floor(joinedCount * winPct / 100));
      prizeDistribution = buildDynamicPrizeDistribution(winners, displayPrizePool, contest.category);
    }

    const prizes = prizeDistribution;

    // Apply ranks and prizes
    participants.forEach((p, idx) => {
      const rank = ranksMap[idx];
      const tiedCount = ranksMap.filter((r) => r === rank).length;
      p.rank = calculationStarted ? rank : 0;
      p.is_tied = tiedCount > 1;
      p.tied_count = tiedCount;

      let prize = 0;
      if (calculationStarted) {
        if (tiedCount > 1) {
          let total = 0;
          for (let r = rank; r < rank + tiedCount; r++) {
            const pr = prizes.find((pr) => r >= pr.rank_start && r <= pr.rank_end);
            if (pr) total += pr.per_winner_amount;
          }
          prize = tiedCount > 0 ? Math.round(total / tiedCount * 100) / 100 : 0;
        } else {
          const pr = prizes.find((pr) => rank >= pr.rank_start && rank <= pr.rank_end);
          if (pr) prize = pr.per_winner_amount;
        }
      }
      p.prize_amount = Math.round(prize * 100) / 100;
    });

    let userJoined = false;
    let userEntryCount = 0;
    if (userId) {
      userEntryCount = await ContestEntry.countDocuments({ contest_id: id, user_id: userId });
      userJoined = userEntryCount > 0;
    }

    return res.json({
      contest: {
        id: contest._id,
        category: contest.category,
        prize_pool: Math.round(displayPrizePool * 100) / 100,
        is_flexible_prize: !isFixed,
        entry_fee: entryFee,
        platform_fee_percent: platformFeePct,
        platform_fee_amount: Math.round(platformFeeAmount * 100) / 100,
        total_pool: Math.round(totalPool * 100) / 100,
        status: contest.status,
        session_name: session?.name || 'Unknown Session',
        session_status: sessionStatus,
        prize_distribution: prizeDistribution,
        max_entries_per_user: contest.max_entries_per_user || 1,
        max_participants: maxParticipants,
        joined_users: joinedCount,
        spots_left: Math.max(0, maxParticipants - joinedCount),
        winning_percentage: contest.winning_percentage || 0,
        calculation_started: calculationStarted,
      },
      participants,
      user_joined: userJoined,
      user_entry_count: userEntryCount,
      remaining_entries: Math.max(0, (contest.max_entries_per_user || 1) - userEntryCount),
      unread_notifications: await getUnreadCount(userId),
    });
  } catch (err) {
    logger.error('getContest error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * GET /api/v1/contests/user?user_id=&session_id=
 */
const getUserContests = async (req, res) => {
  try {
    const userId = req.query.user_id || req.userId;
    const sessionIdFilter = req.query.session_id;

    if (!userId) return res.status(400).json({ success: false, error: 'user_id is required' });

    const entryFilter = { user_id: userId };
    if (sessionIdFilter) entryFilter.session_id = sessionIdFilter;

    const entries = await ContestEntry.find(entryFilter)
      .populate({ path: 'contest_id', model: 'Contest' })
      .populate({ path: 'basket_id', model: 'SavedBasket', select: 'assets multipliers serial_no' })
      .sort({ created_at: -1 })
      .lean();

    const sessionsMap = {};

    for (const entry of entries) {
      const contest = entry.contest_id;
      if (!contest) continue;

      const sessionId = contest.league_session_id?.toString();
      if (!sessionId) continue;

      if (!sessionsMap[sessionId]) {
        const session = await LeagueSession.findById(sessionId).lean();
        sessionsMap[sessionId] = {
          session_id: sessionId,
          session_name: session?.name || 'Unknown',
          session_status: session?.status || 'unknown',
          contests: {},
        };
      }

      const contestId = contest._id.toString();
      if (!sessionsMap[sessionId].contests[contestId]) {
        const joinedCount = await ContestEntry.countDocuments({ contest_id: contestId });
        const isFixed = contest.is_fixed_prize || ['guaranteed', 'practice'].includes(contest.category);
        const entryFee = contest.entry_fee || 0;
        const platFee = contest.platform_fee || 0;
        const sessionStatus = sessionsMap[sessionId].session_status;
        const isFlexible = ['mega', 'equal', 'flexible'].includes(contest.category) && ['live', 'completed'].includes(sessionStatus);

        let prizePool = contest.prize_pool || 0;
        if (isFlexible) {
          const totalPool = joinedCount * entryFee;
          prizePool = totalPool - (totalPool * platFee) / 100;
        }

        sessionsMap[sessionId].contests[contestId] = {
          contest_id: contestId,
          category: contest.category,
          prize_pool: Math.round(prizePool * 100) / 100,
          is_flexible_prize: isFlexible,
          entry_fee: entryFee,
          status: contest.status,
          total_spots: contest.participants || 100,
          spots_joined: joinedCount,
          spots_available: Math.max(0, (contest.participants || 100) - joinedCount),
          baskets: [],
        };
      }

      const basket = entry.basket_id || {};
      const assets = Array.isArray(basket.assets) ? basket.assets : [];
      const multipliers = Array.isArray(basket.multipliers) ? basket.multipliers : [];

      // Fetch prices from session assets
      const session_ = await LeagueSession.findById(sessionId).lean();
      const startPricesMap = {};
      const endPricesMap = {};
      (session_?.assets || []).forEach((a) => {
        if (a.start_price) startPricesMap[a.asset_symbol] = { start_price: a.start_price };
        if (a.end_price) endPricesMap[a.asset_symbol] = { end_price: a.end_price };
      });

      const { assetsWithPoints, totalScore } = calculateAssetPoints(assets, multipliers, startPricesMap, endPricesMap);

      sessionsMap[sessionId].contests[contestId].baskets.push({
        entry_id: entry._id,
        basket_id: basket._id,
        serial_no: basket.serial_no,
        assets: assetsWithPoints,
        multipliers,
        total_score: entry.total_score || 0,
        total_points: Math.round(totalScore * 100) / 100,
        rank: entry.rank,
        entry_created_at: entry.created_at,
      });
    }

    // Flatten
    const sessions = Object.values(sessionsMap).map((s) => ({
      ...s,
      contests: Object.values(s.contests),
    })).filter((s) => s.session_id);

    return res.json({
      success: true,
      sessions,
      total: sessions.length,
      unread_notifications: await getUnreadCount(userId),
    });
  } catch (err) {
    logger.error('getUserContests error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * POST /api/v1/contests/bulk-join
 */
const bulkJoinContest = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const userId = parseInt(req.body.user_id) || req.body.user_id;
    const contestId = req.body.contest_id;
    const entryFee = parseFloat(req.body.entry_fee || 0);
    const basketIds = req.body.basket_ids || [];

    logger.info('=== BULK JOIN CONTEST REQUEST ===', { userId, contestId, entryFee, basketIds });

    if (!userId || !contestId || !Array.isArray(basketIds) || basketIds.length === 0) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: 'Invalid input' });
    }

    const contest = await Contest.findById(contestId).session(session);
    if (!contest) {
      await session.abortTransaction();
      return res.status(404).json({ success: false, message: 'Contest not found' });
    }

    // Check capacity
    const totalEntriesInContest = await ContestEntry.countDocuments({ contest_id: contestId });
    const maxParticipants = contest.participants || 100;
    const availableSpots = maxParticipants - totalEntriesInContest;
    if (basketIds.length > availableSpots) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: `Only ${availableSpots} spots available` });
    }

    // Check per-user limit
    const userEntriesUsed = await ContestEntry.countDocuments({ contest_id: contestId, user_id: userId });
    const maxEntries = contest.max_entries_per_user || 1;
    const remainingEntries = maxEntries - userEntriesUsed;
    if (basketIds.length > remainingEntries) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: `You can only select ${remainingEntries} more baskets` });
    }

    const user = await User.findById(userId).session(session);
    if (!user) {
      await session.abortTransaction();
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const totalFee = entryFee * basketIds.length;
    const totalWalletBalance = (user.deposit_balance || 0) + (user.winnings_balance || 0);
    if (totalWalletBalance < totalFee) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: 'Insufficient balance' });
    }

    const errors = [];
    let successCount = 0;

    for (const basketId of basketIds) {
      try {
        const alreadyJoined = await ContestEntry.exists({ user_id: userId, contest_id: contestId, basket_id: basketId });
        if (alreadyJoined) { errors.push(`Basket ${basketId}: Already joined`); continue; }

        const sourceBasket = await SavedBasket.findOne({ _id: basketId, user_id: userId, is_standalone: true }).session(session);
        if (!sourceBasket) { errors.push(`Basket ${basketId}: Not found`); continue; }

        const entry = await ContestEntry.create([{
          user_id: userId,
          contest_id: contestId,
          basket_id: basketId,
          session_id: contest.league_session_id,
          total_score: 0,
        }], { session });

        const entryId = entry[0]._id;

        // Deduct from deposit_balance first, then winnings_balance
        let remainingFee = entryFee;
        if (user.deposit_balance >= remainingFee) {
          user.deposit_balance -= remainingFee;
        } else {
          remainingFee -= user.deposit_balance;
          user.deposit_balance = 0;
          user.winnings_balance -= remainingFee;
        }
        user.deposit_balance = Math.max(0, user.deposit_balance);
        user.winnings_balance = Math.max(0, user.winnings_balance);

        await Transaction.create([{
          user_id: userId,
          contest_id: contestId,
          type: 'contest_entry',
          amount: entryFee,
          status: 'success',
          transaction_id: `ENTRY_${contestId}_${entryId}_${Date.now()}_${Math.floor(Math.random() * 9000 + 1000)}`,
          description: `Entry fee for Contest #${contestId}, entry ${entryId}`,
        }], { session });

        successCount++;
      } catch (e) {
        errors.push(`Basket ${basketId}: ${e.message}`);
        logger.error(`Error processing basket ${basketId}:`, e.message);
      }
    }

    await user.save({ session });
    await session.commitTransaction();

    // Get updated contest stats
    const updatedJoinedCount = await ContestEntry.countDocuments({ contest_id: contestId });
    const userEntryCount = await ContestEntry.countDocuments({ contest_id: contestId, user_id: userId });

    return res.json({
      success: true,
      message: `Joined with ${successCount} basket(s)`,
      success_count: successCount,
      errors,
      wallet_balance: parseFloat(((user.deposit_balance || 0) + (user.winnings_balance || 0)).toFixed(2)),
      contest_updated: {
        id: contestId,
        joined_users: updatedJoinedCount,
        spots_left: Math.max(0, maxParticipants - updatedJoinedCount),
        user_entry_count: userEntryCount,
        remaining_entries: Math.max(0, maxEntries - userEntryCount),
      },
      should_refresh: true,
      unread_notifications: await getUnreadCount(userId),
    });
  } catch (err) {
    await session.abortTransaction();
    logger.error('bulkJoinContest error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  } finally {
    session.endSession();
  }
};

/**
 * GET /api/v1/contests - list all contests
 */
const contests = async (req, res) => {
  try {
    const allContests = await Contest.find({}).sort({ created_at: -1 }).lean();
    const enriched = await Promise.all(allContests.map(async (c) => {
      const session = await LeagueSession.findById(c.league_session_id).select('name').lean();
      return { ...c, session_name: session?.name || null };
    }));
    return res.json({ success: true, contests: enriched });
  } catch (err) {
    logger.error('contests list error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * GET /api/v1/contests/session-details/:sessionId
 */
const getSessionDetails = async (req, res) => {
  try {
    const session = await LeagueSession.findById(req.params.sessionId).lean();
    if (!session) return res.status(404).json({ error: 'Session not found' });
    return res.json({ success: true, session });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * GET /api/v1/contests/active-session
 */
const getActiveSession = async (req, res) => {
  try {
    const session = await LeagueSession.findOne({ status: 'live' }).sort({ start_time: -1 }).lean();
    if (!session) return res.status(404).json({ error: 'No active session found' });
    return res.json({ session });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * POST /api/v1/contests/calculate-results
 */
const calculateResults = async (req, res) => {
  try {
    const { contest_id } = req.body;
    if (!contest_id) return res.status(400).json({ success: false, error: 'Contest ID required' });

    const contest = await Contest.findById(contest_id).lean();
    if (!contest) return res.status(404).json({ success: false, error: 'Contest not found' });

    const session = await LeagueSession.findById(contest.league_session_id).lean();
    const startPricesMap = {};
    const endPricesMap = {};
    (session?.assets || []).forEach((a) => {
      startPricesMap[a.asset_symbol] = { price: a.start_price || 0 };
      endPricesMap[a.asset_symbol] = { price: a.end_price || 0 };
    });

    const entries = await ContestEntry.find({ contest_id })
      .populate({ path: 'basket_id', model: 'SavedBasket', select: 'assets multipliers' })
      .lean();

    let resultsCalculated = 0;
    for (const entry of entries) {
      const basket = entry.basket_id || {};
      const assets = Array.isArray(basket.assets) ? basket.assets : [];
      const multipliers = Array.isArray(basket.multipliers) ? basket.multipliers : [];
      const { totalScore } = calculateAssetPoints(assets, multipliers, startPricesMap, endPricesMap);

      await ContestEntry.findByIdAndUpdate(entry._id, { total_score: totalScore });
      resultsCalculated++;
    }

    return res.json({ success: true, message: `Results calculated for ${resultsCalculated} entries`, entries_processed: resultsCalculated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

module.exports = {
  contestsBySession,
  getContest,
  getUserContests,
  bulkJoinContest,
  contests,
  getSessionDetails,
  getActiveSession,
  calculateResults,
  buildDynamicPrizeDistribution,
  calculateAssetPoints,
};
