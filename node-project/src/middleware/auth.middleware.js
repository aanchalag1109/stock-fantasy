'use strict';

const jwt = require('jsonwebtoken');
const User = require('../models/user.model');
const config = require('../config/env');
const logger = require('../config/logger');

/**
 * Verifies JWT token from Authorization header.
 * Sets req.user to the authenticated user document.
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Unauthorized: No token provided' });
    }

    const token = authHeader.split(' ')[1];
    let decoded;
    try {
      decoded = jwt.verify(token, config.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ success: false, message: 'Unauthorized: Invalid or expired token' });
    }

    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      return res.status(401).json({ success: false, message: 'Unauthorized: User not found' });
    }

    req.user = user;
    req.userId = user._id.toString();
    next();
  } catch (err) {
    logger.error('Auth middleware error:', err.message);
    res.status(500).json({ success: false, message: 'Authentication error' });
  }
};

/**
 * Optional auth – attaches user if token present but does not block.
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        const decoded = jwt.verify(token, config.JWT_SECRET);
        const user = await User.findById(decoded.id).select('-password');
        if (user) {
          req.user = user;
          req.userId = user._id.toString();
        }
      } catch {
        // ignore invalid token for optional auth
      }
    }
    next();
  } catch {
    next();
  }
};

/**
 * Verifies that the request comes with the internal CRON_SECRET header.
 */
const cronAuth = (req, res, next) => {
  const secret = req.headers['x-cron-secret'] || req.query.cron_secret;
  if (!secret || secret !== config.CRON_SECRET) {
    return res.status(403).json({ success: false, message: 'Forbidden: Invalid cron secret' });
  }
  next();
};

module.exports = { authenticate, optionalAuth, cronAuth };
