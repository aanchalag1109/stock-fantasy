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
  buildDynamicPrizeDistribution, asPrizeArray, round2,
} = require('../helpers/mobile-compat');
// NEW IMPLEMENTATION — NODE.JS PROJECT: admin-configured deposit/withdrawal limits
const { checkTransactionAmount, limitErrorBody } = require('../services/deposit-withdrawal-settings.service');
// NEW IMPLEMENTATION — NODE.JS PROJECT: Automated Notifications
const { notify } = require('../services/notifications/notification.service');

function authUser(user) {
  return {
    id: publicId(user),
    name: user.name,
    email: user.email,
    mobile: user.mobile,
    wallet_balance: walletOf(user),
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
    if (req.body.fcm_token) {
      user.fcm_token = req.body.fcm_token;
      await user.save();
    }
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
    const password = String(req.body.password || '');
    const errors = {};
    if (mobile.length < 10 || mobile.length > 15) errors.mobile = ['The mobile field is required.'];
    if (!name || name.length > 255) errors.name = ['The name field is required.'];
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = ['The email field must be a valid email.'];
    if (password.length < 6) errors.password = ['The password must be at least 6 characters.'];
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
    const user = await User.create({
      name,
      email,
      mobile,
      password: await bcrypt.hash(password, 10),
      deposit_balance: 0,
      winnings_balance: 0,
    });
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

const passwordLogin = async (req, res) => {
  try {
    const mobile = String(req.body.mobile || '').trim();
    const password = String(req.body.password || '');
    if (mobile.length < 10 || !password) {
      return res.status(500).json({ success: false, message: 'Login failed: The given data was invalid.' });
    }
    const user = await User.findOne({ mobile });
    const matches = user && user.password ? await bcrypt.compare(password, user.password) : false;
    if (!user || !matches) {
      return res.status(401).json({ success: false, message: 'Invalid mobile number or password' });
    }
    if (req.body.fcm_token) {
      user.fcm_token = req.body.fcm_token;
      await user.save();
    }
    await ensureOldId(User, user);
    return res.json({
      success: true,
      message: 'Login successful',
      user: {
        id: publicId(user),
        name: user.name || 'User',
        email: user.email || '',
        mobile: user.mobile || '',
        wallet_balance: walletOf(user),
        age: user.age,
        gender: user.gender,
      },
      unread_notifications: await unreadCount(user),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Login failed: ' + err.message });
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
      return res.json({
        exists: true,
        message: 'User found. Please verify OTP.',
        user: { id: publicId(user), name: user.name, email: user.email, mobile: user.mobile },
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

const updateProfile = async (req, res) => {
  try {
    const user = await findByPublicId(User, req.body.user_id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (!req.body.name || !req.body.email || !req.body.mobile) {
      return res.status(500).json({ success: false, message: 'Profile update failed: The given data was invalid.', errors: null });
    }
    user.name = req.body.name;
    user.email = String(req.body.email).toLowerCase();
    user.mobile = req.body.mobile;
    if (req.body.password) user.password = await bcrypt.hash(req.body.password, 10);
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
    if (!details.usdt_wallet_address) {
      return res.json({ status: 'success', data: { usdt_wallet_address: '', usdt_network: 'BEP20' } });
    }
    return res.json({
      status: 'success',
      data: { usdt_wallet_address: details.usdt_wallet_address || '', usdt_network: 'BEP20' },
    });
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
    user.payment_details = {
      ...(user.payment_details ? user.payment_details.toObject ? user.payment_details.toObject() : user.payment_details : {}),
      usdt_wallet_address: req.body.usdt_wallet_address || '',
      usdt_network: 'BEP20',
    };
    await user.save();
    return res.json({ status: 'success', message: 'USDT wallet details updated successfully' });
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
    const contests = await Contest.find({}).select('old_id league_session_id entry_fee prize_pool category').lean();
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
          prize_pool: num(contest.prize_pool),
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
  const assets = symbols.length ? await Asset.find({ symbol: { $in: symbols } }).select('symbol name type').lean() : [];
  const bySymbol = new Map(assets.map((asset) => [asset.symbol, asset]));
  return { session, bySymbol };
}

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
        };
      }),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

const getSessionAssetsGrouped = async (req, res) => {
  try {
    const session = await findByPublicId(LeagueSession, req.params.sessionId);
    if (!session) return res.json({ assets: [] });
    return res.json({
      assets: (session.assets || []).map((asset) => ({
        symbol: asset.asset_symbol,
        name: asset.asset_symbol,
        category_name: asset.category_name,
        category_id: asset.category_id,
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
    const payload = filtered.map((session) => {
      const sessionContests = contests.filter((contest) => keysOf(session).map(String).includes(String(contest.league_session_id)));
      const sessionContestKeys = new Set(sessionContests.flatMap((contest) => keysOf(contest).map(String)));
      const joinedEntries = entries.filter((entry) => sessionContestKeys.has(String(entry.contest_id)));
      let totalPrizePool = 0;
      sessionContests.forEach((contest) => {
        let prizePool = num(contest.prize_pool);
        const category = String(contest.category || '').toLowerCase();
        if (['live', 'completed'].includes(session.status) && ['flexible', 'mega', 'equal'].includes(category)) {
          const joinedCount = entries.filter((entry) => keysOf(contest).map(String).includes(String(entry.contest_id))).length;
          const totalPool = joinedCount * num(contest.entry_fee);
          prizePool = totalPool - (totalPool * num(contest.platform_fee)) / 100;
        }
        totalPrizePool += prizePool;
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
  const isFixed = !!contest.is_fixed_prize || ['guaranteed', 'practice'].includes(contest.category);
  let prizePool = num(contest.prize_pool);
  if (!isFixed && session && session.status !== 'upcoming') {
    const totalPool = joinedCount * entryFee;
    prizePool = totalPool - (totalPool * platformFee) / 100;
  }
  const distribution = asPrizeArray(contest.prize_distribution);
  let firstPrize = 0;
  if (distribution.length) {
    const first = distribution[0];
    firstPrize = round2(first.per_winner ?? first.perWinner ?? 0);
  }
  if (!isFixed && session && ['live', 'completed'].includes(session.status) && prizePool > 0) {
    const winners = Math.max(1, Math.floor(joinedCount * (num(contest.winning_percentage || 30) / 100)));
    const dist = buildDynamicPrizeDistribution(winners, prizePool, contest.category);
    if (dist.length) firstPrize = round2(dist[0].per_winner_amount);
  }
  let badge = null;
  if (contest.is_pinned) badge = 'Featured';
  else if (contest.category === 'guaranteed') badge = 'Guaranteed';
  else if (contest.category === 'practice') badge = 'Practice';
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
    is_pinned: !!contest.is_pinned,
    pin_order: contest.pin_order || 0,
    prize_distribution: typeof contest.prize_distribution === 'string' ? contest.prize_distribution : JSON.stringify(distribution),
    joined_count: joinedCount,
    first_prize: firstPrize,
    badge,
    league_session_id: session ? publicId(session) : contest.league_session_id,
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
        const row = contestPublic(contest, plain, joined);
        const flexible = ['flexible', 'mega', 'equal'].includes(String(contest.category || '').toLowerCase());
        if (flexible) {
          const totalPool = joined * num(contest.entry_fee);
          row.prize_pool = totalPool - (totalPool * num(contest.platform_fee)) / 100;
          row.is_flexible_prize = true;
        }
        const distribution = asPrizeArray(contest.prize_distribution);
        row.first_prize = distribution.length ? round2(distribution[0].perWinner ?? 0) : 0;
        return row;
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
        basket_id: basket.old_id != null ? basket.old_id : entry.basket_id,
        serial_no: basket.serial_no || null,
        total_score: prices.started ? num(entry.total_score) : 0,
        total_points: round2(scored.total),
        assets: scored.rows,
        multipliers: basket.multipliers || [],
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
    const isFixed = ['guaranteed', 'practice'].includes(plain.category) || !!plain.is_fixed_prize;
    let displayPrizePool;
    let totalPool;
    let platformFeeAmount;
    if (isFixed || sessionStatus === 'upcoming') {
      displayPrizePool = num(plain.prize_pool);
      totalPool = num(plain.total_pool);
      platformFeeAmount = num(plain.platform_fee_amount);
    } else {
      totalPool = joinedUsersCount * entryFee;
      platformFeeAmount = (totalPool * platformFeePercent) / 100;
      displayPrizePool = totalPool - platformFeeAmount;
    }
    let prizeDistribution = [];
    const stored = asPrizeArray(plain.prize_distribution);
    if (isFixed || !(prices.started || sessionStatus === 'live')) {
      prizeDistribution = stored.map((item) => {
        const winnersCount = parseInt(item.winners || item.winners_count || 1, 10);
        const rankStart = parseInt(item.rank_start || 1, 10);
        const rankEnd = parseInt(item.rank_end || rankStart, 10);
        const percent = num(item.percent ?? item.percentage ?? item.prize_percent);
        const perWinner = isFixed
          ? num(item.per_winner ?? item.perWinner ?? item.per_winner_amount)
          : (winnersCount > 0 ? ((displayPrizePool * percent) / 100) / winnersCount : 0);
        return {
          rank_label: item.label || item.rank_label || `Rank ${rankStart} to ${rankEnd}`,
          rank_start: rankStart,
          rank_end: rankEnd,
          winners_count: winnersCount,
          percentage: round2(percent),
          prize_amount: round2(perWinner * winnersCount),
          per_winner_amount: round2(perWinner),
        };
      });
    } else if (stored.length) {
      prizeDistribution = stored.map((item) => ({
        rank_label: item.rank_label || item.label,
        rank_start: parseInt(item.rank_start, 10),
        rank_end: parseInt(item.rank_end, 10),
        winners_count: parseInt(item.winners_count || item.winners || 1, 10),
        percentage: round2(item.percentage || item.percent),
        prize_amount: round2(item.prize_amount),
        per_winner_amount: round2(item.per_winner_amount || item.per_winner),
      }));
    } else if (joinedUsersCount > 0 && displayPrizePool > 0) {
      const winners = Math.max(1, Math.floor(joinedUsersCount * (num(plain.winning_percentage || 30) / 100)));
      prizeDistribution = buildDynamicPrizeDistribution(winners, displayPrizePool, plain.category);
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
        is_flexible_prize: !isFixed && sessionStatus !== 'upcoming',
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
      },
      participants,
      user_joined: userEntryCount > 0,
      user_entry_count: userEntryCount,
      remaining_entries: Math.max(0, parseInt(plain.max_entries_per_user || 1, 10) - userEntryCount),
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
        let prizePool = num(contest.prize_pool);
        const category = String(contest.category || '').toLowerCase();
        const isFlexible = ['flexible', 'mega', 'equal'].includes(category) && ['live', 'completed'].includes(session.status);
        if (isFlexible) {
          const totalPool = joinedUsers * num(contest.entry_fee);
          prizePool = totalPool - (totalPool * num(contest.platform_fee)) / 100;
        }
        group.contests.set(contestKey, {
          contest_id: publicId(contest),
          category: contest.category,
          prize_pool: prizePool,
          is_flexible_prize: isFlexible,
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

const bulkJoinContest = async (req, res) => {
  try {
    const user = await findByPublicId(User, req.body.user_id);
    const contest = await findByPublicId(Contest, req.body.contest_id);
    const basketIds = [].concat(req.body.basket_ids || []).filter((id) => id != null && id !== '');
    const entryFee = num(req.body.entry_fee);
    if (!user || !contest || !basketIds.length) return res.status(400).json({ success: false, message: 'Invalid input' });
    const plain = contest.toObject();
    const existing = await ContestEntry.find({ contest_id: { $in: keysOf(plain) } }).lean();
    const maxParticipants = parseInt(plain.participants || 100, 10);
    const available = maxParticipants - existing.length;
    if (basketIds.length > available) {
      return res.status(400).json({ success: false, message: `Only ${available} spots available in this contest` });
    }
    const userEntries = existing.filter((entry) => keysOf(user).map(String).includes(String(entry.user_id)));
    const remaining = parseInt(plain.max_entries_per_user || 1, 10) - userEntries.length;
    if (basketIds.length > remaining) {
      return res.status(400).json({ success: false, message: `You can only select ${remaining} more baskets` });
    }
    if (walletOf(user) < entryFee * basketIds.length) {
      return res.status(400).json({ success: false, message: 'Insufficient balance' });
    }
    let successCount = 0;
    const errors = [];
    for (const basketId of basketIds) {
      const basket = await findByPublicId(SavedBasket, basketId);
      if (!basket || !keysOf(user).map(String).includes(String(basket.user_id)) || !basket.is_standalone) {
        errors.push(`Basket ${basketId}: Not found`);
        continue;
      }
      const already = existing.some((entry) => keysOf(basket).map(String).includes(String(entry.basket_id)) && keysOf(user).map(String).includes(String(entry.user_id)));
      if (already) {
        errors.push(`Basket ${basketId}: Already joined`);
        continue;
      }
      const entry = await ContestEntry.create({
        user_id: user._id,
        contest_id: contest._id,
        basket_id: basket._id,
        session_id: plain.league_session_id,
        total_score: 0,
      });
      await ensureOldId(ContestEntry, entry);
      let remainingFee = entryFee;
      if (num(user.deposit_balance) >= remainingFee) user.deposit_balance = num(user.deposit_balance) - remainingFee;
      else {
        remainingFee -= num(user.deposit_balance);
        user.deposit_balance = 0;
        user.winnings_balance = num(user.winnings_balance) - remainingFee;
      }
      user.deposit_balance = Math.max(0, num(user.deposit_balance));
      user.winnings_balance = Math.max(0, num(user.winnings_balance));
      await Transaction.create({
        user_id: user._id,
        contest_id: contest._id,
        type: 'contest_entry',
        amount: entryFee,
        status: 'success',
        transaction_id: `ENTRY_${publicId(plain)}_${publicId(entry)}_${Math.floor(Date.now() / 1000)}_${Math.floor(1000 + Math.random() * 9000)}`,
        description: `Entry fee for Contest #${publicId(plain)}, entry ${publicId(entry)}`,
      });
      successCount += 1;
    }
    await user.save();
    const joinedUsers = existing.length + successCount;
    const userEntryCount = userEntries.length + successCount;
    return res.json({
      success: true,
      message: `Joined with ${successCount} basket(s)`,
      success_count: successCount,
      errors,
      wallet_balance: walletOf(user),
      contest_updated: {
        id: publicId(plain),
        joined_users: joinedUsers,
        spots_left: Math.max(0, maxParticipants - joinedUsers),
        user_entry_count: userEntryCount,
        remaining_entries: Math.max(0, parseInt(plain.max_entries_per_user || 1, 10) - userEntryCount),
      },
      should_refresh: true,
      unread_notifications: await unreadCount(user),
    });
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
    if (req.query.contest_id && req.query.exclude_joined) {
      const contest = await findByPublicId(Contest, req.query.contest_id);
      if (contest) {
        const joined = await ContestEntry.find({ user_id: { $in: keysOf(user) }, contest_id: { $in: keysOf(contest.toObject()) } }).select('basket_id').lean();
        const used = new Set(joined.map((entry) => String(entry.basket_id)));
        baskets = baskets.filter((basket) => !used.has(String(basket._id)) && !used.has(String(basket.old_id)));
      }
    }
    const data = [];
    for (const basket of baskets) {
      const session = await findByPublicId(LeagueSession, basket.session_id);
      const scored = scoreAssets(basket.assets || [], basket.multipliers || [], priceMaps(session && session.toObject()));
      const grouped = { lc: [], mc: [], sc: [] };
      scored.rows.forEach((asset) => {
        const sector = String(asset.sector || '').toLowerCase();
        if (sector.includes('large cap')) grouped.lc.push(asset);
        else if (sector.includes('mid cap')) grouped.mc.push(asset);
        else if (sector.includes('small cap')) grouped.sc.push(asset);
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
        lc_count: grouped.lc.length,
        mc_count: grouped.mc.length,
        sc_count: grouped.sc.length,
        created_at: sqlDate(basket.created_at),
        updated_at: sqlDate(basket.updated_at),
      });
    }
    return res.json({ success: true, data });
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
    basket.assets = basketAssets(req.body.assets);
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
      scored.rows.forEach((asset) => {
        const sector = String(asset.sector || '').toLowerCase();
        if (sector.includes('large cap')) grouped.lc.push(asset);
        else if (sector.includes('mid cap')) grouped.mc.push(asset);
        else if (sector.includes('small cap')) grouped.sc.push(asset);
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
        lc_count: grouped.lc.length,
        mc_count: grouped.mc.length,
        sc_count: grouped.sc.length,
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
    // NEW IMPLEMENTATION — NODE.JS PROJECT: enforce withdrawal limits (replaces the hard-coded 500 minimum).
    const check = await checkTransactionAmount('withdrawal', req.body.amount);
    if (!check.ok) return res.status(check.status).json(limitErrorBody(check));
    const user = await findByPublicId(User, req.body.user_id);
    const amount = check.amount;
    if (!user) return res.status(500).json({ success: false, error: 'Failed to create withdrawal request: The given data was invalid.' });
    const address = user.payment_details && user.payment_details.usdt_wallet_address;
    if (!address) {
      return res.status(400).json({
        success: false,
        error: 'Please add your USDT wallet address before withdrawing.',
        payment_details_required: true,
      });
    }
    if (num(user.winnings_balance) < amount) {
      return res.status(400).json({
        success: false,
        error: 'Insufficient winnings balance. Only winnings can be withdrawn.',
        winnings_balance: num(user.winnings_balance),
      });
    }
    user.winnings_balance = num(user.winnings_balance) - amount;
    await user.save();
    const withdrawal = await WithdrawalRequest.create({
      user_id: user._id,
      amount,
      status: 'pending',
      message: req.body.message || null,
      usdt_wallet_address: address,
      usdt_network: (user.payment_details && user.payment_details.usdt_network) || 'TRC20',
    });
    await ensureOldId(WithdrawalRequest, withdrawal);
    await Transaction.create({
      user_id: user._id,
      type: 'withdrawal',
      amount,
      status: 'pending',
      description: `Withdrawal request #${publicId(withdrawal)} (USDT ${withdrawal.usdt_network || 'TRC20'})`,
    });
    // NEW IMPLEMENTATION — NODE.JS PROJECT: Automated Notifications
    notify('withdrawal_submitted', { user, dedupeKey: `withdrawal_submitted:${withdrawal._id}`, params: { amount }, data: { screen: 'withdrawals', withdrawal_id: publicId(withdrawal) } });
    return res.json({
      success: true,
      withdrawal_id: publicId(withdrawal),
      message: 'Withdrawal request submitted. Admin will process it shortly.',
      wallet_balance: walletOf(user),
      deposit_balance: num(user.deposit_balance),
      winnings_balance: num(user.winnings_balance),
      usdt_address: address,
      usdt_network: withdrawal.usdt_network || 'TRC20',
      unread_notifications: await unreadCount(user),
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

const sessionStats = async (req, res) => {
  try {
    const session = await findByPublicId(LeagueSession, req.params.sessionId);
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' });
    const filter = req.query.filter || 'all';
    if (!['live', 'completed', 'completing'].includes(session.status)) {
      return res.json({
        success: true,
        session_id: publicId(session),
        session_name: session.name,
        status: session.status,
        stats: [],
        message: 'Stats available once session goes live.',
      });
    }
    const seen = new Set();
    let stats = [];
    (session.assets || []).forEach((asset) => {
      if (!asset.asset_symbol || seen.has(asset.asset_symbol) || asset.start_price == null) return;
      seen.add(asset.asset_symbol);
      const startPrice = num(asset.start_price);
      if (startPrice <= 0) return;
      const currentPrice = asset.end_price == null ? startPrice : num(asset.end_price);
      const changePercent = Math.round((((currentPrice - startPrice) / startPrice) * 100) * 10000) / 10000;
      if (filter === 'positive' && changePercent <= 0) return;
      if (filter === 'negative' && changePercent >= 0) return;
      stats.push({
        symbol: asset.asset_symbol,
        name: asset.asset_name || asset.asset_symbol,
        start_price: startPrice,
        current_price: currentPrice,
        change_percent: changePercent,
        change_amount: Math.round((currentPrice - startPrice) * 10000) / 10000,
        direction: changePercent > 0 ? 'up' : (changePercent < 0 ? 'down' : 'flat'),
        last_updated: sqlDate(asset.end_price_fetched_at),
      });
    });
    stats.sort((a, b) => (filter === 'negative' ? a.change_percent - b.change_percent : b.change_percent - a.change_percent));
    const user = req.query.user_id ? await findByPublicId(User, req.query.user_id) : null;
    return res.json({
      success: true,
      session_id: publicId(session),
      session_name: session.name,
      status: session.status,
      filter,
      total: stats.length,
      stats,
      last_updated: sqlDate(new Date()),
      unread_notifications: await unreadCount(user),
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

const { getLivePrices, getStockLivePrice, getCryptoLivePrice } = require('./liveprice.controller');
const { lgpayCallback } = require('./payment.controller');

module.exports = {
  login, register, passwordLogin, checkUser, getSettings, getUserProfile, updateProfile,
  getPaymentDetails, updatePaymentDetails, banners, upcomingSessions, getSession,
  getUserSessions, getActiveSession, getSessionAssets, getSessionAssetsGrouped, getUserJoinedSessions,
  contestsBySession, myContestsBySession, getContest, getUserContests, bulkJoinContest,
  saveBasket, storeStandalone, savedBaskets, deleteBasket, editBasket, destroyBasket, cleanupEmptyBaskets, getContestBaskets, getUserContestBaskets,
  getWalletAmount, getUserTransactions, userTransactionsEmpty, clearUserTransactions, depositAmount, withdrawAmount,
  getUserNotifications, markAsRead, markAllAsRead, getAnnouncements, sessionStats,
  getLivePrices, getStockLivePrice, getCryptoLivePrice, lgpayCallback,
  getNotificationPreferences, updateNotificationPreferences, // NEW IMPLEMENTATION — NODE.JS PROJECT
};
