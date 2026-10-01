const mongoose = require('mongoose');

const adminSchema = new mongoose.Schema({
  old_id: { type: Number, index: true },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  email_verified_at: { type: Date, default: null },
  remember_token: { type: String, default: null }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

module.exports = mongoose.model('Admin', adminSchema);
