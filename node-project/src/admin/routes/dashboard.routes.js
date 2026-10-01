'use strict';
const router = require('express').Router();
const { requireAdmin } = require('../middleware/auth');
const ctrl = require('../controllers/dashboard.controller');
router.get('/', requireAdmin, ctrl.index);
module.exports = router;
