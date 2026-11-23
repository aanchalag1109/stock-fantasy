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
// NEW IMPLEMENTATION — NODE.JS PROJECT: ProbCoin labels on transactions
const { transactionLabels } = require('../helpers/mobile-compat');
// NEW IMPLEMENTATION — NODE.JS PROJECT: admin-configured deposit/withdrawal limits
const { checkTransactionAmount, limitErrorBody } = require('../services/deposit-withdrawal-settings.service');
// NEW IMPLEMENTATION — NODE.JS PROJECT: Automated Notifications
const { notify } = require('../services/notifications/notification.service');
const withdrawals = require('../services/payments/withdrawal.service'); // NEW IMPLEMENTATION — NODE.JS PROJECT

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

      // NEW IMPLEMENTATION — NODE.JS PROJECT: amounts are ProbCoins (unit, label, real-money side if any)
      return { ...tx, ...transactionLabels(tx) };
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
  // NEW IMPLEMENTATION — NODE.JS PROJECT: same request as POST /withdraw/request (currency USDT): the
  // ProbCoins are converted at the admin rate and checked against the USDT withdrawal limits (before,
  // the ProbCoins were compared with the ₹ limits). No MongoDB transaction (fails on the standalone
  // deployment); the service uses a guarded atomic debit instead.
  try {
    const userId = req.body.user_id || req.userId;
    if (!userId) return res.status(400).json({ success: false, error: 'user_id is required' });
    const user = await withdrawals.findUser(userId);
    const out = await withdrawals.legacyUsdtWithdrawal({ user, amount: req.body.amount, message: req.body.message || null });
    if (!out.result) return res.status(out.status).json(out.body);
    const { withdrawal, quote, user: fresh } = out.result;
    const deposit = parseFloat(fresh.deposit_balance || 0);
    const winnings = parseFloat(fresh.winnings_balance || 0);
    return res.json({
      success: true,
      withdrawal_id: withdrawal._id,
      message: 'Withdrawal request submitted. Admin will process it shortly.',
      wallet_balance: parseFloat((deposit + winnings).toFixed(2)),
      deposit_balance: parseFloat(deposit.toFixed(2)),
      winnings_balance: parseFloat(winnings.toFixed(2)),
      usdt_address: withdrawal.usdt_wallet_address,
      usdt_network: withdrawal.usdt_network || quote.network,
      payout_amount: quote.payout_amount,
      unread_notifications: await getUnreadCount(fresh._id),
    });
  } catch (err) {
    logger.error('withdrawAmount error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to create withdrawal request: ' + err.message });
  }
};

/**
 * GET /api/v1/wallet/withdrawal-requests?user_id=
 */
const getWithdrawalRequests = async (req, res) => {
  try {
    const userId = req.query.user_id || req.userId;
    if (!userId) return res.status(400).json({ success: false, message: 'user_id required' });

    // NEW IMPLEMENTATION — NODE.JS PROJECT: numeric or ObjectId user ids (the raw string matched nothing),
    // and the status the app understands ('accepted', as PHP) plus a label.
    const user = await withdrawals.findUser(userId);
    if (!user) return res.json({ success: true, withdrawal_requests: [] });
    const keys = user.old_id != null ? [user._id, user.old_id] : [user._id];
    const requests = await WithdrawalRequest.find({ user_id: { $in: keys } }).sort({ created_at: -1 }).lean();
    return res.json({
      success: true,
      withdrawal_requests: requests.map((r) => ({ ...r, status: withdrawals.appStatus(r.status), status_label: withdrawals.statusLabel(r.status) })),
    });
  } catch (err) {
    logger.error('getWithdrawalRequests error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch withdrawal requests' });
  }
};

module.exports = { getWalletAmount, getUserTransactions, depositAmount, withdrawAmount, getWithdrawalRequests };
