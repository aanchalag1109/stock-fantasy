'use strict';
const router = require('express').Router();
const { requireAdmin } = require('../middleware/auth');
// NEW IMPLEMENTATION — NODE.JS PROJECT: Admin User Access Control (feature-level permissions)
const { requirePermission } = require('../middleware/permission');
const ctrl = require('../controllers/kyc.controller');
router.get('/', requireAdmin, requirePermission('kyc.view'), ctrl.index);
// NEW IMPLEMENTATION — NODE.JS PROJECT: KYC section (client feedback) — before /:id
router.get('/export', requireAdmin, requirePermission('kyc.export'), ctrl.exportCsv);
router.get('/pending-count', requireAdmin, requirePermission('kyc.view'), ctrl.pendingCount);
router.get('/:id', requireAdmin, requirePermission('kyc.view'), ctrl.show);
router.get('/:id/document/:key', requireAdmin, requirePermission('kyc.view'), ctrl.document);
router.post('/:id/approve', requireAdmin, requirePermission('kyc.review'), ctrl.approve);
router.post('/:id/reject', requireAdmin, requirePermission('kyc.review'), ctrl.reject);
module.exports = router;
