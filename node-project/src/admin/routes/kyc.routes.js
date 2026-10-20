'use strict';
const router = require('express').Router();
const { requireAdmin } = require('../middleware/auth');
// NEW IMPLEMENTATION — NODE.JS PROJECT: Admin User Access Control (feature-level permissions)
const { requirePermission } = require('../middleware/permission');
const ctrl = require('../controllers/kyc.controller');
router.get('/', requireAdmin, requirePermission('kyc.view'), ctrl.index);
router.get('/:id', requireAdmin, requirePermission('kyc.view'), ctrl.show);
router.post('/:id/approve', requireAdmin, requirePermission('kyc.review'), ctrl.approve);
router.post('/:id/reject', requireAdmin, requirePermission('kyc.review'), ctrl.reject);
module.exports = router;
