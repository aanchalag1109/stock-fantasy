'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: Contest Automation (port of the PHP scheduled commands)
 * Purpose: Run each scheduled job in at most one process at a time.
 * Origin: Newly implemented in node-project.
 * Note: This feature must remain distinguishable from PHP-converted code.
 *
 * Acquire = atomically take the lease if it is free or expired. A crashed holder's
 * lease simply expires after `ttlMs`.
 */

const os = require('os');
const crypto = require('crypto');
const JobLock = require('../../models/job-lock.model');

const OWNER = `${os.hostname()}:${process.pid}:${crypto.randomBytes(3).toString('hex')}`;

async function acquire(name, ttlMs) {
  const now = new Date();
  try {
    const doc = await JobLock.findOneAndUpdate(
      { _id: name, $or: [{ locked_until: null }, { locked_until: { $lte: now } }] },
      { $set: { owner: OWNER, locked_until: new Date(now.getTime() + ttlMs) } },
      { upsert: true, new: true },
    );
    return !!doc && doc.owner === OWNER;
  } catch (err) {
    if (err && err.code === 11000) return false; // held by another process (upsert raced the existing doc)
    throw err;
  }
}

async function release(name) {
  await JobLock.updateOne({ _id: name, owner: OWNER }, { $set: { locked_until: new Date(0) } });
}

/** Runs fn() under the lock; returns { skipped: true } when another process holds it. */
async function withLock(name, ttlMs, fn) {
  if (!(await acquire(name, ttlMs))) return { skipped: true };
  try {
    return await fn();
  } finally {
    await release(name).catch(() => {});
  }
}

module.exports = { withLock, acquire, release, OWNER };
