'use strict';

/**
 * PHP PARITY — Announcements create, ported from PHP Admin\AnnouncementController::store.
 * The Node conversion saved `message` and type info/warning/success, which the Announcement model
 * (same as PHP: description required, type update/alert/promo) rejects — so no announcement could
 * be created — and it never notified anyone.
 *
 * Same as PHP:
 *   - validation: title (≤255), description, type update|alert|promo, send_to all|specific,
 *     user_ids required (and must exist) for specific;
 *   - one Notification row per recipient (title, description, type = announcement type);
 *   - FCM push to the recipients with data { type: 'announcement', announcement_id }.
 *   "All users" means every user, as in PHP (User::pluck('id')).
 *
 * NEW IMPLEMENTATION — NODE.JS PROJECT: the push is sent in the background with limited
 * concurrency (a broadcast must not block the admin request) through the existing FCM sender
 * (services/notifications/fcm.service.js); tokens FCM reports as unregistered are cleared.
 */

const mongoose = require('mongoose');
const Announcement = require('../models/announcement.model');
const Notification = require('../models/notification.model');
const User = require('../models/user.model');
const logger = require('../config/logger');
const fcm = require('./notifications/fcm.service');

const TYPES = ['update', 'alert', 'promo'];
const PUSH_CONCURRENCY = 10;
const isOid = (v) => String(v).length === 24 && mongoose.isValidObjectId(String(v));

/** Returns { values, errors } (errors: list of messages, PHP-style). */
async function validate(body = {}) {
  const errors = [];
  const title = String(body.title || '').trim();
  const description = String(body.description || '').trim();
  const type = String(body.type || '');
  const sendTo = String(body.send_to || '');
  if (!title) errors.push('The title field is required.');
  else if (title.length > 255) errors.push('The title must not be greater than 255 characters.');
  if (!description) errors.push('The description field is required.');
  if (!TYPES.includes(type)) errors.push('The selected type is invalid.');
  if (!['all', 'specific'].includes(sendTo)) errors.push('The selected send to is invalid.');

  let userIds = [];
  if (sendTo === 'specific') {
    const posted = [].concat(body.user_ids || body['user_ids[]'] || []).map(String).filter(Boolean);
    if (!posted.length) errors.push('The user ids field is required when send to is specific.');
    else if (posted.some((id) => !isOid(id))) errors.push('The selected user ids is invalid.');
    else {
      const found = await User.find({ _id: { $in: posted } }).select('_id').lean();
      if (found.length !== new Set(posted).size) errors.push('The selected user ids is invalid.');
      userIds = found.map((u) => u._id);
    }
  }
  return { values: { title, description, type, sendTo, userIds }, errors };
}

/** Sends the push to every recipient that has a device token. Never throws. */
async function pushToUsers(userIds, announcement) {
  try {
    const users = await User.find({ _id: { $in: userIds }, fcm_token: { $nin: [null, ''] } }).select('_id fcm_token').lean();
    const data = { type: 'announcement', announcement_id: String(announcement._id), announcement_type: announcement.type };
    let sent = 0;
    for (let i = 0; i < users.length; i += PUSH_CONCURRENCY) {
      const batch = users.slice(i, i + PUSH_CONCURRENCY);
      const results = await Promise.all(batch.map((u) => fcm.send(u.fcm_token, { title: announcement.title, body: announcement.description, data })));
      for (let j = 0; j < batch.length; j += 1) {
        if (results[j].status === 'sent') sent += 1;
        if (results[j].status === 'invalid_token') await User.updateOne({ _id: batch[j]._id, fcm_token: batch[j].fcm_token }, { $set: { fcm_token: null } });
      }
      if (results.some((r) => r.status === 'disabled')) break; // FCM not configured — nothing to send
    }
    logger.info(`[announcements] push for ${announcement._id}: ${sent}/${users.length} sent`);
    return { sent, tokens: users.length };
  } catch (err) {
    logger.error(`[announcements] push failed for ${announcement._id}: ${err.message}`);
    return { sent: 0, error: err.message };
  }
}

/**
 * Creates the announcement, saves a notification per recipient and starts the push.
 * Returns { announcement, recipients, message, push } — `push` is the background promise.
 */
async function createAndSend(values) {
  const announcement = await Announcement.create({ title: values.title, description: values.description, type: values.type });
  const userIds = values.sendTo === 'all'
    ? (await User.find({}).select('_id').lean()).map((u) => u._id)
    : values.userIds;
  if (userIds.length) {
    await Notification.insertMany(userIds.map((userId) => ({
      user_id: userId,
      title: announcement.title,
      description: announcement.description,
      type: announcement.type,
      is_read: false,
    })));
  }
  const push = pushToUsers(userIds, announcement);
  return {
    announcement,
    recipients: userIds.length,
    message: values.sendTo === 'all' ? 'Announcement created and sent to all users!' : `Announcement created and sent to ${userIds.length} users!`,
    push,
  };
}

module.exports = { TYPES, validate, createAndSend, pushToUsers };
