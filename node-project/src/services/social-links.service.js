'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: Social links managed from the admin panel (client feedback)
 * Purpose: The official social media links (Instagram, Telegram, …) were hard-coded in the website
 *          footer. They are now edited on admin → Settings and served to the app / website by
 *          GET /api/v1/social-links.
 *
 * Stored as one object under the `social_links` key of the settings collection:
 *   { links: { <platform>: { url, enabled } }, updated_at }
 * Until an admin saves, the links the website already shows are used.
 */

const Setting = require('../models/setting.model');

const SETTINGS_KEY = 'social_links';
const MAX_URL = 500;

// Display order = array order. `icon` is the Bootstrap Icons / Font Awesome brand name.
const PLATFORMS = [
  { key: 'instagram', label: 'Instagram', icon: 'instagram', placeholder: 'https://www.instagram.com/yourpage' },
  { key: 'telegram', label: 'Telegram', icon: 'telegram', placeholder: 'https://t.me/yourchannel' },
  { key: 'youtube', label: 'YouTube', icon: 'youtube', placeholder: 'https://youtube.com/@yourchannel' },
  { key: 'facebook', label: 'Facebook', icon: 'facebook', placeholder: 'https://www.facebook.com/yourpage' },
  { key: 'tiktok', label: 'TikTok', icon: 'tiktok', placeholder: 'https://www.tiktok.com/@yourpage' },
  { key: 'x', label: 'X (Twitter)', icon: 'twitter-x', placeholder: 'https://x.com/yourhandle' },
  { key: 'whatsapp', label: 'WhatsApp', icon: 'whatsapp', placeholder: 'https://wa.me/919999999999 or channel link' },
  { key: 'linkedin', label: 'LinkedIn', icon: 'linkedin', placeholder: 'https://www.linkedin.com/company/yourpage' },
  { key: 'discord', label: 'Discord', icon: 'discord', placeholder: 'https://discord.gg/yourinvite' },
];
const KEYS = PLATFORMS.map((p) => p.key);

// The links on the website footer before this feature.
const DEFAULT_URLS = {
  instagram: 'https://www.instagram.com/probtrade',
  telegram: 'https://t.me/ProbTradeOfficial',
  youtube: 'https://youtube.com/@probtrade',
  facebook: 'https://www.facebook.com/share/1Cry7jDXBg/',
  tiktok: 'https://www.tiktok.com/@probtrade',
};

const toBool = (v) => v === true || v === 'true' || v === '1' || v === 1 || v === 'on';

/** A safe absolute http(s) URL, or null. */
function cleanUrl(value) {
  const text = String(value == null ? '' : value).trim();
  if (!text || text.length > MAX_URL) return null;
  try {
    const url = new URL(text);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch (err) {
    return null;
  }
}

function defaults() {
  return Object.fromEntries(KEYS.map((k) => [k, { url: DEFAULT_URLS[k] || '', enabled: !!DEFAULT_URLS[k] }]));
}

function merge(stored) {
  const value = stored && typeof stored === 'object' ? stored : null;
  if (!value || !value.links || typeof value.links !== 'object') return { links: defaults(), updated_at: null };
  const links = {};
  KEYS.forEach((k) => {
    const row = value.links[k] || {};
    const url = cleanUrl(row.url) || '';
    links[k] = { url, enabled: !!url && row.enabled !== false };
  });
  return { links, updated_at: value.updated_at || null };
}

async function getSettings() {
  const row = await Setting.findOne({ key: SETTINGS_KEY }).lean();
  return merge(row && row.value);
}

/**
 * body: { links: { instagram: { url, enabled }, … } } (form fields links[instagram][url] …)
 * Returns { values, errors } — errors keyed by platform.
 */
function validate(body = {}) {
  const input = body.links && typeof body.links === 'object' ? body.links : {};
  const errors = {};
  const links = {};
  KEYS.forEach((k) => {
    const row = input[k] && typeof input[k] === 'object' ? input[k] : {};
    const raw = typeof row.url === 'string' ? row.url.trim() : '';
    const enabled = toBool(row.enabled);
    const url = cleanUrl(raw);
    const label = PLATFORMS.find((p) => p.key === k).label;
    if (raw && !url) errors[k] = `${label}: enter a full link starting with https://`;
    else if (enabled && !url) errors[k] = `${label}: add a link or switch it off.`;
    links[k] = { url: url || raw, enabled: enabled && !!url };
  });
  return { values: { links }, errors };
}

async function saveSettings(values) {
  const value = { links: values.links, updated_at: new Date().toISOString() };
  await Setting.findOneAndUpdate({ key: SETTINGS_KEY }, { key: SETTINGS_KEY, value }, { upsert: true });
  return getSettings();
}

/** What the app / website get: enabled links only, in display order. */
async function publicLinks() {
  const { links } = await getSettings();
  return PLATFORMS
    .filter((p) => links[p.key].enabled && links[p.key].url)
    .map((p) => ({ platform: p.key, label: p.label, icon: p.icon, url: links[p.key].url }));
}

module.exports = { SETTINGS_KEY, PLATFORMS, DEFAULT_URLS, getSettings, validate, saveSettings, publicLinks, cleanUrl, merge };
