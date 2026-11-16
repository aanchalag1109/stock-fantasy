'use strict';
// NEW IMPLEMENTATION — NODE.JS PROJECT: Admin → USDT Deposits (PayRam)
const router = require('express').Router();
const { requireAdmin } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permission');
const ctrl = require('../controllers/payram-deposits.controller');

router.get('/', requireAdmin, requirePermission('usdt_deposits.view'), ctrl.index);
router.get('/:deposit_id', requireAdmin, requirePermission('usdt_deposits.view'), ctrl.show);
router.post('/:deposit_id/check', requireAdmin, requirePermission('usdt_deposits.manage'), ctrl.action('check'));
router.post('/:deposit_id/approve', requireAdmin, requirePermission('usdt_deposits.manage'), ctrl.action('approve'));
router.post('/:deposit_id/reject', requireAdmin, requirePermission('usdt_deposits.manage'), ctrl.action('reject'));

module.exports = router;
