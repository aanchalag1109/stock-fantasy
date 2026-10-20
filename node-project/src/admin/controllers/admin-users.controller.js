'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: Admin User Access Control
 * Purpose: Manage admin users, roles, and feature-level permissions
 * Origin: Newly implemented in node-project; not directly converted
 *          from the original PHP implementation.
 *
 * Important: Keep this implementation distinguishable from the
 * original PHP project when comparing functionality in the future.
 *
 * Admin users are User documents with is_admin = true, so the existing login
 * (email/mobile + bcrypt password) keeps working unchanged. Super admin only.
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../../models/user.model');
const AdminRole = require('../../models/admin-role.model');
const logger = require('../../config/logger');
const { render } = require('../helpers/render');
const { checkAdminAccountChange } = require('../../services/admin-access.service');

const BASE_PATH = '/admin-users';
const SUPER = '__super__';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MOBILE_PATTERN = /^\+?\d{7,15}$/;

const listRoles = () => AdminRole.find().select('name').sort({ name: 1 }).lean();

async function findAdmin(id) {
  if (!mongoose.isValidObjectId(id)) return null;
  return User.findOne({ _id: id, is_admin: true }).lean();
}

function auditLog(req, action, target) {
  logger.info(`[admin-access] ${req.adminAccess.email} ${action} admin ${target.email} (${target._id})`);
}

/** Returns { values, errors } for the create / edit form. */
async function validateForm(body, { existingId = null } = {}) {
  const values = {
    name: String(body.name || '').trim(),
    email: String(body.email || '').trim().toLowerCase(),
    mobile: String(body.mobile || '').trim(),
    access_level: String(body.access_level || ''),
    admin_status: body.admin_status === 'disabled' ? 'disabled' : 'active',
  };
  const password = String(body.password || '');
  const errors = {};

  if (!values.name) errors.name = 'Name is required.';
  else if (values.name.length > 255) errors.name = 'Name must be at most 255 characters.';

  if (!EMAIL_PATTERN.test(values.email)) errors.email = 'A valid email address is required.';
  else if (await User.exists({ email: values.email, _id: { $ne: existingId } })) {
    errors.email = 'This email is already used by another account.';
  }

  if (values.mobile) {
    if (!MOBILE_PATTERN.test(values.mobile)) errors.mobile = 'Mobile must be 7–15 digits, optionally starting with +.';
    else if (await User.exists({ mobile: values.mobile, _id: { $ne: existingId } })) {
      errors.mobile = 'This mobile number is already used by another account.';
    }
  }

  if (!existingId || password) {
    if (password.length < 8) errors.password = 'Password must be at least 8 characters.';
    else if (password !== String(body.password_confirmation || '')) errors.password_confirmation = 'Passwords do not match.';
  }

  if (values.access_level !== SUPER) {
    const role = mongoose.isValidObjectId(values.access_level) ? await AdminRole.exists({ _id: values.access_level }) : null;
    if (!role) errors.access_level = 'Choose a role or Super Admin.';
  }

  return { values, password, errors };
}

function accessFields(values) {
  const isSuper = values.access_level === SUPER;
  return {
    is_admin: true,
    is_super_admin: isSuper,
    admin_role_id: isSuper ? null : values.access_level,
    admin_status: values.admin_status,
  };
}

const formView = async (res, data) => render(res, 'admin_users/form', {
  roles: await listRoles(),
  SUPER,
  errors: {},
  ...data,
});

const index = async (req, res) => {
  const [admins, roles] = await Promise.all([
    User.find({ is_admin: true })
      .select('name email mobile is_super_admin admin_role_id admin_status created_at')
      .sort({ is_super_admin: -1, name: 1 })
      .lean(),
    AdminRole.find().select('name').lean(),
  ]);
  const roleNames = Object.fromEntries(roles.map((r) => [String(r._id), r.name]));
  await render(res, 'admin_users/index', {
    title: 'Admin Users',
    admins,
    roleNames,
    currentAdminId: req.adminAccess.userId,
  });
};

const create = (req, res) => formView(res, {
  title: 'Add Admin User',
  adminUser: null,
  values: { admin_status: 'active', access_level: '' },
});

