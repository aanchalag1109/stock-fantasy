'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Standard logo URLs per market, the same public CDNs the migrated data already uses:
 *   US / UK  — financialmodelingprep.com/image-stock/AAPL.png, SHEL.L.png
 *   Indian   — financialmodelingprep.com/image-stock/RELIANCE.NS.png (NSE suffix)
 *   Crypto   — assets.coincap.io/assets/icons/btc@2x.png
 *
 * The PHP data pointed Indian logos at http://localhost/storage/stocks/*.png, files that only
 * existed on a developer machine, so they are treated as broken and replaced.
 */

const FMP = 'https://financialmodelingprep.com/image-stock/';

// FMP has no NSE logo under these symbols; the company's other listing has it.
const INDIAN_OVERRIDES = { 'M&M': 'MAHMF' };

/** @param {'us'|'uk'|'indian'|'crypto'} market */
function defaultLogoUrl(market, symbol) {
  const sym = String(symbol || '').trim().toUpperCase();
  if (!sym) return null;
  if (market === 'crypto') return `https://assets.coincap.io/assets/icons/${encodeURIComponent(sym.replace(/-USD$/, '').toLowerCase())}@2x.png`;
  if (market === 'indian') return `${FMP}${encodeURIComponent(INDIAN_OVERRIDES[sym] || `${sym}.NS`)}.png`;
  return `${FMP}${encodeURIComponent(sym)}.png`;
}

/** Empty, or pointing at a local machine / the old PHP storage folder. */
function isBrokenLogo(url) {
  const value = String(url || '').trim();
  return !value || /^https?:\/\/(localhost|127\.0\.0\.1)([:/]|$)/i.test(value) || /^\/?storage\//i.test(value);
}

/** MongoDB filter matching broken logos (for counting / bulk fixing). */
const BROKEN_LOGO_FILTER = {
  $or: [
    { image_url: null },
    { image_url: '' },
    { image_url: /^https?:\/\/(localhost|127\.0\.0\.1)([:/]|$)/i },
    { image_url: /^\/?storage\//i },
  ],
};

module.exports = { defaultLogoUrl, isBrokenLogo, BROKEN_LOGO_FILTER };
