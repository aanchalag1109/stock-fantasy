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

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: Contest Automation — port of the PHP Laravel scheduler (app/Console/Kernel.php):
 *   league:update-status         every 30 s  → session lifecycle + start/end prices
 *   contest:update-live-scores   every 15 min → live scores and ranks
 *   contest:calculate-performance every 2 min → final scores/ranks, <10-entry refunds
 * Each job runs under a lease lock, so with both servers running it executes once.
 * Disable with CONTEST_AUTOMATION_ENABLED=false.
 */
const config = require('./config/env');
const { withLock } = require('./services/contest-automation/job-lock');
const { runSessionLifecycle } = require('./services/contest-automation/session-lifecycle.job');
const { runLiveScores } = require('./services/contest-automation/live-scores.job');
const { runContestResults } = require('./services/contest-automation/results.job');

const CONTEST_JOBS = [
  { name: 'session-lifecycle', cron: '*/30 * * * * *', leaseMs: 5 * 60 * 1000, run: runSessionLifecycle },
  { name: 'live-scores', cron: '*/15 * * * *', leaseMs: 14 * 60 * 1000, run: runLiveScores },
  { name: 'contest-results', cron: '*/2 * * * *', leaseMs: 10 * 60 * 1000, run: runContestResults },
];

async function runContestJob(job) {
  try {
    const result = await withLock(`contest-automation:${job.name}`, job.leaseMs, () => job.run());
    if (result && !result.skipped && Object.values(result).some((v) => v)) {
      logger.info(`[contest-automation] ${job.name}: ${JSON.stringify(result)}`);
    }
  } catch (err) {
    logger.error(`[contest-automation] ${job.name} error: ${err.message}`);
  }
}

function startContestAutomation() {
  if (!config.CONTEST_AUTOMATION_ENABLED) {
    logger.info('Contest automation disabled (CONTEST_AUTOMATION_ENABLED=false)');
    return;
  }
  CONTEST_JOBS.forEach((job) => nodeCron.schedule(job.cron, () => runContestJob(job)));
  logger.info('Contest automation scheduled (session lifecycle 30s, live scores 15m, results 2m)');
}

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

  startContestAutomation(); // NEW IMPLEMENTATION — NODE.JS PROJECT: Contest Automation
}

function stopScheduler() {
  schedulerStarted = false;
  logger.info('Scheduler stopped');
}

module.exports = { startScheduler, stopScheduler, touchCronHeartbeat, runContestJob, CONTEST_JOBS };
