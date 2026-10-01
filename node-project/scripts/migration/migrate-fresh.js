'use strict';

/**
 * FAST MySQL → MongoDB Migration (v2)
 * - Drops all collections and re-migrates fresh
 * - Uses bulk insertMany for speed
 * - Bypasses Mongoose timestamps bug by using raw db.collection()
 * 
 * Run: node scripts/migration/migrate-fresh.js
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const mysql = require('mysql2/promise');
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/proborzs_prob';
const MYSQL_CONFIG = {
  host: process.env.MYSQL_HOST || 'localhost',
  port: parseInt(process.env.MYSQL_PORT) || 3306,
  database: process.env.MYSQL_DATABASE || 'proborzs_prob',
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  multipleStatements: true,
};

const log = (msg) => console.log(`[${new Date().toISOString().slice(11,19)}] ${msg}`);
const err = (msg) => console.error(`[${new Date().toISOString().slice(11,19)}] ❌ ${msg}`);

const safeJson = (data, fallback = null) => {
  if (!data) return fallback;
  if (typeof data === 'object') return data;
  try { return JSON.parse(data); } catch { return fallback; }
};

// Build an ID map: { mysql_id → mongodb_ObjectId }
const maps = {
  users: {},
  sessions: {},
  contests: {},
  baskets: {},
  categories: {},
};

async function dropAll(db) {
  const collections = [
    'users','leaguesessions','contests','savedbaskets','contestentries',
    'transactions','payments','withdrawalrequests','notifications',
    'banners','announcements','settings','kycsubmissions','tickets',
    'assets','markettypecategories','cronlogs',
  ];
  log('Dropping existing collections...');
  for (const col of collections) {
    try { await db.collection(col).drop(); log(`  dropped: ${col}`); }
    catch (e) { /* doesn't exist, ok */ }
  }
}

async function migrateUsers(conn, db) {
  log('Migrating users...');
  const [rows] = await conn.execute('SELECT * FROM users');
  const docs = rows.map(r => {
    const _id = new mongoose.Types.ObjectId();
    maps.users[r.id] = _id;
    return {
      _id,
      old_id: r.id,
      name: r.name || 'User',
      email: r.email || null,
      mobile: r.mobile || null,
      password: r.password || '',
      profile_image: r.profile_image || null,
      deposit_balance: parseFloat(r.deposit_balance || 0),
      winnings_balance: parseFloat(r.winnings_balance || 0),
      kyc_status: r.kyc_status || 'pending',
      fcm_token: r.fcm_token || null,
      age: r.age || null,
      gender: r.gender || null,
      is_admin: !!r.is_admin,
      is_test_user: !!r.is_test_user,
      payment_details: null,
      created_at: r.created_at || new Date(),
      updated_at: r.updated_at || new Date(),
    };
  });

  // Also pull payment details
  try {
    const [pdRows] = await conn.execute('SELECT * FROM user_payment_details');
    const pdMap = {};
    pdRows.forEach(p => { pdMap[p.user_id] = p; });
    docs.forEach(d => {
      const pd = pdMap[d.old_id];
      if (pd) {
        d.payment_details = {
          usdt_wallet_address: pd.usdt_wallet_address || null,
          usdt_network: pd.usdt_network || 'BEP20',
          upi_id: pd.upi_id || null,
          phone_number: pd.phone_number || null,
          account_holder_name: pd.account_holder_name || null,
          account_number: pd.account_number || null,
          ifsc_code: pd.ifsc_code || null,
          bank_name: pd.bank_name || null,
        };
      }
    });
  } catch (e) { /* table may not exist */ }

  if (docs.length) await db.collection('users').insertMany(docs, { ordered: false });
  log(`✓ Users migrated: ${docs.length}`);
}

async function migrateCategories(conn, db) {
  log('Migrating market type categories...');
  const [rows] = await conn.execute('SELECT * FROM market_type_categories');
  const docs = rows.map(r => {
    const _id = new mongoose.Types.ObjectId();
    maps.categories[r.id] = _id;
    return {
      _id,
      old_id: r.id,
      name: r.name,
      category_type: r.category_type || r.type || 'stock',
      status: r.status || 'active',
      created_at: r.created_at || null,
      updated_at: r.updated_at || null,
    };
  });
  if (docs.length) await db.collection('markettypecategories').insertMany(docs, { ordered: false });
  log(`✓ Categories migrated: ${docs.length}`);
}

