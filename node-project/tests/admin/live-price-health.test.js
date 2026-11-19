'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 * Live Management price health: flags live sessions whose start prices were never captured
 * (and completed ones missing end prices) once the automation's fetch window has passed.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { priceHealth } = require('../../src/services/session-management.service');
const { FETCH_WINDOW_MS } = require('../../src/services/contest-automation/session-lifecycle.job');

const NOW = new Date('2026-11-19T10:00:00Z');
const ago = (ms) => new Date(NOW.getTime() - ms);
const assets = (n, field) => Array.from({ length: 3 }, (_, i) => ({ asset_symbol: `S${i}`, [field]: i < n ? 100 : null }));

describe('Live Management price health', () => {
  test('live session past the fetch window with no start prices → danger', () => {
    const issue = priceHealth({ status: 'live', start_time: ago(FETCH_WINDOW_MS + 60000), end_time: new Date(NOW.getTime() + 3600000), start_prices_captured_at: null, assets: assets(0, 'start_price') }, NOW);
    assert.equal(issue.level, 'danger');
    assert.equal(issue.code, 'start_missing');
    assert.match(issue.message, /No start prices were captured \(0\/3 priced\) and the 30-minute fetch window has passed/);
  });

  test('inside the window it is only "fetching"; captured sessions are fine; partial capture warns', () => {
    assert.equal(priceHealth({ status: 'live', start_time: ago(60000), end_time: NOW, start_prices_captured_at: null, assets: assets(1, 'start_price') }, NOW).level, 'info');
    assert.equal(priceHealth({ status: 'live', start_time: ago(3600000), end_time: NOW, start_prices_captured_at: ago(3600000), assets: assets(3, 'start_price') }, NOW), null);
    const partial = priceHealth({ status: 'live', start_time: ago(3600000), end_time: NOW, start_prices_captured_at: ago(3600000), assets: assets(2, 'start_price') }, NOW);
    assert.equal(partial.code, 'start_partial');
    assert.equal(partial.level, 'warning');
  });

  test('a live session with no assets, and RUN ALL sessions', () => {
    assert.equal(priceHealth({ status: 'live', start_time: ago(1), end_time: NOW, assets: [] }, NOW).code, 'no_assets');
    assert.equal(priceHealth({ status: 'live', run_all_active: true, start_time: ago(FETCH_WINDOW_MS * 2), end_time: NOW, assets: assets(0, 'start_price') }, NOW), null, 'RUN ALL drives its own prices');
  });

  test('completed session missing end prices after the window → danger; historical sessions are ignored', () => {
    const base = { status: 'completed', start_time: ago(7200000), start_prices_captured_at: ago(7200000), end_prices_captured_at: null };
    assert.equal(priceHealth({ ...base, end_time: ago(60000), assets: assets(0, 'end_price') }, NOW).level, 'info');
    assert.equal(priceHealth({ ...base, end_time: ago(FETCH_WINDOW_MS + 60000), assets: assets(0, 'end_price') }, NOW).code, 'end_missing');
    assert.equal(priceHealth({ status: 'completed', start_time: ago(1e9), end_time: ago(1e9), start_prices_captured_at: null, end_prices_captured_at: null, assets: assets(0, 'end_price') }, NOW), null, 'migrated sessions not captured by the automation are not flagged');
  });
});
