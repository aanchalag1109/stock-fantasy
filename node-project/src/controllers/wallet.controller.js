'use strict';

const User = require('../models/user.model');
const Transaction = require('../models/transaction.model');
const WithdrawalRequest = require('../models/withdrawal-request.model');
const Contest = require('../models/contest.model');
const ContestEntry = require('../models/contest-entry.model');
const SavedBasket = require('../models/saved-basket.model');
const LeagueSession = require('../models/league-session.model');
const Notification = require('../models/notification.model');
const mongoose = require('mongoose');
const logger = require('../config/logger');
// NEW IMPLEMENTATION — NODE.JS PROJECT: admin-configured deposit/withdrawal limits
const { checkTransactionAmount, limitErrorBody } = require('../services/deposit-withdrawal-settings.service');
// NEW IMPLEMENTATION — NODE.JS PROJECT: Automated Notifications
const { notify } = require('../services/notifications/notification.service');

async function getUnreadCount(userId) {
  if (!userId) return 0;
  return Notification.countDocuments({ user_id: userId, is_read: false });
}

/**
 * GET /api/v1/wallet/balance?user_id=
 */
const getWalletAmount = async (req, res) => {
  try {
    const userId = req.query.user_id || req.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized or user_id not provided' });

    const user = await User.findById(userId).select('deposit_balance winnings_balance _id');
    if (!user) return res.status(404).json({ error: 'User not found' });

    const unread = await getUnreadCount(user._id);
    return res.json({
      wallet_balance: parseFloat(((user.deposit_balance || 0) + (user.winnings_balance || 0)).toFixed(2)),
      deposit_balance: parseFloat((user.deposit_balance || 0).toFixed(2)),
      winnings_balance: parseFloat((user.winnings_balance || 0).toFixed(2)),
      unread_notifications: unread,
    });
  } catch (err) {
    logger.error('getWalletAmount error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch wallet amount' });
  }
};

/**
 * GET /api/v1/wallet/transactions?user_id=
 */
const getUserTransactions = async (req, res) => {
  try {
    const userId = req.query.user_id || req.body.user_id || req.userId;
    if (!userId) return res.status(400).json({ success: false, message: 'user_id is required' });

    const transactions = await Transaction.find({ user_id: userId })
      .sort({ created_at: -1 })
      .lean();

    // Enrich with contest_name and basket_serial_no
    const enriched = await Promise.all(transactions.map(async (tx) => {
      let contestId = tx.contest_id;
      let entryId = null;

      if (!contestId && tx.transaction_id) {
        const match = tx.transaction_id.match(/CONTEST_(\w+)_ENTRY_(\w+)/);
        if (match) {
          contestId = match[1];
          entryId = match[2];
        }
      }

      if (contestId) {
        const contest = await Contest.findById(contestId)
          .populate({ path: 'league_session_id', select: 'name', model: 'LeagueSession' })
          .select('league_session_id')
          .lean();

        tx.contest_name = contest?.league_session_id?.name || null;

        let entry = null;
        if (entryId) {
          entry = await ContestEntry.findById(entryId).populate({ path: 'basket_id', select: 'serial_no', model: 'SavedBasket' }).lean();
        } else {
          entry = await ContestEntry.findOne({ contest_id: contestId, user_id: userId })
            .populate({ path: 'basket_id', select: 'serial_no', model: 'SavedBasket' })
            .lean();
        }
        tx.basket_serial_no = entry?.basket_id?.serial_no || null;
      } else {
        tx.contest_name = null;
        tx.basket_serial_no = null;
      }

      return tx;
    }));

    return res.json({ transactions: enriched });
  } catch (err) {
    logger.error('getUserTransactions error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch transactions' });
  }
};

/**
 * POST /api/v1/wallet/deposit
 * Manual admin deposit.
 */