async function migrateAssets(conn, db) {
  log('Migrating assets...');
  const [rows] = await conn.execute('SELECT * FROM assets');
  const docs = rows.map(r => ({
    _id: new mongoose.Types.ObjectId(),
    old_id: r.id,
    symbol: r.symbol,
    name: r.name,
    category_id: maps.categories[r.category_id] || null,
    image_url: r.image_url || null,
    status: r.status || 'active',
    created_at: r.created_at || new Date(),
    updated_at: r.updated_at || new Date(),
  }));
  if (docs.length) await db.collection('assets').insertMany(docs, { ordered: false });
  log(`✓ Assets migrated: ${docs.length}`);
}

async function migrateSessions(conn, db) {
  log('Migrating league sessions...');
  const [rows] = await conn.execute('SELECT * FROM league_sessions');
  const docs = rows.map(r => {
    const _id = new mongoose.Types.ObjectId();
    maps.sessions[r.id] = _id;
    return {
      _id,
      old_id: r.id,
      name: r.name,
      market_type: r.market_type || 'stock',
      max_stocks: r.max_stocks || 5,
      status: r.status || 'upcoming',
      active: r.active == null ? true : !!Number(r.active),
      image_url: r.image_url || null,
      user_joining_start_time: r.user_joining_start_time || null,
      start_time: r.start_time || null,
      end_time: r.end_time || null,
      stocks: safeJson(r.stocks, []),
      start_prices: safeJson(r.start_prices, {}),
      end_prices: safeJson(r.end_prices, {}),
      created_at: r.created_at || new Date(),
      updated_at: r.updated_at || new Date(),
    };
  });
  if (docs.length) await db.collection('leaguesessions').insertMany(docs, { ordered: false });
  log(`✓ Sessions migrated: ${docs.length}`);

  try {
    const [assetRows] = await conn.execute(`
      SELECT lsa.league_session_id, lsa.category_id, lsa.asset_symbol,
             MAX(a.name) AS asset_name, MAX(c.name) AS category_name
      FROM league_session_assets lsa
      LEFT JOIN assets a ON a.symbol = lsa.asset_symbol
      LEFT JOIN market_type_categories c ON c.id = lsa.category_id
      GROUP BY lsa.id, lsa.league_session_id, lsa.category_id, lsa.asset_symbol
      ORDER BY lsa.id
    `);
    const bySession = new Map();
    for (const row of assetRows) {
      if (!row.asset_symbol || !maps.sessions[row.league_session_id]) continue;
      const id = String(maps.sessions[row.league_session_id]);
      if (!bySession.has(id)) bySession.set(id, []);
      bySession.get(id).push({
        category_id: row.category_id,
        category_name: row.category_name || '',
        asset_symbol: row.asset_symbol,
        asset_name: row.asset_name || '',
      });
    }
    for (const [id, assets] of bySession) {
      await db.collection('leaguesessions').updateOne(
        { _id: new mongoose.Types.ObjectId(id) },
        { $set: { assets } }
      );
    }
    log(`✓ Session assets attached: ${assetRows.length}`);
  } catch (e) {
    log('league_session_assets skip: ' + e.message);
  }
}

async function migrateTemplates(conn, db) {
  log('Migrating saved templates...');
  try {
    const [rows] = await conn.execute('SELECT * FROM league_session_templates');
    const docs = rows.map((r) => ({
      _id: new mongoose.Types.ObjectId(),
      old_id: r.id,
      name: r.name,
      template_name: r.template_name,
      image_url: r.image_url || null,
      market_type: r.market_type,
      max_stocks: r.max_stocks || 5,
      user_joining_start_time: r.user_joining_start_time || null,
      start_time: r.start_time || null,
      end_time: r.end_time || null,
      status: r.status || 'draft',
      active: r.active == null ? true : !!Number(r.active),
      assets_data: safeJson(r.assets_data),
      created_at: r.created_at || new Date(),
      updated_at: r.updated_at || new Date(),
    }));
    if (docs.length) await db.collection('sessiontemplates').insertMany(docs, { ordered: false });
    log(`✓ Templates migrated: ${docs.length}`);
  } catch (e) {
    log('league_session_templates skip: ' + e.message);
  }
}

