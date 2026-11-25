'use strict';

const KycSubmission = require('../models/kyc-submission.model');
const User = require('../models/user.model');
const logger = require('../config/logger');
// NEW IMPLEMENTATION — NODE.JS PROJECT
const { findByPublicId } = require('../helpers/mobile-compat');
const { mask } = require('../services/admin-user-profile.service');
const { compact, numbersOf, latestFor, stateOf } = require('../services/kyc.service');
const settings = require('../services/deposit-withdrawal-settings.service');

/**
 * POST /api/v1/kyc/submit
 *
 * NEW IMPLEMENTATION — NODE.JS PROJECT: numeric user ids work (the app's ids; they failed before, so the
 * submission never reached the admin), a resubmission clears the old decision and is kept in the history,
 * and an approval made at the same moment is never overwritten.
 */
const submitKyc = async (req, res) => {
  try {
    const userId = req.body.user_id || req.userId;
    if (!userId) return res.status(400).json({ success: false, message: 'user_id required' });

    const user = await findByPublicId(User, userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const aadhar = compact(req.body.aadhar_number);
    const pan = compact(req.body.pan_number);

    // Handle file uploads
    const files = req.files || {};
    const uploaded = {};
    [['aadhar_front', 'aadhar_front'], ['aadhar_back', 'aadhar_back'], ['pan_front', 'pan_image'], ['selfie', 'selfie']].forEach(([field, key]) => {
      const file = files[field] && files[field][0];
      if (file) uploaded[key] = 'uploads/kyc/' + file.filename;
    });

    const existing = await latestFor(user);
    if (stateOf(user, existing) === 'approved') {
      return res.status(400).json({ success: false, message: 'KYC already approved' });
    }

    const now = new Date();
    const set = {
      ...(aadhar ? { aadhar_number: aadhar } : {}),
      ...(pan ? { pan_number: pan } : {}),
      ...uploaded,
      status: 'pending',
      submitted_at: now,
      rejection_reason: null,
      reviewed_at: null,
      reviewed_by: null,
      review_note: null,
    };
    if (existing) {
      const updated = await KycSubmission.findOneAndUpdate(
        { _id: existing._id, status: existing.status }, // not reviewed meanwhile
        { $set: set, $push: { history: { action: 'resubmitted', from: existing.status, at: now, by: null, reason: null, note: null } } },
      );
      if (!updated) return res.status(409).json({ success: false, message: 'Your KYC was just updated. Please open the page again.' });
    } else {
      await KycSubmission.create({ user_id: user._id, ...set, history: [{ action: 'submitted', from: null, at: now, by: null, reason: null, note: null }] });
    }

    // Update user KYC status
    await User.updateOne({ _id: user._id }, { $set: { kyc_status: 'pending', ...(aadhar ? { aadhar } : {}), ...(pan ? { pan } : {}) } });

    return res.json({ success: true, message: 'KYC submitted successfully', kyc_status: 'pending' });
  } catch (err) {
    logger.error(`submitKyc error: ${err.message}`);
    res.status(500).json({ success: false, message: 'KYC submission failed: ' + err.message });
  }
};

/**
 * GET /api/v1/kyc/status?user_id=
 *
 * NEW IMPLEMENTATION — NODE.JS PROJECT: numeric ids; numbers masked and no document links, because this
 * endpoint answers anyone who sends a user_id.
 */
const getKycStatus = async (req, res) => {
  try {
    const userId = req.query.user_id || req.userId;
    if (!userId) return res.status(400).json({ success: false, message: 'user_id required' });

    const user = await findByPublicId(User, userId);
    const kyc = user ? await latestFor(user) : null;
    const numbers = kyc ? numbersOf(kyc) : {};
    const state = user ? stateOf(user, kyc) : 'not_submitted';
    const required = await settings.isKycRequired();

    return res.json({
      success: true,
      kyc_status: user?.kyc_status || 'pending',
      submitted: Boolean(kyc),
      state, // approved | pending | rejected | not_submitted
      can_submit: Boolean(user) && (state === 'not_submitted' || state === 'rejected'),
      required_for_withdrawal: required,
      can_withdraw: state === 'approved' || !required,
      kyc: kyc ? {
        _id: kyc._id,
        status: kyc.status,
        rejection_reason: kyc.rejection_reason || null,
        aadhar_number: mask(numbers.aadhaar),
        pan_number: mask(numbers.pan),
        documents: {
          aadhar_front: Boolean(kyc.aadhar_front),
          aadhar_back: Boolean(kyc.aadhar_back),
          pan_front: Boolean(kyc.pan_image),
          selfie: Boolean(kyc.selfie || kyc.selfie_image),
        },
        submitted_at: kyc.submitted_at || kyc.created_at || null,
        reviewed_at: kyc.reviewed_at || null,
        created_at: kyc.created_at || null,
        updated_at: kyc.updated_at || null,
      } : null,
    });
  } catch (err) {
    logger.error(`getKycStatus error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Failed to fetch KYC status' });
  }
};

module.exports = { submitKyc, getKycStatus };
