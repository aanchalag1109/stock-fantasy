/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: Admin User Access Control
 * Purpose: Manage admin users, roles, and feature-level permissions
 * Origin: Newly implemented in node-project; not directly converted
 *          from the original PHP implementation.
 *
 * Important: Keep this implementation distinguishable from the
 * original PHP project when comparing functionality in the future.
 *
 * A named set of "<module>.<action>" permission keys (see src/admin/access/permissions.js)
 * assigned to admin users through User.admin_role_id.
 */

const mongoose = require('mongoose');

const adminRoleSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  name_key: { type: String, required: true, unique: true, index: true }, // lower-cased name for uniqueness
  description: { type: String, trim: true, default: '', maxlength: 500 },
  permissions: { type: [String], default: [] },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  updated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'admin_roles',
});

module.exports = mongoose.model('AdminRole', adminRoleSchema);
