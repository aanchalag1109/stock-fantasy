'use strict';

const CronLog = require('../models/cron-log.model');
const axios = require('axios');
const logger = require('../config/logger');

/**
 * POST /api/v1/cron/run
 * Trigger cron job manually (requires cron-secret header).
 */
const runCron = async (req, res) => {
  try {
    const { job_name, api_url, api_method = 'get', api_headers = {}, api_body = {} } = req.body;
    if (!job_name || !api_url) {
      return res.status(400).json({ success: false, message: 'job_name and api_url required' });
    }

    logger.info(`Running cron job: ${job_name}`);
    const start = Date.now();
    let success = false;
    let response_body = '';

    try {
      const response = await axios({
        method: api_method.toLowerCase(),
        url: api_url,
        headers: api_headers,
        data: api_body,
        timeout: 30000,
      });
      success = response.status >= 200 && response.status < 300;
      response_body = JSON.stringify(response.data).slice(0, 1000);
    } catch (e) {
      response_body = e.message;
    }

    await CronLog.create({
      job_name,
      success,
      duration_ms: Date.now() - start,
      response: response_body,
    });
    const { touchCronHeartbeat } = require('../scheduler');
    await touchCronHeartbeat();

    return res.json({ success: true, job_name, status: success ? 'success' : 'failed', response: response_body });
  } catch (err) {
    logger.error('runCron error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/v1/cron/logs
 */
const getCronLogs = async (req, res) => {
  try {
    const { limit = 50, job_name } = req.query;
    const filter = job_name ? { job_name } : {};
    const logs = await CronLog.find(filter).sort({ created_at: -1 }).limit(parseInt(limit)).lean();
    return res.json({ success: true, logs });
  } catch (err) {
    logger.error('getCronLogs error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { runCron, getCronLogs };