async function migrateContests(conn, db) {
  log('Migrating contests...');
  const [rows] = await conn.execute('SELECT * FROM contests');
  const docs = rows.map(r => {
    const _id = new mongoose.Types.ObjectId();
    maps.contests[r.id] = _id;
    return {
      _id,
      old_id: r.id,
      name: r.name || '',
      league_session_id: maps.sessions[r.league_session_id] || null,
      category: r.category || 'mega',
      contest_type: r.contest_type || 'dynamic',
      status: r.status || 'upcoming',
      participants: r.participants || 100,
      max_entries_per_user: r.max_entries_per_user || 1,
      entry_fee: parseFloat(r.entry_fee || 0),
      platform_fee: parseFloat(r.platform_fee || 0),
      winning_percentage: parseFloat(r.winning_percentage || 30),
      prize_pool: parseFloat(r.prize_pool || 0),
      fixed_prize_pool: parseFloat(r.fixed_prize_pool || 0),
      total_pool: parseFloat(r.total_pool || 0),
      platform_fee_amount: parseFloat(r.platform_fee_amount || 0),
      is_pinned: !!r.is_pinned,
      pin_order: r.pin_order || 0,
      is_fixed_prize: !!r.is_fixed_prize,
      is_calculated: !!r.is_calculated,
      prizes_distributed: !!r.prizes_distributed,
      prize_distribution: safeJson(r.prize_distribution),
      total_winners: r.total_winners || 0,
      bot_count: r.bot_count || 0,
      bot_join_minutes_before: r.bot_join_minutes_before || 30,
      bots_joined: !!r.bots_joined,
      bot_join_at: r.bot_join_at || null,
      created_at: r.created_at || new Date(),
      updated_at: r.updated_at || new Date(),
    };
  });
  if (docs.length) await db.collection('contests').insertMany(docs, { ordered: false });
  log(`✓ Contests migrated: ${docs.length}`);
}

async function migratePerformancePrizes(conn, db) {
  log('Migrating contest performance prizes...');
  try {
    const [rows] = await conn.execute('SELECT * FROM contest_performance_prizes');
    const contests = await db.collection('contests').find({}, { projection: { _id: 1, old_id: 1 } }).toArray();
    const byOld = new Map(contests.map((contest) => [contest.old_id, contest._id]));
    const docs = rows.map((row) => ({
      _id: new mongoose.Types.ObjectId(),
      old_id: row.id,
      contest_id: byOld.get(row.contest_id) || row.contest_id,
      contest_old_id: row.contest_id,
      rank_label: row.rank_label,
      rank_start: row.rank_start,
      rank_end: row.rank_end,
      winners_count: row.winners_count,
      percentage: row.percentage,
      prize_amount: parseFloat(row.prize_amount || 0),
      per_winner_amount: parseFloat(row.per_winner_amount || 0),
      total_pool: parseFloat(row.total_pool || 0),
      platform_fee: parseFloat(row.platform_fee || 0),
      prize_pool: parseFloat(row.prize_pool || 0),
      total_participants: row.total_participants || 0,
      total_winners: row.total_winners || 0,
      created_at: row.created_at || new Date(),
      updated_at: row.updated_at || new Date(),
    }));
    if (docs.length) await db.collection('contestperformanceprizes').insertMany(docs, { ordered: false });
    log(`✓ Performance prizes migrated: ${docs.length}`);
  } catch (e) {
    log('contest_performance_prizes skip: ' + e.message);
  }
}

