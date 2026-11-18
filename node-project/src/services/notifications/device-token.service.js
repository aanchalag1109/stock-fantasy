'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: Automated Notifications and Notification Management
 * Purpose: Store the mobile app's Firebase (FCM) device token on the user.
 * Origin: Newly implemented in node-project; not directly converted
 *          from the original PHP implementation.
 *
 * Important: Keep this implementation distinguishable from the
 * original PHP project when comparing functionality in the future.
 *
 * One device token belongs to one user: when a phone logs in to another account
 * the token is removed from the previous account, so the old user's pushes stop
 * reaching that phone.
 */

const User = require('../../models/user.model');

const MAX_TOKEN_LENGTH = 4096;

/** Returns the trimmed token, or null when the value is not a usable FCM token. */
function parseToken(value) {
  if (typeof value !== 'string') return null;
  const token = value.trim();
  if (!token || token.length > MAX_TOKEN_LENGTH || /\s/.test(token)) return null;
  return token;
}

/** Saves `token` on the user (a document or an _id) and detaches it from any other account. */
async function assignToken(user, token) {
  const userId = user && user._id ? user._id : user;
  await User.updateMany({ fcm_token: token, _id: { $ne: userId } }, { $set: { fcm_token: null } });
  await User.updateOne({ _id: userId }, { $set: { fcm_token: token } });
  if (user && user._id) user.fcm_token = token;
}

/** Clears the user's token (logout). With `token`, only clears it if it still matches. */
async function clearToken(user, token) {
  const userId = user && user._id ? user._id : user;
  const filter = token ? { _id: userId, fcm_token: token } : { _id: userId };
  await User.updateOne(filter, { $set: { fcm_token: null } });
}

module.exports = { parseToken, assignToken, clearToken, MAX_TOKEN_LENGTH };
