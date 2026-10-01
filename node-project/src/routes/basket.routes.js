'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/basket.controller');

router.post('/save', ctrl.saveBasket);
router.post('/standalone', ctrl.saveBasket);
router.get('/', ctrl.getUserBaskets);
router.get('/validate', ctrl.validateBasketForSession);
router.get('/:id', ctrl.getBasket);
router.delete('/:id', ctrl.deleteBasket);

module.exports = router;
