'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: OTP-only Login and Signup
 * Purpose: Issue and verify mobile OTPs for login and signup
 * Origin: Newly implemented in node-project; not directly converted
 *          from the original PHP implementation.
 *
 * Important: Keep this implementation distinguishable from the
 * original PHP project when comparing functionality in the future.
 *
 * With SMS_ENABLED=true a random OTP is generated and sent by SMS
 * (src/services/sms.service.js). Otherwise the OTP is static
 * (config.OTP_STATIC_CODE, default 123456) and no SMS is sent.
 */

const crypto = require('crypto');
const OtpVerification = require('../models/otp-verification.model');
const config = require('../config/env');
const logger = require('../config/logger');
const smsService = require('./sms.service');

const PURPOSES = ['login', 'signup'];
const OTP_EXPIRY_SECONDS = 300;
const RESEND_COOLDOWN_SECONDS = 30;
const MAX_VERIFY_ATTEMPTS = 5;

function normalizePurpose(purpose) {
  const value = String(purpose || '').trim().toLowerCase();
  if (value === 'register') return 'signup';
  return PURPOSES.includes(value) ? value : null;
}

function hashOtp(mobile, purpose, otp) {
  return crypto.createHmac('sha256', config.JWT_SECRET).update(`${mobile}:${purpose}:${otp}`).digest('hex');
}

function generateOtp() {
  if (!config.SMS.enabled) return config.OTP_STATIC_CODE;
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

function buildOtpMessage(otp) {
  return config.SMS.otpTemplate
    .replace(/{otp}/g, otp)
    .replace(/{minutes}/g, String(OTP_EXPIRY_SECONDS / 60));
}

// Resolves to true when the OTP was handed to the SMS provider (or SMS is disabled).
async function deliverOtp(mobile, otp, purpose) {
  if (!config.SMS.enabled) {
    logger.info(`OTP issued (static mode) for ${purpose}: ${mobile}`);
    return true;
  }
  const result = await smsService.sendSms(mobile, buildOtpMessage(otp));
  if (!result.ok) {
    logger.error(`OTP SMS failed for ${purpose}: ${mobile} (code ${result.code}): ${result.message}`);
    return false;
  }
  logger.info(`OTP SMS sent for ${purpose}: ${mobile} (request ${result.request_id})`);
  return true;
}

/**
 * Issues an OTP. Resolves to { ok: true, expires_in, resend_after } or
 * { ok: false, status, message, retry_after }.
 */
async function sendOtp(mobile, purpose) {
  const now = Date.now();
  const recent = await OtpVerification.findOne({ mobile, purpose, consumed_at: null }).sort({ created_at: -1 }).lean();
  if (recent) {
    const elapsed = Math.floor((now - new Date(recent.created_at).getTime()) / 1000);
    if (elapsed < RESEND_COOLDOWN_SECONDS) {
      const retryAfter = RESEND_COOLDOWN_SECONDS - elapsed;
      return { ok: false, status: 429, message: `Please wait ${retryAfter} seconds before requesting a new OTP.`, retry_after: retryAfter };
    }
  }

  const otp = generateOtp();
  // Only the latest OTP for a mobile + purpose stays valid.
  await OtpVerification.deleteMany({ mobile, purpose, consumed_at: null });
  const record = await OtpVerification.create({
    mobile,
    purpose,
    otp_hash: hashOtp(mobile, purpose, otp),
    expires_at: new Date(now + OTP_EXPIRY_SECONDS * 1000),
  });
  if (!(await deliverOtp(mobile, otp, purpose))) {
    // Drop the undelivered OTP so the resend cooldown does not block a retry.
    await OtpVerification.deleteOne({ _id: record._id });
    return { ok: false, status: 502, message: 'Could not send OTP right now. Please try again.' };
  }

  return { ok: true, expires_in: OTP_EXPIRY_SECONDS, resend_after: RESEND_COOLDOWN_SECONDS };
}

/**
 * Verifies and consumes the latest OTP. Resolves to { ok: true } or
 * { ok: false, status, message, attempts_remaining? }.
 */
async function verifyOtp(mobile, purpose, otp) {
  const code = String(otp || '').trim();
  if (!/^\d{6}$/.test(code)) {
    return { ok: false, status: 400, message: 'Please enter a valid 6-digit OTP.' };
  }

  const record = await OtpVerification.findOne({
    mobile, purpose, consumed_at: null, expires_at: { $gt: new Date() },
  }).sort({ created_at: -1 });
  if (!record) {
    return { ok: false, status: 400, message: 'OTP expired or not requested. Please request a new OTP.' };
  }
  if (record.attempts >= MAX_VERIFY_ATTEMPTS) {
    return { ok: false, status: 429, message: 'Too many incorrect attempts. Please request a new OTP.' };
  }

  const expected = Buffer.from(record.otp_hash, 'hex');
  const actual = Buffer.from(hashOtp(mobile, purpose, code), 'hex');
  if (!crypto.timingSafeEqual(expected, actual)) {
    record.attempts += 1;
    await record.save();
    const remaining = Math.max(MAX_VERIFY_ATTEMPTS - record.attempts, 0);
    return { ok: false, status: 400, message: 'Invalid OTP. Please try again.', attempts_remaining: remaining };
  }

  // Conditional update so the same OTP cannot be used by two concurrent requests.
  const consumed = await OtpVerification.findOneAndUpdate(
    { _id: record._id, consumed_at: null },
    { consumed_at: new Date() }
  );
  if (!consumed) {
    return { ok: false, status: 400, message: 'OTP already used. Please request a new OTP.' };
  }
  return { ok: true };
}

// Sends the verifyOtp() failure in a consistent JSON shape.
function sendVerifyError(res, result) {
  const body = { success: false, message: result.message };
  if (result.attempts_remaining !== undefined) body.attempts_remaining = result.attempts_remaining;
  return res.status(result.status).json(body);
}

module.exports = {
  PURPOSES, OTP_EXPIRY_SECONDS, RESEND_COOLDOWN_SECONDS, MAX_VERIFY_ATTEMPTS,
  normalizePurpose, sendOtp, verifyOtp, sendVerifyError,
};
