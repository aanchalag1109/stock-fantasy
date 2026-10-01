'use strict';

const mongoose = require('mongoose');

const kycSubmissionSchema = new mongoose.Schema({
  old_id: { type: Number, index: true },
  user_id: { type: mongoose.Schema.Types.Mixed, required: true, index: true },
  aadhar_number: { type: String, default: null },
  pan_number: { type: String, default: null },
  aadhar_front: { type: String, default: null },
  aadhar_back: { type: String, default: null },
  pan_image: { type: String, default: null },
  selfie: { type: String, default: null },
  // Legacy fields
  document_type: { type: String, default: null },
  document_number: { type: String, default: null },
  front_image: { type: String, default: null },
  back_image: { type: String, default: null },
  selfie_image: { type: String, default: null },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
  rejection_reason: { type: String, default: null },
  reviewed_at: { type: Date, default: null },
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

module.exports = mongoose.model('KycSubmission', kycSubmissionSchema);
