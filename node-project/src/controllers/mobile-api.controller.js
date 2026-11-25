'use strict';

const bcrypt = require('bcryptjs');
const User = require('../models/user.model');
const LeagueSession = require('../models/league-session.model');
const Contest = require('../models/contest.model');
const SavedBasket = require('../models/saved-basket.model');
const ContestEntry = require('../models/contest-entry.model');
const Transaction = require('../models/transaction.model');
const WithdrawalRequest = require('../models/withdrawal-request.model');
const Notification = require('../models/notification.model');
const Banner = require('../models/banner.model');
const Announcement = require('../models/announcement.model');
const Setting = require('../models/setting.model');
const Asset = require('../models/asset.model');
const {
  keysOf, publicId, sqlDate, absoluteUrl, num, walletOf, unreadCount,
  findByPublicId, ensureOldId, priceMaps, scoreAssets, selectedMultipliers,
  buildDynamicPrizeDistribution, asPrizeArray, round2, transactionLabels,
} = require('../helpers/mobile-compat');
// NEW IMPLEMENTATION (node-project only, not converted from PHP): OTP-only Login and Signup.
const otpService = require('../services/otp.service');
// NEW IMPLEMENTATION — NODE.JS PROJECT: admin-configured deposit/withdrawal limits
const { checkTransactionAmount, limitErrorBody } = require('../services/deposit-withdrawal-settings.service');
// NEW IMPLEMENTATION — NODE.JS PROJECT: Automated Notifications
const { notify } = require('../services/notifications/notification.service');
const deviceTokens = require('../services/notifications/device-token.service');
// NEW IMPLEMENTATION — NODE.JS PROJECT: Fantasy contest formats + safe joining
const formats = require('../services/contest-formats');
const contestJoin = require('../services/contest-join.service');
// NEW IMPLEMENTATION — NODE.JS PROJECT: live prize rows use the payout's own calculation
const { dynamicPrizeRows, cardPrize, advertisedPerWinner } = require('../services/contest-automation/contest-scoring');
const sessionMarkets = require('../services/markets'); // NEW IMPLEMENTATION — NODE.JS PROJECT: market types
// NEW IMPLEMENTATION — NODE.JS PROJECT: per-category pick limits for the player's basket (client feedback)
const sessionAssets = require('../services/session-assets.service');
const withdrawals = require('../services/payments/withdrawal.service'); // NEW IMPLEMENTATION — NODE.JS PROJECT
const payoutDetails = require('../services/payments/payout-details.service'); // NEW IMPLEMENTATION — NODE.JS PROJECT
const depositWithdrawalSettings = require('../services/deposit-withdrawal-settings.service');
const passwordAuth = require('../services/password-auth.service'); // NEW IMPLEMENTATION — NODE.JS PROJECT: OTP or password login

/** 422 with the basket-limit errors (message = first one, errors = all), or null when the basket is fine. */
function basketLimitError(res, session, assets) {
  const errors = session ? sessionAssets.checkBasket(session, assets) : [];
  if (!errors.length) return null;
  return res.status(422).json({ success: false, message: errors[0], error: errors[0], errors });
}

function authUser(user) {
  return {
    id: publicId(user),
    name: user.name,
    email: user.email,
    mobile: user.mobile,
    wallet_balance: walletOf(user),
    // NEW IMPLEMENTATION — NODE.JS PROJECT: profile photo on login / signup / password login too (full URL or null)
    profile_image: absoluteUrl(user.profile_image),
  };
}

async function findUserByMobile(mobile) {
  const digits = String(mobile || '').replace(/\D/g, '');
  const last10 = digits.slice(-10);
  if (last10.length < 10) return null;
  const exact = await User.findOne({ mobile: String(mobile).trim() });
  if (exact) return exact;
  const users = await User.find({ mobile: { $regex: `${last10}$` } }).limit(20);
  return users.find((user) => String(user.mobile || '').replace(/\D/g, '').slice(-10) === last10) || null;
}

