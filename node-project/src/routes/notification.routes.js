'use strict';
const router = require('express').Router();
const ctrl = require('../controllers/notification.controller');

router.get('/', ctrl.getUserNotifications);
router.post('/', ctrl.getUserNotifications);
router.post('/mark-read', ctrl.markAsRead);
router.post('/mark-all-read', ctrl.markAllAsRead);

module.exports = router;
