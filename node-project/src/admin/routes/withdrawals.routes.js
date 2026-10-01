'use strict';
const router = require('express').Router();
const { requireAdmin } = require('../middleware/auth');
const ctrl = require('../controllers/withdrawals.controller');
router.get('/', requireAdmin, ctrl.index);
router.get('/:id', requireAdmin, ctrl.show);
router.put('/:id', requireAdmin, ctrl.update);
module.exports = router;
