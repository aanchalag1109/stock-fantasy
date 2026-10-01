'use strict';
const router = require('express').Router();
const { requireAdmin } = require('../middleware/auth');
const { tickets } = require('../controllers/misc.controller');
router.get('/', requireAdmin, tickets.index);
router.get('/:id', requireAdmin, tickets.show);
router.post('/:id/close', requireAdmin, tickets.close);
router.post('/:id/reply', requireAdmin, tickets.reply);
module.exports = router;
