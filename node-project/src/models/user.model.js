const mongoose = require('mongoose');

const paymentDetailsSchema = new mongoose.Schema({
  usdt_wallet_address: { type: String, default: '' },
  usdt_network: { type: String, default: 'BEP20' },
  upi_id: { type: String, default: null },
  phone_number: { type: String, default: null },
  account_holder_name: { type: String, default: null },
  account_number: { type: String, default: null },
  bank_name: { type: String, default: null },
  ifsc_code: { type: String, default: null },
}, { _id: false });

const userSchema = new mongoose.Schema({
  old_id: { type: Number, index: true },
  name: { type: String, trim: true, default: 'User' },
  email: { type: String, trim: true, lowercase: true, index: { unique: true, sparse: true } },
  mobile: { type: String, trim: true, index: { unique: true, sparse: true } },
  password: { type: String, default: null },
  profile_image: { type: String, default: null },
  email_verified_at: { type: Date, default: null },
  deposit_balance: { type: Number, default: 0 },
  winnings_balance: { type: Number, default: 0 },
  kyc_status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
  aadhar: { type: String, default: null },
  pan: { type: String, default: null },
  fcm_token: { type: String, default: null },
  portfolio_score: { type: Number, default: 0 },
  is_admin: { type: Boolean, default: false },
  // NEW IMPLEMENTATION — NODE.JS PROJECT: Admin User Access Control (only meaningful when is_admin is true)
  is_super_admin: { type: Boolean, default: false },
  admin_role_id: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminRole', default: null },
  admin_status: { type: String, enum: ['active', 'disabled'], default: 'active' },
  is_test_user: { type: Boolean, default: false, index: true },
  age: { type: Number, default: null },
  gender: { type: String, default: null },
  remember_token: { type: String, default: null },
  payment_details: { type: paymentDetailsSchema, default: () => ({}) },
  // NEW IMPLEMENTATION — NODE.JS PROJECT: Automated Notifications — per-user opt-outs (missing = enabled)
  notification_preferences: {
    session_reminders: { type: Boolean, default: true },
    winnings: { type: Boolean, default: true },
    transactions: { type: Boolean, default: true },
    account: { type: Boolean, default: true },
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

userSchema.virtual('wallet_balance').get(function () {
  return parseFloat(((this.deposit_balance || 0) + (this.winnings_balance || 0)).toFixed(2));
});

module.exports = mongoose.model('User', userSchema);
