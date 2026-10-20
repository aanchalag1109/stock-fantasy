'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: Deposit and Withdrawal Settings Module
 * Purpose: Manage minimum and maximum deposit and withdrawal limits
 * Origin: Newly implemented in node-project; not directly converted
 *          from the original PHP implementation.
 *
 * Important: Keep this implementation distinguishable from the
 * original PHP project when comparing functionality in the future.
 */

const router = require('express').Router();
const { requireAdmin } = require('../middleware/auth');
// NEW IMPLEMENTATION — NODE.JS PROJECT: Admin User Access Control (feature-level permissions)
const { requirePermission } = require('../middleware/permission');
const controller = require('../controllers/deposit-withdrawal-settings.controller');

router.get('/', requireAdmin, requirePermission('deposit_withdrawal_settings.view'), controller.index);
router.get('/data', requireAdmin, requirePermission('deposit_withdrawal_settings.view'), controller.show);
router.post('/', requireAdmin, requirePermission('deposit_withdrawal_settings.edit'), controller.update);

module.exports = router;
