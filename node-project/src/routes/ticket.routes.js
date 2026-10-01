'use strict';
const router = require('express').Router();
const ctrl = require('../controllers/ticket.controller');
router.post('/', ctrl.createTicket);
router.get('/', ctrl.getUserTickets);
router.get('/:id', ctrl.getTicket);
module.exports = router;
