'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/user.model');
const Notification = require('../models/notification.model');
const Setting = require('../models/setting.model');
const config = require('../config/env');
const logger = require('../config/logger');

// ─── Helper ───────────────────────────────────────────────────────────────
function generateToken(userId) {
  return jwt.sign({ id: userId }, config.JWT_SECRET, { expiresIn: config.JWT_EXPIRES_IN });
}

async function getUnreadCount(userId) {
  if (!userId) return 0;
  return Notification.countDocuments({ user_id: userId, is_read: false });
}

function buildUserResponse(user, token = null) {
  const obj = {
    id: user._id,
    name: user.name || 'User',
    email: user.email || '',
    mobile: user.mobile || '',
    profile_image: user.profile_image || null,
    wallet_balance: parseFloat(((user.deposit_balance || 0) + (user.winnings_balance || 0)).toFixed(2)),
    deposit_balance: parseFloat((user.deposit_balance || 0).toFixed(2)),
    winnings_balance: parseFloat((user.winnings_balance || 0).toFixed(2)),
    kyc_status: user.kyc_status,
    age: user.age,
    gender: user.gender,
    is_test_user: user.is_test_user,
    fcm_token: user.fcm_token,
  };
  if (token) obj.token = token;
  return obj;
}

// ─── Controllers ──────────────────────────────────────────────────────────

/**
 * POST /api/v1/auth/login
 * Mobile-based login (OTP-flow variant – no OTP check, just mobile lookup).
 */
const login = async (req, res) => {
  try {
    const { mobile, fcm_token } = req.body;
    if (!mobile || mobile.trim().length < 10) {
      return res.status(400).json({ success: false, message: 'Valid mobile number required' });
    }

    const user = await User.findOne({ mobile: mobile.trim() });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found. Please register first.' });
    }

    if (fcm_token) {
      user.fcm_token = fcm_token;
      await user.save();
    }

    const token = generateToken(user._id);
    const unread = await getUnreadCount(user._id);

    return res.json({
      success: true,
      message: 'Login successful',
      user: buildUserResponse(user, token),
      unread_notifications: unread,
    });
  } catch (err) {
    logger.error('Login error:', err.message);
    res.status(500).json({ success: false, message: 'Login failed' });
  }
};

/**
 * POST /api/v1/auth/login/password
 * Login with mobile + password.
 */
const passwordLogin = async (req, res) => {
  try {
    const { mobile, password, fcm_token } = req.body;
    if (!mobile || !password) {
      return res.status(400).json({ success: false, message: 'Mobile and password are required' });
    }

    const user = await User.findOne({ mobile: mobile.trim() });
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid mobile number or password' });
    }

    const isMatch = user.password ? await bcrypt.compare(password, user.password) : false;
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid mobile number or password' });
    }

    if (fcm_token) {
      user.fcm_token = fcm_token;
      await user.save();
    }

    const token = generateToken(user._id);
    const unread = await getUnreadCount(user._id);

    return res.json({
      success: true,
      message: 'Login successful',
      user: buildUserResponse(user, token),
      unread_notifications: unread,
    });
  } catch (err) {
    logger.error('Password login error:', err.message);
    res.status(500).json({ success: false, message: 'Login failed' });
  }
};

/**
 * POST /api/v1/auth/register
 */
