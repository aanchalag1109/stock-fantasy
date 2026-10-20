'use strict';
const router = require('express').Router();
const { requireAdmin } = require('../middleware/auth');
// NEW IMPLEMENTATION — NODE.JS PROJECT: Admin User Access Control (feature-level permissions)
const { requirePermission } = require('../middleware/permission');
const { cron } = require('../controllers/misc.controller');
router.get('/', requireAdmin, requirePermission('cron.view'), cron.index);
router.delete('/clear', requireAdmin, requirePermission('cron.clear'), cron.clear);
module.exports = router;
