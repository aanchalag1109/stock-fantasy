'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: Automated Notifications and Notification Management
 * Purpose: Send session reminders, winning amount notifications,
 *          and deposit/withdrawal notifications.
 * Origin: Newly implemented in node-project; not directly converted
 *          from the original PHP implementation.
 *
 * Important: Keep this implementation distinguishable from the
 * original PHP project when comparing functionality in the future.
 */

const router = require('express').Router();
const { requireAdmin } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permission');
const ctrl = require('../controllers/notification-settings.controller');

router.get('/', requireAdmin, requirePermission('notification_settings.view'), ctrl.index);
router.post('/', requireAdmin, requirePermission('notification_settings.edit'), ctrl.update);

module.exports = router;
