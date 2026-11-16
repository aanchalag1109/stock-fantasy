'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: USDT deposits via PayRam
 * Purpose: HTTP client for the PayRam merchant API, following the official docs
 *          (docs.payram.com) and the official SDK (npm "payram" 1.0.1), and checked against our
 *          PayRam server (v3.10.1):
 *   createPayment  POST {PAYRAM_API_URL}/api/v1/payment                     header API-Key
 *                  body { customerEmail, customerID, amountInUSD, invoiceID, currency, network? }
 *                  → { reference_id, url, host }
 *   getPayment     GET  {PAYRAM_API_URL}/api/v1/payment/reference/{reference_id}
 *                  → { paymentState, amountInUSD, filledAmount, filledAmountInUSD, currencySymbol, invoiceID, ... }
 *   verifyWebhook  X-Payram-Signature: sha256=<hex HMAC-SHA256(raw body, API key)> (recommended),
 *                  otherwise the API-Key header must equal our key (what the SDK checks).
 */

const crypto = require('crypto');
const axios = require('axios');
const config = require('../../config/env');
const logger = require('../../config/logger');

/** PayRam "Site URL" without a trailing slash or /api/v1. */
function baseUrl() {
  return String(config.PAYRAM.apiUrl || '').trim().replace(/\/+$/, '').replace(/\/api\/v1$/i, '');
}
const isConfigured = () => Boolean(baseUrl() && config.PAYRAM.apiKey);

function errorMessage(res) {
  const data = res.data || {};
  return (data.error && data.error.message) || data.message || `PayRam HTTP ${res.status}`;
}

/**
 * @param {{ invoiceId:string, customerId:string, customerEmail:string, amountUsd:number, network?:string }} p
 * @returns {Promise<{ ok:true, reference_id:string, url:string } | { ok:false, message:string, code?:string }>}
 */
async function createPayment({ invoiceId, customerId, customerEmail, amountUsd, network }) {
  if (!isConfigured()) return { ok: false, message: 'PayRam is not configured (PAYRAM_API_URL / PAYRAM_API_KEY).' };
  const body = {
    customerEmail,
    customerID: String(customerId),
    amountInUSD: Number(amountUsd),
    invoiceID: invoiceId,
    currency: 'USDT', // only USDT is accepted for this deposit
    ...(network ? { network } : {}),
  };
  try {
    const res = await axios.post(`${baseUrl()}/api/v1/payment`, body, {
      headers: { 'API-Key': config.PAYRAM.apiKey, 'Content-Type': 'application/json' },
      timeout: (config.PAYRAM.timeoutSeconds || 20) * 1000,
      validateStatus: () => true,
    });
    if (res.status >= 200 && res.status < 300 && res.data && res.data.reference_id && res.data.url) {
      return { ok: true, reference_id: String(res.data.reference_id), url: String(res.data.url) };
    }
    const code = res.data && res.data.error && res.data.error.code;
    logger.warn(`[payram] create payment ${invoiceId} failed: HTTP ${res.status} ${code || ''} ${errorMessage(res)}`);
    return { ok: false, message: errorMessage(res), code: code || null };
  } catch (err) {
    logger.warn(`[payram] create payment ${invoiceId} failed: ${err.message}`);
    return { ok: false, message: `Could not reach PayRam: ${err.message}` };
  }
}

/**
 * Current state of a payment straight from PayRam.
 * @returns {Promise<{ ok:true, data:object } | { ok:false, message:string, status?:number }>}
 */
async function getPayment(referenceId) {
  if (!isConfigured()) return { ok: false, message: 'PayRam is not configured' };
  try {
    const res = await axios.get(`${baseUrl()}/api/v1/payment/reference/${encodeURIComponent(referenceId)}`, {
      headers: { 'API-Key': config.PAYRAM.apiKey },
      timeout: (config.PAYRAM.timeoutSeconds || 20) * 1000,
      validateStatus: () => true,
    });
    if (res.status >= 200 && res.status < 300 && res.data && typeof res.data === 'object' && res.data.paymentState) {
      return { ok: true, data: res.data };
    }
    return { ok: false, status: res.status, message: errorMessage(res) };
  } catch (err) {
    return { ok: false, message: err.message };
  }
}

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

/**
 * Authenticates a webhook request.
 * @param {Buffer} rawBody exact bytes received
 * @param {object} headers Node request headers (lower-case keys)
 * @returns {{ ok:boolean, method:'signature'|'api_key'|null }}
 */
function verifyWebhook(rawBody, headers = {}) {
  const key = config.PAYRAM.apiKey;
  if (!key) return { ok: false, method: null };
  const signature = headers['x-payram-signature'];
  if (signature) {
    if (!Buffer.isBuffer(rawBody)) return { ok: false, method: 'signature' };
    const expected = `sha256=${crypto.createHmac('sha256', key).update(rawBody).digest('hex')}`;
    return { ok: safeEqual(String(signature).trim().toLowerCase(), expected), method: 'signature' };
  }
  const apiKey = headers['api-key'];
  if (apiKey) return { ok: safeEqual(String(apiKey), key), method: 'api_key' };
  return { ok: false, method: null };
}

module.exports = { createPayment, getPayment, verifyWebhook, isConfigured, baseUrl };
