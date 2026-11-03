'use strict';
// NEW IMPLEMENTATION — NODE.JS PROJECT: Admin → Assets (manage the stocks/crypto in each category)
const router = require('express').Router();
const { requireAdmin } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permission');
const { assets } = require('../controllers/assets.controller');

router.get('/', requireAdmin, requirePermission('assets.view'), assets.index);
router.get('/create', requireAdmin, requirePermission('assets.create'), assets.create);
router.get('/check-symbol', requireAdmin, requirePermission('assets.create', 'assets.edit'), assets.checkSymbol);
router.post('/', requireAdmin, requirePermission('assets.create'), assets.store);
router.post('/fix-logos', requireAdmin, requirePermission('assets.edit'), assets.fixLogos);
// The bulk handler checks the exact permission per action (edit for move/status, delete for delete).
router.post('/bulk', requireAdmin, requirePermission('assets.edit', 'assets.delete'), assets.bulk);
router.get('/:id/edit', requireAdmin, requirePermission('assets.edit'), assets.edit);
router.put('/:id', requireAdmin, requirePermission('assets.edit'), assets.update);
router.delete('/:id', requireAdmin, requirePermission('assets.delete'), assets.destroy);

module.exports = router;
