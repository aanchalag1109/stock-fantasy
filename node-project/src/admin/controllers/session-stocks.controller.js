'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT (client feedback): Session Stocks — every stock of a session with its
 * price and +/- %, the 5-minute readings of a stock, and CSV export. Read-only; the work is in
 * services/session-stocks.service.js (shared with the app's API).
 */

const { render } = require('../helpers/render');
const svc = require('../../services/session-stocks.service');
const logger = require('../../config/logger');

const adminName = (req) => (req.adminAccess && req.adminAccess.email) || 'admin';

const IST = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
});
function when(value) {
  const d = value ? new Date(value) : null;
  return d && !Number.isNaN(d.getTime()) ? IST.format(d) : '—';
}
/** Price: 2–4 decimals; more for coins that cost a fraction of a unit. */
function price(n) {
  if (n == null) return '—';
  const small = Math.abs(n) < 1 && n !== 0;
  return Number(n).toLocaleString('en-IN', small ? { maximumSignificantDigits: 6 } : { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}
const signed = (n, text) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${text}`;
const diff = (n) => (n == null ? '—' : signed(n, price(Math.abs(n))));
const percent = (n) => (n == null ? '—' : signed(n, `${Math.abs(n).toFixed(2)}%`));
const points = (n) => (n == null ? '—' : signed(n, Math.abs(n).toLocaleString('en-IN')));
const tone = (n) => (n > 0 ? 'text-success' : n < 0 ? 'text-danger' : 'text-muted');

const PHASE_BADGES = { not_started: 'bg-info text-dark', live: 'bg-success', finalising: 'bg-warning text-dark', final: 'bg-primary', cancelled: 'bg-danger' };

const page = (view, title, load, back) => async (req, res) => {
  try {
    const data = await load(req);
    if (!data) { req.flash('error', 'Session or stock not found.'); return res.redirect(back(req)); }
    return await render(res, `session_stocks/${view}`, {
      title,
      ...data,
      options: svc,
      when,
      price,
      diff,
      percent,
      points,
      tone,
      phaseBadges: PHASE_BADGES,
      qs: (changes) => { const q = svc.queryString(data.filters, changes); return q ? `?${q}` : ''; },
      admin: req.session.admin,
    });
  } catch (err) {
    logger.error(`[session-stocks] ${view} failed: ${err.message}`);
    return res.status(500).send(err.message);
  }
};

const download = (name, run) => async (req, res) => {
  const back = '/session-stocks';
  try {
    if (!(await svc.findSession(req.params.id))) { req.flash('error', 'Session not found.'); return res.redirect(back); }
    const stamp = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 16).replace(/[-:T]/g, '');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="session_${String(req.params.id).replace(/\W/g, '')}_${name}_${stamp}.csv"`);
    res.setHeader('Cache-Control', 'no-store');
    const rows = await run(req.params.id, req.query, (chunk) => res.write(chunk));
    logger.info(`[session-stocks] ${adminName(req)} exported ${rows} rows (session ${req.params.id}, ${name})`);
    return res.end();
  } catch (err) {
    logger.error(`[session-stocks] export failed: ${err.message}`);
    if (!res.headersSent) {
      res.removeHeader('Content-Disposition');
      req.flash('error', `Export failed: ${err.message}`);
      return res.redirect(back);
    }
    return res.end(`\r\nExport failed: ${err.message}\r\n`);
  }
};

module.exports = {
  sessions: page('index', 'Session Stocks', (req) => svc.listSessions(req.query), () => '/dashboard'),
  stocks: page('stocks', 'Session Stocks', (req) => svc.sessionStocks(req.params.id, req.query), () => '/session-stocks'),
  stock: page('stock', 'Stock History', (req) => svc.stockPage(req.params.id, typeof req.query.symbol === 'string' ? req.query.symbol : ''), () => '/session-stocks'),
  exportStocks: download('stocks', svc.exportStocks),
  exportHistory: download('history', svc.exportHistory),
};
