'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: Public base URL for links the API sends out (image URLs, LG Pay return URL).
 * Problem: links were built only from APP_URL; a server deployed with the default
 *          APP_URL=http://localhost:8000 sent the app "http://localhost:8000/uploads/…" images.
 *
 * publicBaseUrl():
 *   - APP_URL when it is set to a real address (always wins — set it in production .env);
 *   - otherwise (unset or localhost / 127.0.0.1) the address the current request came in on
 *     (X-Forwarded-Proto/Host behind a proxy, else the Host header);
 *   - otherwise (no request, e.g. a cron job) APP_URL as configured.
 * The request address is kept per request with AsyncLocalStorage (requestContext middleware).
 */

const { AsyncLocalStorage } = require('async_hooks');
const config = require('../config/env');

const store = new AsyncLocalStorage();
const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?(\/|$)/i;
const trim = (url) => String(url || '').replace(/\/+$/, '');

function firstHeader(value) {
  return String(value || '').split(',')[0].trim();
}

/** Express middleware: remembers the origin this request was made to. */
function requestContext(req, res, next) {
  const proto = firstHeader(req.get('x-forwarded-proto')) || req.protocol || 'http';
  const host = firstHeader(req.get('x-forwarded-host')) || req.get('host');
  const origin = host && /^[a-z0-9.\-:[\]]+$/i.test(host) && /^https?$/.test(proto) ? `${proto}://${host}` : null;
  store.run({ origin }, next);
}

function publicBaseUrl() {
  const configured = trim(config.APP_URL);
  if (configured && !LOCAL.test(configured)) return configured;
  const ctx = store.getStore();
  if (ctx && ctx.origin) return trim(ctx.origin);
  return configured;
}

module.exports = { requestContext, publicBaseUrl };
