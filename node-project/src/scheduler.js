'use strict';

const nodeCron = require('node-cron');
const logger = require('./config/logger');
const Setting = require('./models/setting.model');

let schedulerStarted = false;

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: Automated Notifications and Notification Management
 * Session reminders and push retries, once per minute. Both server.js and
 * admin-server.js start this scheduler; notification dedupe keys make that safe.
 */
const { runSessionReminders } = require('./services/notifications/session-reminder.job');
const { retryPendingPushes } = require('./services/notifications/notification.service');

let notificationJobsRunning = false;
async function runNotificationJobs() {
  if (notificationJobsRunning) return; // a slow tick must not overlap the next one
  notificationJobsRunning = true;
  try {
    const reminders = await runSessionReminders();
    if (reminders.queued) logger.info(`Session reminders queued: ${reminders.queued}`);
    await retryPendingPushes();
  } catch (err) {
    logger.error('Notification jobs error:', err.message);
  } finally {
    notificationJobsRunning = false;
  }
}

async function touchCronHeartbeat() {
  const now = new Date();
  await Setting.findOneAndUpdate(
    { key: 'cron_last_run' },
    { key: 'cron_last_run', value: now.toISOString() },
    { upsert: true }
  );
  return now;
}

/**
 * Start the cron scheduler.
 * Mirrors the Laravel cron runner: fetches CronJob records and runs them on schedule.
 */
function startScheduler() {
  if (schedulerStarted) return;
  schedulerStarted = true;

  logger.info('Starting cron scheduler...');

  // Run every minute – same as a server cron trigger
  nodeCron.schedule('* * * * *', async () => {
    try {
      await touchCronHeartbeat();
      logger.debug('Cron scheduler tick');
    } catch (err) {
      logger.error('Scheduler tick error:', err.message);
    }
    await runNotificationJobs();
  });

  logger.info('Cron scheduler started (1-minute interval)');
}

function stopScheduler() {
  schedulerStarted = false;
  logger.info('Scheduler stopped');
}

module.exports = { startScheduler, stopScheduler, touchCronHeartbeat };
