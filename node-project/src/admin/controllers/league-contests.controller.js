'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT (client feedback): League Contests — leagues → contests → players,
 * with filters and CSV export. Read-only; the work is in services/league-contests.service.js.
 */

const { render } = require('../helpers/render');
const svc = require('../../services/league-contests.service');
const logger = require('../../config/logger');

const adminName = (req) => (req.adminAccess && req.adminAccess.email) || 'admin';

const IST = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
});
function when(value) {
  const d = value ? new Date(value) : null;
  return d && !Number.isNaN(d.getTime()) ? IST.format(d) : '—';
}
/** ProbCoins: "1,500" / "556.88"; "—" when unknown. */
const coins = (n) => (n == null ? '—' : Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 }));

/** Short id for the screen: the numeric id, or the end of a long one. */
const shortId = (id) => (String(id).length === 24 ? `…${String(id).slice(-6)}` : id);

const STATE_BADGES = { upcoming: 'bg-info text-dark', live: 'bg-success', result_pending: 'bg-warning text-dark', paid: 'bg-primary', cancelled: 'bg-danger', ended: 'bg-secondary' };
const SESSION_BADGES = { upcoming: 'bg-info text-dark', live: 'bg-success', completed: 'bg-secondary', cancelled: 'bg-danger', draft: 'bg-light text-dark' };

const page = (view, title, load) => async (req, res) => {
  try {
    const data = await load(req);
    if (!data) { req.flash('error', 'Contest not found.'); return res.redirect('/league-contests/contests'); }
    return await render(res, `league_contests/${view}`, {
      title,
      ...data,
      options: svc,
      when,
      coins,
      idOf: svc.idOf,
      shortId,
      stateBadges: STATE_BADGES,
      sessionBadges: SESSION_BADGES,
      qs: (changes) => { const q = svc.queryString(data.filters, changes); return q ? `?${q}` : ''; },
      admin: req.session.admin,
    });
  } catch (err) {
    logger.error(`[league-contests] ${view} failed: ${err.message}`);
    return res.status(500).send(err.message);
  }
};

const download = (name, back, run, prepare) => async (req, res) => {
  try {
    if (prepare && !(await prepare(req))) { req.flash('error', 'Contest not found.'); return res.redirect(back); }
    const stamp = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 16).replace(/[-:T]/g, '');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${name(req)}_${stamp}.csv"`);
    res.setHeader('Cache-Control', 'no-store');
    const rows = await run(req, (chunk) => res.write(chunk));
    logger.info(`[league-contests] ${adminName(req)} exported ${rows} rows (${name(req)})`);
    return res.end();
  } catch (err) {
    logger.error(`[league-contests] export failed: ${err.message}`);
    if (!res.headersSent) {
      res.removeHeader('Content-Disposition');
      req.flash('error', `Export failed: ${err.message}`);
      return res.redirect(back);
    }
    return res.end(`\r\nExport failed: ${err.message}\r\n`);
  }
};

module.exports = {
  sessions: page('index', 'League Contests', (req) => svc.listSessions(req.query)),
  contests: page('contests', 'League Contests', (req) => svc.listContests(req.query)),
  players: page('players', 'Contest Players', (req) => svc.contestPlayers(req.params.id, req.query)),
  exportSessions: download(() => 'leagues', '/league-contests', (req, write) => svc.exportSessions(req.query, write)),
  exportContests: download(() => 'league_contests', '/league-contests/contests', (req, write) => svc.exportContests(req.query, write)),
  exportPlayers: download(
    (req) => `contest_${String(req.params.id).replace(/\W/g, '')}_players`,
    '/league-contests/contests',
    (req, write) => svc.exportPlayers(req.params.id, req.query, write),
    (req) => svc.findContest(req.params.id),
  ),
};
