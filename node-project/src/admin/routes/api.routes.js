'use strict';
const axios = require('axios');
const mongoose = require('mongoose');
const router = require('express').Router();
const { requireAdmin } = require('../middleware/auth');
// NEW IMPLEMENTATION — NODE.JS PROJECT: Admin User Access Control (feature-level permissions)
const { requirePermission } = require('../middleware/permission');
const config = require('../../config/env');
const User = require('../../models/user.model');
const Contest = require('../../models/contest.model');
const ContestEntry = require('../../models/contest-entry.model');
const Transaction = require('../../models/transaction.model');
const LeagueSession = require('../../models/league-session.model');
const Asset = require('../../models/asset.model');
const MarketTypeCategory = require('../../models/market-type-category.model');

// Laravel registers this twice. The later api.php route wins and counts contests.status = live.
router.get('/live-contests-count', requireAdmin, requirePermission('live_management.view'), async (req, res) => {
  try {
    const count = await Contest.countDocuments({ status: 'live' });
    res.json({ count });
  } catch (err) {
    res.json({ count: 0 });
  }
});

// PHP admin/api/categories/{type} returns id + name. id is the MySQL category id.
router.get('/categories/:type', requireAdmin, requirePermission('sessions.create', 'sessions.edit'), async (req, res) => {
  const categories = await MarketTypeCategory.find({ category_type: req.params.type, status: 'active' })
    .sort({ old_id: 1, _id: 1 })
    .select('old_id name')
    .lean();
  res.json(categories.map((category) => ({ id: category.old_id, name: category.name })));
});

// PHP admin/api/assets/{categoryId} filters by the numeric category id.
router.get('/assets/:categoryId', requireAdmin, requirePermission('sessions.create', 'sessions.edit'), async (req, res) => {
  const categoryId = String(req.params.categoryId);
  const categoryKeys = [];
  if (/^\d+$/.test(categoryId)) {
    categoryKeys.push(Number(categoryId));
    const category = await MarketTypeCategory.findOne({ old_id: Number(categoryId) }).select('_id').lean();
    if (category) categoryKeys.push(category._id);
  } else if (mongoose.isValidObjectId(categoryId) && categoryId.length === 24) {
    categoryKeys.push(new mongoose.Types.ObjectId(categoryId));
  }
  const assets = categoryKeys.length
    ? await Asset.find({ category_id: { $in: categoryKeys }, status: 'active' })
      .sort({ old_id: 1, _id: 1 })
      .select('old_id name symbol image_url')
      .lean()
    : [];
  res.json(assets.map((asset) => ({
    id: asset.old_id,
    name: asset.name,
    symbol: asset.symbol,
    image_url: asset.image_url || null,
  })));
});

