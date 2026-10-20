'use strict';
const router = require('express').Router();
const { requireAdmin } = require('../middleware/auth');
// NEW IMPLEMENTATION — NODE.JS PROJECT: Admin User Access Control (feature-level permissions)
const { requirePermission } = require('../middleware/permission');
const { notifications } = require('../controllers/misc.controller');
router.get('/', requireAdmin, requirePermission('notifications.view'), notifications.create);
router.get('/send', requireAdmin, requirePermission('notifications.view'), notifications.create);
router.post('/send', requireAdmin, requirePermission('notifications.send'), notifications.send);
module.exports = router;
