'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/payment.controller');

router.get('/create-order', ctrl.createOrder);
router.post('/lgpay-callback', ctrl.lgpayCallback);
router.get('/return', ctrl.paymentReturn);

module.exports = router;
