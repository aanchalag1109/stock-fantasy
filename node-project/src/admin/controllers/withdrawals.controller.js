'use strict';

const WithdrawalRequest = require('../../models/withdrawal-request.model');
const User = require('../../models/user.model');
const Transaction = require('../../models/transaction.model');
const { render } = require('../helpers/render');
// NEW IMPLEMENTATION — NODE.JS PROJECT: Automated Notifications
const { notify } = require('../../services/notifications/notification.service');
const mongoose = require('mongoose');

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

const update = async (req, res) => {
  const mongoSession = await mongoose.startSession();
  try {
    mongoSession.startTransaction();
    const { status, admin_message } = req.body;
    const withdrawal = await WithdrawalRequest.findById(req.params.id).session(mongoSession);
    if (!withdrawal || withdrawal.status !== 'pending') {
      await mongoSession.abortTransaction();
      req.flash('error', 'Request already processed or not found');
      return res.redirect('/withdrawal_requests');
    }
    withdrawal.status = status === 'accepted' ? 'approved' : status;
    withdrawal.admin_message = admin_message;
    await withdrawal.save({ session: mongoSession });

    if (status === 'rejected') {
      await User.findByIdAndUpdate(withdrawal.user_id, { $inc: { winnings_balance: withdrawal.amount } }, { session: mongoSession });
      await Transaction.create([{
        user_id: withdrawal.user_id,
        type: 'deposit',
        amount: withdrawal.amount,
        status: 'success',
        description: `Withdrawal rejected - refund${admin_message ? ': ' + admin_message : ''}`,
      }], { session: mongoSession });
    }

    await mongoSession.commitTransaction();
    // NEW IMPLEMENTATION — NODE.JS PROJECT: Automated Notifications — after the admin decision is committed; one per withdrawal and outcome
    if (withdrawal.status === 'approved' || withdrawal.status === 'rejected') {
      notify(`withdrawal_${withdrawal.status}`, {
        user: withdrawal.user_id,
        dedupeKey: `withdrawal_${withdrawal.status}:${withdrawal._id}`,
        params: { amount: withdrawal.amount, reason: withdrawal.status === 'rejected' ? admin_message : null },
        data: { screen: 'withdrawals', withdrawal_id: String(withdrawal._id) },
      });
    }
    req.flash('success', status === 'accepted' ? 'Withdrawal accepted. Please send USDT to user wallet.' : 'Withdrawal rejected. Amount refunded.');
    res.redirect('/withdrawal_requests');
  } catch (err) {
    await mongoSession.abortTransaction();
    req.flash('error', err.message);
    res.redirect('/withdrawal_requests');
  } finally { mongoSession.endSession(); }
};

module.exports = { index, show, update };
