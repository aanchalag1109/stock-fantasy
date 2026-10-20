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
 * Roles are named permission sets. Super admin only.
 */

const mongoose = require('mongoose');
const AdminRole = require('../../models/admin-role.model');
const User = require('../../models/user.model');
const logger = require('../../config/logger');
const { render } = require('../helpers/render');
const { MODULES, normalizePermissions } = require('../access/permissions');

const BASE_PATH = '/admin-roles';

async function findRole(id) {
  if (!mongoose.isValidObjectId(id)) return null;
  return AdminRole.findById(id).lean();
}

const countAdmins = (roleId) => User.countDocuments({ is_admin: true, admin_role_id: roleId });

async function validateForm(body, { existingId = null } = {}) {
  const values = {
    name: String(body.name || '').trim(),
    description: String(body.description || '').trim(),
    permissions: normalizePermissions(body.permissions),
  };
  const errors = {};
  if (!values.name) errors.name = 'Role name is required.';
  else if (values.name.length > 100) errors.name = 'Role name must be at most 100 characters.';
  else if (await AdminRole.exists({ name_key: values.name.toLowerCase(), _id: { $ne: existingId } })) {
    errors.name = 'A role with this name already exists.';
  }
  if (values.description.length > 500) errors.description = 'Description must be at most 500 characters.';
  if (!values.permissions.length) errors.permissions = 'Select at least one permission.';
  return { values, errors };
}

const formView = (res, data) => render(res, 'admin_roles/form', { modules: MODULES, errors: {}, ...data });

const index = async (req, res) => {
  const [roles, counts] = await Promise.all([
    AdminRole.find().sort({ name: 1 }).lean(),
    User.aggregate([
      { $match: { is_admin: true, admin_role_id: { $ne: null } } },
      { $group: { _id: '$admin_role_id', count: { $sum: 1 } } },
    ]),
  ]);
  const adminCounts = Object.fromEntries(counts.map((c) => [String(c._id), c.count]));
  await render(res, 'admin_roles/index', { title: 'Roles & Permissions', roles, adminCounts });
};

const create = (req, res) => formView(res, {
  title: 'Create Role',
  role: null,
  values: { name: '', description: '', permissions: [] },
});

const store = async (req, res) => {
  const { values, errors } = await validateForm(req.body);
  if (Object.keys(errors).length) {
    res.status(422);
    return formView(res, { title: 'Create Role', role: null, values, errors });
  }
  const role = await AdminRole.create({
    ...values,
    name_key: values.name.toLowerCase(),
    created_by: req.adminAccess.userId,
    updated_by: req.adminAccess.userId,
  });
  logger.info(`[admin-access] ${req.adminAccess.email} created role "${role.name}" [${values.permissions.join(', ')}]`);
  req.flash('success', `Role "${role.name}" created.`);
  return res.redirect(BASE_PATH);
};

const edit = async (req, res) => {
  const role = await findRole(req.params.id);
  if (!role) { req.flash('error', 'Role not found.'); return res.redirect(BASE_PATH); }
  return formView(res, {
    title: 'Edit Role',
    role,
    values: { name: role.name, description: role.description || '', permissions: normalizePermissions(role.permissions) },
    assignedCount: await countAdmins(role._id),
  });
};

const update = async (req, res) => {
  const role = await findRole(req.params.id);
  if (!role) { req.flash('error', 'Role not found.'); return res.redirect(BASE_PATH); }
  const { values, errors } = await validateForm(req.body, { existingId: role._id });
  if (Object.keys(errors).length) {
    res.status(422);
    return formView(res, { title: 'Edit Role', role, values, errors, assignedCount: await countAdmins(role._id) });
  }
  await AdminRole.updateOne({ _id: role._id }, {
    $set: { ...values, name_key: values.name.toLowerCase(), updated_by: req.adminAccess.userId },
  });
  logger.info(`[admin-access] ${req.adminAccess.email} updated role "${values.name}" [${values.permissions.join(', ')}]`);
  req.flash('success', `Role "${values.name}" updated. Changes apply to its admins immediately.`);
  return res.redirect(BASE_PATH);
};

const destroy = async (req, res) => {
  const role = await findRole(req.params.id);
  if (!role) { req.flash('error', 'Role not found.'); return res.redirect(BASE_PATH); }
  const assigned = await countAdmins(role._id);
  if (assigned) {
    req.flash('error', `Role "${role.name}" is assigned to ${assigned} admin user(s). Reassign them before deleting it.`);
    return res.redirect(BASE_PATH);
  }
  await AdminRole.deleteOne({ _id: role._id });
  logger.info(`[admin-access] ${req.adminAccess.email} deleted role "${role.name}"`);
  req.flash('success', `Role "${role.name}" deleted.`);
  return res.redirect(BASE_PATH);
};

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = {
  index: wrap(index),
  create: wrap(create),
  store: wrap(store),
  edit: wrap(edit),
  update: wrap(update),
  destroy: wrap(destroy),
};
