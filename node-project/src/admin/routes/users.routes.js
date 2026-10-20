'use strict';
const router = require('express').Router();
const { requireAdmin } = require('../middleware/auth');
// NEW IMPLEMENTATION — NODE.JS PROJECT: Admin User Access Control (feature-level permissions)
const { requirePermission } = require('../middleware/permission');
const ctrl = require('../controllers/users.controller');
router.get('/', requireAdmin, requirePermission('users.view'), ctrl.index);
router.get('/create', requireAdmin, requirePermission('users.create'), ctrl.create);
router.post('/', requireAdmin, requirePermission('users.create'), ctrl.store);
router.post('/bulk-delete', requireAdmin, requirePermission('users.delete'), ctrl.bulkDelete);
router.get('/:id', requireAdmin, requirePermission('users.view'), ctrl.show);
router.get('/:id/edit', requireAdmin, requirePermission('users.edit'), ctrl.edit);
router.put('/:id', requireAdmin, requirePermission('users.edit'), ctrl.update);
router.delete('/:id', requireAdmin, requirePermission('users.delete'), ctrl.destroy);
router.post('/:id/wallet', requireAdmin, requirePermission('users.wallet'), ctrl.adjustWallet);
router.post('/:id/wallet/add', requireAdmin, requirePermission('users.wallet'), (req, res, next) => { req.body.type = req.body.type || 'add_deposit'; next(); }, ctrl.adjustWallet);
router.post('/:id/wallet/remove', requireAdmin, requirePermission('users.wallet'), (req, res, next) => { req.body.type = 'deduct_deposit'; next(); }, ctrl.adjustWallet);
module.exports = router;
