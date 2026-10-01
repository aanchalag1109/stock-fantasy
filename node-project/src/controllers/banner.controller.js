'use strict';

const Banner = require('../models/banner.model');
const logger = require('../config/logger');

const getBanners = async (req, res) => {
  try {
    const banners = await Banner.find({ status: 'active' }).sort({ _id: -1 }).lean();
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const result = banners.map((b) => ({
      ...b,
      image: b.image ? `${baseUrl}/${b.image}` : null,
    }));
    return res.json({ success: true, banners: result });
  } catch (err) {
    logger.error('getBanners error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

module.exports = { getBanners };
