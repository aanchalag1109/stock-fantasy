'use strict';

const WithdrawalRequest = require('../../models/withdrawal-request.model');
const { render } = require('../helpers/render');
const withdrawalService = require('../../services/payments/withdrawal.service');

const index = async (req, res) => {
  try {
    const { status, page = 1 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    const limit = 20;
    const skip = (page - 1) * limit;
    const [requests, total] = await Promise.all([
      WithdrawalRequest.find(filter).sort({ created_at: -1 }).skip(skip).limit(limit)
        .populate({ path: 'user_id', model: 'User', select: 'name mobile email' }).lean(),
      WithdrawalRequest.countDocuments(filter),
    ]);
    render(res, 'withdrawals/index', { title: 'Withdrawal Requests', requests, total, pages: Math.ceil(total / limit), page: parseInt(page), status, admin: req.session.admin });
  } catch (err) { res.status(500).send(err.message); }
};

const show = async (req, res) => {
  try {
    const request = await WithdrawalRequest.findById(req.params.id)
      .populate({ path: 'user_id', model: 'User', select: 'name mobile email payment_details winnings_balance deposit_balance old_id' }).lean();
    if (!request) { req.flash('error', 'Not found'); return res.redirect('/withdrawal_requests'); }

    // Fetch last 5 withdrawal requests for this user (for history panel)
    const history = await WithdrawalRequest.find({ user_id: request.user_id?._id || request.user_id })
      .sort({ created_at: -1 }).limit(5).select('amount status created_at _id').lean();

    render(res, 'withdrawals/show', { title: 'Withdrawal Detail', request, history, admin: req.session.admin });
  } catch (err) { res.status(500).send(err.message); }
};

// NEW IMPLEMENTATION — NODE.JS PROJECT: approve / reject through services/payments/withdrawal.service.js
// (atomic claim, refund exactly once on reject, payout reference recorded). The previous version
// used MongoDB transactions, which fail on the standalone deployment.
const update = async (req, res) => {
  const { status, admin_message: adminMessage, payout_reference: payoutReference } = req.body;
  const action = status === 'accepted' || status === 'approved' ? 'approve' : status === 'rejected' ? 'reject' : null;
  const result = await withdrawalService.processWithdrawal(req.params.id, {
    action, adminMessage, payoutReference, admin: req.adminAccess ? req.adminAccess.email : 'admin',
  }).catch((err) => ({ type: 'error', message: err.message }));
  req.flash(result.type, result.message);
  res.redirect('/withdrawal_requests');
};

module.exports = { index, show, update };
