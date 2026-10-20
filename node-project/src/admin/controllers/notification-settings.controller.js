'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: Automated Notifications and Notification Management
 * Purpose: Send session reminders, winning amount notifications,
 *          and deposit/withdrawal notifications.
 * Origin: Newly implemented in node-project; not directly converted
 *          from the original PHP implementation.
 *
 * Important: Keep this implementation distinguishable from the
 * original PHP project when comparing functionality in the future.
 *
 * Admin page: global push switch, session reminder timings, per-event toggles,
 * FCM status, and a log of recent automated notifications with delivery status.
 */

const Notification = require('../../models/notification.model');
const User = require('../../models/user.model');
const logger = require('../../config/logger');
const { render } = require('../helpers/render');
const settingsService = require('../../services/notifications/notification-settings.service');
const fcm = require('../../services/notifications/fcm.service');

const BASE_PATH = '/notification-settings';
const PUSH_STATUSES = ['sent', 'retry', 'failed', 'skipped', 'disabled'];

async function pageData(req) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const eventFilter = settingsService.EVENTS[req.query.event] ? req.query.event : '';
  const logFilter = eventFilter ? { event: eventFilter } : { event: { $ne: null } };
  const [recent, counts] = await Promise.all([
    Notification.find(logFilter).sort({ created_at: -1 }).limit(50).lean(),
    Notification.aggregate([
      { $match: { event: { $ne: null }, created_at: { $gte: since } } },
      { $group: { _id: '$push_status', count: { $sum: 1 } } },
    ]),
  ]);
  const userIds = [...new Set(recent.map((n) => String(n.user_id)))];
  const users = await User.find({ _id: { $in: userIds.filter((id) => id.length === 24) } }).select('name mobile').lean();
  const userById = Object.fromEntries(users.map((u) => [String(u._id), u]));
  return {
    recent: recent.map((n) => ({ ...n, user: userById[String(n.user_id)] || null })),
    counts: Object.fromEntries(PUSH_STATUSES.map((s) => [s, (counts.find((c) => c._id === s) || {}).count || 0])),
    eventFilter,
    events: settingsService.EVENTS,
    fcmConfigured: fcm.isConfigured(),
    fcmProject: fcm.projectId(),
  };
}

const index = async (req, res, next) => {
  try {
    const settings = await settingsService.getSettings();
    await render(res, 'notification_settings/index', {
      title: 'Notification Settings',
      settings,
      values: { ...settings, session_reminder_minutes: settings.session_reminder_minutes.join(', ') },
      errors: {},
      ...(await pageData(req)),
    });
  } catch (err) { next(err); }
};

const update = async (req, res, next) => {
  try {
    const { values, errors } = settingsService.validate(req.body);
    if (Object.keys(errors).length) {
      res.status(422);
      return render(res, 'notification_settings/index', {
        title: 'Notification Settings',
        settings: await settingsService.getSettings(),
        values: { ...values, session_reminder_minutes: String(req.body.session_reminder_minutes || '') },
        errors,
        ...(await pageData(req)),
      });
    }
    await settingsService.saveSettings(values);
    logger.info(`[notifications] ${req.adminAccess ? req.adminAccess.email : 'admin'} updated notification settings`, values);
    req.flash('success', 'Notification settings saved.');
    return res.redirect(BASE_PATH);
  } catch (err) { return next(err); }
};

module.exports = { index, update };
