'use strict';
const router = require('express').Router();
const { requireAdmin } = require('../middleware/auth');
// NEW IMPLEMENTATION — NODE.JS PROJECT: Admin User Access Control (feature-level permissions)
const { requirePermission } = require('../middleware/permission');
const { banners } = require('../controllers/misc.controller');
router.get('/', requireAdmin, requirePermission('banners.view'), banners.index);
router.get('/create', requireAdmin, requirePermission('banners.create'), banners.create);
router.post('/', requireAdmin, requirePermission('banners.create'), banners.store);
router.get('/:id/edit', requireAdmin, requirePermission('banners.edit'), banners.edit);
router.put('/:id', requireAdmin, requirePermission('banners.edit'), banners.update);
router.delete('/:id', requireAdmin, requirePermission('banners.delete'), banners.destroy);
module.exports = router;
