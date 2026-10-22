'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: OTP-only Login and Signup (SMS delivery)
 * Purpose: Send SMS through the apitxt.com Send SMS API
 * Origin: Newly implemented in node-project; not directly converted
 *          from the original PHP implementation.
 *
 * Important: Keep this implementation distinguishable from the
 * original PHP project when comparing functionality in the future.
 *
 * API: GET https://apitxt.com/api/sendMsg
 *   authkey, mobiles, message, sender, route, template_id (DLT), pe_id
 * Success body: { status: 200, message: 'success', request_id }
 */

const axios = require('axios');
const config = require('../config/env');

const ERROR_MESSAGES = {
  101: 'Missing mobile number',
  102: 'Missing message',
  103: 'Missing sender Id',
  104: 'Missing route',
  105: 'Missing authentication key',
  106: 'Missing country code',
  111: 'Missing Principal Entity Id (pe_id)',
  112: 'Missing DLT template Id',
  113: 'Missing SMS panel template Id',
  202: 'Invalid mobile number',
  203: 'Invalid sender ID',
  204: 'Invalid route or flash value',
  301: 'Insufficient balance',
  302: 'Route currently unavailable',
  303: 'Blocked user account',
  304: 'Invalid authentication key / IP restricted',
  305: 'SMS panel template ID not matched',
  307: 'Sender ID does not match the template',
  311: 'Duplicate request discarded',
};

// The API takes 10-digit Indian numbers; strip +91 / 91 / 0 prefixes and separators.
function toTenDigitMobile(mobile) {
  const digits = String(mobile || '').replace(/\D/g, '');
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return null;
}

/**
 * Sends one SMS. Resolves to { ok: true, request_id } or { ok: false, code, message }.
 * Never throws.
 */
async function sendSms(mobile, message) {
  const sms = config.SMS;
  const to = toTenDigitMobile(mobile);
  if (!to) return { ok: false, code: 202, message: ERROR_MESSAGES[202] };

  try {
    const { data } = await axios.get(sms.apiUrl, {
      params: {
        authkey: sms.apiKey,
        mobiles: to,
        message,
        sender: sms.senderId,
        route: sms.route,
        template_id: sms.dltTemplateId,
        pe_id: sms.peId,
      },
      timeout: sms.timeoutMs,
    });

    const status = Number(data && data.status);
    if (status === 200) return { ok: true, request_id: data.request_id };
    return { ok: false, code: status || null, message: ERROR_MESSAGES[status] || (data && data.message) || 'Unknown SMS API response' };
  } catch (err) {
    const body = err.response && err.response.data;
    const status = Number(body && body.status);
    return { ok: false, code: status || null, message: ERROR_MESSAGES[status] || (body && body.message) || err.message };
  }
}

module.exports = { sendSms, toTenDigitMobile };
