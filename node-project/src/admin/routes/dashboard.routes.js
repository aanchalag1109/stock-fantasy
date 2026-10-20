'use strict';
const router = require('express').Router();
const { requireAdmin } = require('../middleware/auth');
// NEW IMPLEMENTATION — NODE.JS PROJECT: Admin User Access Control (feature-level permissions)
const { requirePermission } = require('../middleware/permission');
const ctrl = require('../controllers/dashboard.controller');
router.get('/', requireAdmin, requirePermission('dashboard.view'), ctrl.index);
module.exports = router;