async function migrateBaskets(conn, db) {
  log('Migrating saved baskets...');
  const [rows] = await conn.execute('SELECT * FROM saved_baskets');
  const docs = rows.map(r => {
    const _id = new mongoose.Types.ObjectId();
    maps.baskets[r.id] = _id;
    return {
      _id,
      old_id: r.id,
      user_id: maps.users[r.user_id] || null,
      session_id: maps.sessions[r.session_id] || maps.sessions[r.league_session_id] || null,
      contest_id: maps.contests[r.contest_id] || null,
      serial_no: r.serial_no || 'B1',
      is_standalone: !!r.is_standalone,
      assets: safeJson(r.assets, []),
      multipliers: safeJson(r.multipliers, []),
      total_score: parseFloat(r.total_score || 0),
      rank: r.rank || null,
      starting_prices: safeJson(r.starting_prices, {}),
      ending_prices: safeJson(r.ending_prices, {}),
      created_at: r.created_at || new Date(),
      updated_at: r.updated_at || new Date(),
    };
  });
  if (docs.length) await db.collection('savedbaskets').insertMany(docs, { ordered: false });
  log(`✓ Baskets migrated: ${docs.length}`);
}

async function migrateContestEntries(conn, db) {
  log('Migrating contest entries...');
  const [rows] = await conn.execute('SELECT * FROM contest_entries');
  const docs = rows.map(r => ({
    _id: new mongoose.Types.ObjectId(),
    old_id: r.id,
    user_id: maps.users[r.user_id] || null,
    contest_id: maps.contests[r.contest_id] || null,
    basket_id: maps.baskets[r.basket_id] || null,
    session_id: maps.sessions[r.session_id] || maps.sessions[r.league_session_id] || null,
    total_score: parseFloat(r.total_score || 0),
    rank: r.rank || null,
    prize_amount: parseFloat(r.prize_amount || 0),
    starting_prices: safeJson(r.starting_prices, {}),
    ending_prices: safeJson(r.ending_prices, {}),
    created_at: r.created_at || new Date(),
    updated_at: r.updated_at || new Date(),
  }));
  if (docs.length) await db.collection('contestentries').insertMany(docs, { ordered: false });
  log(`✓ Contest entries migrated: ${docs.length}`);
}

async function migrateTransactions(conn, db) {
  log('Migrating transactions...');
  const [rows] = await conn.execute('SELECT * FROM transactions');
  const docs = rows.map(r => ({
    _id: new mongoose.Types.ObjectId(),
    old_id: r.id,
    user_id: maps.users[r.user_id] || null,
    contest_id: maps.contests[r.contest_id] || null,
    type: r.type || 'deposit',
    amount: parseFloat(r.amount || 0),
    status: r.status || 'success',
    transaction_id: r.transaction_id || null,
    payment_method: r.payment_method || null,
    description: r.description || null,
    created_at: r.created_at || new Date(),
    updated_at: r.updated_at || new Date(),
  }));
  if (docs.length) await db.collection('transactions').insertMany(docs, { ordered: false });
  log(`✓ Transactions migrated: ${docs.length}`);
}

async function migrateWithdrawals(conn, db) {
  log('Migrating withdrawal requests...');
  const [rows] = await conn.execute('SELECT * FROM withdrawal_requests');
  const docs = rows.map(r => ({
    _id: new mongoose.Types.ObjectId(),
    old_id: r.id,
    user_id: maps.users[r.user_id] || null,
    amount: parseFloat(r.amount || 0),
    status: r.status || 'pending',
    usdt_wallet_address: r.usdt_wallet_address || r.wallet_address || null,
    usdt_network: r.usdt_network || 'BEP20',
    admin_message: r.admin_message || r.rejection_reason || null,
    created_at: r.created_at || new Date(),
    updated_at: r.updated_at || new Date(),
  }));
  if (docs.length) await db.collection('withdrawalrequests').insertMany(docs, { ordered: false });
  log(`✓ Withdrawal requests migrated: ${docs.length}`);
}

async function migratePayments(conn, db) {
  log('Migrating payments...');
  const [rows] = await conn.execute('SELECT * FROM payments');
  const docs = rows.map(r => ({
    _id: new mongoose.Types.ObjectId(),
    old_id: r.id,
    user_id: maps.users[r.user_id] || null,
    order_id: r.order_id,
    amount: parseFloat(r.amount || 0),
    payment_status: r.payment_status ?? 0,
    gateway: r.gateway || 'lgpay',
    created_at: r.created_at || new Date(),
    updated_at: r.updated_at || new Date(),
  }));
  if (docs.length) await db.collection('payments').insertMany(docs, { ordered: false });
  log(`✓ Payments migrated: ${docs.length}`);
}

