'use strict';

const KycSubmission = require('../../models/kyc-submission.model');
const User = require('../../models/user.model');
const { render } = require('../helpers/render');

const index = async (req, res) => {
  try {
    const { status, page = 1 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    const limit = 20;
    const skip = (page - 1) * limit;
    const [submissions, total] = await Promise.all([
      KycSubmission.find(filter).sort({ created_at: -1 }).skip(skip).limit(limit)
        .populate({ path: 'user_id', model: 'User', select: 'name mobile email' }).lean(),
      KycSubmission.countDocuments(filter),
    ]);
    render(res, 'kyc/index', { title: 'KYC Verification', submissions, total, pages: Math.ceil(total / limit), page: parseInt(page), status, admin: req.session.admin });
  } catch (err) { res.status(500).send(err.message); }
};

const show = async (req, res) => {
  try {
    const submission = await KycSubmission.findById(req.params.id)
      .populate({ path: 'user_id', model: 'User', select: 'name mobile email kyc_status' }).lean();
    if (!submission) { req.flash('error', 'Not found'); return res.redirect('/kyc'); }
    render(res, 'kyc/show', { title: 'KYC Details', submission, admin: req.session.admin });
  } catch (err) { res.status(500).send(err.message); }
};

const approve = async (req, res) => {
  try {
    const kyc = await KycSubmission.findById(req.params.id);
    if (!kyc) { req.flash('error', 'Not found'); return res.redirect('/kyc'); }
    kyc.status = 'approved';
    await kyc.save();
    await User.findByIdAndUpdate(kyc.user_id, { kyc_status: 'approved' });
    req.flash('success', 'KYC approved successfully!');
    res.redirect('/kyc');
  } catch (err) { req.flash('error', err.message); res.redirect('/kyc'); }
};

const reject = async (req, res) => {
  try {
    const kyc = await KycSubmission.findById(req.params.id);
    if (!kyc) { req.flash('error', 'Not found'); return res.redirect('/kyc'); }
    kyc.status = 'rejected';
    kyc.rejection_reason = req.body.reason || 'Rejected by admin';
    await kyc.save();
    await User.findByIdAndUpdate(kyc.user_id, { kyc_status: 'rejected' });
    req.flash('success', 'KYC rejected.');
    res.redirect('/kyc');
  } catch (err) { req.flash('error', err.message); res.redirect('/kyc'); }
};

module.exports = { index, show, approve, reject };