const login = async (req, res) => {
  try {
    const mobile = String(req.body.mobile || '').trim();
    if (mobile.length < 10 || mobile.length > 15) {
      return res.status(500).json({ success: false, message: 'Login failed' });
    }
    const user = await User.findOne({ mobile });
    if (!user) return res.status(404).json({ success: false, message: 'User not found. Please register first.' });
    // NEW IMPLEMENTATION (node-project only, not converted from PHP): OTP-only Login and Signup.
    // PHP trusted the client's OTP check; the OTP from POST /send-otp is now verified here.
    const otpResult = await otpService.verifyOtp(mobile, 'login', req.body.otp);
    if (!otpResult.ok) return otpService.sendVerifyError(res, otpResult);
    // NEW IMPLEMENTATION — NODE.JS PROJECT: one device token per user
    const fcmToken = deviceTokens.parseToken(req.body.fcm_token);
    if (fcmToken) await deviceTokens.assignToken(user, fcmToken);
    await ensureOldId(User, user);
    return res.json({
      success: true,
      message: 'Login successful',
      user: authUser(user),
      unread_notifications: await unreadCount(user),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Login failed' });
  }
};

const register = async (req, res) => {
  try {
    const mobile = String(req.body.mobile || '').trim();
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const errors = {};
    if (mobile.length < 10 || mobile.length > 15) errors.mobile = ['The mobile field is required.'];
    if (!name || name.length > 255) errors.name = ['The name field is required.'];
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = ['The email field must be a valid email.'];
    // NEW IMPLEMENTATION (node-project only, not converted from PHP): OTP-only Login and Signup.
    // The PHP password rule is removed; signup is confirmed by the OTP instead.
    if (!/^\d{6}$/.test(String(req.body.otp || '').trim())) errors.otp = ['The otp field must be a 6-digit code.'];
    // NEW IMPLEMENTATION — NODE.JS PROJECT: login with OTP or password — signup still verifies the mobile
    // with the OTP; the user may also choose a password now (optional).
    const wantsPassword = req.body.password !== undefined && req.body.password !== null && req.body.password !== '';
    if (wantsPassword) {
      const problem = passwordAuth.validatePassword(req.body.password, req.body.password_confirmation);
      if (problem) errors.password = [problem];
    }
    if (Object.keys(errors).length) {
      return res.status(400).json({ success: false, message: 'Registration failed: The given data was invalid.', errors });
    }
    const existingMobile = await User.findOne({ mobile });
    if (existingMobile) {
      return res.status(409).json({ success: false, message: 'User with this mobile number already exists.' });
    }
    const existingEmail = await User.findOne({ email });
    if (existingEmail) {
      return res.status(400).json({
        success: false,
        message: 'Registration failed: The email has already been taken.',
        errors: { email: ['The email has already been taken.'] },
      });
    }
    // NEW IMPLEMENTATION (node-project only, not converted from PHP): OTP-only Login and Signup.
    // Verified after the field/duplicate checks so a rejected form does not use up the OTP.
    const otpResult = await otpService.verifyOtp(mobile, 'signup', req.body.otp);
    if (!otpResult.ok) return otpService.sendVerifyError(res, otpResult);
    const user = await User.create({
      name,
      email,
      mobile,
      password: wantsPassword ? await passwordAuth.hashPassword(req.body.password) : null,
      password_set_at: wantsPassword ? new Date() : null,
      deposit_balance: 0,
      winnings_balance: 0,
    });
    // NEW IMPLEMENTATION — NODE.JS PROJECT: save the device token at signup too
    const signupToken = deviceTokens.parseToken(req.body.fcm_token);
    if (signupToken) await deviceTokens.assignToken(user, signupToken);
    await ensureOldId(User, user);
    return res.json({
      success: true,
      user: authUser(user),
      unread_notifications: await unreadCount(user),
    });
  } catch (err) {
    return res.status(400).json({ success: false, message: 'Registration failed: ' + err.message, errors: null });
  }
};

/** NEW IMPLEMENTATION — NODE.JS PROJECT: the same success response for OTP and password login. */
async function loginSuccess(res, user, fcmTokenRaw, extra = {}) {
  const fcmToken = deviceTokens.parseToken(fcmTokenRaw);
  if (fcmToken) await deviceTokens.assignToken(user, fcmToken);
  await ensureOldId(User, user);
  return res.json({
    success: true,
    message: 'Login successful',
    user: authUser(user),
    unread_notifications: await unreadCount(user),
    ...extra,
  });
}

// NEW IMPLEMENTATION — NODE.JS PROJECT (client feedback): login with OTP or password, the user's choice.
// POST /password-login { mobile, password, fcm_token? } — same success response as POST /login.
// Accounts without a password get 409 password_not_set (login with OTP, or set one via /set-password);
// 5 wrong passwords lock password login for 15 minutes (OTP login keeps working).
const passwordLogin = async (req, res) => {
  try {
    const mobile = String(req.body.mobile || req.body.username || '').trim();
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (mobile.length < 10 || mobile.length > 15) return res.status(400).json({ success: false, message: 'Please enter a valid mobile number.' });
    if (!password) return res.status(400).json({ success: false, message: 'Please enter your password.' });
    const user = await findUserByMobile(mobile);
    if (!user) return res.status(404).json({ success: false, message: 'User not found. Please register first.' });
    const check = await passwordAuth.checkLogin(user, password);
    if (!check.ok) {
      const { ok, status, ...body } = check;
      return res.status(status).json({ success: false, ...body });
    }
    return loginSuccess(res, user, req.body.fcm_token);
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Login failed' });
  }
};

// NEW IMPLEMENTATION — NODE.JS PROJECT (client feedback): set or reset the password with an OTP.
// Step 1: POST /send-otp { mobile, purpose: 'password' }.
// Step 2: POST /set-password { mobile, otp, password, password_confirmation, fcm_token? } → logged in.
// Used for "Forgot password" and by OTP users who want to add a password.
const setPassword = async (req, res) => {
  try {
    const mobile = String(req.body.mobile || '').trim();
    if (mobile.length < 10 || mobile.length > 15) return res.status(400).json({ success: false, message: 'Please enter a valid mobile number.' });
    const problem = passwordAuth.validatePassword(req.body.password, req.body.password_confirmation);
    if (problem) return res.status(422).json({ success: false, message: problem, errors: { password: [problem] } });
    const user = await User.findOne({ mobile }); // same exact match as send-otp, which issued the OTP
    if (!user) return res.status(404).json({ success: false, message: 'User not found. Please register first.' });
    // Checked after the password rules so a rejected password does not use up the OTP.
    const otpResult = await otpService.verifyOtp(mobile, 'password', req.body.otp);
    if (!otpResult.ok) return otpService.sendVerifyError(res, otpResult);
    await passwordAuth.setPassword(user._id, req.body.password);
    return loginSuccess(res, user, req.body.fcm_token, { message: 'Password saved. You can now login with your password.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Could not save the password. Please try again.' });
  }
};

const checkUser = async (req, res) => {
  try {
    const mobile = req.body.mobile || req.query.mobile || req.body.username || req.query.username;
    if (!mobile || String(mobile).length < 10 || String(mobile).length > 20) {
      return res.status(500).json({ success: false, message: 'Something went wrong' });
    }
    const user = await findUserByMobile(mobile);
    if (user) {
      await ensureOldId(User, user);
      // NEW IMPLEMENTATION — NODE.JS PROJECT: which login methods this account can use
      const withPassword = passwordAuth.hasPassword(user);
      return res.json({
        exists: true,
        message: 'User found. Please verify OTP.',
        user: { id: publicId(user), name: user.name, email: user.email, mobile: user.mobile, profile_image: absoluteUrl(user.profile_image) },
        has_password: withPassword,
        login_methods: withPassword ? ['otp', 'password'] : ['otp'],
      });
    }
    return res.status(404).json({ exists: false, message: 'User not found. Please register first.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Something went wrong' });
  }
};

const getSettings = async (req, res) => {
  try {
    const rows = await Setting.find({}).lean();
    const settings = {};
    rows.forEach((row) => { settings[row.key] = row.value; });
    return res.json({ settings });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to fetch settings' });
  }
};

const getUserProfile = async (req, res) => {
  try {
    const userId = req.query.user_id || req.body.user_id;
    if (!userId) return res.status(400).json({ success: false, message: 'User ID is required' });
    const user = await findByPublicId(User, userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    return res.json({
      success: true,
      user: {
        ...authUser(user),
        profile_image: absoluteUrl(user.profile_image),
        age: user.age,
        gender: user.gender,
      },
      unread_notifications: await unreadCount(user),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to fetch user profile: ' + err.message });
  }
};

/** NEW IMPLEMENTATION — NODE.JS PROJECT: which of mobile / email a profile request really changes. */
const last10 = (value) => String(value || '').replace(/\D/g, '').slice(-10);
function profileChanges(user, body) {
  const mobile = body.mobile != null && String(body.mobile).trim() !== '' && last10(body.mobile) !== last10(user.mobile);
  const email = body.email != null && String(body.email).trim() !== ''
    && String(body.email).trim().toLowerCase() !== String(user.email || '').trim().toLowerCase();
  return { mobile, email };
}

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT (client feedback): change the email with an OTP sent to the user's
 * registered mobile. 1) POST /send-otp { mobile: <current mobile>, purpose: 'change_email' }
 * 2) POST /change-email { user_id, new_email, otp }
 */
const changeEmail = async (req, res) => {
  try {
    const user = await findByPublicId(User, req.body.user_id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    const email = String(req.body.new_email || req.body.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) return res.status(422).json({ success: false, message: 'Please enter a valid email address.' });
    if (email === String(user.email || '').toLowerCase()) return res.status(422).json({ success: false, message: 'This is already your email.' });
    if (await User.findOne({ email, _id: { $ne: user._id } })) return res.status(409).json({ success: false, message: 'This email is already used by another account.' });
    const otpResult = await otpService.verifyOtp(user.mobile, 'change_email', req.body.otp);
    if (!otpResult.ok) return otpService.sendVerifyError(res, otpResult);
    await User.updateOne({ _id: user._id }, { $set: { email, email_verified_at: null } });
    user.email = email;
    return res.json({ success: true, message: 'Email updated successfully', user: { ...authUser(user), profile_image: absoluteUrl(user.profile_image) } });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Could not change the email. Please try again.' });
  }
};

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT (client feedback): change the mobile number with two OTPs —
 * one to the current number (the account owner) and one to the new number (they own it).
 * 1) POST /send-otp { mobile: <current mobile>, purpose: 'change_mobile' }
 * 2) POST /send-otp { mobile: <new mobile>, purpose: 'new_mobile' }
 * 3) POST /change-mobile { user_id, new_mobile, otp_current, otp_new }
 */
const changeMobile = async (req, res) => {
  try {
    const user = await findByPublicId(User, req.body.user_id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    const mobile = String(req.body.new_mobile || '').trim();
    if (mobile.length < 10 || mobile.length > 15) return res.status(422).json({ success: false, message: 'Please enter a valid mobile number.' });
    if (last10(mobile) === last10(user.mobile)) return res.status(422).json({ success: false, message: 'This is already your mobile number.' });
    if (await User.findOne({ mobile, _id: { $ne: user._id } })) return res.status(409).json({ success: false, message: 'This mobile number is already used by another account.' });
    // Both checked before either OTP is used up, so one wrong code doesn't waste the other.
    if (!/^\d{6}$/.test(String(req.body.otp_current || '').trim()) || !/^\d{6}$/.test(String(req.body.otp_new || '').trim())) {
      return res.status(400).json({ success: false, message: 'Enter both OTPs: the one sent to your current number and the one sent to the new number.' });
    }
    const current = await otpService.verifyOtp(user.mobile, 'change_mobile', req.body.otp_current);
    if (!current.ok) return otpService.sendVerifyError(res, { ...current, message: `Current number: ${current.message}` });
    const fresh = await otpService.verifyOtp(mobile, 'new_mobile', req.body.otp_new);
    if (!fresh.ok) return otpService.sendVerifyError(res, { ...fresh, message: `New number: ${fresh.message}` });
    await User.updateOne({ _id: user._id }, { $set: { mobile } });
    user.mobile = mobile;
    return res.json({ success: true, message: 'Mobile number updated successfully', user: { ...authUser(user), profile_image: absoluteUrl(user.profile_image) } });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Could not change the mobile number. Please try again.' });
  }
};

const updateProfile = async (req, res) => {
  try {
    const user = await findByPublicId(User, req.body.user_id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (!req.body.name || !req.body.email || !req.body.mobile) {
      return res.status(500).json({ success: false, message: 'Profile update failed: The given data was invalid.', errors: null });
    }
    // NEW IMPLEMENTATION — NODE.JS PROJECT: with password login, a password can be changed here only with
    // the current password; accounts without one set it with an OTP (POST /set-password). Before, any
    // request with a user_id could set a new password.
    let newPasswordHash = null;
    if (req.body.password) {
      if (!passwordAuth.hasPassword(user)) {
        return res.status(403).json({ success: false, password_not_set: true, message: 'Set your password with OTP (Forgot / Set password).' });
      }
      if (!(await passwordAuth.matches(req.body.current_password, user.password))) {
        return res.status(403).json({ success: false, message: 'Current password is incorrect.' });
      }
      const problem = passwordAuth.validatePassword(req.body.password, req.body.password_confirmation);
      if (problem) return res.status(422).json({ success: false, message: problem, errors: { password: [problem] } });
      newPasswordHash = await passwordAuth.hashPassword(req.body.password);
    }
    // NEW IMPLEMENTATION — NODE.JS PROJECT (client feedback): mobile and email are changed only with OTP
    // (POST /change-mobile, /change-email). Sending the current values (as the profile form does) is fine.
    const changes = profileChanges(user, req.body);
    if (changes.mobile || changes.email) {
      return res.status(403).json({
        success: false,
        otp_required: true,
        field: changes.mobile ? 'mobile' : 'email',
        message: changes.mobile
          ? 'To change your mobile number, verify it with OTP (Change mobile number).'
          : 'To change your email, verify with OTP sent to your registered mobile (Change email).',
      });
    }
    user.name = req.body.name;
    if (newPasswordHash) {
      user.password = newPasswordHash;
      user.password_set_at = new Date();
    }
    if (req.file) user.profile_image = `uploads/profiles/${req.file.filename}`;
    await user.save();
    return res.json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        ...authUser(user),
        profile_image: absoluteUrl(user.profile_image),
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Profile update failed: ' + err.message, errors: null });
  }
};

const getPaymentDetails = async (req, res) => {
  try {
    const user = await findByPublicId(User, req.params.user_id || req.query.user_id || req.body.user_id);
    const details = (user && user.payment_details) || {};
    // NEW IMPLEMENTATION — NODE.JS PROJECT: the network withdrawals are paid on (was always 'BEP20')
    const network = await depositWithdrawalSettings.getWithdrawalNetwork();
    const address = details.usdt_wallet_address || '';
    return res.json({ status: 'success', data: { usdt_wallet_address: address, usdt_network: network, problem: address ? payoutDetails.usdtProblem(details, network) : null } });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to fetch payment details' });
  }
};

const updatePaymentDetails = async (req, res) => {
  try {
    const user = await findByPublicId(User, req.body.user_id);
    if (!user) {
      return res.status(400).json({
        status: 'error',
        message: 'Validation failed',
        errors: { user_id: ['The selected user id is invalid.'] },
      });
    }
    // NEW IMPLEMENTATION — NODE.JS PROJECT: address checked against the admin's network; OTP required
    const address = String(req.body.usdt_wallet_address || '').trim();
    const result = await payoutDetails.save(user, { usdt: address ? { usdt_wallet_address: address } : null }, req.body.otp);
    if (!result.ok) {
      const { ok, status, ...body } = result;
      return res.status(status).json({ status: 'error', ...body });
    }
    return res.json({ status: 'success', message: 'USDT wallet details updated successfully', data: { usdt_wallet_address: address, usdt_network: result.details.usdt.network } });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to update payment details' });
  }
};

function sessionRow(session, extra = {}) {
  return {
    id: publicId(session),
    name: session.name,
    start_time: sqlDate(session.start_time),
    end_time: sqlDate(session.end_time),
    status: session.status,
    market_type: session.market_type,
    // NEW IMPLEMENTATION — NODE.JS PROJECT: market (indian_stock | us_stock | crypto) + chosen categories
    market: sessionMarkets.marketOfSession(session),
    market_label: sessionMarkets.labelOf(sessionMarkets.marketOfSession(session)),
    // NEW IMPLEMENTATION — NODE.JS PROJECT (client feedback): min/max are how many stocks the player picks
    // from the category (min_select / max_select; min_assets / max_assets kept for older app builds);
    // pool_count = stocks available in it.
    categories: sessionAssets.basketLimits(session).map((c) => ({
      id: c.category_id,
      name: c.category_name,
      min_assets: c.min_select,
      max_assets: c.max_select,
      min_select: c.min_select,
      max_select: c.max_select,
      pool_count: c.pool_count,
    })),
    max_stocks: session.max_stocks,
    user_joining_start_time: sqlDate(session.user_joining_start_time),
    active: session.active == null ? true : !!session.active,
    stocks: session.stocks || [],
    cryptos: session.cryptos || [],
    image_url: absoluteUrl(session.image_url),
    created_at: sqlDate(session.created_at),
    updated_at: sqlDate(session.updated_at),
    ...extra,
  };
}

const banners = async (req, res) => {
  try {
    const rows = await Banner.find({ status: 'active' }).sort({ old_id: -1, _id: -1 }).lean();
    return res.json({
      success: true,
      banners: rows.map((banner) => ({
        id: publicId(banner),
        title: banner.title,
        image: absoluteUrl(banner.image),
        link: banner.link,
        status: banner.status,
        created_at: sqlDate(banner.created_at),
        updated_at: sqlDate(banner.updated_at),
      })),
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

const upcomingSessions = async (req, res) => {
  try {
    const sessions = await LeagueSession.find({ status: 'upcoming' }).sort({ start_time: 1 }).lean();
    const sessionKeys = sessions.flatMap(keysOf);
    const contests = sessionKeys.length
      ? await Contest.find({ league_session_id: { $in: sessionKeys } }).select('league_session_id prize_pool').lean()
      : [];
    const pools = new Map();
    contests.forEach((contest) => {
      const key = String(contest.league_session_id);
      pools.set(key, (pools.get(key) || 0) + num(contest.prize_pool));
    });
    return res.json({
      success: true,
      sessions: sessions.map((session) => sessionRow(session, {
        total_prize_pool: pools.get(String(session._id)) || pools.get(String(session.old_id)) || 0,
      })),
      unread_notifications: 0,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

const getSession = async (req, res) => {
  try {
    const session = await findByPublicId(LeagueSession, req.params.sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    const plain = session.toObject();
    return res.json({
      success: true,
      session: {
        ...sessionRow(plain, { image_url: plain.image_url || null }),
        image_url: plain.image_url || null,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

const getUserSessions = async (req, res) => {
  try {
    const sessions = await LeagueSession.find({}).sort({ start_time: -1 }).lean();
    // NEW IMPLEMENTATION — NODE.JS PROJECT: the fields the shared card-prize calculation needs, and the
    // joined count of contests whose session has started (one grouped count, not every entry)
    const contests = await Contest.find({}).select('old_id league_session_id entry_fee prize_pool category platform_fee winning_percentage multiplier is_fixed_prize fixed_prize_pool prize_distribution').lean();
    const startedKeys = new Set(sessions.filter((s) => ['live', 'completed'].includes(s.status)).flatMap((s) => keysOf(s).map(String)));
    const startedContests = contests.filter((c) => startedKeys.has(String(c.league_session_id)));
    const joined = new Map();
    if (startedContests.length) {
      const rowsCount = await ContestEntry.aggregate([
        { $match: { contest_id: { $in: startedContests.flatMap(keysOf) } } },
        { $group: { _id: '$contest_id', n: { $sum: 1 } } },
      ]);
      rowsCount.forEach((r) => joined.set(String(r._id), r.n));
    }
    const bySession = new Map();
    contests.forEach((contest) => {
      const key = String(contest.league_session_id);
      if (!bySession.has(key)) bySession.set(key, []);
      bySession.get(key).push(contest);
    });
    const rows = [];
    sessions.forEach((session) => {
      const linked = [
        ...(bySession.get(String(session._id)) || []),
        ...(session.old_id != null ? (bySession.get(String(session.old_id)) || []) : []),
      ];
      const unique = new Map(linked.map((contest) => [String(contest._id), contest]));
      const list = [...unique.values()];
      if (!list.length) {
        rows.push({ ...sessionRow(session, { image_url: session.image_url }), contest_id: null, entry_fee: 0, prize_pool: 0, contest_category: null, assets: [], entries_count: 0, joined_at: null });
        return;
      }
      list.forEach((contest) => {
        rows.push({
          ...sessionRow(session, { image_url: session.image_url }),
          contest_id: publicId(contest),
          entry_fee: num(contest.entry_fee),
          // NEW IMPLEMENTATION — NODE.JS PROJECT: shared card-prize calculation (same as detail + payout)
          prize_pool: cardPrize(contest, session.status, countFor(contest, joined)).prize_pool,
          contest_category: contest.category,
          assets: [],
          entries_count: 0,
          joined_at: null,
        });
      });
    });
    return res.json({ sessions: rows });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

const getActiveSession = async (req, res) => {
  try {
    const session = await LeagueSession.findOne({ status: 'live' }).sort({ start_time: -1 }).lean();
    if (!session) return res.status(404).json({ error: 'No active session found' });
    return res.json({
      session: {
        id: publicId(session),
        name: session.name,
        market_type: session.market_type,
        max_stocks: Number(session.max_stocks) || 0,
        user_joining_start_time: sqlDate(session.user_joining_start_time),
        start_time: sqlDate(session.start_time),
        end_time: sqlDate(session.end_time),
        status: session.status,
        active: !!session.active,
        stocks: session.stocks || [],
        cryptos: session.cryptos || [],
        created_at: sqlDate(session.created_at),
        updated_at: sqlDate(session.updated_at),
      },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

async function sessionAssetRows(sessionId) {
  const session = await findByPublicId(LeagueSession, sessionId);
  if (!session) return null;
  const symbols = [...new Set((session.assets || []).map((asset) => asset.asset_symbol).filter(Boolean))];
  // NEW IMPLEMENTATION — NODE.JS PROJECT: image_url (client feedback). A symbol listed in two markets
  // resolves to the asset of the session's own market.
  const assets = symbols.length ? await Asset.find({ symbol: { $in: symbols } }).select('symbol name type image_url market').lean() : [];
  const market = sessionMarkets.marketOfSession(session);
  const bySymbol = new Map();
  assets.forEach((asset) => {
    const current = bySymbol.get(asset.symbol);
    if (!current || (current.market !== market && asset.market === market)) bySymbol.set(asset.symbol, asset);
  });
  return { session, bySymbol };
}

/** NEW IMPLEMENTATION — NODE.JS PROJECT: absolute image URL of a session asset, or null. */
const assetImage = (info) => (info && info.image_url ? absoluteUrl(info.image_url) : null);

const getSessionAssets = async (req, res) => {
  try {
    const loaded = await sessionAssetRows(req.params.sessionId);
    if (!loaded) return res.json({ assets: [] });
    return res.json({
      assets: (loaded.session.assets || []).map((asset) => {
        const info = loaded.bySymbol.get(asset.asset_symbol) || {};
        return {
          symbol: info.symbol || asset.asset_symbol,
          name: info.name || asset.asset_name || asset.asset_symbol,
          type: info.type || null,
          category_name: asset.category_name || null,
          category_id: asset.category_id != null ? asset.category_id : null, // NEW IMPLEMENTATION — NODE.JS PROJECT
          image_url: assetImage(info), // NEW IMPLEMENTATION — NODE.JS PROJECT: asset logo (null when none)
        };
      }),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

const getSessionAssetsGrouped = async (req, res) => {
  try {
    // NEW IMPLEMENTATION — NODE.JS PROJECT: same asset lookup as above, for image_url
    const loaded = await sessionAssetRows(req.params.sessionId);
    if (!loaded) return res.json({ assets: [] });
    return res.json({
      assets: (loaded.session.assets || []).map((asset) => ({
        symbol: asset.asset_symbol,
        name: asset.asset_symbol,
        category_name: asset.category_name,
        category_id: asset.category_id,
        image_url: assetImage(loaded.bySymbol.get(asset.asset_symbol)),
      })),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

const getUserJoinedSessions = async (req, res) => {
  try {
    const user = await findByPublicId(User, req.query.user_id);
    if (!user) return res.status(400).json({ success: false, error: 'user_id is required' });
    if (req.query.debug) {
      const entries = await ContestEntry.find({ user_id: { $in: keysOf(user) } }).lean();
      return res.json({ debug: true, user_id: publicId(user), contest_entries_count: entries.length, contest_entries: entries });
    }
    const entries = await ContestEntry.find({ user_id: { $in: keysOf(user) } }).lean();
    const contestIds = [...new Set(entries.map((entry) => String(entry.contest_id)))];
    const contests = contestIds.length ? await Contest.find({ $or: [{ _id: { $in: contestIds.filter((id) => id.length === 24) } }, { old_id: { $in: contestIds.map(Number).filter((id) => !Number.isNaN(id)) } }] }).lean() : [];
    const contestByKey = new Map();
    contests.forEach((contest) => {
      contestByKey.set(String(contest._id), contest);
      if (contest.old_id != null) contestByKey.set(String(contest.old_id), contest);
    });
    const sessionIds = [...new Set(contests.map((contest) => String(contest.league_session_id)))];
    const sessions = await LeagueSession.find({
      $or: [
        { _id: { $in: sessionIds.filter((id) => id.length === 24) } },
        { old_id: { $in: sessionIds.map(Number).filter((n) => !Number.isNaN(n)) } },
      ],
    }).lean();
    const filtered = req.query.status ? sessions.filter((session) => session.status === req.query.status) : sessions;
    filtered.sort((a, b) => new Date(b.start_time) - new Date(a.start_time));
    // NEW IMPLEMENTATION — NODE.JS PROJECT: live pools count every player's entries, not just this user's
    const allCounts = await joinedCounts(contests);
    const payload = filtered.map((session) => {
      const sessionContests = contests.filter((contest) => keysOf(session).map(String).includes(String(contest.league_session_id)));
      const sessionContestKeys = new Set(sessionContests.flatMap((contest) => keysOf(contest).map(String)));
      const joinedEntries = entries.filter((entry) => sessionContestKeys.has(String(entry.contest_id)));
      let totalPrizePool = 0;
      sessionContests.forEach((contest) => {
        // NEW IMPLEMENTATION — NODE.JS PROJECT: shared card-prize calculation (same as detail + payout)
        totalPrizePool += cardPrize(contest, session.status, countFor(contest, allCounts)).prize_pool;
      });
      return {
        id: publicId(session),
        name: session.name,
        start_time: sqlDate(session.start_time),
        end_time: sqlDate(session.end_time),
        status: session.status,
        image_url: absoluteUrl(session.image_url),
        total_entries: joinedEntries.length,
        contests_joined: sessionContests.length,
        total_prize_pool: totalPrizePool,
      };
    });
    return res.json({
      success: true,
      sessions: payload,
      total: payload.length,
      unread_notifications: await unreadCount(user),
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

function contestPublic(contest, session, joinedCount) {
  const entryFee = num(contest.entry_fee);
  const platformFee = num(contest.platform_fee);
  const isFixed = formats.isFixedPool(contest);
  // NEW IMPLEMENTATION — NODE.JS PROJECT (client feedback): one card-prize calculation for every card,
  // identical to the contest detail screen and the payout (live winner-takes-all etc. included).
  const prize = cardPrize(contest, session ? session.status : 'upcoming', joinedCount);
  const prizePool = prize.prize_pool;
  const firstPrize = prize.first_prize;
  const distribution = asPrizeArray(contest.prize_distribution);
  const badge = formats.appBadge(contest);
  const spots = parseInt(contest.participants || 100, 10);
  return {
    id: publicId(contest),
    category: contest.category,
    status: contest.status || 'active',
    entry_fee: entryFee,
    platform_fee: platformFee,
    winning_percentage: num(contest.winning_percentage),
    participants: contest.participants,
    max_entries_per_user: contest.max_entries_per_user,
    prize_pool: round2(prizePool),
    is_flexible_prize: !isFixed,
    is_fixed_prize: isFixed,
    is_live_prize: prize.is_live_prize, // NEW IMPLEMENTATION — NODE.JS PROJECT: true = from actual joins
    is_pinned: !!contest.is_pinned,
    pin_order: contest.pin_order || 0,
    prize_distribution: typeof contest.prize_distribution === 'string' ? contest.prize_distribution : JSON.stringify(distribution),
    joined_count: joinedCount,
    first_prize: firstPrize,
    badge,
    league_session_id: session ? publicId(session) : contest.league_session_id,
    // NEW IMPLEMENTATION — NODE.JS PROJECT: contest type fields (see services/contest-formats.js)
    ...formats.publicFields(contest),
    spots_left: Math.max(0, spots - joinedCount),
  };
}

async function joinedCounts(contests) {
  const keys = contests.flatMap(keysOf);
  if (!keys.length) return new Map();
  const entries = await ContestEntry.find({ contest_id: { $in: keys } }).select('contest_id').lean();
  const counts = new Map();
  entries.forEach((entry) => {
    const key = String(entry.contest_id);
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return counts;
}

function countFor(contest, counts) {
  return keysOf(contest).reduce((sum, key) => sum + (counts.get(String(key)) || 0), 0);
}

const contestsBySession = async (req, res) => {
  try {
    const session = await findByPublicId(LeagueSession, req.params.sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    const plain = session.toObject();
    const contests = await Contest.find({
      league_session_id: { $in: keysOf(plain) },
      status: { $nin: ['cancelled'] },
    }).lean();
    contests.sort((a, b) => {
      if (!!b.is_pinned - !!a.is_pinned) return (!!b.is_pinned) - (!!a.is_pinned);
      if ((a.pin_order || 0) !== (b.pin_order || 0)) return (a.pin_order || 0) - (b.pin_order || 0);
      return num(b.prize_pool) - num(a.prize_pool);
    });
    const counts = await joinedCounts(contests);
    return res.json({
      contests: contests.map((contest) => contestPublic(contest, plain, countFor(contest, counts))),
      session: {
        id: publicId(plain),
        name: plain.name,
        start_time: sqlDate(plain.start_time),
        end_time: sqlDate(plain.end_time),
        status: plain.status,
      },
      redirect_to_home: ['live', 'completed'].includes(plain.status),
      unread_notifications: 0,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to fetch contests' });
  }
};

const myContestsBySession = async (req, res) => {
  try {
    const session = await findByPublicId(LeagueSession, req.params.sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    const plain = session.toObject();
    const contests = await Contest.find({ league_session_id: { $in: keysOf(plain) } }).lean();
    contests.sort((a, b) => num(b.prize_pool) - num(a.prize_pool));
    const counts = await joinedCounts(contests);
    return res.json({
      contests: contests.map((contest) => {
        const joined = countFor(contest, counts);
        // NEW IMPLEMENTATION — NODE.JS PROJECT (client feedback): prize_pool / first_prize come from the shared
        // card-prize calculation in contestPublic (same as the detail screen and the payout). The separate
        // override here showed upcoming contests a pool from the joins so far and used another first-prize rule.
        return contestPublic(contest, plain, joined);
      }),
      session: {
        id: publicId(plain),
        name: plain.name,
        start_time: sqlDate(plain.start_time),
        end_time: sqlDate(plain.end_time),
        status: plain.status,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to fetch contests' });
  }
};

const getContest = async (req, res) => {
  try {
    const contest = await findByPublicId(Contest, req.params.id);
    if (!contest) return res.status(404).json({ success: false, message: 'Contest not found' });
    const plain = contest.toObject();
    const session = await findByPublicId(LeagueSession, plain.league_session_id);
    const sessionPlain = session ? session.toObject() : null;
    const prices = priceMaps(sessionPlain);
    const entries = await ContestEntry.find({ contest_id: { $in: keysOf(plain) } }).lean();
    const userIds = [...new Set(entries.map((entry) => String(entry.user_id)))];
    const basketIds = [...new Set(entries.map((entry) => String(entry.basket_id)))];
    const [users, baskets] = await Promise.all([
      userIds.length ? User.find({ $or: [{ _id: { $in: userIds.filter((id) => id.length === 24) } }, { old_id: { $in: userIds.map(Number).filter((n) => !Number.isNaN(n)) } }] }).lean() : [],
      basketIds.length ? SavedBasket.find({ $or: [{ _id: { $in: basketIds.filter((id) => id.length === 24) } }, { old_id: { $in: basketIds.map(Number).filter((n) => !Number.isNaN(n)) } }] }).lean() : [],
    ]);
    const userMap = new Map();
    users.forEach((user) => { userMap.set(String(user._id), user); if (user.old_id != null) userMap.set(String(user.old_id), user); });
    const basketMap = new Map();
    baskets.forEach((basket) => { basketMap.set(String(basket._id), basket); if (basket.old_id != null) basketMap.set(String(basket.old_id), basket); });
    let participants = entries.map((entry) => {
      const basket = basketMap.get(String(entry.basket_id)) || {};
      const scored = scoreAssets(basket.assets || [], basket.multipliers || [], prices);
      const person = userMap.get(String(entry.user_id));
      return {
        user_id: person ? publicId(person) : entry.user_id,
        user_name: person ? person.name : 'Unknown User',
        profile_image: person ? absoluteUrl(person.profile_image) : null, // NEW IMPLEMENTATION — NODE.JS PROJECT: leaderboard photo
        basket_id: basket.old_id != null ? basket.old_id : entry.basket_id,
        serial_no: basket.serial_no || null,
        total_score: prices.started ? num(entry.total_score) : 0,
        total_points: round2(scored.total),
        assets: scored.rows,
        multipliers: basket.multipliers || [],
        category_summary: sessionAssets.basketCategorySummary(sessionPlain, basket.assets || []), // NEW IMPLEMENTATION — NODE.JS PROJECT
      };
    });
    if (prices.started) participants.sort((a, b) => b.total_score - a.total_score);
    const ranks = [];
    if (prices.started) {
      let current = 1;
      let previous = null;
      participants.forEach((participant, index) => {
        if (previous != null && participant.total_score === previous) ranks[index] = current;
        else {
          current = index + 1;
          ranks[index] = current;
        }
        previous = participant.total_score;
      });
    }
    const joinedUsersCount = entries.length;
    const maxParticipants = parseInt(plain.participants || 100, 10);
    const sessionStatus = sessionPlain ? sessionPlain.status : 'upcoming';
    const entryFee = num(plain.entry_fee);
    const platformFeePercent = num(plain.platform_fee);
    const isFixed = formats.isFixedPool(plain);
    // NEW IMPLEMENTATION — NODE.JS PROJECT: once the session has started, a flexible contest's pool and
    // prize structure follow the actual joins, using the same calculation the payout uses. Previously
    // live mega/equal contests kept showing the full-house prize rows saved at creation (and ₹0 prize amounts).
    const started = !!prices.started || ['live', 'completed'].includes(sessionStatus);
    let displayPrizePool = num(plain.prize_pool);
    let totalPool = num(plain.total_pool);
    let platformFeeAmount = num(plain.platform_fee_amount);
    let prizeDistribution = [];
    const stored = asPrizeArray(plain.prize_distribution);
    if (!isFixed && started) {
      const live = dynamicPrizeRows(plain, joinedUsersCount);
      totalPool = live.totalPool;
      displayPrizePool = live.prizePool;
      platformFeeAmount = live.totalPool - live.prizePool;
      prizeDistribution = live.rows;
    } else {
      prizeDistribution = stored.map((item) => {
        const winnersCount = parseInt(item.winners || item.winners_count || 1, 10);
        const rankStart = parseInt(item.rank_start || 1, 10);
        const rankEnd = parseInt(item.rank_end || rankStart, 10);
        const percent = num(item.percent ?? item.percentage ?? item.prize_percent);
        // NEW IMPLEMENTATION — NODE.JS PROJECT (client feedback): exactly the amount saved in admin
        const perWinner = advertisedPerWinner(item, displayPrizePool, isFixed);
        return {
          rank_label: item.label || item.rank_label || `Rank ${rankStart} to ${rankEnd}`,
          rank_start: rankStart,
          rank_end: rankEnd,
          winners_count: winnersCount,
          percentage: isFixed ? round2(percent) : Math.round(percent * 10000) / 10000, // e.g. 12.375, as in admin
          prize_amount: round2(perWinner * winnersCount),
          per_winner_amount: round2(perWinner),
        };
      });
    }
    participants = participants.map((participant, index) => {
      if (!prices.started) {
        return { ...participant, rank: 0, is_tied: false, tied_count: 0, prize_amount: 0 };
      }
      const rank = ranks[index];
      const tiedCount = ranks.filter((value) => value === rank).length;
      let prize = 0;
      if (tiedCount > 1) {
        let totalPrize = 0;
        for (let step = rank; step < rank + tiedCount; step += 1) {
          const match = prizeDistribution.find((row) => step >= row.rank_start && step <= row.rank_end);
          if (match) totalPrize += num(match.per_winner_amount);
        }
        prize = totalPrize > 0 ? round2(totalPrize / tiedCount) : 0;
      } else {
        const match = prizeDistribution.find((row) => rank >= row.rank_start && rank <= row.rank_end);
        prize = match ? num(match.per_winner_amount) : 0;
      }
      return { ...participant, rank, is_tied: tiedCount > 1, tied_count: tiedCount, prize_amount: round2(prize) };
    });
    const requestUser = req.query.user_id ? await findByPublicId(User, req.query.user_id) : null;
    const userEntryCount = requestUser
      ? entries.filter((entry) => keysOf(requestUser).map(String).includes(String(entry.user_id))).length
      : 0;
    return res.json({
      contest: {
        id: publicId(plain),
        category: plain.category,
        prize_pool: round2(displayPrizePool),
        is_flexible_prize: !isFixed && started,
        entry_fee: entryFee,
        platform_fee_percent: platformFeePercent,
        platform_fee_amount: round2(platformFeeAmount),
        total_pool: round2(totalPool),
        status: plain.status,
        session_name: sessionPlain ? sessionPlain.name : 'Unknown Session',
        session_status: sessionStatus,
        prize_distribution: prizeDistribution,
        max_entries_per_user: parseInt(plain.max_entries_per_user || 1, 10),
        max_participants: maxParticipants,
        joined_users: joinedUsersCount,
        spots_left: Math.max(0, maxParticipants - joinedUsersCount),
        winning_percentage: num(plain.winning_percentage),
        calculation_started: prices.started,
        // NEW IMPLEMENTATION — NODE.JS PROJECT: contest type fields + current number of winners
        ...formats.publicFields(plain),
        badge: formats.appBadge(plain),
        winners_now: formats.winnersFor(plain, joinedUsersCount),
      },
      participants,
      user_joined: userEntryCount > 0,
      user_entry_count: userEntryCount,
      remaining_entries: Math.max(0, parseInt(plain.max_entries_per_user || 1, 10) - userEntryCount),
      // NEW IMPLEMENTATION — NODE.JS PROJECT: cap for the basket selection when joining
      max_selectable: contestJoin.selectionLimit(plain, sessionPlain, joinedUsersCount, userEntryCount).max_selectable,
      unread_notifications: await unreadCount(requestUser),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const getUserContests = async (req, res) => {
  try {
    const user = await findByPublicId(User, req.query.user_id);
    if (!user) return res.status(400).json({ success: false, error: 'user_id is required' });
    const filter = { user_id: { $in: keysOf(user) } };
    if (req.query.session_id) {
      const session = await findByPublicId(LeagueSession, req.query.session_id);
      if (session) filter.session_id = { $in: keysOf(session.toObject()) };
    }
    const entries = await ContestEntry.find(filter).sort({ created_at: -1 }).lean();
    const contests = await Contest.find({ $or: [{ _id: { $in: entries.map((e) => e.contest_id).filter((id) => String(id).length === 24) } }, { old_id: { $in: entries.map((e) => Number(e.contest_id)).filter((n) => !Number.isNaN(n)) } }] }).lean();
    const sessions = await LeagueSession.find({ $or: [{ _id: { $in: contests.map((c) => c.league_session_id).filter((id) => String(id).length === 24) } }, { old_id: { $in: contests.map((c) => Number(c.league_session_id)).filter((n) => !Number.isNaN(n)) } }] }).lean();
    const contestMap = new Map();
    contests.forEach((contest) => { contestMap.set(String(contest._id), contest); if (contest.old_id != null) contestMap.set(String(contest.old_id), contest); });
    const sessionMap = new Map();
    sessions.forEach((session) => { sessionMap.set(String(session._id), session); if (session.old_id != null) sessionMap.set(String(session.old_id), session); });
    const baskets = await SavedBasket.find({ $or: [{ _id: { $in: entries.map((e) => e.basket_id).filter((id) => String(id).length === 24) } }, { old_id: { $in: entries.map((e) => Number(e.basket_id)).filter((n) => !Number.isNaN(n)) } }] }).lean();
    const basketMap = new Map();
    baskets.forEach((basket) => { basketMap.set(String(basket._id), basket); if (basket.old_id != null) basketMap.set(String(basket.old_id), basket); });
    const counts = await joinedCounts(contests);
    const sessionsOut = new Map();
    entries.forEach((entry) => {
      const contest = contestMap.get(String(entry.contest_id));
      if (!contest) return;
      const session = sessionMap.get(String(contest.league_session_id));
      if (!session) return;
      const sessionKey = String(publicId(session));
      if (!sessionsOut.has(sessionKey)) {
        sessionsOut.set(sessionKey, {
          session_id: publicId(session),
          session_name: session.name,
          session_status: session.status,
          contests: new Map(),
        });
      }
      const contestKey = String(publicId(contest));
      const group = sessionsOut.get(sessionKey);
      if (!group.contests.has(contestKey)) {
        const joinedUsers = countFor(contest, counts);
        const maxParticipants = parseInt(contest.participants || 0, 10);
        // NEW IMPLEMENTATION — NODE.JS PROJECT (client feedback): shared card-prize calculation. Before, only
        // mega/equal/flexible were recalculated once live, so a live winner-takes-all / h2h / multiplier card
        // kept the old full-house prize while the detail screen showed the real one.
        const prize = cardPrize(contest, session.status, joinedUsers);
        group.contests.set(contestKey, {
          contest_id: publicId(contest),
          category: contest.category,
          prize_pool: prize.prize_pool,
          first_prize: prize.first_prize,
          is_flexible_prize: prize.is_flexible_prize,
          is_live_prize: prize.is_live_prize,
          entry_fee: num(contest.entry_fee),
          status: contest.status,
          total_spots: maxParticipants,
          spots_joined: joinedUsers,
          spots_available: Math.max(0, maxParticipants - joinedUsers),
          baskets: [],
        });
      }
      const basket = basketMap.get(String(entry.basket_id)) || {};
      const scored = scoreAssets(basket.assets || [], basket.multipliers || [], priceMaps(session));
      group.contests.get(contestKey).baskets.push({
        entry_id: publicId(entry),
        basket_id: basket.old_id != null ? basket.old_id : entry.basket_id,
        serial_no: basket.serial_no || null,
        assets: scored.rows,
        multipliers: basket.multipliers || [],
        category_summary: sessionAssets.basketCategorySummary(session, basket.assets || []), // NEW IMPLEMENTATION — NODE.JS PROJECT
        starting_prices: entry.starting_prices || [],
        total_score: num(entry.total_score),
        total_points: round2(scored.total),
        rank: entry.rank,
        entry_created_at: sqlDate(entry.created_at),
      });
    });
    const result = [...sessionsOut.values()].map((session) => ({ ...session, contests: [...session.contests.values()] }));
    return res.json({
      success: true,
      sessions: result,
      total: result.length,
      unread_notifications: await unreadCount(user),
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

// NEW IMPLEMENTATION — NODE.JS PROJECT: Fantasy contest formats — safe joining (services/contest-join.service.js):
// server-side entry fee, joining closes at session start, no overbooking, atomic wallet debit.
const bulkJoinContest = async (req, res) => {
  try {
    const result = await contestJoin.joinContest({
      userRef: req.body.user_id,
      contestRef: req.body.contest_id,
      basketIds: req.body.basket_ids,
      clientEntryFee: req.body.entry_fee,
    });
    return res.status(result.status).json(result.body);
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

function basketAssets(assets) {
  return (Array.isArray(assets) ? assets : []).map((asset) => {
    const symbol = asset.symbol || asset.name || '';
    const name = asset.name || asset.symbol || '';
    return {
      ...asset,
      symbol,
      name,
      prediction: asset.prediction || 'UP',
    };
  });
}

async function nextSerial(user, session) {
  const baskets = await SavedBasket.find({
    user_id: { $in: keysOf(user) },
    session_id: { $in: keysOf(session) },
    serial_no: { $ne: null },
  }).select('serial_no').lean();
  const max = baskets.reduce((highest, basket) => {
    const value = parseInt(String(basket.serial_no || '').replace(/\D/g, ''), 10);
    return Number.isNaN(value) ? highest : Math.max(highest, value);
  }, 0);
  return `B${max + 1}`;
}

const saveBasket = async (req, res) => {
  try {
    const user = await findByPublicId(User, req.body.user_id);
    const session = await findByPublicId(LeagueSession, req.body.session_id);
    if (!user || !session) return res.status(400).json({ success: false, message: 'User ID and Session ID required' });
    const multipliers = selectedMultipliers(req.body.multipliers || []);
    const assets = basketAssets(req.body.assets);
    // NEW IMPLEMENTATION — NODE.JS PROJECT: per-category pick limits (client feedback)
    if (basketLimitError(res, session, assets)) return undefined;
    if (req.body.basket_id) {
      const basket = await findByPublicId(SavedBasket, req.body.basket_id);
      if (!basket || !keysOf(user).map(String).includes(String(basket.user_id))) {
        return res.status(404).json({ success: false, message: 'Basket not found or unauthorized' });
      }
      basket.assets = assets;
      basket.multipliers = multipliers;
      await basket.save();
      return res.json({ success: true, message: 'Basket updated successfully', basket_id: publicId(basket) });
    }
    const standalone = req.body.is_standalone === true || req.body.is_standalone === 1 || req.body.is_standalone === '1';
    if (!standalone) return res.status(400).json({ success: false, message: 'Invalid request: Use is_standalone=1 for new baskets' });
    const serial = await nextSerial(user, session);
    const basket = await SavedBasket.create({
      user_id: user._id,
      contest_id: null,
      session_id: session.old_id != null ? session.old_id : session._id,
      serial_no: serial,
      assets,
      multipliers,
      total_score: 0,
      is_standalone: true,
    });
    await ensureOldId(SavedBasket, basket);
    return res.json({ success: true, message: 'Standalone basket saved', basket_id: publicId(basket), serial_no: serial });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to save basket: ' + err.message });
  }
};

const storeStandalone = async (req, res) => {
  try {
    const user = await findByPublicId(User, req.body.user_id);
    const session = await findByPublicId(LeagueSession, req.body.session_id);
    if (!user || !Array.isArray(req.body.assets) || !req.body.assets.length) {
      return res.status(500).json({ success: false, error: 'Failed to save standalone basket' });
    }
    // NEW IMPLEMENTATION — NODE.JS PROJECT: per-category pick limits (client feedback)
    if (basketLimitError(res, session, basketAssets(req.body.assets))) return undefined;
    const serial = session ? await nextSerial(user, session) : 'B1';
    const basket = await SavedBasket.create({
      user_id: user._id,
      contest_id: null,
      session_id: session ? (session.old_id != null ? session.old_id : session._id) : req.body.session_id,
      serial_no: serial,
      assets: basketAssets(req.body.assets),
      multipliers: selectedMultipliers(req.body.multipliers || []),
      total_score: 0,
      is_standalone: true,
    });
    await ensureOldId(SavedBasket, basket);
    return res.json({
      success: true,
      message: 'Standalone basket saved successfully',
      data: { ...basket.toObject(), id: publicId(basket), user_id: publicId(user) },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to save standalone basket' });
  }
};

const savedBaskets = async (req, res) => {
  try {
    const user = await findByPublicId(User, req.query.user_id);
    if (!user) return res.status(400).json({ success: false, error: 'user_id is required' });
    const filter = { user_id: { $in: keysOf(user) }, is_standalone: true };
    if (req.query.session_id) {
      const session = await findByPublicId(LeagueSession, req.query.session_id);
      if (session) filter.session_id = { $in: keysOf(session.toObject()) };
    }
    let baskets = await SavedBasket.find(filter).sort({ created_at: -1 }).lean();
    // NEW IMPLEMENTATION — NODE.JS PROJECT: with contest_id, also tell the app how many baskets it may select
    let limit = null;
    if (req.query.contest_id) {
      const contestDoc = await findByPublicId(Contest, req.query.contest_id);
      if (contestDoc) {
        const contest = contestDoc.toObject();
        const [all, joined, contestSession] = await Promise.all([
          ContestEntry.countDocuments({ contest_id: { $in: keysOf(contest) } }),
          ContestEntry.find({ user_id: { $in: keysOf(user) }, contest_id: { $in: keysOf(contest) } }).select('basket_id').lean(),
          findByPublicId(LeagueSession, contest.league_session_id),
        ]);
        limit = {
          max_entries_per_user: parseInt(contest.max_entries_per_user || 1, 10),
          user_entry_count: joined.length,
          ...contestJoin.selectionLimit(contest, contestSession, all, joined.length),
        };
        if (req.query.exclude_joined) {
          const used = new Set(joined.map((entry) => String(entry.basket_id)));
          baskets = baskets.filter((basket) => !used.has(String(basket._id)) && !used.has(String(basket.old_id)));
        }
      }
    }
    const data = [];
    for (const basket of baskets) {
      const session = await findByPublicId(LeagueSession, basket.session_id);
      const scored = scoreAssets(basket.assets || [], basket.multipliers || [], priceMaps(session && session.toObject()));
      const grouped = { lc: [], mc: [], sc: [] };
      // NEW IMPLEMENTATION — NODE.JS PROJECT: category names are admin-defined now, so baskets are
      // also grouped by their actual category name (lc/mc/sc kept for older app builds).
      const byCategory = new Map();
      scored.rows.forEach((asset) => {
        const sector = String(asset.sector || '').toLowerCase();
        if (sector.includes('large cap')) grouped.lc.push(asset);
        else if (sector.includes('mid cap')) grouped.mc.push(asset);
        else if (sector.includes('small cap')) grouped.sc.push(asset);
        const name = asset.sector || 'Other';
        if (!byCategory.has(name)) byCategory.set(name, { name, category_id: asset.category_id ?? null, assets: [] });
        byCategory.get(name).assets.push(asset);
      });
      data.push({
        id: publicId(basket),
        basket_id: publicId(basket),
        user_id: publicId(user),
        session_id: session ? publicId(session) : basket.session_id,
        league_session_id: session ? publicId(session) : basket.session_id,
        contest_id: basket.contest_id,
        serial_no: basket.serial_no || null,
        multipliers: basket.multipliers || [],
        starting_prices: basket.starting_prices || [],
        total_points: round2(scored.total),
        total_score: num(basket.total_score),
        entry_fee: 0,
        prize_pool: 0,
        is_standalone: !!basket.is_standalone,
        assets_by_category: grouped,
        categories: [...byCategory.values()].map((c) => ({ ...c, count: c.assets.length })),
        lc_count: grouped.lc.length,
        mc_count: grouped.mc.length,
        sc_count: grouped.sc.length,
        // NEW IMPLEMENTATION — NODE.JS PROJECT: stocks per market category of the session, with limits
        category_summary: sessionAssets.basketCategorySummary(session, basket.assets || []),
        created_at: sqlDate(basket.created_at),
        updated_at: sqlDate(basket.updated_at),
      });
    }
    return res.json({ success: true, data, ...(limit || {}) });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to fetch baskets' });
  }
};

const deleteBasket = async (req, res) => {
  try {
    const user = await findByPublicId(User, req.body.user_id);
    const basket = await findByPublicId(SavedBasket, req.body.basket_id);
    if (!req.body.basket_id || !req.body.user_id) return res.status(400).json({ success: false, message: 'basket_id and user_id are required' });
    if (!user || !basket || !keysOf(user).map(String).includes(String(basket.user_id))) {
      return res.status(404).json({ success: false, message: 'Basket not found or unauthorized' });
    }
    await SavedBasket.deleteOne({ _id: basket._id });
    return res.json({ success: true, message: 'Basket deleted successfully' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to delete basket: ' + err.message });
  }
};

const editBasket = async (req, res) => {
  try {
    if (!req.body.basket_id || !req.body.user_id) return res.status(400).json({ success: false, message: 'basket_id and user_id are required' });
    const user = await findByPublicId(User, req.body.user_id);
    const basket = await findByPublicId(SavedBasket, req.body.basket_id);
    if (!user || !basket || !keysOf(user).map(String).includes(String(basket.user_id))) {
      return res.status(404).json({ success: false, message: 'Basket not found or unauthorized' });
    }
    const assets = basketAssets(req.body.assets);
    // NEW IMPLEMENTATION — NODE.JS PROJECT: per-category pick limits of the basket's session (client feedback)
    if (basketLimitError(res, await findByPublicId(LeagueSession, basket.session_id), assets)) return undefined;
    basket.assets = assets;
    basket.multipliers = selectedMultipliers(req.body.multipliers || []);
    await basket.save();
    return res.json({ success: true, message: 'Basket updated successfully' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to update basket: ' + err.message });
  }
};

const destroyBasket = async (req, res) => {
  const basket = await findByPublicId(SavedBasket, req.params.id);
  if (!basket) return res.status(404).json({ success: false, message: 'Basket not found or unauthorized' });
  await SavedBasket.deleteOne({ _id: basket._id });
  return res.json({ success: true, message: 'Basket deleted successfully' });
};

const cleanupEmptyBaskets = async (req, res) => {
  const result = await SavedBasket.deleteMany({ $or: [{ assets: { $size: 0 } }, { assets: null }] });
  return res.json({ success: true, message: 'Empty baskets cleaned up', deleted: result.deletedCount || 0 });
};

const getUserContestBaskets = async (req, res) => {
  try {
    const user = await findByPublicId(User, req.query.user_id);
    if (!user) return res.status(400).json({ success: false, error: 'user_id is required' });

    const entryFilter = { user_id: { $in: keysOf(user) } };
    if (req.query.contest_id) {
      const contest = await findByPublicId(Contest, req.query.contest_id);
      if (contest) entryFilter.contest_id = { $in: keysOf(contest.toObject()) };
    }
    if (req.query.session_id) {
      const session = await findByPublicId(LeagueSession, req.query.session_id);
      if (session) entryFilter.session_id = { $in: keysOf(session.toObject()) };
    }
    const entries = await ContestEntry.find(entryFilter).lean();
    const basketKeys = [];
    entries.forEach((entry) => {
      if (entry.basket_id != null) basketKeys.push(entry.basket_id);
    });
    const objectIds = basketKeys.filter((id) => /^[a-f0-9]{24}$/i.test(String(id)));
    const oldIds = basketKeys.map((id) => Number(id)).filter((id) => Number.isInteger(id));
    const baskets = await SavedBasket.find({
      $or: [
        { _id: { $in: objectIds } },
        { old_id: { $in: oldIds } },
        { user_id: { $in: keysOf(user) }, contest_id: { $ne: null }, is_standalone: { $ne: true } },
      ],
    }).sort({ created_at: -1 }).lean();

    const entryByBasket = new Map();
    entries.forEach((entry) => entryByBasket.set(String(entry.basket_id), entry));

    const data = [];
    for (const basket of baskets) {
      const entry = entryByBasket.get(String(basket._id)) || entryByBasket.get(String(basket.old_id));
      const contest = await findByPublicId(Contest, (entry && entry.contest_id) || basket.contest_id);
      const session = await findByPublicId(LeagueSession, (entry && entry.session_id) || basket.session_id || (contest && contest.league_session_id));
      const scored = scoreAssets(basket.assets || [], basket.multipliers || [], priceMaps(session && session.toObject()));
      const grouped = { lc: [], mc: [], sc: [] };
      // NEW IMPLEMENTATION — NODE.JS PROJECT: category names are admin-defined now, so baskets are
      // also grouped by their actual category name (lc/mc/sc kept for older app builds).
      const byCategory = new Map();
      scored.rows.forEach((asset) => {
        const sector = String(asset.sector || '').toLowerCase();
        if (sector.includes('large cap')) grouped.lc.push(asset);
        else if (sector.includes('mid cap')) grouped.mc.push(asset);
        else if (sector.includes('small cap')) grouped.sc.push(asset);
        const name = asset.sector || 'Other';
        if (!byCategory.has(name)) byCategory.set(name, { name, category_id: asset.category_id ?? null, assets: [] });
        byCategory.get(name).assets.push(asset);
      });
      data.push({
        id: publicId(basket),
        basket_id: publicId(basket),
        user_id: publicId(user),
        session_id: session ? publicId(session) : basket.session_id,
        league_session_id: session ? publicId(session) : basket.session_id,
        contest_id: contest ? publicId(contest) : (basket.contest_id || null),
        serial_no: basket.serial_no || null,
        multipliers: basket.multipliers || [],
        starting_prices: basket.starting_prices || [],
        total_points: round2(scored.total),
        total_score: entry ? num(entry.total_score) : num(basket.total_score),
        rank: entry ? entry.rank : basket.rank,
        entry_fee: contest ? num(contest.entry_fee) : 0,
        prize_pool: contest ? num(contest.prize_pool) : 0,
        category: contest ? contest.category : null,
        is_standalone: !!basket.is_standalone,
        assets_by_category: grouped,
        categories: [...byCategory.values()].map((c) => ({ ...c, count: c.assets.length })),
        lc_count: grouped.lc.length,
        mc_count: grouped.mc.length,
        sc_count: grouped.sc.length,
        // NEW IMPLEMENTATION — NODE.JS PROJECT: stocks per market category of the session, with limits
        category_summary: sessionAssets.basketCategorySummary(session, basket.assets || []),
        created_at: sqlDate(basket.created_at),
        updated_at: sqlDate(basket.updated_at),
      });
    }
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to fetch baskets' });
  }
};

const getContestBaskets = async (req, res) => {
  const contest = await findByPublicId(Contest, req.query.contest_id);
  const user = await findByPublicId(User, req.query.user_id);
  if (!contest || !user) return res.status(400).json({ success: false, error: 'contest_id and user_id required' });
  const entries = await ContestEntry.find({ contest_id: { $in: keysOf(contest.toObject()) }, user_id: { $in: keysOf(user) } }).lean();
  const baskets = await SavedBasket.find({ _id: { $in: entries.map((entry) => entry.basket_id).filter(Boolean) } }).lean();
  return res.json({
    success: true,
    data: baskets.map((basket) => ({
      ...basket,
      id: publicId(basket),
      user_id: publicId(user),
      assets: basket.assets,
      multipliers: basket.multipliers,
    })),
  });
};

const getWalletAmount = async (req, res) => {
  try {
    if (!req.query.user_id) return res.status(401).json({ error: 'Unauthorized or user_id not provided' });
    const user = await findByPublicId(User, req.query.user_id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.json({
      wallet_balance: walletOf(user),
      deposit_balance: num(user.deposit_balance),
      winnings_balance: num(user.winnings_balance),
      unread_notifications: await unreadCount(user),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to fetch wallet amount' });
  }
};

const getUserTransactions = async (req, res) => {
  try {
    const user = await findByPublicId(User, req.body.user_id || req.query.user_id);
    if (!user) return res.status(500).json({ success: false, message: 'Failed to fetch transactions' });
    const rows = await Transaction.find({ user_id: { $in: keysOf(user) } }).sort({ created_at: -1 }).lean();
    const transactions = [];
    for (const row of rows) {
      let contest = null;
      let contestId = row.contest_id;
      let entryId = null;
      if (!contestId && row.transaction_id) {
        const match = String(row.transaction_id).match(/CONTEST_(\d+)_ENTRY_(\d+)/);
        if (match) {
          contestId = Number(match[1]);
          entryId = Number(match[2]);
        }
      }
      let contestName = null;
      let basketSerial = null;
      if (contestId) {
        contest = await findByPublicId(Contest, contestId);
        if (!contest && contestId && String(contestId).length === 24) contest = await Contest.findById(contestId);
        if (contest) {
          const session = await findByPublicId(LeagueSession, contest.league_session_id);
          contestName = session ? session.name : null;
        }
        const entry = entryId
          ? await findByPublicId(ContestEntry, entryId)
          : await ContestEntry.findOne({ contest_id: contest ? contest._id : contestId, user_id: { $in: keysOf(user) } });
        if (entry) {
          const basket = await findByPublicId(SavedBasket, entry.basket_id);
          basketSerial = basket ? basket.serial_no : null;
        }
      }
      transactions.push({
        id: publicId(row),
        user_id: publicId(user),
        contest_id: contest ? publicId(contest) : contestId,
        type: row.type,
        amount: num(row.amount),
        status: row.status,
        description: row.description,
        transaction_id: row.transaction_id,
        created_at: sqlDate(row.created_at),
        updated_at: sqlDate(row.updated_at),
        contest_name: contestName,
        basket_serial_no: basketSerial,
        // NEW IMPLEMENTATION — NODE.JS PROJECT: amounts are ProbCoins — unit, "50 ProbCoins" label and,
        // for INR/USDT purchases and withdrawals, the real-money side ("₹500" / "5 USDT")
        ...transactionLabels(row),
      });
    }
    return res.json({ transactions });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to fetch transactions' });
  }
};

const userTransactionsEmpty = (req, res) => res.json({ transactions: [] });

const clearUserTransactions = async (req, res) => {
  if (!req.query.user_id) return res.status(400).json({ success: false, error: 'user_id is required' });
  const user = await findByPublicId(User, req.query.user_id);
  if (!user) return res.json({ success: true, message: `Deleted 0 transactions for user ${req.query.user_id}`, deleted_count: 0 });
  const result = await Transaction.deleteMany({ user_id: { $in: keysOf(user) } });
  return res.json({
    success: true,
    message: `Deleted ${result.deletedCount || 0} transactions for user ${req.query.user_id}`,
    deleted_count: result.deletedCount || 0,
  });
};

const depositAmount = async (req, res) => {
  try {
    // NEW IMPLEMENTATION — NODE.JS PROJECT: enforce deposit limits before any write.
    const check = await checkTransactionAmount('deposit', req.body.wallet_balance);
    if (!check.ok) return res.status(check.status).json({ ...limitErrorBody(check), errors: null });
    const user = await findByPublicId(User, req.body.user_id);
    const amount = check.amount;
    if (!user) return res.status(500).json({ success: false, error: 'Server error: The given data was invalid.', errors: null });
    user.deposit_balance = num(user.deposit_balance) + amount;
    await user.save();
    const depositTxn = await Transaction.create({
      user_id: user._id,
      type: 'deposit',
      amount,
      status: 'success',
      description: 'Manual deposit',
    });
    // NEW IMPLEMENTATION — NODE.JS PROJECT: Automated Notifications
    notify('deposit_success', { user, dedupeKey: `deposit_success:txn:${depositTxn._id}`, params: { amount }, data: { transaction_id: String(depositTxn._id) } });
    return res.json({
      success: true,
      wallet_balance: walletOf(user),
      deposit_balance: num(user.deposit_balance),
      winnings_balance: num(user.winnings_balance),
      unread_notifications: await unreadCount(user),
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Server error: ' + err.message, errors: null });
  }
};

const withdrawAmount = async (req, res) => {
  try {
    // NEW IMPLEMENTATION — NODE.JS PROJECT: same request as POST /withdraw/request (currency USDT): the
    // ProbCoins are converted at the admin rate and checked against the USDT withdrawal limits (before,
    // the ProbCoins were compared with the ₹ limits), and the payout is recorded for the admin.
    const user = await findByPublicId(User, req.body.user_id);
    const out = await withdrawals.legacyUsdtWithdrawal({ user, amount: req.body.amount, message: req.body.message || null });
    if (!out.result) return res.status(out.status).json(out.body);
    const { withdrawal, quote, user: fresh } = out.result;
    return res.json({
      success: true,
      withdrawal_id: publicId(withdrawal),
      message: 'Withdrawal request submitted. Admin will process it shortly.',
      wallet_balance: walletOf(fresh),
      deposit_balance: num(fresh.deposit_balance),
      winnings_balance: num(fresh.winnings_balance),
      usdt_address: withdrawal.usdt_wallet_address,
      usdt_network: withdrawal.usdt_network || quote.network,
      payout_amount: quote.payout_amount, // NEW IMPLEMENTATION — NODE.JS PROJECT: USDT to be paid
      unread_notifications: await unreadCount(fresh),
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to create withdrawal request: ' + err.message });
  }
};

const getUserNotifications = async (req, res) => {
  const userId = req.body.user_id || req.query.user_id;
  if (!userId) return res.json({ success: true, notifications: [] });
  const user = await findByPublicId(User, userId);
  if (!user) return res.json({ success: true, notifications: [] });
  const rows = await Notification.find({ user_id: { $in: keysOf(user) } }).sort({ created_at: -1 }).lean();
  return res.json({
    success: true,
    notifications: rows.map((row) => ({
      id: publicId(row),
      title: row.title,
      description: row.description,
      type: row.type,
      created_at: sqlDate(row.created_at),
      is_read: !!row.is_read,
      // NEW IMPLEMENTATION — NODE.JS PROJECT: Automated Notifications — event + navigation payload (null for older rows)
      event: row.event || null,
      data: row.data || null,
    })),
  });
};

const markAsRead = async (req, res) => {
  if (!req.body.notification_id) return res.status(400).json({ success: false, message: 'Notification ID is required' });
  const note = await findByPublicId(Notification, req.body.notification_id);
  if (!note) return res.status(404).json({ success: false, message: 'Notification not found' });
  note.is_read = true;
  await note.save();
  return res.json({ success: true, message: 'Notification marked as read' });
};

const markAllAsRead = async (req, res) => {
  if (!req.body.user_id) return res.status(400).json({ success: false, message: 'User ID is required' });
  const user = await findByPublicId(User, req.body.user_id);
  if (user) await Notification.updateMany({ user_id: { $in: keysOf(user) }, is_read: false }, { $set: { is_read: true } });
  return res.json({ success: true, message: 'All notifications marked as read' });
};

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: Automated Notifications and Notification Management
 * GET/POST /api/v1/notification-preferences — per-user opt-outs. Follows the same
 * user_id convention as the other mobile notification endpoints.
 * Turning a category off stops its push notifications; session reminders are not
 * created at all, while transaction/account notifications stay in in-app history.
 */
const NOTIFICATION_PREFERENCE_KEYS = ['session_reminders', 'winnings', 'transactions', 'account'];
const preferencesOf = (user) => Object.fromEntries(NOTIFICATION_PREFERENCE_KEYS.map((key) => [
  key, !(user.notification_preferences && user.notification_preferences[key] === false),
]));

const getNotificationPreferences = async (req, res) => {
  const user = await findByPublicId(User, req.query.user_id || req.body.user_id);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  return res.json({ success: true, preferences: preferencesOf(user) });
};

const updateNotificationPreferences = async (req, res) => {
  const user = await findByPublicId(User, req.body.user_id);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  const set = {};
  for (const key of NOTIFICATION_PREFERENCE_KEYS) {
    const value = req.body[key];
    if (value === undefined) continue;
    if (![true, false, 'true', 'false', 1, 0, '1', '0'].includes(value)) {
      return res.status(422).json({ success: false, message: `${key} must be true or false` });
    }
    set[`notification_preferences.${key}`] = value === true || value === 'true' || value === 1 || value === '1';
  }
  if (!Object.keys(set).length) return res.status(422).json({ success: false, message: 'No preferences provided' });
  await User.updateOne({ _id: user._id }, { $set: set });
  const fresh = await User.findById(user._id).select('notification_preferences').lean();
  return res.json({ success: true, message: 'Notification preferences updated', preferences: preferencesOf(fresh) });
};

const getAnnouncements = async (req, res) => {
  const rows = await Announcement.find({}).sort({ created_at: -1 }).lean();
  return res.json({
    success: true,
    announcements: rows.map((row) => ({
      id: publicId(row),
      title: row.title,
      description: row.description,
      type: row.type,
      end_date: sqlDate(row.end_date),
      created_at: sqlDate(row.created_at),
    })),
  });
};

// NEW IMPLEMENTATION — NODE.JS PROJECT (client feedback): session stock list with live prices and history
const { sessionStats, stockHistory } = require('./session-stats.controller');

const { getLivePrices, getStockLivePrice, getCryptoLivePrice } = require('./liveprice.controller');
const { lgpayCallback } = require('./payment.controller');

module.exports = {
  login, register, passwordLogin, setPassword, checkUser, getSettings, getUserProfile, updateProfile, changeEmail, changeMobile,
  getPaymentDetails, updatePaymentDetails, banners, upcomingSessions, getSession,
  getUserSessions, getActiveSession, getSessionAssets, getSessionAssetsGrouped, getUserJoinedSessions,
  contestsBySession, myContestsBySession, getContest, getUserContests, bulkJoinContest,
  saveBasket, storeStandalone, savedBaskets, deleteBasket, editBasket, destroyBasket, cleanupEmptyBaskets, getContestBaskets, getUserContestBaskets,
  getWalletAmount, getUserTransactions, userTransactionsEmpty, clearUserTransactions, depositAmount, withdrawAmount,
  getUserNotifications, markAsRead, markAllAsRead, getAnnouncements, sessionStats, stockHistory,
  getLivePrices, getStockLivePrice, getCryptoLivePrice, lgpayCallback,
  getNotificationPreferences, updateNotificationPreferences, // NEW IMPLEMENTATION — NODE.JS PROJECT
};
