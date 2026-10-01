'use strict';

const SavedBasket = require('../models/saved-basket.model');
const LeagueSession = require('../models/league-session.model');
const logger = require('../config/logger');

/**
 * POST /api/v1/baskets/save
 * Save or update basket.
 */
const saveBasket = async (req, res) => {
  try {
    const userId = req.body.user_id || req.userId;
    const { contest_id, session_id, basket_id, assets = [], multipliers = [], is_standalone } = req.body;

    if (!userId || !session_id) {
      return res.status(400).json({ success: false, message: 'User ID and Session ID required' });
    }

    // Normalize multipliers – only keep selected
    let selectedMultipliers = [];
    if (Array.isArray(multipliers) && multipliers.length > 0) {
      if (multipliers[0] && typeof multipliers[0] === 'object' && 'selected' in multipliers[0]) {
        selectedMultipliers = multipliers.filter((m) => m.selected === true);
      } else {
        selectedMultipliers = multipliers;
      }
    }

    // Update existing basket
    if (basket_id) {
      const basket = await SavedBasket.findOne({ _id: basket_id, user_id: userId });
      if (!basket) {
        return res.status(404).json({ success: false, message: 'Basket not found or unauthorized' });
      }
      basket.assets = assets;
      basket.multipliers = selectedMultipliers;
      await basket.save();
      return res.json({ success: true, message: 'Basket updated successfully', basket_id });
    }

    // Create new standalone basket
    if (is_standalone || req.body.is_standalone === '1') {
      // Generate serial number
      const existingBaskets = await SavedBasket.find({ user_id: userId, session_id })
        .select('serial_no')
        .lean();

      let maxNum = 0;
      existingBaskets.forEach((b) => {
        const match = (b.serial_no || '').match(/^B(\d+)$/);
        if (match) {
          const n = parseInt(match[1]);
          if (n > maxNum) maxNum = n;
        }
      });
      const serialNo = `B${maxNum + 1}`;

      const newBasket = await SavedBasket.create({
        user_id: userId,
        session_id,
        contest_id: contest_id || null,
        serial_no: serialNo,
        assets,
        multipliers: selectedMultipliers,
        total_score: 0,
        is_standalone: true,
      });

      return res.json({
        success: true,
        message: 'Standalone basket saved',
        basket_id: newBasket._id,
        serial_no: serialNo,
      });
    }

    return res.status(400).json({ success: false, message: 'Invalid request: Use is_standalone=1 for new baskets' });
  } catch (err) {
    logger.error('saveBasket error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to save basket: ' + err.message });
  }
};

/**
 * GET /api/v1/baskets?user_id=&session_id=
 */
const getUserBaskets = async (req, res) => {
  try {
    const userId = req.query.user_id || req.userId;
    const { session_id } = req.query;

    if (!userId) return res.status(400).json({ success: false, message: 'user_id required' });

    const filter = { user_id: userId };
    if (session_id) filter.session_id = session_id;

    const baskets = await SavedBasket.find(filter).sort({ created_at: -1 }).lean();
    return res.json({ success: true, baskets });
  } catch (err) {
    logger.error('getUserBaskets error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch baskets' });
  }
};

/**
 * GET /api/v1/baskets/:id
 */
const getBasket = async (req, res) => {
  try {
    const basket = await SavedBasket.findById(req.params.id).lean();
    if (!basket) return res.status(404).json({ success: false, message: 'Basket not found' });
    return res.json({ success: true, basket });
  } catch (err) {
    logger.error('getBasket error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch basket' });
  }
};

/**
 * DELETE /api/v1/baskets/:id
 */
const deleteBasket = async (req, res) => {
  try {
    const userId = req.body.user_id || req.query.user_id || req.userId;
    const basket = await SavedBasket.findOne({ _id: req.params.id, user_id: userId });
    if (!basket) return res.status(404).json({ success: false, message: 'Basket not found or unauthorized' });

    await basket.deleteOne();
    return res.json({ success: true, message: 'Basket deleted' });
  } catch (err) {
    logger.error('deleteBasket error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to delete basket' });
  }
};

/**
 * GET /api/v1/baskets/validate-basket-for-session?session_id=&basket_id=
 */
const validateBasketForSession = async (req, res) => {
  try {
    const { session_id, basket_id } = req.query;
    if (!session_id || !basket_id) {
      return res.status(400).json({ success: false, message: 'session_id and basket_id required' });
    }

    const session = await LeagueSession.findById(session_id).lean();
    if (!session) return res.status(404).json({ success: false, message: 'Session not found' });

    const basket = await SavedBasket.findById(basket_id).lean();
    if (!basket) return res.status(404).json({ success: false, message: 'Basket not found' });

    const maxStocks = session.max_stocks || 5;
    const assetCount = (basket.assets || []).length;

    if (assetCount < maxStocks) {
      return res.json({ valid: false, message: `Basket must have exactly ${maxStocks} assets. Current: ${assetCount}` });
    }

    return res.json({ valid: true, message: 'Basket is valid for this session' });
  } catch (err) {
    logger.error('validateBasketForSession error:', err.message);
    res.status(500).json({ success: false, message: 'Validation failed' });
  }
};

module.exports = { saveBasket, getUserBaskets, getBasket, deleteBasket, validateBasketForSession };
