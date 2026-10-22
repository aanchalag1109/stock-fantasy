'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: OTP-only Login and Signup (SMS delivery)
 * Exercises sms.service and otp.service with axios and the OtpVerification model
 * stubbed in memory, so no database or network is needed.
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const config = require('../../src/config/env');
const logger = require('../../src/config/logger');
const OtpVerification = require('../../src/models/otp-verification.model');
const smsService = require('../../src/services/sms.service');
const otpService = require('../../src/services/otp.service');

const originalSms = { ...config.SMS };
const originals = {
  get: axios.get,
  findOne: OtpVerification.findOne,
  deleteMany: OtpVerification.deleteMany,
  deleteOne: OtpVerification.deleteOne,
  create: OtpVerification.create,
  info: logger.info,
  error: logger.error,
};

let calls;
let records;

function setUp() {
  calls = [];
  records = [];
  Object.assign(config.SMS, {
    enabled: true, apiKey: 'KEY', senderId: 'ABCDEF', route: '4',
    dltTemplateId: '1707000', peId: '1701000', otpTemplate: 'Your OTP is {otp}, valid {minutes} min.',
  });
  OtpVerification.findOne = () => ({ sort: () => ({ lean: async () => null }) });
  OtpVerification.deleteMany = async () => ({});
  OtpVerification.deleteOne = async (q) => { records = records.filter((r) => r._id !== q._id); };
  OtpVerification.create = async (doc) => { const r = { _id: records.length + 1, ...doc }; records.push(r); return r; };
  logger.info = () => {};
  logger.error = () => {};
}

function tearDown() {
  Object.assign(config.SMS, originalSms);
  axios.get = originals.get;
  Object.assign(OtpVerification, {
    findOne: originals.findOne, deleteMany: originals.deleteMany,
    deleteOne: originals.deleteOne, create: originals.create,
  });
  logger.info = originals.info;
  logger.error = originals.error;
}

describe('sms.service', () => {
  beforeEach(setUp);
  afterEach(tearDown);

  test('normalizes mobiles to 10 digits', () => {
    assert.equal(smsService.toTenDigitMobile('9876543210'), '9876543210');
    assert.equal(smsService.toTenDigitMobile('+91 98765-43210'), '9876543210');
    assert.equal(smsService.toTenDigitMobile('09876543210'), '9876543210');
    assert.equal(smsService.toTenDigitMobile('12345'), null);
  });

  test('sends the DLT parameters and reads a success response', async () => {
    axios.get = async (url, opts) => { calls.push({ url, ...opts }); return { data: { status: 200, message: 'success', request_id: 'SMS_1' } }; };
    const result = await smsService.sendSms('+919876543210', 'hello');
    assert.deepEqual(result, { ok: true, request_id: 'SMS_1' });
    assert.equal(calls[0].url, 'https://apitxt.com/api/sendMsg');
    assert.deepEqual(calls[0].params, {
      authkey: 'KEY', mobiles: '9876543210', message: 'hello', sender: 'ABCDEF',
      route: '4', template_id: '1707000', pe_id: '1701000',
    });
  });

  test('maps provider error codes', async () => {
    axios.get = async () => ({ data: { status: 301, message: 'error' } });
    const result = await smsService.sendSms('9876543210', 'hello');
    assert.deepEqual(result, { ok: false, code: 301, message: 'Insufficient balance' });
  });

  test('returns network failures instead of throwing', async () => {
    axios.get = async () => { throw new Error('timeout'); };
    const result = await smsService.sendSms('9876543210', 'hello');
    assert.equal(result.ok, false);
    assert.equal(result.message, 'timeout');
  });
});

describe('otp.service with SMS', () => {
  beforeEach(setUp);
  afterEach(tearDown);

  test('sends a random 6-digit OTP using the template', async () => {
    axios.get = async (url, opts) => { calls.push(opts.params); return { data: { status: 200, request_id: 'SMS_2' } }; };
    const result = await otpService.sendOtp('9876543210', 'login');
    assert.equal(result.ok, true);
    assert.match(calls[0].message, /^Your OTP is \d{6}, valid 5 min\.$/);
    assert.equal(records.length, 1);
  });

  test('discards the OTP and returns 502 when the SMS fails', async () => {
    axios.get = async () => ({ data: { status: 304 } });
    const result = await otpService.sendOtp('9876543210', 'login');
    assert.equal(result.ok, false);
    assert.equal(result.status, 502);
    assert.equal(records.length, 0);
  });

  test('uses the static OTP and sends nothing when SMS is disabled', async () => {
    config.SMS.enabled = false;
    axios.get = async () => { throw new Error('should not be called'); };
    const result = await otpService.sendOtp('9876543210', 'signup');
    assert.equal(result.ok, true);
    assert.equal(records.length, 1);
  });
});
