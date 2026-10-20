'use strict';
const router = require('express').Router();
const { requireAdmin } = require('../middleware/auth');
// NEW IMPLEMENTATION — NODE.JS PROJECT: Admin User Access Control (feature-level permissions)
const { requirePermission } = require('../middleware/permission');
const { settings } = require('../controllers/misc.controller');
router.get('/', requireAdmin, requirePermission('app_settings.view'), settings.index);
router.post('/', requireAdmin, requirePermission('app_settings.edit'), settings.update);
router.post('/payment', requireAdmin, requirePermission('app_settings.edit'), settings.saveKey('payment_api'));
router.post('/terms', requireAdmin, requirePermission('app_settings.edit'), settings.saveKey('terms'));
router.post('/privacy', requireAdmin, requirePermission('app_settings.edit'), settings.saveKey('privacy'));
router.post('/about', requireAdmin, requirePermission('app_settings.edit'), settings.saveKey('about'));
router.post('/payment-policy', requireAdmin, requirePermission('app_settings.edit'), settings.saveKey('payment_policy'));
router.put('/password', requireAdmin, require('../controllers/pages.controller').profile.password);
module.exports = router;
