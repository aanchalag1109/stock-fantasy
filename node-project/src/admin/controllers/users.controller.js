'use strict';

const User = require('../../models/user.model');
const Transaction = require('../../models/transaction.model');
const bcrypt = require('bcryptjs');
const { render } = require('../helpers/render');
// NEW IMPLEMENTATION — NODE.JS PROJECT: Admin User Access Control
const { checkAdminAccountChange } = require('../../services/admin-access.service');

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: Admin User Access Control
 * Admin accounts may only be changed from the Players module by super admins, and
 * only super admins can grant or revoke is_admin. Without this, anyone with
 * users.edit could reset a super admin's password or promote themselves.
 */
const isSuperAdmin = (req) => !!(req.adminAccess && req.adminAccess.isSuperAdmin);
function blockAdminTarget(req, res, user) {
  if (!user || !user.is_admin || isSuperAdmin(req)) return false;
  req.flash('error', 'Admin accounts can only be changed by a super admin (see Admin Users).');
  res.redirect('/users');
  return true;
}

const create = (req, res) => {
  render(res, 'users/create', { title: 'Create New User', admin: req.session.admin });
};

const store = async (req, res) => {
  try {
    const { name, email, mobile, password, password_confirmation, is_admin } = req.body;
    if (!password || password.length < 8) {
      req.flash('error', 'Password must be at least 8 characters');
      return res.redirect('/users/create');
    }
    if (password !== password_confirmation) {
      req.flash('error', 'Passwords do not match');
      return res.redirect('/users/create');
    }
    await User.create({
      name,
      email,
      mobile,
      password: await bcrypt.hash(password, 10),
      // NEW IMPLEMENTATION — NODE.JS PROJECT: only super admins may grant admin access
      is_admin: isSuperAdmin(req) && (is_admin === '1' || is_admin === 'on'),
    });
    req.flash('success', 'User created successfully');
    res.redirect('/users');
  } catch (err) {
    req.flash('error', err.message);
    res.redirect('/users/create');
  }
};

const bulkDelete = async (req, res) => {
  try {
    let ids = [];
    try { ids = JSON.parse(req.body.user_ids || '[]'); } catch (e) { ids = []; }
    if (!Array.isArray(ids) || !ids.length) {
      req.flash('error', 'No users selected for deletion');
      return res.redirect('/users');
    }
    const mongoose = require('mongoose');
    const objectIds = ids.filter((id) => mongoose.isValidObjectId(id) && String(id).length === 24);
    const numbers = ids.filter((id) => /^\d+$/.test(String(id))).map(Number);
    const clauses = [];
    if (objectIds.length) clauses.push({ _id: { $in: objectIds } });
    if (numbers.length) clauses.push({ old_id: { $in: numbers } });
    // NEW IMPLEMENTATION — NODE.JS PROJECT: bulk delete never removes admin accounts (use Admin Users).
    const skippedAdmins = clauses.length ? await User.countDocuments({ $or: clauses, is_admin: true }) : 0;
    const deleted = clauses.length ? await User.deleteMany({ $or: clauses, is_admin: { $ne: true } }) : { deletedCount: 0 };
    if (!deleted.deletedCount) {
      req.flash('error', skippedAdmins ? 'Admin accounts cannot be bulk deleted. Manage them under Admin Users.' : 'No valid users found for deletion');
      return res.redirect('/users');
    }
    req.flash('success', `Successfully deleted ${deleted.deletedCount} user(s)` + (skippedAdmins ? ` (${skippedAdmins} admin account(s) skipped)` : ''));
    res.redirect('/users');
  } catch (err) {
    req.flash('error', err.message);
    res.redirect('/users');
  }
};

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function findUser(id) {
  const mongoose = require('mongoose');
  const value = String(id);
  if (value.length === 24 && mongoose.isValidObjectId(value)) {
    const user = await User.findById(value).lean();
    if (user) return user;
  }
  if (/^\d+$/.test(value)) return User.findOne({ old_id: Number(value) }).lean();
  return null;
}

function playerMatch(query) {
  const match = {
    is_test_user: { $ne: true },
    $nor: [{ is_admin: true, old_id: null }],
  };
  if (query.search) {
    const pattern = new RegExp(escapeRegex(query.search), 'i');
    match.$or = [{ name: pattern }, { email: pattern }, { mobile: pattern }];
  }
  if (query.kyc_status && ['pending', 'verified', 'rejected'].includes(query.kyc_status)) {
    match.kyc_status = query.kyc_status === 'verified' ? 'approved' : query.kyc_status;
  }
  return match;
}

const index = async (req, res) => {
  try {
    const { search = '', is_admin = '' } = req.query;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = 20;
    const match = playerMatch(req.query);
    const [users, total] = await Promise.all([
      User.aggregate([
        { $match: match },
        { $addFields: { created_missing: { $cond: [{ $ifNull: ['$created_at', false] }, 0, 1] } } },
        { $sort: { created_missing: 1, created_at: -1, old_id: -1 } },
        { $skip: (page - 1) * limit },
        { $limit: limit },
        { $project: { created_missing: 0, password: 0 } },
      ]),
      User.countDocuments(match),
    ]);
    await render(res, 'users/index', {
      title: 'Manage Users',
      users,
      total,
      pages: Math.ceil(total / limit) || 1,
      page,
      search,
      is_admin,
      admin: req.session.admin,
    });
  } catch (err) {
    res.status(500).send(err.message);
  }
};

