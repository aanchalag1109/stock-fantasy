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
 * Admins remain User documents with is_admin = true (unchanged login). Access is
 * resolved from the database on every request, so disabling an admin or editing a
 * role takes effect immediately, even for sessions that are already logged in.
 */

const User = require('../models/user.model');
const AdminRole = require('../models/admin-role.model');
const logger = require('../config/logger');
const { normalizePermissions, LANDING_PAGES } = require('../admin/access/permissions');

const ACCESS_FIELDS = 'name email is_admin is_super_admin admin_role_id admin_status';

const isActive = (user) => (user.admin_status || 'active') !== 'disabled';

/**
 * Returns null when the user is not (or no longer) an active admin.
 * An admin with no role and no super-admin flag gets an empty permission set.
 */
async function loadAdminAccess(userId) {
  if (!userId) return null;
  const user = await User.findById(userId).select(ACCESS_FIELDS).lean();
  if (!user || !user.is_admin || !isActive(user)) return null;

  let role = null;
  if (!user.is_super_admin && user.admin_role_id) {
    role = await AdminRole.findById(user.admin_role_id).select('name permissions').lean();
  }
  return {
    userId: String(user._id),
    name: user.name,
    email: user.email,
    isSuperAdmin: !!user.is_super_admin,
    roleId: role ? String(role._id) : null,
    roleName: user.is_super_admin ? 'Super Admin' : (role ? role.name : null),
    permissions: new Set(user.is_super_admin ? [] : normalizePermissions(role ? role.permissions : [])),
  };
}

// True when access grants ANY of the given permission keys. Super admins always pass.
function hasPermission(access, permissions) {
  if (!access) return false;
  if (access.isSuperAdmin) return true;
  const list = Array.isArray(permissions) ? permissions : [permissions];
  return list.some((key) => access.permissions.has(key));
}

function landingPath(access) {
  const hit = LANDING_PAGES.find(([permission]) => hasPermission(access, permission));
  return hit ? hit[1] : '/profile';
}

function countActiveSuperAdmins(excludeId) {
  const filter = { is_admin: true, is_super_admin: true, admin_status: { $ne: 'disabled' } };
  if (excludeId) filter._id = { $ne: excludeId };
  return User.countDocuments(filter);
}

/**
 * Validates a change to an admin account. `next` holds the fields being changed
 * (is_admin, is_super_admin, admin_status) or { deleted: true }.
 * Returns an error message, or null when the change is allowed.
 */
async function checkAdminAccountChange({ actorId, target, next }) {
  const after = {
    is_admin: next.is_admin !== undefined ? next.is_admin : !!target.is_admin,
    is_super_admin: next.is_super_admin !== undefined ? next.is_super_admin : !!target.is_super_admin,
    admin_status: next.admin_status || target.admin_status || 'active',
  };
  const loses = next.deleted || !after.is_admin || after.admin_status === 'disabled';

  if (String(target._id) === String(actorId)
      && (loses || (target.is_super_admin && !after.is_super_admin))) {
    return 'You cannot remove, disable or reduce your own admin access.';
  }

  const wasActiveSuper = target.is_admin && target.is_super_admin && isActive(target);
  const staysActiveSuper = !loses && after.is_super_admin;
  if (wasActiveSuper && !staysActiveSuper && (await countActiveSuperAdmins(target._id)) === 0) {
    return 'At least one active super admin is required.';
  }
  return null;
}

/**
 * First-deploy safety net. Before this feature every admin had full access, so if
 * no super admin exists yet, all current admins are promoted to keep that behaviour.
 * After the first super admin exists this is a no-op; role-less admins get no access.
 */
async function bootstrapSuperAdmins() {
  const existing = await User.countDocuments({ is_admin: true, is_super_admin: true });
  if (existing > 0) return 0;
  const result = await User.updateMany({ is_admin: true }, { $set: { is_super_admin: true } });
  const promoted = result.modifiedCount || 0;
  if (promoted) logger.warn(`Admin access control: no super admin found, promoted ${promoted} existing admin(s) to super admin.`);
  return promoted;
}

module.exports = {
  loadAdminAccess, hasPermission, landingPath, countActiveSuperAdmins,
  checkAdminAccountChange, bootstrapSuperAdmins,
};
