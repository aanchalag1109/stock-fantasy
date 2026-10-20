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
 * attachAdminAccess runs on every admin request (mounted in src/admin/app.js).
 * requirePermission / requireSuperAdmin are added to each route after requireAdmin.
 * Each guard is tagged (fn.permissions / fn.superAdminOnly) so tests can verify that
 * no admin route is left without a permission check.
 */

const { render } = require('../helpers/render');
const access = require('../../services/admin-access.service');
const { isValidPermission } = require('../access/permissions');

const wantsJson = (req) => req.xhr
  || (req.get('Accept') || '').includes('application/json')
  || (req.get('Content-Type') || '').includes('application/json')
  || req.originalUrl.startsWith('/api/');

const attachAdminAccess = async (req, res, next) => {
  req.adminAccess = null;
  res.locals.can = () => false;
  res.locals.isSuperAdmin = false;
  res.locals.adminRoleName = null;
  if (!req.session || !req.session.admin) return next();

  try {
    const current = await access.loadAdminAccess(req.session.admin.id);
    if (!current) {
      // Admin was disabled, demoted or deleted since logging in: end the admin session.
      delete req.session.admin;
      req.flash('error', 'Your admin access is no longer active. Please contact a super admin.');
      return next();
    }
    req.adminAccess = current;
    res.locals.can = (...permissions) => access.hasPermission(current, permissions.flat());
    res.locals.isSuperAdmin = current.isSuperAdmin;
    res.locals.adminRoleName = current.roleName;
    return next();
  } catch (err) {
    return next(err); // fail closed: never continue without knowing the admin's access
  }
};

function deny(req, res, message) {
  if (!req.adminAccess) {
    if (wantsJson(req)) return res.status(401).json({ success: false, error: 'Unauthenticated.', message: 'Unauthenticated.' });
    req.flash('error', 'Please login to access the admin panel.');
    return res.redirect('/login');
  }
  if (wantsJson(req)) return res.status(403).json({ success: false, error: message, message });

  // Admins without the dashboard land on the first page they can open instead of a 403.
  const landing = access.landingPath(req.adminAccess);
  const path = req.originalUrl.split('?')[0].replace(/\/+$/, '');
  if (req.method === 'GET' && path === '/dashboard' && landing !== '/dashboard') {
    return res.redirect(landing);
  }
  res.status(403);
  return render(res, 'errors/forbidden', { title: 'Access Denied', message, landing });
}

/** Allows the request when the admin has ANY of the given permissions. */
function requirePermission(...permissions) {
  const keys = permissions.flat();
  keys.forEach((key) => {
    if (!isValidPermission(key)) throw new Error(`Unknown admin permission "${key}"`);
  });
  const guard = (req, res, next) => (access.hasPermission(req.adminAccess, keys)
    ? next()
    : deny(req, res, 'You do not have permission to perform this action.'));
  guard.permissions = keys;
  return guard;
}

const requireSuperAdmin = (req, res, next) => (req.adminAccess && req.adminAccess.isSuperAdmin
  ? next()
  : deny(req, res, 'Only super admins can manage admin users and roles.'));
requireSuperAdmin.superAdminOnly = true;

module.exports = { attachAdminAccess, requirePermission, requireSuperAdmin, wantsJson };
