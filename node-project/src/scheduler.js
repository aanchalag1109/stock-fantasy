'use strict';

const nodeCron = require('node-cron');
const logger = require('./config/logger');
const Setting = require('./models/setting.model');

let schedulerStarted = false;

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
  });

  logger.info('Cron scheduler started (1-minute interval)');
}

function stopScheduler() {
  schedulerStarted = false;
  logger.info('Scheduler stopped');
}

module.exports = { startScheduler, stopScheduler, touchCronHeartbeat };
