'use strict';

/**
 * PHP PARITY — Live Management (PHP Admin\LiveManagementController + SessionStatusController,
 * view admin/contests/live_management.blade.php, session_contests, live_contest_detail).
 * The Node conversion only had a static table; this restores the PHP page and its actions.
 * Business logic lives in services/session-management.service.js.
 *
 * NEW IMPLEMENTATION — NODE.JS PROJECT: cancelSession (client request: cancel a session from
 * Live Management and refund every joined user).
 */

const logger = require('../../config/logger');
const { render } = require('../helpers/render');
const service = require('../../services/session-management.service');

const actorOf = (req) => (req.adminAccess ? req.adminAccess.email : 'admin');

// Wraps a service call that returns { success, status?, message } into a JSON response.
const action = (fn, label) => async (req, res) => {
  try {
    const result = await fn(req);
    if (result.success) logger.info(`[live-management] ${actorOf(req)} ${label} ${req.params.id || ''}: ${result.message || 'ok'}`);
    const { status, ...body } = result;
    res.status(result.success ? 200 : (status || 400)).json(body);
  } catch (err) {
    logger.error(`[live-management] ${label} failed: ${err.message}`);
    res.status(500).json({ success: false, message: 'System Error: ' + err.message });
  }
};

const index = (req, res) => render(res, 'live_management/index', { title: 'Live Contest Management' });

const sessionContestsPage = async (req, res) => {
  const data = await service.sessionContests(req.params.id);
  if (!data) { req.flash('error', 'Session not found'); return res.redirect('/live-management'); }
  return render(res, 'live_management/session_contests', { title: `Session Contests — ${data.session.name}`, ...data });
};

const contestDetailPage = (req, res) => render(res, 'live_management/contest_detail', { title: 'Live Contest Detail', contestId: req.params.id });

const liveSessionsData = async (req, res) => {
  try {
    res.json(await service.liveSessionsData(req.query.status || 'all'));
  } catch (err) {
    res.json({ success: false, error: err.message, sessions: [], live_sessions_count: 0, live_contests_count: 0, total_participants: 0, total_prize_pool: 0 });
  }
};

const contestDetails = async (req, res) => {
  try {
    const data = await service.contestDetails(req.params.id);
    if (!data) return res.status(404).json({ success: false, error: 'Contest not found' });
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

const portfolioDetails = async (req, res) => {
  try {
    const data = await service.portfolioDetails(req.params.id);
    if (!data) return res.status(404).json({ success: false, error: 'Portfolio not found' });
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

module.exports = {
  index,
  sessionContestsPage,
  contestDetailPage,
  liveSessionsData,
  contestDetails,
  portfolioDetails,
  startSession: action((req) => service.startSession(req.params.id), 'started session'),
  endAndDistribute: action((req) => service.endAndDistribute(req.params.id, { actor: actorOf(req) }), 'ended & distributed session'),
  cancelSession: action((req) => service.cancelSession(req.params.id, { actor: actorOf(req) }), 'cancelled session'),
  fixOrphanedContests: action(() => service.fixOrphanedContests(), 'cleaned up orphaned contests'),
  startContests: action(() => service.runStartContests(), 'ran start contests'),
  updateScores: action(() => service.runUpdateScores(), 'ran update scores'),
};
