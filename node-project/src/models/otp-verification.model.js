/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: OTP-only Login and Signup
 * Purpose: Store issued OTPs so login/signup can be verified server-side
 * Origin: Newly implemented in node-project; not directly converted
 *          from the original PHP implementation (PHP had no OTP storage).
 *
 * Important: Keep this implementation distinguishable from the
 * original PHP project when comparing functionality in the future.
 */

const mongoose = require('mongoose');

const otpVerificationSchema = new mongoose.Schema({
  mobile: { type: String, required: true, trim: true },
  purpose: { type: String, enum: ['login', 'signup'], required: true },
  otp_hash: { type: String, required: true },
  expires_at: { type: Date, required: true },
  attempts: { type: Number, default: 0 },
  consumed_at: { type: Date, default: null }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

otpVerificationSchema.index({ mobile: 1, purpose: 1, created_at: -1 });
// MongoDB removes records one hour after they expire.
otpVerificationSchema.index({ expires_at: 1 }, { expireAfterSeconds: 3600 });

module.exports = mongoose.model('OtpVerification', otpVerificationSchema);
