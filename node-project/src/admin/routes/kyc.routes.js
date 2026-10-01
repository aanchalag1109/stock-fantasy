'use strict';
const router = require('express').Router();
const { requireAdmin } = require('../middleware/auth');
const ctrl = require('../controllers/kyc.controller');
router.get('/', requireAdmin, ctrl.index);
router.get('/:id', requireAdmin, ctrl.show);
router.post('/:id/approve', requireAdmin, ctrl.approve);
router.post('/:id/reject', requireAdmin, ctrl.reject);
module.exports = router;
