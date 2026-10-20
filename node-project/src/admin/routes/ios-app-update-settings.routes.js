'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: Admin-Controlled iOS Force Update System
 * Purpose: Manage iOS version requirements and update policies
 * Origin: Newly implemented in node-project; not directly converted
 *          from the original PHP implementation.
 *
 * Important: Keep this implementation distinguishable from the
 * original PHP project when comparing functionality in the future.
 *
 * Shares the app_update_settings permission with the Android page.
 */

const router = require('express').Router();
const { requireAdmin } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permission');
const controller = require('../controllers/ios-app-update-settings.controller');

router.get('/', requireAdmin, requirePermission('app_update_settings.view'), controller.index);
router.get('/data', requireAdmin, requirePermission('app_update_settings.view'), controller.show);
router.post('/', requireAdmin, requirePermission('app_update_settings.edit'), controller.update);

module.exports = router;