async function migrateNotifications(conn, db) {
  log('Migrating notifications...');
  const [rows] = await conn.execute('SELECT * FROM notifications');
  const docs = rows.map(r => ({
    _id: new mongoose.Types.ObjectId(),
    old_id: r.id,
    user_id: maps.users[r.user_id] || null,
    title: r.title || r.data ? (safeJson(r.data, {}))?.title || 'Notification' : 'Notification',
    description: r.description || null,
    type: r.type || 'update',
    is_read: !!r.read_at,
    created_at: r.created_at || new Date(),
    updated_at: r.updated_at || new Date(),
  }));
  if (docs.length) await db.collection('notifications').insertMany(docs, { ordered: false });
  log(`✓ Notifications migrated: ${docs.length}`);
}

async function migrateBanners(conn, db) {
  log('Migrating banners...');
  const [rows] = await conn.execute('SELECT * FROM banners');
  const docs = rows.map(r => ({
    _id: new mongoose.Types.ObjectId(),
    old_id: r.id,
    title: r.title || '',
    image: r.image || r.image_url || null,
    link: r.link || null,
    status: r.status || 'active',
    created_at: r.created_at || new Date(),
    updated_at: r.updated_at || new Date(),
  }));
  if (docs.length) await db.collection('banners').insertMany(docs, { ordered: false });
  log(`✓ Banners migrated: ${docs.length}`);
}

async function migrateAnnouncements(conn, db) {
  log('Migrating announcements...');
  const [rows] = await conn.execute('SELECT * FROM announcements');
  const docs = rows.map(r => ({
    _id: new mongoose.Types.ObjectId(),
    old_id: r.id,
    title: r.title || '',
    message: r.message || r.content || '',
    type: r.type || 'info',
    start_date: r.start_date || null,
    end_date: r.end_date || null,
    created_at: r.created_at || new Date(),
    updated_at: r.updated_at || new Date(),
  }));
  if (docs.length) await db.collection('announcements').insertMany(docs, { ordered: false });
  log(`✓ Announcements migrated: ${docs.length}`);
}

async function migrateSettings(conn, db) {
  log('Migrating settings...');
  const [rows] = await conn.execute('SELECT * FROM settings');
  const docs = rows.map(r => ({
    _id: new mongoose.Types.ObjectId(),
    key: r.key || r.name,
    value: r.value || r.val || '',
    created_at: r.created_at || new Date(),
    updated_at: r.updated_at || new Date(),
  }));
  if (docs.length) await db.collection('settings').insertMany(docs, { ordered: false });
  log(`✓ Settings migrated: ${docs.length}`);
}

async function migrateKyc(conn, db) {
  log('Migrating KYC submissions...');
  const [rows] = await conn.execute('SELECT * FROM kyc_submissions');
  const docs = rows.map(r => ({
    _id: new mongoose.Types.ObjectId(),
    old_id: r.id,
    user_id: maps.users[r.user_id] || null,
    aadhar_number: r.aadhar_number || r.aadhaar_number || null,
    pan_number: r.pan_number || null,
    aadhar_front: r.aadhar_front || null,
    aadhar_back: r.aadhar_back || null,
    pan_image: r.pan_image || null,
    selfie: r.selfie || null,
    status: r.status || 'pending',
    rejection_reason: r.rejection_reason || null,
    created_at: r.created_at || new Date(),
    updated_at: r.updated_at || new Date(),
  }));
  if (docs.length) await db.collection('kycsubmissions').insertMany(docs, { ordered: false });
  log(`✓ KYC submissions migrated: ${docs.length}`);
}

