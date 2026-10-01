'use strict';

const Asset = require('../models/asset.model');
const MarketTypeCategory = require('../models/market-type-category.model');
const logger = require('../config/logger');

/**
 * GET /api/v1/market/assets
 */
const getAssets = async (req, res) => {
  try {
    const { type, status = 'active', category_id } = req.query;
    const filter = { status };
    if (type) filter.type = type;
    if (category_id) filter.category_id = category_id;

    const assets = await Asset.find(filter).sort({ name: 1 }).lean();
    return res.json({ success: true, assets });
  } catch (err) {
    logger.error('getAssets error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * GET /api/v1/market/categories
 */
const getCategories = async (req, res) => {
  try {
    const categories = await MarketTypeCategory.find({}).sort({ name: 1 }).lean();
    return res.json({ success: true, categories });
  } catch (err) {
    logger.error('getCategories error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * GET /api/v1/market/assets/grouped
 */
const getAssetsGrouped = async (req, res) => {
  try {
    const assets = await Asset.find({ status: 'active' }).sort({ name: 1 }).lean();
    const categories = await MarketTypeCategory.find({}).lean();

    const catMap = {};
    categories.forEach((c) => { catMap[c._id.toString()] = c.name; });

    const grouped = {};
    assets.forEach((a) => {
      const catName = a.category_id ? (catMap[a.category_id.toString()] || 'Other') : 'Other';
      if (!grouped[catName]) grouped[catName] = [];
      grouped[catName].push(a);
    });

    return res.json({ success: true, grouped });
  } catch (err) {
    logger.error('getAssetsGrouped error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

module.exports = { getAssets, getCategories, getAssetsGrouped };