const show = async (req, res) => {
  try {
    const user = await findUser(req.params.id);
    if (!user) { req.flash('error', 'User not found'); return res.redirect('/users'); }
    await render(res, 'users/show', { title: 'User Profile', user, admin: req.session.admin });
  } catch (err) { res.status(500).send(err.message); }
};

const edit = async (req, res) => {
  try {
    const user = await findUser(req.params.id);
    if (!user) { req.flash('error', 'User not found'); return res.redirect('/users'); }
    if (blockAdminTarget(req, res, user)) return; // NEW IMPLEMENTATION — NODE.JS PROJECT
    await render(res, 'users/edit', { title: 'Edit User', user, admin: req.session.admin });
  } catch (err) { res.status(500).send(err.message); }
};

const update = async (req, res) => {
  try {
    const user = await findUser(req.params.id);
    if (!user) { req.flash('error', 'User not found'); return res.redirect('/users'); }
    if (blockAdminTarget(req, res, user)) return; // NEW IMPLEMENTATION — NODE.JS PROJECT
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!name || name.length > 255) {
      req.flash('error', 'The name field is required.');
      return res.redirect('/users/' + user._id + '/edit');
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      req.flash('error', 'The email field is required.');
      return res.redirect('/users/' + user._id + '/edit');
    }
    const taken = await User.findOne({ email, _id: { $ne: user._id } }).select('_id').lean();
    if (taken) {
      req.flash('error', 'The email has already been taken.');
      return res.redirect('/users/' + user._id + '/edit');
    }
    const deposit = req.body.deposit_balance === undefined || req.body.deposit_balance === '' ? 0 : Number(req.body.deposit_balance);
    const winnings = req.body.winnings_balance === undefined || req.body.winnings_balance === '' ? 0 : Number(req.body.winnings_balance);
    if (!Number.isFinite(deposit) || !Number.isFinite(winnings)) {
      req.flash('error', 'Balance must be a number.');
      return res.redirect('/users/' + user._id + '/edit');
    }
    const updates = {
      name,
      email,
      deposit_balance: deposit,
      winnings_balance: winnings,
      // NEW IMPLEMENTATION — NODE.JS PROJECT: only super admins may change admin access
      is_admin: isSuperAdmin(req) ? (req.body.is_admin === '1' || req.body.is_admin === 'on') : !!user.is_admin,
    };
    // NEW IMPLEMENTATION — NODE.JS PROJECT: Admin User Access Control — protect self / last super admin
    if (user.is_admin && !updates.is_admin) {
      const problem = await checkAdminAccountChange({ actorId: req.adminAccess.userId, target: user, next: { is_admin: false } });
      if (problem) { req.flash('error', problem); return res.redirect('/users/' + user._id + '/edit'); }
      updates.is_super_admin = false;
      updates.admin_role_id = null;
    }
    if (req.body.mobile) updates.mobile = String(req.body.mobile).trim();
    if (req.body.password) {
      if (String(req.body.password).length < 8) {
        req.flash('error', 'The password must be at least 8 characters.');
        return res.redirect('/users/' + user._id + '/edit');
      }
      updates.password = await bcrypt.hash(req.body.password, 10);
    }
    await User.findByIdAndUpdate(user._id, updates);
    req.flash('success', 'User updated successfully!');
    res.redirect('/users');
  } catch (err) {
    req.flash('error', err.message);
    res.redirect('/users');
  }
};

const destroy = async (req, res) => {
  try {
    // NEW IMPLEMENTATION — NODE.JS PROJECT: Admin User Access Control — admin accounts are protected
    const target = await User.findById(req.params.id).lean();
    if (blockAdminTarget(req, res, target)) return;
    if (target && target.is_admin) {
      const problem = await checkAdminAccountChange({ actorId: req.adminAccess.userId, target, next: { deleted: true } });
      if (problem) { req.flash('error', problem); return res.redirect('/users'); }
    }
    await User.findByIdAndDelete(req.params.id);
    req.flash('success', 'User deleted');
    res.redirect('/users');
  } catch (err) {
    req.flash('error', err.message);
    res.redirect('/users');
  }
};

const adjustWallet = async (req, res) => {
  try {
    const { type, amount, reason } = req.body;
    const amt = parseFloat(amount) || 0;
    const user = await User.findById(req.params.id);
    if (!user) { req.flash('error', 'User not found'); return res.redirect('/users'); }
    if (blockAdminTarget(req, res, user)) return; // NEW IMPLEMENTATION — NODE.JS PROJECT

    if (type === 'add_deposit') user.deposit_balance = (user.deposit_balance || 0) + amt;
    else if (type === 'add_winnings') user.winnings_balance = (user.winnings_balance || 0) + amt;
    else if (type === 'deduct_deposit') user.deposit_balance = Math.max(0, (user.deposit_balance || 0) - amt);
    else if (type === 'deduct_winnings') user.winnings_balance = Math.max(0, (user.winnings_balance || 0) - amt);
    await user.save();

    await Transaction.create({
      user_id: user._id,
      type: type.startsWith('add') ? 'deposit' : 'withdrawal',
      amount: amt,
      status: 'success',
      description: reason || `Manual ${type} by admin`,
    });

    req.flash('success', `Wallet adjusted: ${type} ₹${amt}`);
    res.redirect('/users/' + req.params.id);
  } catch (err) {
    req.flash('error', err.message);
    res.redirect('/users/' + req.params.id);
  }
};

module.exports = { index, create, store, show, edit, update, destroy, adjustWallet, bulkDelete };
