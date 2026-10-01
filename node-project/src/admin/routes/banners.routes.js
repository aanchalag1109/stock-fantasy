'use strict';
const router = require('express').Router();
const { requireAdmin } = require('../middleware/auth');
const { banners } = require('../controllers/misc.controller');
router.get('/', requireAdmin, banners.index);
router.get('/create', requireAdmin, banners.create);
router.post('/', requireAdmin, banners.store);
router.delete('/:id', requireAdmin, banners.destroy);
module.exports = router;
