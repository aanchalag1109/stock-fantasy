'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: Asset, Market Category & Session redesign (client feedback)
 * Purpose: The market types a session, market category and asset belong to:
 *          Indian Stock, US Stock and Crypto. Replaces "Stock Market + country".
 * Origin: Newly implemented in node-project; not directly converted
 *          from the original PHP implementation.
 *
 * Important: Keep this implementation distinguishable from the
 * original PHP project when comparing functionality in the future.
 *
 * `market` is the new field (sessions, templates, categories, assets). The older
 * `market_type` ('stock' | 'crypto') and `category_type` fields are still written,
 * derived from `market`, because the app and many admin pages read them.
 *
 * 'uk' is a legacy market: UK stocks and categories were kept (inactive) by the
 * migration but can't be chosen for new sessions, and their prices aren't fetchable.
 */

const MARKETS = {
  indian_stock: { label: 'Indian Stock', type: 'stock', provider: 'indian', currency: '₹' },
  us_stock: { label: 'US Stock', type: 'stock', provider: 'us', currency: '$' },
  crypto: { label: 'Crypto', type: 'crypto', provider: 'crypto', currency: '$' },
};
const LEGACY_MARKETS = {
  uk: { label: 'UK Stock (legacy)', type: 'stock', provider: 'uk', currency: '£' },
};
const ALL_MARKETS = { ...MARKETS, ...LEGACY_MARKETS };

const MARKET_KEYS = Object.keys(MARKETS);           // selectable for new sessions/categories/assets
const ALL_MARKET_KEYS = Object.keys(ALL_MARKETS);   // valid stored values

const isMarket = (value) => MARKET_KEYS.includes(value);
const isKnownMarket = (value) => ALL_MARKET_KEYS.includes(value);
const labelOf = (market) => (ALL_MARKETS[market] || {}).label || '';
/** 'stock' | 'crypto' — the legacy market_type / category_type for a market. */
const typeOf = (market) => (ALL_MARKETS[market] || {}).type || null;
/** 'indian' | 'us' | 'uk' | 'crypto' — which price provider serves a market. */
const providerOf = (market) => (ALL_MARKETS[market] || {}).provider || null;

/** Market of a legacy category, from its name ("Large Cap US") and type ('stock'/'crypto'). */
function marketFromLegacyCategory(name, type) {
  const text = String(name || '');
  if (type === 'crypto' || /crypto/i.test(text)) return 'crypto';
  if (/\bUS\b/.test(text)) return 'us_stock';
  if (/\bUK\b/.test(text)) return 'uk';
  return 'indian_stock';
}

/** Market of a legacy asset from its symbol alone: BTC-USD → crypto, SHEL.L → uk. */
function marketFromSymbol(symbol) {
  const text = String(symbol || '').toUpperCase();
  if (/-USD$/.test(text)) return 'crypto';
  if (/\.L$/.test(text)) return 'uk';
  return null;
}

/**
 * Market of a session or template. Uses `market` when set; otherwise derives it from the
 * legacy market_type and the category names of its assets (all sessions before the redesign).
 */
function marketOfSession(doc) {
  if (!doc) return null;
  if (isKnownMarket(doc.market)) return doc.market;
  if (doc.market_type === 'crypto') return 'crypto';
  const names = (doc.assets || []).map((a) => a && a.category_name).filter(Boolean);
  if (doc.assets_data && typeof doc.assets_data === 'object') names.push(...Object.keys(doc.assets_data));
  const found = [...new Set(names.map((n) => marketFromLegacyCategory(n, doc.market_type)))];
  if (found.length === 1) return found[0];
  if (found.includes('us_stock') && !found.includes('indian_stock')) return 'us_stock';
  return 'indian_stock';
}

/** Accepts a market key or the legacy 'stock'/'crypto' and returns the matching market keys. */
function marketsFor(value) {
  if (isKnownMarket(value)) return [value];
  if (value === 'crypto') return ['crypto'];
  if (value === 'stock') return ['indian_stock', 'us_stock'];
  return [];
}

module.exports = {
  MARKETS, LEGACY_MARKETS, ALL_MARKETS, MARKET_KEYS, ALL_MARKET_KEYS,
  isMarket, isKnownMarket, labelOf, typeOf, providerOf,
  marketFromLegacyCategory, marketFromSymbol, marketOfSession, marketsFor,
};
