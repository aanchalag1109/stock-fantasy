'use strict';
const router = require('express').Router();
const { requireAdmin } = require('../middleware/auth');
// NEW IMPLEMENTATION — NODE.JS PROJECT: Admin User Access Control (feature-level permissions)
const { requirePermission } = require('../middleware/permission');
const ctrl = require('../controllers/contests.controller');
router.get('/', requireAdmin, requirePermission('contests.view'), ctrl.index);
router.get('/create', requireAdmin, requirePermission('contests.create'), ctrl.create);
router.post('/', requireAdmin, requirePermission('contests.create'), ctrl.store);
router.post('/bulk-delete', requireAdmin, requirePermission('contests.delete'), ctrl.bulkDelete);
router.post('/:id/cancel', requireAdmin, requirePermission('contests.edit'), ctrl.cancel);
router.post('/:id/pin', requireAdmin, requirePermission('contests.edit'), ctrl.togglePin);
router.get('/:id', requireAdmin, requirePermission('contests.view'), ctrl.show);
router.get('/:id/edit', requireAdmin, requirePermission('contests.edit'), ctrl.edit);
router.put('/:id', requireAdmin, requirePermission('contests.edit'), ctrl.update);
router.delete('/:id', requireAdmin, requirePermission('contests.delete'), ctrl.destroy);
module.exports = router;