async function migrateTickets(conn, db) {
  log('Migrating tickets...');
  const [rows] = await conn.execute('SELECT * FROM tickets');
  const repliesMap = {};
  try {
    const [replyRows] = await conn.execute('SELECT * FROM ticket_replies ORDER BY created_at ASC');
    replyRows.forEach(r => {
      if (!repliesMap[r.ticket_id]) repliesMap[r.ticket_id] = [];
      repliesMap[r.ticket_id].push({
        admin_id: r.admin_id ? 'admin' : null,
        user_id: r.user_id ? maps.users[r.user_id] || null : null,
        message: r.message || r.body || '',
        created_at: r.created_at || new Date(),
      });
    });
  } catch (e) { /* ticket_replies may not exist */ }

  const docs = rows.map(r => ({
    _id: new mongoose.Types.ObjectId(),
    old_id: r.id,
    user_id: maps.users[r.user_id] || null,
    subject: r.subject || 'Support Request',
    message: r.message || r.body || r.description || '',
    category: r.category || 'general',
    status: r.status || 'open',
    replies: repliesMap[r.id] || [],
    created_at: r.created_at || new Date(),
    updated_at: r.updated_at || new Date(),
  }));
  if (docs.length) await db.collection('tickets').insertMany(docs, { ordered: false });
  log(`✓ Tickets migrated: ${docs.length}`);
}

async function migrateCronLogs(conn, db) {
  log('Migrating cron logs...');
  const [rows] = await conn.execute('SELECT * FROM cron_logs ORDER BY created_at DESC LIMIT 500');
  const docs = rows.map(r => ({
    _id: new mongoose.Types.ObjectId(),
    old_id: r.id,
    job_name: r.job_name || r.name || 'master',
    success: r.success !== undefined ? !!r.success : true,
    duration_ms: r.duration_ms || null,
    response: r.response || r.output || null,
    created_at: r.created_at || new Date(),
    updated_at: r.updated_at || new Date(),
  }));
  if (docs.length) await db.collection('cronlogs').insertMany(docs, { ordered: false });
  log(`✓ Cron logs migrated: ${docs.length}`);
}

async function printSummary(db) {
  log('\n========== MIGRATION SUMMARY ==========');
  const colls = ['users','leaguesessions','contests','savedbaskets','contestentries',
    'transactions','payments','withdrawalrequests','notifications',
    'banners','announcements','settings','kycsubmissions','tickets','assets'];
  for (const c of colls) {
    try {
      const count = await db.collection(c).countDocuments();
      log(`  ${c.padEnd(22)} : ${count}`);
    } catch (e) { log(`  ${c.padEnd(22)} : (error)`); }
  }
  log('=======================================\n');
}

async function main() {
  log('🚀 Starting fresh MySQL → MongoDB migration...');
  log(`   MySQL: ${MYSQL_CONFIG.host}/${MYSQL_CONFIG.database}`);
  log(`   MongoDB: ${MONGODB_URI}`);

  let conn, mongoConn;

  try {
    // Connect both
    conn = await mysql.createConnection(MYSQL_CONFIG);
    log('✓ MySQL connected');

    mongoConn = await mongoose.connect(MONGODB_URI);
    const db = mongoose.connection.db;
    log('✓ MongoDB connected');

    // Step 1: Drop all
    await dropAll(db);

    // Step 2: Migrate in dependency order
    await migrateUsers(conn, db);
    await migrateCategories(conn, db);
    await migrateAssets(conn, db);
    await migrateSessions(conn, db);
    await migrateTemplates(conn, db);
    await migrateContests(conn, db);
    await migratePerformancePrizes(conn, db);
    await migrateBaskets(conn, db);
    await migrateContestEntries(conn, db);
    await migrateTransactions(conn, db);
    await migrateWithdrawals(conn, db);
    await migratePayments(conn, db);
    await migrateNotifications(conn, db);
    await migrateBanners(conn, db);
    await migrateAnnouncements(conn, db);
    await migrateSettings(conn, db);
    await migrateKyc(conn, db);
    await migrateTickets(conn, db);
    await migrateCronLogs(conn, db);

    await printSummary(db);

    log('✅ Migration COMPLETE!');
    log('');
    log('Admin login: http://localhost:8001/login');
    log('Use any user email from your old Laravel site with the same password.');

  } catch (e) {
    err('Migration failed: ' + e.message);
    console.error(e.stack);
  } finally {
    if (conn) await conn.end();
    if (mongoConn) await mongoose.disconnect();
    process.exit(0);
  }
}

main();
