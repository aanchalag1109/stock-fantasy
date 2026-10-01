'use strict';
const router = require('express').Router();
const { requireAdmin } = require('../middleware/auth');
const { notifications } = require('../controllers/misc.controller');
router.get('/', requireAdmin, notifications.create);
router.get('/send', requireAdmin, notifications.create);
router.post('/send', requireAdmin, notifications.send);
module.exports = router;
