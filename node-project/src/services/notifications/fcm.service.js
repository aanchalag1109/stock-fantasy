'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: Automated Notifications and Notification Management
 * Purpose: Send session reminders, winning amount notifications,
 *          and deposit/withdrawal notifications.
 * Origin: Newly implemented in node-project; not directly converted
 *          from the original PHP implementation.
 *
 * Important: Keep this implementation distinguishable from the
 * original PHP project when comparing functionality in the future.
 *
 * Firebase Cloud Messaging (HTTP v1) sender. Same provider and flow as the PHP
 * admin's App\Services\FCMService: a service-account JWT is exchanged for an OAuth
 * token, then one message is sent per device token. Built on Node's crypto + axios,
 * so no new dependency or provider is introduced.
 *
 * Configure with FCM_SERVICE_ACCOUNT_PATH (path to the Firebase service-account JSON)
 * or FCM_SERVICE_ACCOUNT_JSON (its contents). Without either, push is reported as
 * "disabled" and only in-app notifications are stored.
 */

const fs = require('fs');
const crypto = require('crypto');
const axios = require('axios');
const config = require('../../config/env');
const logger = require('../../config/logger');

const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

let serviceAccount;      // undefined = not loaded yet, null = not configured
let cachedToken = null;  // { value, expiresAt }

function loadServiceAccount() {
  if (serviceAccount !== undefined) return serviceAccount;
  serviceAccount = null;
  try {
    const raw = config.FCM.serviceAccountJson
      || (config.FCM.serviceAccountPath ? fs.readFileSync(config.FCM.serviceAccountPath, 'utf8') : null);
    if (!raw) {
      logger.warn('FCM is not configured (FCM_SERVICE_ACCOUNT_PATH / FCM_SERVICE_ACCOUNT_JSON); push notifications are disabled.');
      return serviceAccount;
    }
    const parsed = JSON.parse(raw);
    if (!parsed.client_email || !parsed.private_key || !parsed.project_id) throw new Error('missing client_email, private_key or project_id');
    serviceAccount = parsed;
  } catch (err) {
    logger.error(`FCM service account could not be loaded: ${err.message}`);
  }
  return serviceAccount;
}

const isConfigured = () => !!loadServiceAccount();
const projectId = () => (loadServiceAccount() || {}).project_id || null;

const base64url = (input) => Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

async function getAccessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60000) return cachedToken.value;
  const account = loadServiceAccount();
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(JSON.stringify({ iss: account.client_email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 }));
  const signature = crypto.createSign('RSA-SHA256').update(`${header}.${claims}`).sign(account.private_key);
  const assertion = `${header}.${claims}.${base64url(signature)}`;

  const response = await axios.post(TOKEN_URL, new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  }).toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 });

  cachedToken = { value: response.data.access_token, expiresAt: Date.now() + (response.data.expires_in || 3600) * 1000 };
  return cachedToken.value;
}

/**
 * Sends one push. Never throws. Returns
 *   { status: 'sent' } | { status: 'disabled' }
 *   { status: 'invalid_token', error } — token is dead, caller should clear it
 *   { status: 'failed', retryable, error }
 */
async function send(token, { title, body, data = {} }) {
  if (!isConfigured()) return { status: 'disabled' };
  if (!token) return { status: 'invalid_token', error: 'no device token' };
  try {
    const accessToken = await getAccessToken();
    const message = {
      token,
      notification: { title, body },
      data: Object.fromEntries(Object.entries(data).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)])),
    };
    await axios.post(`https://fcm.googleapis.com/v1/projects/${projectId()}/messages:send`, { message }, {
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      timeout: 10000,
    });
    return { status: 'sent' };
  } catch (err) {
    const status = err.response && err.response.status;
    const details = (err.response && err.response.data && err.response.data.error) || {};
    const errorCode = ((details.details || []).find((d) => d.errorCode) || {}).errorCode;
    if (errorCode === 'UNREGISTERED' || status === 404 || (errorCode === 'INVALID_ARGUMENT' && /token/i.test(details.message || ''))) {
      return { status: 'invalid_token', error: errorCode || `HTTP ${status}` };
    }
    if (status === 401) cachedToken = null;
    const retryable = !status || status === 401 || status === 429 || status >= 500;
    return { status: 'failed', retryable, error: (details.message || err.message || 'unknown error').slice(0, 300) };
  }
}

// Test hook: reset cached configuration/token.
function _reset() { serviceAccount = undefined; cachedToken = null; }

module.exports = { send, isConfigured, projectId, _reset };
