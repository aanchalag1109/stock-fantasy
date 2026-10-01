'use strict';

const router = require('express').Router();
const { guestOnly } = require('../middleware/auth');
const ctrl = require('../controllers/auth.controller');

router.get('/login', guestOnly, ctrl.showLogin);
router.post('/login', guestOnly, ctrl.login);
router.get('/logout', ctrl.logout);
router.post('/logout', ctrl.logout);

module.exports = router;