const register = async (req, res) => {
  try {
    const { mobile, name, email, password } = req.body;

    if (!mobile || mobile.trim().length < 10) {
      return res.status(400).json({ success: false, message: 'Valid mobile number required (min 10 digits)' });
    }
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Name is required' });
    }

    const existing = await User.findOne({ $or: [{ mobile: mobile.trim() }, ...(email ? [{ email: email.toLowerCase().trim() }] : [])] });
    if (existing) {
      if (existing.mobile === mobile.trim()) {
        return res.status(409).json({ success: false, message: 'User with this mobile number already exists.' });
      }
      return res.status(409).json({ success: false, message: 'Email already in use.' });
    }

    const hashedPassword = password ? await bcrypt.hash(password, 10) : null;

    const user = await User.create({
      name: name.trim(),
      email: email ? email.toLowerCase().trim() : undefined,
      mobile: mobile.trim(),
      password: hashedPassword,
      deposit_balance: 0,
      winnings_balance: 0,
    });

    const token = generateToken(user._id);
    const unread = await getUnreadCount(user._id);

    return res.status(201).json({
      success: true,
      message: 'Registration successful',
      user: buildUserResponse(user, token),
      unread_notifications: unread,
    });
  } catch (err) {
    logger.error('Register error:', err.message);
    if (err.code === 11000) {
      const field = Object.keys(err.keyValue || {})[0] || 'field';
      return res.status(409).json({ success: false, message: `${field} already in use` });
    }
    res.status(500).json({ success: false, message: 'Registration failed: ' + err.message });
  }
};

/**
 * GET /api/v1/auth/check-user?mobile=
 */
const checkUser = async (req, res) => {
  try {
    const { mobile } = req.query;
    if (!mobile) {
      return res.status(400).json({ success: false, message: 'Mobile is required' });
    }

    // Strip non-digits and take last 10
    const digits = mobile.replace(/\D/g, '');
    const last10 = digits.slice(-10);

    // Find by mobile ending in last 10 digits
    const users = await User.find({}).select('mobile name email _id');
    const user = users.find((u) => {
      const m = (u.mobile || '').replace(/\D/g, '');
      return m.slice(-10) === last10;
    });

    if (user) {
      return res.json({
        exists: true,
        message: 'User found. Please verify OTP.',
        user: { id: user._id, name: user.name, email: user.email, mobile: user.mobile },
      });
    }

    return res.status(404).json({ exists: false, message: 'User not found. Please register first.' });
  } catch (err) {
    logger.error('Check user error:', err.message);
    res.status(500).json({ success: false, message: 'Something went wrong' });
  }
};

/**
 * GET /api/v1/auth/settings
 */
const getSettings = async (req, res) => {
  try {
    const settingsDocs = await Setting.find({});
    const settings = {};
    settingsDocs.forEach((s) => { settings[s.key] = s.value; });
    return res.json({ settings });
  } catch (err) {
    logger.error('getSettings error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch settings' });
  }
};

/**
 * GET /api/v1/auth/profile?user_id=
 */
const getUserProfile = async (req, res) => {
  try {
    const userId = req.query.user_id || req.userId;
    if (!userId) return res.status(400).json({ success: false, message: 'User ID is required' });

    const user = await User.findById(userId).select('-password');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const unread = await getUnreadCount(user._id);
    const baseUrl = `${req.protocol}://${req.get('host')}`;

    return res.json({
      success: true,
      user: {
        ...buildUserResponse(user),
        profile_image: user.profile_image ? `${baseUrl}/${user.profile_image}` : null,
      },
      unread_notifications: unread,
    });
  } catch (err) {
    logger.error('getUserProfile error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch user profile' });
  }
};

/**
 * POST /api/v1/auth/profile/update
 */
const updateProfile = async (req, res) => {
  try {
    const userId = req.body.user_id || req.userId;
    if (!userId) return res.status(400).json({ success: false, message: 'User ID required' });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const { name, email, mobile, password, age, gender } = req.body;

    if (name) user.name = name.trim();
    if (email) {
      const emailExists = await User.findOne({ email: email.toLowerCase(), _id: { $ne: user._id } });
      if (emailExists) return res.status(409).json({ success: false, message: 'Email already in use' });
      user.email = email.toLowerCase().trim();
    }
    if (mobile) {
      const mobileExists = await User.findOne({ mobile: mobile.trim(), _id: { $ne: user._id } });
      if (mobileExists) return res.status(409).json({ success: false, message: 'Mobile already in use' });
      user.mobile = mobile.trim();
    }
    if (password && password.length >= 6) {
      user.password = await bcrypt.hash(password, 10);
    }
    if (age !== undefined) user.age = parseInt(age);
    if (gender !== undefined) user.gender = gender;

    // Handle file upload
    if (req.file) {
      user.profile_image = 'uploads/profiles/' + req.file.filename;
    }

    await user.save();

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    return res.json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        ...buildUserResponse(user),
        profile_image: user.profile_image ? `${baseUrl}/${user.profile_image}` : null,
      },
    });
  } catch (err) {
    logger.error('updateProfile error:', err.message);
    res.status(500).json({ success: false, message: 'Profile update failed: ' + err.message });
  }
};

