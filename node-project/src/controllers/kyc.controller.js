'use strict';

const KycSubmission = require('../models/kyc-submission.model');
const User = require('../models/user.model');
const logger = require('../config/logger');

/**
 * POST /api/v1/kyc/submit
 */
const submitKyc = async (req, res) => {
  try {
    const userId = req.body.user_id || req.userId;
    if (!userId) return res.status(400).json({ success: false, message: 'user_id required' });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const { aadhar_number, pan_number } = req.body;

    // Handle file uploads
    const files = req.files || {};
    const aadharFront = files.aadhar_front?.[0]?.filename;
    const aadharBack = files.aadhar_back?.[0]?.filename;
    const panFront = files.pan_front?.[0]?.filename;
    const selfie = files.selfie?.[0]?.filename;

    const existing = await KycSubmission.findOne({ user_id: userId });
    if (existing && existing.status === 'approved') {
      return res.status(400).json({ success: false, message: 'KYC already approved' });
    }

    const kycData = {
      user_id: userId,
      aadhar_number: aadhar_number || existing?.aadhar_number,
      pan_number: pan_number || existing?.pan_number,
      status: 'pending',
    };

    if (aadharFront) kycData.aadhar_front = 'uploads/kyc/' + aadharFront;
    if (aadharBack) kycData.aadhar_back = 'uploads/kyc/' + aadharBack;
    if (panFront) kycData.pan_image = 'uploads/kyc/' + panFront;
    if (selfie) kycData.selfie = 'uploads/kyc/' + selfie;

    let kyc;
    if (existing) {
      Object.assign(existing, kycData);
      kyc = await existing.save();
    } else {
      kyc = await KycSubmission.create(kycData);
    }

    // Update user KYC status
    user.kyc_status = 'pending';
    if (aadhar_number) user.aadhar = aadhar_number;
    if (pan_number) user.pan = pan_number;
    await user.save();

    return res.json({ success: true, message: 'KYC submitted successfully', kyc_status: 'pending' });
  } catch (err) {
    logger.error('submitKyc error:', err.message);
    res.status(500).json({ success: false, message: 'KYC submission failed: ' + err.message });
  }
};

/**
 * GET /api/v1/kyc/status?user_id=
 */
const getKycStatus = async (req, res) => {
  try {
    const userId = req.query.user_id || req.userId;
    if (!userId) return res.status(400).json({ success: false, message: 'user_id required' });

    const kyc = await KycSubmission.findOne({ user_id: userId }).lean();
    const user = await User.findById(userId).select('kyc_status').lean();

    return res.json({
      success: true,
      kyc_status: user?.kyc_status || 'pending',
      kyc: kyc || null,
    });
  } catch (err) {
    logger.error('getKycStatus error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch KYC status' });
  }
};

module.exports = { submitKyc, getKycStatus };
