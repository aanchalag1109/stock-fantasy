/**
 * PHP PARITY — state of a Performance page "RUN ALL" job (PHP kept it in the cache under
 * run_all_log_<contestId>; here it is persisted so the log survives page reloads).
 * One document per contest (_id = contest id).
 */

const mongoose = require('mongoose');

const runAllJobSchema = new mongoose.Schema({
  _id: { type: String },                                   // contest _id
  session_id: { type: mongoose.Schema.Types.Mixed, default: null },
  status: { type: String, enum: ['queued', 'running', 'done', 'failed'], default: 'queued' },
  log: { type: [String], default: [] },
  start_at: { type: Date, default: null },
  end_at: { type: Date, default: null },
  stop_requested: { type: Boolean, default: false },
  heartbeat_at: { type: Date, default: null },             // lets the page detect a job lost to a restart
  started_by: { type: String, default: null },
}, {
  collection: 'run_all_jobs',
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
});

module.exports = mongoose.model('RunAllJob', runAllJobSchema);
