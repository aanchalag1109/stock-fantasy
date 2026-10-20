'use strict';
const router = require('express').Router();
const { requireAdmin } = require('../middleware/auth');
// NEW IMPLEMENTATION — NODE.JS PROJECT: Admin User Access Control (feature-level permissions)
const { requirePermission } = require('../middleware/permission');
const ctrl = require('../controllers/withdrawals.controller');
router.get('/', requireAdmin, requirePermission('withdrawals.view'), ctrl.index);
router.get('/:id', requireAdmin, requirePermission('withdrawals.view'), ctrl.show);
router.put('/:id', requireAdmin, requirePermission('withdrawals.process'), ctrl.update);
module.exports = router;
