'use strict';

const mongoose = require('mongoose');

const cronLogSchema = new mongoose.Schema({
  old_id: { type: Number, index: true },
  job_name: { type: String, default: 'master', index: true },
  run_time: { type: Date, default: Date.now, index: true },
  status: { type: String, enum: ['success', 'failed', 'running'], default: 'success' },
  success: { type: Boolean, default: true },
  output: { type: mongoose.Schema.Types.Mixed, default: null },
  response: { type: String, default: null },
  duration_ms: { type: Number, default: 0 },
  type: { type: String, default: 'api' },
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

module.exports = mongoose.model('CronLog', cronLogSchema);
