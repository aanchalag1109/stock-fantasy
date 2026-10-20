'use strict';
const router = require('express').Router();
const { requireAdmin } = require('../middleware/auth');
// NEW IMPLEMENTATION — NODE.JS PROJECT: Admin User Access Control (feature-level permissions)
const { requirePermission } = require('../middleware/permission');
const ctrl = require('../controllers/transactions.controller');
router.get('/', requireAdmin, requirePermission('transactions.view'), ctrl.index);
router.get('/:id', requireAdmin, requirePermission('transactions.view'), ctrl.show);
router.post('/:id/approve', requireAdmin, requirePermission('transactions.approve'), ctrl.approve);
router.post('/:id/reject', requireAdmin, requirePermission('transactions.approve'), ctrl.reject);
module.exports = router;
