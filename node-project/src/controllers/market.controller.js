'use strict';

const Asset = require('../models/asset.model');
const MarketTypeCategory = require('../models/market-type-category.model');
const logger = require('../config/logger');
// NEW IMPLEMENTATION — NODE.JS PROJECT: assets are a master list per market (no global category)
const markets = require('../services/markets');

/**
 * GET /api/v1/market/assets?market=indian_stock|us_stock|crypto&type=stock|crypto&status=active
 * (category_id is no longer an asset field and is ignored.)
 */
const getAssets = async (req, res) => {
  try {
    const { type, status = 'active', market } = req.query;
    const filter = { status };
    if (type) filter.type = type;
    if (market) filter.market = { $in: markets.marketsFor(market) };

    const assets = await Asset.find(filter).sort({ name: 1 }).lean();
    return res.json({ success: true, assets });
  } catch (err) {
    logger.error('getAssets error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * GET /api/v1/market/categories?market=… — each with market, min_assets and description.
 */
const getCategories = async (req, res) => {
  try {
    const filter = req.query.market ? { market: { $in: markets.marketsFor(req.query.market) } } : {};
    const categories = await MarketTypeCategory.find(filter).sort({ name: 1 }).lean();
    return res.json({ success: true, categories });
  } catch (err) {
    logger.error('getCategories error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * GET /api/v1/market/assets/grouped — active assets grouped by market label
 * ("Indian Stock", "US Stock", "Crypto"). Categories are chosen per session, so they no
 * longer group the master list.
 */
const getAssetsGrouped = async (req, res) => {
  try {
    const assets = await Asset.find({ status: 'active' }).sort({ name: 1 }).lean();
    const grouped = {};
    assets.forEach((a) => {
      const label = markets.labelOf(a.market) || 'Other';
      if (!grouped[label]) grouped[label] = [];
      grouped[label].push(a);
    });
    return res.json({ success: true, grouped });
  } catch (err) {
    logger.error('getAssetsGrouped error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

module.exports = { getAssets, getCategories, getAssetsGrouped };
