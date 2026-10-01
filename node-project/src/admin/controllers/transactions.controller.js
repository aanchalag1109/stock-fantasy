'use strict';

const mongoose = require('mongoose');
const Transaction = require('../../models/transaction.model');
const User = require('../../models/user.model');
const { render } = require('../helpers/render');

const PAGE_SIZE = 15;

function publicId(doc) {
  return doc && doc.old_id != null ? doc.old_id : (doc ? String(doc._id) : '');
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.');
}

function money(value) {
  return (Number(value) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function limitText(value, limit) {
  const text = value == null || value === '' ? 'No description' : String(value);
  const chars = Array.from(text);
  if (chars.length <= limit) return text;
  return chars.slice(0, limit).join('') + '...';
}

function istClock(date) {
  if (!date) return null;
  const dt = new Date(date);
  if (Number.isNaN(dt.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(dt);
  const get = (type) => (parts.find((part) => part.type === type) || {}).value || '';
  let hour = get('hour');
  if (hour === '24') hour = '00';
  const hourNum = Number(hour);
  const period = hourNum >= 12 ? 'PM' : 'AM';
  let hour12 = hourNum % 12;
  if (hour12 === 0) hour12 = 12;
  return {
    date: `${get('month')} ${get('day')}, ${get('year')}`,
    time24: `${hour}:${get('minute')} ${period}`,
    time12: `${String(hour12).padStart(2, '0')}:${get('minute')} ${period}`,
  };
}

function sameInstant(left, right) {
  if (!left || !right) return false;
  const a = new Date(left).getTime();
  const b = new Date(right).getTime();
  return Number.isFinite(a) && a === b;
}

async function findTransaction(id) {
  const value = String(id || '');
  if (value.length === 24 && mongoose.isValidObjectId(value)) {
    const doc = await Transaction.findById(value);
    if (doc) return doc;
  }
  if (/^\d+$/.test(value)) return Transaction.findOne({ old_id: Number(value) });
  return null;
}

async function usersByKeys(keys) {
  const objectIds = keys.filter((id) => String(id).length === 24 && mongoose.isValidObjectId(String(id)));
  const numbers = keys.filter((id) => /^\d+$/.test(String(id))).map(Number);
  const clauses = [];
  if (objectIds.length) clauses.push({ _id: { $in: objectIds } });
  if (numbers.length) clauses.push({ old_id: { $in: numbers } });
  if (!clauses.length) return new Map();
  const users = await User.find({ $or: clauses })
    .select('old_id name email deposit_balance winnings_balance payment_details')
    .lean();
  const map = new Map();
  users.forEach((user) => {
    map.set(String(user._id), user);
    if (user.old_id != null) map.set(String(user.old_id), user);
  });
  return map;
}

async function userKeysForSearch(search) {
  const regex = new RegExp(escapeRegex(search), 'i');
  const users = await User.find({ $or: [{ name: regex }, { email: regex }] }).select('_id old_id').lean();
  const keys = [];
  users.forEach((user) => {
    keys.push(user._id);
    if (user.old_id != null) keys.push(user.old_id);
  });
  return keys;
}

const index = async (req, res) => {
  try {
    const search = req.query.search || '';
    const type = req.query.type || '';
    const status = req.query.status || '';
    const userId = req.query.user_id || '';
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const filter = {};
    if (type) filter.type = type;
    if (status) filter.status = status;
    let userKeys = null;
    if (userId) {
      userKeys = /^\d+$/.test(String(userId)) ? await userKeysForId(userId) : [userId];
    }
    if (search) {
      const searchKeys = await userKeysForSearch(search);
      if (userKeys) {
        const allowed = new Set(userKeys.map((key) => String(key)));
        userKeys = searchKeys.filter((key) => allowed.has(String(key)));
      } else {
        userKeys = searchKeys;
      }
    }
    if (userKeys) filter.user_id = { $in: userKeys.length ? userKeys : ['__none__'] };
    const total = await Transaction.countDocuments(filter);
    const rows = await Transaction.find(filter)
      .sort({ created_at: -1, old_id: 1 })
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .lean();
    const userMap = await usersByKeys(rows.map((row) => row.user_id));
    const transactions = rows.map((row) => {
      const user = userMap.get(String(row.user_id)) || null;
      const clock = istClock(row.created_at);
      return {
        ...row,
        display_id: publicId(row),
        user,
        date_label: clock ? clock.date : '',
        time_label: clock ? clock.time24 : '',
        description_label: limitText(row.description, 30),
      };
    });
    await render(res, 'transactions/index', {
      title: 'Transaction Management',
      transactions,
      total,
      pages: Math.ceil(total / PAGE_SIZE),
      page,
      search,
      type,
      status,
      user_id: userId,
      money,
      admin: req.session.admin,
    });
  } catch (err) {
    res.status(500).send(err.message);
  }
};

async function userKeysForId(userId) {
  const user = await User.findOne({ old_id: Number(userId) }).select('_id old_id').lean();
  const keys = [Number(userId)];
  if (user) keys.push(user._id);
  return keys;
}

const show = async (req, res) => {
  try {
    const transaction = await findTransaction(req.params.id);
    if (!transaction) {
      req.flash('error', 'Not found');
      return res.redirect('/transactions');
    }
    const lean = transaction.toObject();
    const userMap = await usersByKeys([lean.user_id]);
    const user = userMap.get(String(lean.user_id)) || null;
    const created = istClock(lean.created_at);
    const updated = istClock(lean.updated_at);
    await render(res, 'transactions/show', {
      title: `Transaction #${publicId(lean)}`,
      transaction: lean,
      displayId: publicId(lean),
      user,
      userRef: user && user.old_id != null ? user.old_id : lean.user_id,
      createdLabel: created ? `${created.date} ${created.time12}` : '',
      updatedLabel: updated ? `${updated.date} ${updated.time12}` : '',
      showUpdated: !sameInstant(lean.created_at, lean.updated_at),
      money,
      admin: req.session.admin,
    });
  } catch (err) {
    res.status(500).send(err.message);
  }
};

const approve = async (req, res) => {
  const back = '/transactions/' + req.params.id;
  try {
    const transaction = await findTransaction(req.params.id);
    if (!transaction || transaction.status !== 'pending') {
      req.flash('error', 'Only pending transactions can be approved.');
      return res.redirect(back);
    }
    transaction.status = 'success';
    await transaction.save();
    if (transaction.type === 'deposit') {
      const user = await User.findOne(
        String(transaction.user_id).length === 24 && mongoose.isValidObjectId(String(transaction.user_id))
          ? { _id: transaction.user_id }
          : { old_id: Number(transaction.user_id) }
      );
      if (user) {
        user.deposit_balance = Number(user.deposit_balance || 0) + Number(transaction.amount || 0);
        await user.save();
      }
    }
    req.flash('success', 'Transaction approved successfully!');
    res.redirect('/transactions/' + publicId(transaction));
  } catch (err) {
    req.flash('error', err.message);
    res.redirect(back);
  }
};

const reject = async (req, res) => {
  const back = '/transactions/' + req.params.id;
  try {
    const transaction = await findTransaction(req.params.id);
    if (!transaction || transaction.status !== 'pending') {
      req.flash('error', 'Only pending transactions can be rejected.');
      return res.redirect(back);
    }
    transaction.status = 'failed';
    await transaction.save();
    if (transaction.type === 'withdrawal') {
      const user = await User.findOne(
        String(transaction.user_id).length === 24 && mongoose.isValidObjectId(String(transaction.user_id))
          ? { _id: transaction.user_id }
          : { old_id: Number(transaction.user_id) }
      );
      if (user) {
        user.winnings_balance = Number(user.winnings_balance || 0) + Number(transaction.amount || 0);
        await user.save();
        await Transaction.create({
          user_id: user._id,
          type: 'deposit',
          amount: transaction.amount,
          status: 'success',
          description: 'Withdrawal rejected - Refund to winnings',
        });
      }
    }
    req.flash('success', 'Transaction rejected successfully!');
    res.redirect('/transactions/' + publicId(transaction));
  } catch (err) {
    req.flash('error', err.message);
    res.redirect(back);
  }
};

module.exports = { index, show, approve, reject };
