'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT (client feedback)
 *
 * Feature: Session stock list — price and +/- % of every stock of a session, from start to end
 * Purpose: One document per live price call of a session (every 5 minutes), with every price it returned.
 *          The start and end prices stay on the session (assets[].start_price / end_price) and are not
 *          copied here. Display only: scoring, ranks and prizes never read this collection.
 */

const mongoose = require('mongoose');

const sessionPriceReadingSchema = new mongoose.Schema({
  session_id: { type: mongoose.Schema.Types.ObjectId, required: true },
  at: { type: Date, required: true },
  prices: [{ _id: false, symbol: String, price: Number }],
}, {
  collection: 'session_price_readings',
});

sessionPriceReadingSchema.index({ session_id: 1, at: 1 }, { unique: true });

module.exports = mongoose.model('SessionPriceReading', sessionPriceReadingSchema);
