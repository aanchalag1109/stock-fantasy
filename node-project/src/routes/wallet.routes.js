'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/wallet.controller');
// NEW IMPLEMENTATION — NODE.JS PROJECT: Admin-Controlled Android Force Update System
const { requireSupportedAppVersion } = require('../middleware/app-version.middleware');

router.get('/balance', ctrl.getWalletAmount);
router.get('/transactions', ctrl.getUserTransactions);
router.post('/transactions', ctrl.getUserTransactions);
router.post('/deposit', requireSupportedAppVersion, ctrl.depositAmount); // NEW IMPLEMENTATION — NODE.JS PROJECT: Android app version guard
router.post('/withdraw', requireSupportedAppVersion, ctrl.withdrawAmount); // NEW IMPLEMENTATION — NODE.JS PROJECT: Android app version guard
router.get('/withdrawal-requests', ctrl.getWithdrawalRequests);

module.exports = router;
