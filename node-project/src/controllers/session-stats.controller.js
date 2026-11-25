'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT (client feedback)
 *
 * GET /api/v1/session-stats/:sessionId           every stock of the session: price, +/- %, final gain/loss
 * GET /api/v1/session-stats/:sessionId/history   one stock (?symbol=) from start to end
 *
 * The first one is PHP's StatsController::sessionStats with the same fields, plus new ones. PHP saved each
 * 5-minute price as end_price; here that price is assets[].live_price, so the old port showed 0% for every
 * stock until the session ended.
 */

const LeagueSession = require('../models/league-session.model');
const User = require('../models/user.model');
const svc = require('../services/session-stocks.service');
const { publicId, sqlDate, findByPublicId, unreadCount } = require('../helpers/mobile-compat');

const MESSAGES = {
  not_started: 'Stats available once session goes live.',
  cancelled: 'This session was cancelled.',
  finalising: 'Session ended. Waiting for the final prices.',
};
const NO_START = 'Start prices are being fetched. Please check again in a minute.';

const stockJson = (r) => ({
  symbol: r.symbol,
  name: r.name,
  start_price: r.start_price,
  current_price: r.current_price,
  change_percent: r.change_percent,
  change_amount: r.change_amount,
  direction: r.direction === 'no_price' ? 'flat' : r.direction, // up | down | flat, as PHP
  last_updated: sqlDate(r.price_at),
  points: r.points,
  category_id: r.category_id,
  category_name: r.category_name,
  image_url: r.image_url,
  price_type: r.price_type,
  price_missing: r.direction === 'no_price',
  is_final: r.is_final,
});

const sessionJson = (session, phase) => ({
  session_id: publicId(session),
  session_name: session.name,
  status: session.status,
  phase,
  is_final: phase === 'final',
  start_time: sqlDate(session.start_time),
  end_time: sqlDate(session.end_time),
});

async function sessionStats(req, res) {
  try {
    const session = await findByPublicId(LeagueSession, req.params.sessionId);
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' });
    const filter = ['positive', 'negative'].includes(req.query.filter) ? req.query.filter : 'all';
    const now = new Date();
    const phase = svc.phaseOf(session, now);
    if (!svc.hasStarted(phase)) return res.json({ success: true, ...sessionJson(session, phase), stats: [], message: MESSAGES[phase] });

    const data = await svc.board(session, now);
    const priced = data.rows.filter((r) => r.has_start_price);
    const counts = svc.countsOf(priced);
    const wanted = { positive: 'up', negative: 'down' }[filter];
    const stats = svc.sortRows(wanted ? priced.filter((r) => r.direction === wanted) : priced, filter === 'negative' ? 'loss' : 'gain');
    const user = req.query.user_id ? await findByPublicId(User, req.query.user_id) : null;
    return res.json({
      success: true,
      ...sessionJson(session, phase),
      ...(!priced.length ? { message: NO_START } : MESSAGES[phase] ? { message: MESSAGES[phase] } : {}),
      filter,
      total: stats.length,
      counts: { all: counts.all, positive: counts.up, negative: counts.down, unchanged: counts.flat, price_missing: counts.no_price },
      currency: data.currency,
      stats: stats.map(stockJson),
      // Stocks whose start price could not be fetched: no price or %, they score 0.
      not_priced: data.rows.filter((r) => !r.has_start_price).map((r) => ({ symbol: r.symbol, name: r.name, category_name: r.category_name, image_url: r.image_url })),
      refresh_seconds: phase === 'final' ? null : svc.REFRESH_SECONDS,
      last_updated: sqlDate(data.updated_at),
      server_time: sqlDate(now),
      unread_notifications: await unreadCount(user),
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

async function stockHistory(req, res) {
  try {
    const session = await findByPublicId(LeagueSession, req.params.sessionId);
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' });
    const symbol = typeof req.query.symbol === 'string' ? req.query.symbol.trim() : '';
    if (!symbol) return res.status(400).json({ success: false, error: 'symbol is required' });
    const now = new Date();
    const data = await svc.stockHistory(session, symbol, now);
    if (!data) return res.status(404).json({ success: false, error: 'This stock is not in the session' });
    const started = svc.hasStarted(data.phase);
    const message = !started ? MESSAGES[data.phase] : !data.row.has_start_price ? 'The start price of this stock is not available.' : MESSAGES[data.phase];
    return res.json({
      success: true,
      ...sessionJson(session, data.phase),
      ...(message ? { message } : {}),
      currency: data.currency,
      stock: started && data.row.has_start_price ? stockJson(data.row) : null,
      total: data.points.length,
      history: data.points.map((p) => ({
        type: p.type, // start | live | final
        time: sqlDate(p.at),
        price: p.price,
        change_amount: p.change_amount,
        change_percent: p.change_percent,
        direction: p.direction,
        points: p.points,
      })),
      refresh_seconds: data.phase === 'final' ? null : svc.REFRESH_SECONDS,
      server_time: sqlDate(now),
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

module.exports = { sessionStats, stockHistory };