/**
 * GET /api/v1/auth/payment-details?user_id=
 */
const getPaymentDetails = async (req, res) => {
  try {
    const userId = req.query.user_id || req.userId;
    if (!userId) return res.status(400).json({ status: 'error', message: 'User ID required' });

    const user = await User.findById(userId).select('payment_details');
    if (!user) return res.status(404).json({ status: 'error', message: 'User not found' });

    const pd = user.payment_details || {};
    return res.json({
      status: 'success',
      data: {
        usdt_wallet_address: pd.usdt_wallet_address || '',
        usdt_network: 'BEP20',
        upi_id: pd.upi_id || null,
        account_holder_name: pd.account_holder_name || null,
        account_number: pd.account_number || null,
        bank_name: pd.bank_name || null,
        ifsc_code: pd.ifsc_code || null,
      },
    });
  } catch (err) {
    logger.error('getPaymentDetails error:', err.message);
    res.status(500).json({ status: 'error', message: 'Failed to fetch payment details' });
  }
};

/**
 * POST /api/v1/auth/payment-details/update
 */
const updatePaymentDetails = async (req, res) => {
  try {
    const userId = req.body.user_id || req.userId;
    if (!userId) return res.status(400).json({ status: 'error', message: 'User ID required' });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ status: 'error', message: 'User not found' });

    const { usdt_wallet_address, upi_id, account_holder_name, account_number, bank_name, ifsc_code } = req.body;

    user.payment_details = {
      ...user.payment_details,
      usdt_wallet_address: usdt_wallet_address || user.payment_details?.usdt_wallet_address || '',
      usdt_network: 'BEP20',
      upi_id: upi_id !== undefined ? upi_id : user.payment_details?.upi_id,
      account_holder_name: account_holder_name !== undefined ? account_holder_name : user.payment_details?.account_holder_name,
      account_number: account_number !== undefined ? account_number : user.payment_details?.account_number,
      bank_name: bank_name !== undefined ? bank_name : user.payment_details?.bank_name,
      ifsc_code: ifsc_code !== undefined ? ifsc_code : user.payment_details?.ifsc_code,
    };

    await user.save();
    return res.json({ status: 'success', message: 'Payment details updated successfully' });
  } catch (err) {
    logger.error('updatePaymentDetails error:', err.message);
    res.status(500).json({ status: 'error', message: 'Failed to update payment details' });
  }
};

/**
 * POST /api/v1/auth/fcm-token
 */
const updateFcmToken = async (req, res) => {
  try {
    const userId = req.body.user_id || req.userId;
    const { fcm_token } = req.body;
    if (!userId || !fcm_token) {
      return res.status(400).json({ success: false, message: 'user_id and fcm_token are required' });
    }
    await User.findByIdAndUpdate(userId, { fcm_token });
    return res.json({ success: true, message: 'FCM token updated' });
  } catch (err) {
    logger.error('updateFcmToken error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to update FCM token' });
  }
};

module.exports = {
  login,
  passwordLogin,
  register,
  checkUser,
  getSettings,
  getUserProfile,
  updateProfile,
  getPaymentDetails,
  updatePaymentDetails,
  updateFcmToken,
};