router.get('/v1/stock-live-price', requireAdmin, requirePermission('sessions.create', 'sessions.edit', 'live_price_feeds.view'), async (req, res) => {
  try {
    const symbol = req.query.symbol;
    if (!symbol) return res.status(404).json({ success: false, error: 'Stock not found' });
    const response = await axios.get(
      'https://indian-stock-market-data-nse-bse-bcd-mcx-cds-nfo.p.rapidapi.com/v1/rapidapi/stock/quote',
      {
        headers: {
          'x-rapidapi-host': 'indian-stock-market-data-nse-bse-bcd-mcx-cds-nfo.p.rapidapi.com',
          'x-rapidapi-key': config.RAPIDAPI_KEY,
        },
        params: { tradingSymbol: symbol, exchange: 'NSE' },
        timeout: 30000,
        validateStatus: () => true,
      }
    );
    const data = response.status >= 200 && response.status < 300 ? response.data : null;
    if (!data) return res.status(404).json({ success: false, error: 'Stock not found' });
    res.json({
      success: true,
      symbol: data.tradingSymbol || symbol,
      name: data.companyName || symbol,
      price: data.lastPrice || 0,
      change: data.change || 0,
      change_percent: data.pChange || 0,
      volume: data.totalTradedVolume || 0,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/v1/crypto-live-price', requireAdmin, requirePermission('sessions.create', 'sessions.edit', 'live_price_feeds.view'), async (req, res) => {
  try {
    const response = await axios.get('https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest', {
      headers: {
        Accept: 'application/json',
        'X-CMC_PRO_API_KEY': config.CMC_API_KEY,
      },
      params: { limit: 100, convert: 'USD' },
      timeout: (config.PRICE_FETCH_TIMEOUT || 10) * 1000,
      validateStatus: () => true,
    });
    const rows = response.status >= 200 && response.status < 300 ? (response.data?.data || []) : [];
    if (!rows.length) return res.status(404).json({ success: false, error: 'No crypto data' });
    const data = rows.map((crypto) => {
      const quote = (crypto.quote && crypto.quote.USD) || {};
      return {
        symbol: crypto.symbol || '',
        name: crypto.name || '',
        price: quote.price || 0,
        change: quote.price_change_24h || 0,
        change_percent: quote.percent_change_24h || 0,
        volume: quote.volume_24h || 0,
        market_cap: quote.market_cap || 0,
        rank: crypto.cmc_rank || 0,
        status: 'success',
        last_updated: new Date().toISOString(),
      };
    });
    res.json({ success: true, data, timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Session assets grouped by category (used by testing create basket)
router.get('/session-assets/:id', requireAdmin, requirePermission('sessions.view', 'testing.view'), async (req, res) => {
  try {
    const id = String(req.params.id);
    let session = null;
    if (mongoose.isValidObjectId(id)) session = await LeagueSession.findById(id).lean();
    if (!session && /^\d+$/.test(id)) session = await LeagueSession.findOne({ old_id: Number(id) }).lean();
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

    const sessionAssets = session.assets || [];
    if (!sessionAssets.length) return res.json({ success: true, categories: [] });

    const grouped = {};
    sessionAssets.forEach(a => {
      const catName = a.category_name || 'Other';
      if (!grouped[catName]) grouped[catName] = { category_name: catName, display_name: catName, assets: [] };
      grouped[catName].assets.push({
        symbol: a.asset_symbol,
        name: a.asset_name || a.asset_symbol,
        image: `https://ui-avatars.com/api/?name=${a.asset_symbol}&size=40&background=28a745&color=fff`,
      });
    });

    const categories = Object.values(grouped).map(g => ({ ...g, count: g.assets.length }));
    res.json({ success: true, categories });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// All sessions (for dropdowns)
router.get('/sessions', requireAdmin, requirePermission('sessions.view'), async (req, res) => {
  const sessions = await LeagueSession.find().select('_id name status').lean();
  res.json(sessions);
});

// User search
router.get('/users/search', requireAdmin, requirePermission('users.view'), async (req, res) => {
  const { q } = req.query;
  const users = await User.find({
    $or: [{ name: { $regex: q, $options: 'i' } }, { mobile: { $regex: q, $options: 'i' } }]
  }).select('_id name mobile').limit(10).lean();
  res.json(users);
});

// ── Performance APIs ────────────────────────────────────────────────────────

// Live sessions data (mirrors PHP LiveManagementController::getLiveSessionsData)
router.get('/live-sessions-data', requireAdmin, requirePermission('live_management.view'), async (req, res) => {
  try {
    const status = req.query.status || 'all';
    const match = {};
    if (status !== 'all') match.status = status;
    const sessions = await LeagueSession.aggregate([
      { $match: match },
      { $addFields: { id_missing: { $cond: [{ $ifNull: ['$old_id', null] }, 0, 1] } } },
      { $sort: { id_missing: 1, start_time: -1 } },
      { $project: { id_missing: 0 } },
    ]);
    const sessionKeys = sessions.flatMap(s => [s._id, s.old_id].filter(k => k != null));
    const contestRows = sessionKeys.length
      ? await Contest.aggregate([
          { $match: { league_session_id: { $in: sessionKeys } } },
          { $group: { _id: '$league_session_id', count: { $sum: 1 }, total_prize: { $sum: '$prize_pool' } } },
        ])
      : [];
    const contestMap = new Map(contestRows.map(r => [String(r._id), r]));
    const sessionsOut = sessions.map(s => {
      const row = contestMap.get(String(s._id)) || contestMap.get(String(s.old_id)) || { count: 0, total_prize: 0 };
      return {
        id:               s.old_id || String(s._id),
        _id:              String(s._id),
        name:             s.name,
        market_type:      s.market_type,
        status:           s.status,
        start_time:       s.start_time,
        end_time:         s.end_time,
        max_stocks:       s.max_stocks,
        contests_count:   row.count,
        total_prize_pool: row.total_prize || 0,
      };
    });
    res.json({ success: true, sessions: sessionsOut });
  } catch (err) {
    res.json({ success: false, error: err.message, sessions: [] });
  }
});

// Session details (mirrors PHP /api/sessions/:id)
router.get('/sessions/:id', requireAdmin, requirePermission('sessions.view'), async (req, res) => {
  try {
    const id = String(req.params.id);
    let session = null;
    if (mongoose.isValidObjectId(id)) session = await LeagueSession.findById(id).lean();
    if (!session && /^\d+$/.test(id)) session = await LeagueSession.findOne({ old_id: Number(id) }).lean();
    if (!session) return res.status(404).json({ error: 'Session not found' });
    res.json({ success: true, session: { ...session, id: session.old_id || String(session._id) } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Session contests (mirrors PHP PerformanceController::getSessionContests)
router.get('/session-contests/:id', requireAdmin, requirePermission('sessions.view', 'contests.view'), async (req, res) => {
  try {
    const id = String(req.params.id);
    let session = null;
    if (mongoose.isValidObjectId(id)) session = await LeagueSession.findById(id).lean();
    if (!session && /^\d+$/.test(id)) session = await LeagueSession.findOne({ old_id: Number(id) }).lean();
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

    const keys = [session._id];
    if (session.old_id != null) keys.push(session.old_id);
    const contests = await Contest.find({ league_session_id: { $in: keys } })
      .select('old_id category prize_pool entry_fee participants status').lean();

    const contestKeys = contests.flatMap(c => [c._id, c.old_id].filter(k => k != null));
    const joinedRows = contestKeys.length
      ? await ContestEntry.aggregate([
          { $match: { contest_id: { $in: contestKeys } } },
          { $group: { _id: '$contest_id', count: { $sum: 1 } } },
        ])
      : [];
    const joinedMap = new Map(joinedRows.map(r => [String(r._id), r.count]));
    const contestsOut = contests.map(c => ({
      id:               c.old_id || String(c._id),
      _id:              String(c._id),
      category:         c.category,
      prize_pool:       c.prize_pool,
      entry_fee:        c.entry_fee,
      max_participants: c.participants || 0,
      status:           c.status,
      joined_count:     (joinedMap.get(String(c._id)) || 0) + (c.old_id != null ? (joinedMap.get(String(c.old_id)) || 0) : 0),
    }));
    res.json({ success: true, contests: contestsOut });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Session prices — start/end prices stored on session.assets array
router.get('/session-prices/:id', requireAdmin, requirePermission('performance.view'), async (req, res) => {
  try {
    const id = String(req.params.id);
    let session = null;
    if (mongoose.isValidObjectId(id)) session = await LeagueSession.findById(id).lean();
    if (!session && /^\d+$/.test(id)) session = await LeagueSession.findOne({ old_id: Number(id) }).lean();
    if (!session) return res.status(404).json({ success: false, message: 'Session not found' });

    const assets = session.assets || [];
    const startPrices = assets
      .filter(a => a.start_price != null)
      .map(a => ({ asset_symbol: a.asset_symbol, start_price: a.start_price, start_price_fetched_at: a.start_price_fetched_at || null }));
    const endPrices = assets
      .filter(a => a.end_price != null)
      .map(a => ({ asset_symbol: a.asset_symbol, end_price: a.end_price, end_price_fetched_at: a.end_price_fetched_at || null }));

    res.json({
      success: true,
      start_prices: startPrices,
      end_prices:   endPrices,
      session_info: { id: session.old_id || String(session._id), name: session.name, status: session.status, market_type: session.market_type },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Performance contest prices (used in contest.ejs loadPrices)
router.get('/performance/:contestId/prices', requireAdmin, requirePermission('performance.view'), async (req, res) => {
  try {
    const id = String(req.params.contestId);
    let contest = null;
    if (mongoose.isValidObjectId(id)) contest = await Contest.findById(id).lean();
    if (!contest && /^\d+$/.test(id)) contest = await Contest.findOne({ old_id: Number(id) }).lean();
    if (!contest) return res.status(404).json({ success: false, error: 'Contest not found' });

    // Resolve session
    const sessionRef = contest.league_session_id;
    const sessionClauses = [];
    if (sessionRef != null && String(sessionRef).length === 24) sessionClauses.push({ _id: sessionRef });
    if (sessionRef != null && /^\d+$/.test(String(sessionRef)) && String(sessionRef).length < 24) {
      sessionClauses.push({ old_id: Number(sessionRef) });
    }
    const session = sessionClauses.length ? await LeagueSession.findOne({ $or: sessionClauses }).lean() : null;
    const assets = session ? (session.assets || []) : [];

    const startPrices = assets.filter(a => a.start_price != null).map(a => ({
      asset_symbol: a.asset_symbol, start_price: a.start_price, start_price_fetched_at: a.start_price_fetched_at || null,
    }));
    const endPrices = assets.filter(a => a.end_price != null).map(a => ({
      asset_symbol: a.asset_symbol, end_price: a.end_price, end_price_fetched_at: a.end_price_fetched_at || null,
    }));

    res.json({
      success: true,
      start_prices: startPrices,
      end_prices:   endPrices,
      session_info: session ? { id: session.old_id || String(session._id), name: session.name, status: session.status, market_type: session.market_type } : {},
      contest_status: contest.status,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Performance contest transactions (used in contest.ejs loadTransactions)
router.get('/performance/:contestId/transactions', requireAdmin, requirePermission('performance.view'), async (req, res) => {
  try {
    const id = String(req.params.contestId);
    let contest = null;
    if (mongoose.isValidObjectId(id)) contest = await Contest.findById(id).lean();
    if (!contest && /^\d+$/.test(id)) contest = await Contest.findOne({ old_id: Number(id) }).lean();
    if (!contest) return res.status(404).json({ success: false, error: 'Contest not found' });

    const contestKeys = [contest._id];
    if (contest.old_id != null) contestKeys.push(contest.old_id);

    const txns = await Transaction.find({ contest_id: { $in: contestKeys } })
      .sort({ created_at: -1 }).limit(500).lean();

    const userIds = [...new Set(txns.map(t => String(t.user_id)))];
    const users = userIds.length
      ? await User.find({
          $or: [
            { _id: { $in: userIds.filter(id2 => id2.length === 24) } },
            { old_id: { $in: userIds.filter(id2 => /^\d+$/.test(id2) && id2.length < 24).map(Number) } },
          ],
        }).select('old_id name mobile').lean()
      : [];
    const userMap = new Map();
    users.forEach(u => {
      userMap.set(String(u._id), u);
      if (u.old_id != null) userMap.set(String(u.old_id), u);
    });

    const out = txns.map(t => {
      const u = userMap.get(String(t.user_id));
      return { ...t, user_name: u ? u.name : null, user_mobile: u ? u.mobile : null };
    });
    res.json({ success: true, transactions: out });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Performance contest participants (used in contest.ejs loadParticipants)
router.get('/performance/:contestId/participants', requireAdmin, requirePermission('performance.view'), async (req, res) => {
  try {
    const id = String(req.params.contestId);
    let contest = null;
    if (mongoose.isValidObjectId(id)) contest = await Contest.findById(id).lean();
    if (!contest && /^\d+$/.test(id)) contest = await Contest.findOne({ old_id: Number(id) }).lean();
    if (!contest) return res.status(404).json({ success: false, error: 'Contest not found' });

    const contestKeys = [contest._id];
    if (contest.old_id != null) contestKeys.push(contest.old_id);
    const entries = await ContestEntry.find({ contest_id: { $in: contestKeys } })
      .sort({ total_score: -1 }).lean();

    const userIds = [...new Set(entries.map(e => String(e.user_id)))];
    const users = userIds.length
      ? await User.find({
          $or: [
            { _id: { $in: userIds.filter(id2 => id2.length === 24) } },
            { old_id: { $in: userIds.filter(id2 => /^\d+$/.test(id2) && id2.length < 24).map(Number) } },
          ],
        }).select('old_id name mobile winnings_balance').lean()
      : [];
    const userMap = new Map();
    users.forEach(u => {
      userMap.set(String(u._id), u);
      if (u.old_id != null) userMap.set(String(u.old_id), u);
    });

    const participants = entries.map(e => {
      const u = userMap.get(String(e.user_id));
      return { ...e, user_name: u ? u.name : null, user_mobile: u ? u.mobile : null };
    });
    res.json({ success: true, participants });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Test Transaction for a session (mirrors PHP POST /api/test-transaction/:sessionId)
router.post('/test-transaction/:sessionId', requireAdmin, requirePermission('testing.manage'), async (req, res) => {
  try {
    const id = String(req.params.sessionId);
    let session = null;
    if (mongoose.isValidObjectId(id)) session = await LeagueSession.findById(id).lean();
    if (!session && /^\d+$/.test(id)) session = await LeagueSession.findOne({ old_id: Number(id) }).lean();
    if (!session) return res.status(404).json({ success: false, message: 'Session not found' });

    const transactionId = 'TEST_' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();

    const txn = await Transaction.create({
      user_id:        req.session.admin.id,
      contest_id:     null,
      type:           'manual_adjustment',
      amount:         100,
      transaction_id: transactionId,
      status:         'success',
      description:    'Test transaction for session ' + (session.name || String(session._id)),
    });

    res.json({
      success:        true,
      message:        'Test transaction created',
      transaction_id: transactionId,
      session_id:     String(session._id),
      session_name:   session.name,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
