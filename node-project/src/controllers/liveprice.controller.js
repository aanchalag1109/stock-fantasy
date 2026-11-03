'use strict';

const axios = require('axios');
const Asset = require('../models/asset.model');
const config = require('../config/env');
const logger = require('../config/logger');
// NEW IMPLEMENTATION — NODE.JS PROJECT: US symbols are quoted by Twelve Data, Indian by RapidAPI
const priceFeed = require('../services/contest-automation/price-feed');

// In-memory price cache
const priceCache = { stocks: {}, crypto: {}, updatedAt: null };
const CACHE_DURATION_MS = (config.PRICE_CACHE_DURATION || 60) * 1000;

async function fetchCryptoListings(limit = 100) {
  try {
    const response = await axios.get('https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest', {
      headers: { 'X-CMC_PRO_API_KEY': config.CMC_API_KEY },
      params: { limit, convert: 'USD' },
      timeout: config.PRICE_FETCH_TIMEOUT * 1000,
    });
    return response.data?.data || [];
  } catch {
    return [];
  }
}

/**
 * GET /api/v1/prices/live
 */
const getLivePrices = async (req, res) => {
  try {
    const assets = await Asset.find({ status: 'active' }).select('symbol name type').lean();

    const stocks = [];
    const crypto = [];

    for (const asset of assets) {
      const data = {
        symbol: asset.symbol,
        name: asset.name,
        price: 0,
        current_price: 0,
        change_percent: 0,
        price_change: 0,
      };
      if (asset.type === 'crypto') crypto.push(data);
      else stocks.push(data);
    }

    return res.json({
      success: true,
      timestamp: new Date().toISOString(),
      stocks,
      crypto,
    });
  } catch (err) {
    logger.error('getLivePrices error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * GET /api/v1/prices/stock?symbol=
 */
const getStockLivePrice = async (req, res) => {
  try {
    const { symbol } = req.query;
    if (!symbol) return res.status(400).json({ success: false, error: 'symbol required' });

    const data = await priceFeed.stockQuote(symbol, { market: req.query.market });
    if (!data) return res.status(404).json({ success: false, error: 'Stock not found' });

    return res.json({
      success: true,
      symbol: data.symbol,
      name: data.name,
      price: data.price,
      change: data.change,
      change_percent: data.change_percent,
      volume: data.volume,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error('getStockLivePrice error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * GET /api/v1/prices/crypto
 */
const getCryptoLivePrice = async (req, res) => {
  try {
    const cryptos = await fetchCryptoListings(100);
    if (!cryptos.length) return res.status(404).json({ success: false, error: 'No crypto data' });
    const data = cryptos.map((crypto) => {
      const quote = (crypto.quote && crypto.quote.USD) || {};
      return {
        symbol: crypto.symbol || '',
        name: crypto.name || '',
        price: quote.price || 0,
        change: quote.price_change_24h || 0,
        change_percent: quote.percent_change_24h || 0,
        volume: quote.volume_24h || 0,
        market_cap: quote.market_cap || 0,
        rank: crypto.cmc_rank || 0,
        status: 'success',
        last_updated: new Date().toISOString(),
      };
    });
    return res.json({ success: true, data, timestamp: new Date().toISOString() });
  } catch (err) {
    logger.error('getCryptoLivePrice error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * GET /api/v1/prices/optimized?symbols=RELIANCE,TCS&type=stock
 */
const getOptimizedPrices = async (req, res) => {
  try {
    const { symbols, type = 'stock' } = req.query;
    const symbolList = symbols ? symbols.split(',').map((s) => s.trim()) : [];

    const now = Date.now();
    if (priceCache.updatedAt && now - priceCache.updatedAt < CACHE_DURATION_MS) {
      const cached = type === 'crypto' ? priceCache.crypto : priceCache.stocks;
      const filtered = symbolList.length > 0
        ? Object.fromEntries(symbolList.map((s) => [s, cached[s] || null]))
        : cached;
      return res.json({ success: true, prices: filtered, from_cache: true, timestamp: priceCache.updatedAt });
    }

    return res.json({ success: true, prices: {}, from_cache: false, timestamp: now });
  } catch (err) {
    logger.error('getOptimizedPrices error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

module.exports = { getLivePrices, getStockLivePrice, getCryptoLivePrice, getOptimizedPrices };
