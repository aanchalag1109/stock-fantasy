'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: OTP-only Login and Signup
 * Purpose: Send an OTP to a mobile number before login or signup
 * Origin: Newly implemented in node-project; not directly converted
 *          from the original PHP implementation.
 *
 * Important: Keep this implementation distinguishable from the
 * original PHP project when comparing functionality in the future.
 *
 * POST /api/v1/send-otp (also /api/v1/auth/send-otp)
 *   body: { mobile, purpose: 'login' | 'signup' }
 */

const User = require('../models/user.model');
const otpService = require('../services/otp.service');
const logger = require('../config/logger');

const sendOtp = async (req, res) => {
  try {
    const mobile = String(req.body.mobile || '').trim();
    const purpose = otpService.normalizePurpose(req.body.purpose);

    if (mobile.length < 10 || mobile.length > 15) {
      return res.status(400).json({ success: false, message: 'Valid mobile number required (10-15 characters).' });
    }
    if (!purpose) {
      return res.status(400).json({ success: false, message: "purpose must be 'login' or 'signup'." });
    }

    // Same exact-match lookup the login/register endpoints use.
    const user = await User.findOne({ mobile }).select('_id').lean();
    if (purpose === 'login' && !user) {
      return res.status(404).json({ success: false, message: 'User not found. Please register first.' });
    }
    if (purpose === 'signup' && user) {
      return res.status(409).json({ success: false, message: 'User with this mobile number already exists.' });
    }

    const result = await otpService.sendOtp(mobile, purpose);
    if (!result.ok) {
      return res.status(result.status).json({ success: false, message: result.message, retry_after: result.retry_after });
    }
    return res.json({
      success: true,
      message: 'OTP sent successfully',
      mobile,
      purpose,
      expires_in: result.expires_in,
      resend_after: result.resend_after,
    });
  } catch (err) {
    logger.error('Send OTP error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to send OTP' });
  }
};

module.exports = { sendOtp };
