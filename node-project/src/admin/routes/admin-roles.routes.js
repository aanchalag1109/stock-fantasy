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
 */

const router = require('express').Router();
const { requireAdmin } = require('../middleware/auth');
const { requireSuperAdmin } = require('../middleware/permission');
const ctrl = require('../controllers/admin-roles.controller');

const guard = [requireAdmin, requireSuperAdmin];

router.get('/', guard, ctrl.index);
router.get('/create', guard, ctrl.create);
router.post('/', guard, ctrl.store);
router.get('/:id/edit', guard, ctrl.edit);
router.put('/:id', guard, ctrl.update);
router.delete('/:id', guard, ctrl.destroy);

module.exports = router;
