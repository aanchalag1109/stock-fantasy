/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: Contest Automation (port of the PHP scheduled commands)
 * Purpose: Lease-based lock so a scheduled job runs in only one process at a time.
 * Origin: Newly implemented in node-project. PHP relied on a single cron runner;
 *          here both server.js and admin-server.js start the scheduler.
 * Note: This feature must remain distinguishable from PHP-converted code.
 */

const mongoose = require('mongoose');

const jobLockSchema = new mongoose.Schema({
  _id: { type: String },                 // job name
  owner: { type: String, default: null }, // process that holds the lease
  locked_until: { type: Date, default: null },
}, {
  collection: 'job_locks',
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
});

module.exports = mongoose.model('JobLock', jobLockSchema);
