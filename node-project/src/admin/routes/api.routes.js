'use strict';
const axios = require('axios');
const mongoose = require('mongoose');
const router = require('express').Router();
const { requireAdmin } = require('../middleware/auth');
const config = require('../../config/env');
const User = require('../../models/user.model');
const Contest = require('../../models/contest.model');
const LeagueSession = require('../../models/league-session.model');
const Asset = require('../../models/asset.model');
const MarketTypeCategory = require('../../models/market-type-category.model');

// Laravel registers this twice. The later api.php route wins and counts contests.status = live.
router.get('/live-contests-count', requireAdmin, async (req, res) => {
  try {
    const count = await Contest.countDocuments({ status: 'live' });
    res.json({ count });
  } catch (err) {
    res.json({ count: 0 });
  }
});

// PHP admin/api/categories/{type} returns id + name. id is the MySQL category id.
router.get('/categories/:type', requireAdmin, async (req, res) => {
  const categories = await MarketTypeCategory.find({ category_type: req.params.type, status: 'active' })
    .sort({ old_id: 1, _id: 1 })
    .select('old_id name')
    .lean();
  res.json(categories.map((category) => ({ id: category.old_id, name: category.name })));
});

// PHP admin/api/assets/{categoryId} filters by the numeric category id.
router.get('/assets/:categoryId', requireAdmin, async (req, res) => {
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

router.get('/v1/stock-live-price', requireAdmin, async (req, res) => {
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

router.get('/v1/crypto-live-price', requireAdmin, async (req, res) => {
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

// All sessions (for dropdowns)
router.get('/sessions', requireAdmin, async (req, res) => {
  const sessions = await LeagueSession.find().select('_id name status').lean();
  res.json(sessions);
});

// User search
router.get('/users/search', requireAdmin, async (req, res) => {
  const { q } = req.query;
  const users = await User.find({
    $or: [{ name: { $regex: q, $options: 'i' } }, { mobile: { $regex: q, $options: 'i' } }]
  }).select('_id name mobile').limit(10).lean();
  res.json(users);
});

module.exports = router;