const depositAmount = async (req, res) => {
  // NEW IMPLEMENTATION — NODE.JS PROJECT: enforce deposit limits before any write.
  const check = await checkTransactionAmount('deposit', req.body.wallet_balance || req.body.amount);
  if (!check.ok) return res.status(check.status).json(limitErrorBody(check));

  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const userId = req.body.user_id;
    const amount = check.amount;

    if (!userId) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, error: 'user_id and valid amount required' });
    }

    const user = await User.findById(userId).session(session);
    if (!user) {
      await session.abortTransaction();
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    user.deposit_balance = parseFloat((user.deposit_balance || 0)) + amount;
    await user.save({ session });

    const [depositTxn] = await Transaction.create([{
      user_id: userId,
      type: 'deposit',
      amount,
      description: 'Manual deposit',
      status: 'success',
    }], { session });

    await session.commitTransaction();
    // NEW IMPLEMENTATION — NODE.JS PROJECT: Automated Notifications (after commit)
    notify('deposit_success', { user: user._id, dedupeKey: `deposit_success:txn:${depositTxn._id}`, params: { amount }, data: { transaction_id: String(depositTxn._id) } });

    const unread = await getUnreadCount(user._id);
    return res.json({
      success: true,
      wallet_balance: parseFloat(((user.deposit_balance || 0) + (user.winnings_balance || 0)).toFixed(2)),
      deposit_balance: parseFloat((user.deposit_balance || 0).toFixed(2)),
      winnings_balance: parseFloat((user.winnings_balance || 0).toFixed(2)),
      unread_notifications: unread,
    });
  } catch (err) {
    await session.abortTransaction();
    logger.error('depositAmount error:', err.message);
    res.status(500).json({ success: false, error: 'Server error: ' + err.message });
  } finally {
    session.endSession();
  }
};

/**
 * POST /api/v1/wallet/withdraw
 */
const withdrawAmount = async (req, res) => {
  // NEW IMPLEMENTATION — NODE.JS PROJECT: enforce withdrawal limits (replaces the hard-coded 500 minimum).
  const check = await checkTransactionAmount('withdrawal', req.body.amount);
  if (!check.ok) return res.status(check.status).json(limitErrorBody(check));

  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const userId = req.body.user_id || req.userId;
    const amount = check.amount;
    const message = req.body.message || null;

    if (!userId) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, error: 'user_id is required' });
    }

    const user = await User.findById(userId).session(session);
    if (!user) {
      await session.abortTransaction();
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const pd = user.payment_details || {};
    if (!pd.usdt_wallet_address) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        error: 'Please add your USDT wallet address before withdrawing.',
        payment_details_required: true,
      });
    }

    const winnings = parseFloat(user.winnings_balance || 0);
    if (winnings < amount) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        error: 'Insufficient winnings balance. Only winnings can be withdrawn.',
        winnings_balance: winnings,
      });
    }

    user.winnings_balance = winnings - amount;
    await user.save({ session });

    const withdrawal = await WithdrawalRequest.create([{
      user_id: userId,
      amount,
      status: 'pending',
      message,
      usdt_wallet_address: pd.usdt_wallet_address,
      usdt_network: pd.usdt_network || 'BEP20',
    }], { session });

    const withdrawalId = withdrawal[0]._id;

    await Transaction.create([{
      user_id: userId,
      type: 'withdrawal',
      amount,
      description: `Withdrawal request #${withdrawalId} (USDT ${pd.usdt_network || 'BEP20'})`,
      status: 'pending',
    }], { session });

    await session.commitTransaction();
    // NEW IMPLEMENTATION — NODE.JS PROJECT: Automated Notifications (after commit)
    notify('withdrawal_submitted', { user: user._id, dedupeKey: `withdrawal_submitted:${withdrawalId}`, params: { amount }, data: { screen: 'withdrawals', withdrawal_id: String(withdrawalId) } });

    const unread = await getUnreadCount(user._id);
    return res.json({
      success: true,
      withdrawal_id: withdrawalId,
      message: 'Withdrawal request submitted. Admin will process it shortly.',
      wallet_balance: parseFloat(((user.deposit_balance || 0) + (user.winnings_balance || 0)).toFixed(2)),
      deposit_balance: parseFloat((user.deposit_balance || 0).toFixed(2)),
      winnings_balance: parseFloat((user.winnings_balance || 0).toFixed(2)),
      usdt_address: pd.usdt_wallet_address,
      usdt_network: pd.usdt_network || 'BEP20',
      unread_notifications: unread,
    });
  } catch (err) {
    await session.abortTransaction();
    logger.error('withdrawAmount error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to create withdrawal request: ' + err.message });
  } finally {
    session.endSession();
  }
};

/**
 * GET /api/v1/wallet/withdrawal-requests?user_id=
 */
const getWithdrawalRequests = async (req, res) => {
  try {
    const userId = req.query.user_id || req.userId;
    if (!userId) return res.status(400).json({ success: false, message: 'user_id required' });

    const requests = await WithdrawalRequest.find({ user_id: userId }).sort({ created_at: -1 }).lean();
    return res.json({ success: true, withdrawal_requests: requests });
  } catch (err) {
    logger.error('getWithdrawalRequests error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch withdrawal requests' });
  }
};

module.exports = { getWalletAmount, getUserTransactions, depositAmount, withdrawAmount, getWithdrawalRequests };
