'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/wallet.controller');

router.get('/balance', ctrl.getWalletAmount);
router.get('/transactions', ctrl.getUserTransactions);
router.post('/transactions', ctrl.getUserTransactions);
router.post('/deposit', ctrl.depositAmount);
router.post('/withdraw', ctrl.withdrawAmount);
router.get('/withdrawal-requests', ctrl.getWithdrawalRequests);

module.exports = router;
