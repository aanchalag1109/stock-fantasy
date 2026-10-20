'use strict';
const router = require('express').Router();
const { requireAdmin } = require('../middleware/auth');
// NEW IMPLEMENTATION — NODE.JS PROJECT: Admin User Access Control (feature-level permissions)
const { requirePermission } = require('../middleware/permission');
const { announcements } = require('../controllers/misc.controller');
router.get('/', requireAdmin, requirePermission('announcements.view'), announcements.index);
router.get('/create', requireAdmin, requirePermission('announcements.create'), announcements.create);
router.post('/', requireAdmin, requirePermission('announcements.create'), announcements.store);
router.post('/bulk-delete', requireAdmin, requirePermission('announcements.delete'), announcements.bulkDelete);
router.get('/:id', requireAdmin, requirePermission('announcements.view'), announcements.show);
router.delete('/:id', requireAdmin, requirePermission('announcements.delete'), announcements.destroy);
module.exports = router;
