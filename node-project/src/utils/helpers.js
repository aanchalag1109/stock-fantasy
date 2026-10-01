const crypto = require('crypto');

/**
 * Format date to MySQL-like string: YYYY-MM-DD HH:mm:ss
 */
function formatDate(date = new Date()) {
  const d = new Date(date);
  const pad = (n) => (n < 10 ? '0' + n : n);
  return (
    d.getFullYear() +
    '-' +
    pad(d.getMonth() + 1) +
    '-' +
    pad(d.getDate()) +
    ' ' +
    pad(d.getHours()) +
    ':' +
    pad(d.getMinutes()) +
    ':' +
    pad(d.getSeconds())
  );
}

/**
 * Get current time in Asia/Kolkata timezone
 */
function nowIST() {
  const str = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
  return new Date(str);
}

/**
 * Generate MD5 hash uppercase
 */
function md5Upper(str) {
  return crypto.createHash('md5').update(str).digest('hex').toUpperCase();
}

/**
 * Safely parse JSON or return default
 */
function safeJsonParse(data, fallback = null) {
  if (!data) return fallback;
  if (typeof data === 'object') return data;
  try {
    return JSON.parse(data);
  } catch {
    return fallback;
  }
}

/**
 * Clamp value
 */
function clamp(val, min, max) {
  return Math.min(Math.max(val, min), max);
}

module.exports = {
  formatDate,
  nowIST,
  md5Upper,
  safeJsonParse,
  clamp
};
