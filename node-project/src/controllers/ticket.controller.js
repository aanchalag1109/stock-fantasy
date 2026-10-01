'use strict';

const Ticket = require('../models/ticket.model');
const logger = require('../config/logger');

const createTicket = async (req, res) => {
  try {
    const userId = req.body.user_id || req.userId;
    const { subject, message, category } = req.body;
    if (!userId || !subject || !message) {
      return res.status(400).json({ success: false, message: 'user_id, subject and message required' });
    }
    const ticket = await Ticket.create({ user_id: userId, subject, message, category: category || 'general', status: 'open' });
    return res.status(201).json({ success: true, message: 'Ticket created successfully', ticket });
  } catch (err) {
    logger.error('createTicket error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to create ticket' });
  }
};

const getUserTickets = async (req, res) => {
  try {
    const userId = req.query.user_id || req.userId;
    if (!userId) return res.status(400).json({ success: false, message: 'user_id required' });
    const tickets = await Ticket.find({ user_id: userId }).sort({ created_at: -1 }).lean();
    return res.json({ success: true, tickets });
  } catch (err) {
    logger.error('getUserTickets error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch tickets' });
  }
};

const getTicket = async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id).lean();
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });
    return res.json({ success: true, ticket });
  } catch (err) {
    logger.error('getTicket error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch ticket' });
  }
};

module.exports = { createTicket, getUserTickets, getTicket };