const store = async (req, res) => {
  const { values, password, errors } = await validateForm(req.body);
  if (Object.keys(errors).length) {
    res.status(422);
    return formView(res, { title: 'Add Admin User', adminUser: null, values, errors });
  }
  const doc = {
    name: values.name,
    email: values.email,
    password: await bcrypt.hash(password, 10),
    ...accessFields(values),
  };
  if (values.mobile) doc.mobile = values.mobile; // omitted when empty: mobile has a sparse unique index
  const created = await User.create(doc);
  auditLog(req, 'created', created);
  req.flash('success', `Admin user ${created.name} created.`);
  return res.redirect(BASE_PATH);
};

const edit = async (req, res) => {
  const adminUser = await findAdmin(req.params.id);
  if (!adminUser) { req.flash('error', 'Admin user not found.'); return res.redirect(BASE_PATH); }
  return formView(res, {
    title: 'Edit Admin User',
    adminUser,
    values: {
      name: adminUser.name,
      email: adminUser.email,
      mobile: adminUser.mobile || '',
      access_level: adminUser.is_super_admin ? SUPER : String(adminUser.admin_role_id || ''),
      admin_status: adminUser.admin_status || 'active',
    },
  });
};

const update = async (req, res) => {
  const adminUser = await findAdmin(req.params.id);
  if (!adminUser) { req.flash('error', 'Admin user not found.'); return res.redirect(BASE_PATH); }

  const { values, password, errors } = await validateForm(req.body, { existingId: adminUser._id });
  if (!Object.keys(errors).length) {
    const fields = accessFields(values);
    const problem = await checkAdminAccountChange({ actorId: req.adminAccess.userId, target: adminUser, next: fields });
    if (problem) errors.access_level = problem;
  }
  if (Object.keys(errors).length) {
    res.status(422);
    return formView(res, { title: 'Edit Admin User', adminUser, values, errors });
  }

  const set = { name: values.name, email: values.email, ...accessFields(values) };
  const unset = {};
  if (values.mobile) set.mobile = values.mobile;
  else unset.mobile = 1;
  if (password) set.password = await bcrypt.hash(password, 10);
  await User.updateOne({ _id: adminUser._id }, Object.keys(unset).length ? { $set: set, $unset: unset } : { $set: set });

  if (String(adminUser._id) === req.adminAccess.userId) {
    req.session.admin.name = values.name;
    req.session.admin.email = values.email;
  }
  auditLog(req, 'updated', { ...adminUser, email: values.email });
  req.flash('success', `Admin user ${values.name} updated.`);
  return res.redirect(BASE_PATH);
};

const toggleStatus = async (req, res) => {
  const adminUser = await findAdmin(req.params.id);
  if (!adminUser) { req.flash('error', 'Admin user not found.'); return res.redirect(BASE_PATH); }
  const nextStatus = (adminUser.admin_status || 'active') === 'disabled' ? 'active' : 'disabled';
  const problem = await checkAdminAccountChange({ actorId: req.adminAccess.userId, target: adminUser, next: { admin_status: nextStatus } });
  if (problem) { req.flash('error', problem); return res.redirect(BASE_PATH); }
  await User.updateOne({ _id: adminUser._id }, { $set: { admin_status: nextStatus } });
  auditLog(req, nextStatus === 'disabled' ? 'disabled' : 'enabled', adminUser);
  req.flash('success', `${adminUser.name} is now ${nextStatus === 'disabled' ? 'disabled' : 'active'}.`);
  return res.redirect(BASE_PATH);
};

// Removes admin access but keeps the User document (and its transaction history).
const revoke = async (req, res) => {
  const adminUser = await findAdmin(req.params.id);
  if (!adminUser) { req.flash('error', 'Admin user not found.'); return res.redirect(BASE_PATH); }
  const problem = await checkAdminAccountChange({ actorId: req.adminAccess.userId, target: adminUser, next: { is_admin: false } });
  if (problem) { req.flash('error', problem); return res.redirect(BASE_PATH); }
  await User.updateOne({ _id: adminUser._id }, {
    $set: { is_admin: false, is_super_admin: false, admin_role_id: null, admin_status: 'active' },
  });
  auditLog(req, 'revoked access of', adminUser);
  req.flash('success', `Admin access removed from ${adminUser.name}.`);
  return res.redirect(BASE_PATH);
};

// Express 4 does not forward rejected promises; surface DB errors to the error handler.
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = {
  index: wrap(index),
  create: wrap(create),
  store: wrap(store),
  edit: wrap(edit),
  update: wrap(update),
  toggleStatus: wrap(toggleStatus),
  revoke: wrap(revoke),
};
