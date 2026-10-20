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
const controller = require('../controllers/deposit-withdrawal-settings.controller');

router.get('/', requireAdmin, controller.index);
router.get('/data', requireAdmin, controller.show);
router.post('/', requireAdmin, controller.update);

module.exports = router;
