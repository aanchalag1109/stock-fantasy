'use strict';

/**
 * MySQL → MongoDB Migration Script
 * 
 * Migrates all data from MySQL (Laravel) to MongoDB (Node.js).
 * Run: node scripts/migration/migrate.js
 * 
 * Environment:
 *   MYSQL_HOST, MYSQL_PORT, MYSQL_DATABASE, MYSQL_USER, MYSQL_PASSWORD
 *   MONGODB_URI
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const mysql = require('mysql2/promise');
const mongoose = require('mongoose');
const config = require('../../src/config/env');
const logger = require('../../src/config/logger');

// Models
const User = require('../../src/models/user.model');
const LeagueSession = require('../../src/models/league-session.model');
const Contest = require('../../src/models/contest.model');
const ContestEntry = require('../../src/models/contest-entry.model');
const SavedBasket = require('../../src/models/saved-basket.model');
const Transaction = require('../../src/models/transaction.model');
const Payment = require('../../src/models/payment.model');
const WithdrawalRequest = require('../../src/models/withdrawal-request.model');
const Notification = require('../../src/models/notification.model');
const Banner = require('../../src/models/banner.model');
const Announcement = require('../../src/models/announcement.model');
const Setting = require('../../src/models/setting.model');
const KycSubmission = require('../../src/models/kyc-submission.model');
const Ticket = require('../../src/models/ticket.model');
const Asset = require('../../src/models/asset.model');
const MarketTypeCategory = require('../../src/models/market-type-category.model');
const SessionTemplate = require('../../src/models/session-template.model');
const ContestPerformancePrize = require('../../src/models/contest-performance-prize.model');

const safeJson = (data, fallback = null) => {
  if (!data) return fallback;
  if (typeof data === 'object') return data;
  try { return JSON.parse(data); } catch { return fallback; }
};

async function getConnection() {
  return mysql.createConnection({
    host: config.MYSQL.host,
    port: config.MYSQL.port,
    database: config.MYSQL.database,
    user: config.MYSQL.user,
    password: config.MYSQL.password,
    multipleStatements: true,
  });
}

async function migrateUsers(conn) {
  logger.info('Migrating users...');
  const [rows] = await conn.execute('SELECT * FROM users');
  let count = 0;
  for (const row of rows) {
    try {
      await User.updateOne(
        { old_id: row.id },
        {
          $setOnInsert: {
            old_id: row.id,
            name: row.name || 'User',
            email: row.email || undefined,
            mobile: row.mobile,
            password: row.password,
            profile_image: row.profile_image,
            deposit_balance: parseFloat(row.deposit_balance || 0),
            winnings_balance: parseFloat(row.winnings_balance || 0),
            kyc_status: row.kyc_status || 'pending',
            aadhar: row.aadhar,
            pan: row.pan,
            fcm_token: row.fcm_token,
            age: row.age,
            gender: row.gender,
            is_admin: !!row.is_admin,
            is_test_user: !!row.is_test_user,
            portfolio_score: parseFloat(row.portfolio_score || 0),
            created_at: row.created_at,
            updated_at: row.updated_at,
          },
        },
        { upsert: true }
      );
      count++;
    } catch (e) {
      logger.warn(`User ${row.id} skip: ${e.message}`);
    }
  }

  // Migrate user_payment_details
  try {
    const [pdRows] = await conn.execute('SELECT * FROM user_payment_details');
    for (const pd of pdRows) {
      const user = await User.findOne({ old_id: pd.user_id });
      if (user) {
        user.payment_details = {
          usdt_wallet_address: pd.usdt_wallet_address || '',
          usdt_network: pd.usdt_network || 'BEP20',
          upi_id: pd.upi_id || null,
          phone_number: pd.phone_number || null,
          account_holder_name: pd.account_holder_name || null,
          account_number: pd.account_number || null,
          bank_name: pd.bank_name || null,
          ifsc_code: pd.ifsc_code || null,
        };
        await user.save();
      }
    }
  } catch {
    // table may not exist
  }

  logger.info(`Users migrated: ${count}`);
}

async function migrateMarketCategories(conn) {
  logger.info('Migrating market type categories...');
  const [rows] = await conn.execute('SELECT * FROM market_type_categories');
  let count = 0;
  for (const row of rows) {
    try {
      await MarketTypeCategory.updateOne(
        { old_id: row.id },
        { $setOnInsert: { old_id: row.id, name: row.name, category_type: row.category_type || 'stock', status: row.status || 'active', created_at: row.created_at, updated_at: row.updated_at } },
        { upsert: true, timestamps: false }
      );
      count++;
    } catch (e) {
      logger.warn(`Category ${row.id} skip: ${e.message}`);
    }
  }
  logger.info(`Categories migrated: ${count}`);
}

async function migrateAssets(conn) {
  logger.info('Migrating assets...');
  try {
    const [rows] = await conn.execute('SELECT * FROM assets');
    let count = 0;
    for (const row of rows) {
      try {
        await Asset.updateOne(
          { old_id: row.id },
          { $setOnInsert: { old_id: row.id, symbol: row.symbol, name: row.name, type: row.type || 'stock', category_id: row.category_id, status: row.status || 'active', created_at: row.created_at, updated_at: row.updated_at } },
          { upsert: true }
        );
        count++;
      } catch (e) {
        logger.warn(`Asset ${row.id} skip: ${e.message}`);
      }
    }
    logger.info(`Assets migrated: ${count}`);
  } catch {
    logger.warn('assets table not found, skipping');
  }
}

async function migrateSessions(conn) {
  logger.info('Migrating league sessions...');
  const [rows] = await conn.execute('SELECT * FROM league_sessions');
  let count = 0;
  for (const row of rows) {
    try {
      await LeagueSession.updateOne(
        { old_id: row.id },
        { $setOnInsert: {
          old_id: row.id,
          name: row.name,
          market_type: row.market_type || 'stock',
          max_stocks: row.max_stocks || 5,
          user_joining_start_time: row.user_joining_start_time,
          start_time: row.start_time,
          end_time: row.end_time,
          status: row.status || 'upcoming',
          active: !!row.active,
          image_url: row.image_url,
          stocks: safeJson(row.stocks),
          cryptos: safeJson(row.cryptos),
          created_at: row.created_at,
          updated_at: row.updated_at,
        }},
        { upsert: true }
      );
      count++;
    } catch (e) {
      logger.warn(`Session ${row.id} skip: ${e.message}`);
    }
  }
  logger.info(`Sessions migrated: ${count}`);

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
      if (!row.asset_symbol) continue;
      if (!bySession.has(row.league_session_id)) bySession.set(row.league_session_id, []);
      bySession.get(row.league_session_id).push({
        category_id: row.category_id,
        category_name: row.category_name || '',
        asset_symbol: row.asset_symbol,
        asset_name: row.asset_name || '',
      });
    }
    for (const [sessionId, assets] of bySession) {
      await LeagueSession.updateOne({ old_id: sessionId }, { $set: { assets } });
    }
    logger.info(`Session assets attached: ${assetRows.length}`);
  } catch (e) {
    logger.warn('league_session_assets skip: ' + e.message);
  }
}

async function migrateTemplates(conn) {
  logger.info('Migrating saved templates...');
  try {
    const [rows] = await conn.execute('SELECT * FROM league_session_templates');
    let count = 0;
    for (const row of rows) {
      await SessionTemplate.updateOne(
        { old_id: row.id },
        {
          $setOnInsert: {
            old_id: row.id,
            name: row.name,
            template_name: row.template_name,
            image_url: row.image_url || null,
            market_type: row.market_type,
            max_stocks: row.max_stocks || 5,
            user_joining_start_time: row.user_joining_start_time || null,
            start_time: row.start_time || null,
            end_time: row.end_time || null,
            status: row.status || 'draft',
            active: row.active == null ? true : !!Number(row.active),
            assets_data: safeJson(row.assets_data),
            created_at: row.created_at,
            updated_at: row.updated_at,
          },
        },
        { upsert: true, timestamps: false }
      );
      count++;
    }
    logger.info(`Templates migrated: ${count}`);
  } catch (e) {
    logger.warn('league_session_templates skip: ' + e.message);
  }
}

async function migrateContests(conn) {
  logger.info('Migrating contests...');
  const [rows] = await conn.execute('SELECT * FROM contests');
  let count = 0;
  for (const row of rows) {
    try {
      const session = await LeagueSession.findOne({ old_id: row.league_session_id }).select('_id').lean();
      await Contest.updateOne(
        { old_id: row.id },
        { $setOnInsert: {
          old_id: row.id,
          name: row.name || '',
          league_session_id: session?._id || row.league_session_id,
          category: row.category || 'mega',
          contest_type: row.contest_type || 'dynamic',
          status: row.status || 'upcoming',
          participants: row.participants || 100,
          max_entries_per_user: row.max_entries_per_user || 1,
          entry_fee: parseFloat(row.entry_fee || 0),
          platform_fee: parseFloat(row.platform_fee || 0),
          winning_percentage: parseFloat(row.winning_percentage || 30),
          prize_pool: parseFloat(row.prize_pool || 0),
          fixed_prize_pool: parseFloat(row.fixed_prize_pool || 0),
          total_pool: parseFloat(row.total_pool || 0),
          platform_fee_amount: parseFloat(row.platform_fee_amount || 0),
          is_pinned: !!row.is_pinned,
          pin_order: row.pin_order || 0,
          is_fixed_prize: !!row.is_fixed_prize,
          is_calculated: !!row.is_calculated,
          prizes_distributed: !!row.prizes_distributed,
          prize_distribution: safeJson(row.prize_distribution),
          total_winners: row.total_winners || 0,
          bot_count: row.bot_count || 0,
          bot_join_minutes_before: row.bot_join_minutes_before || 30,
          bots_joined: !!row.bots_joined,
          bot_join_at: row.bot_join_at || null,
          created_at: row.created_at,
          updated_at: row.updated_at,
        }},
        { upsert: true }
      );
      count++;
    } catch (e) {
      logger.warn(`Contest ${row.id} skip: ${e.message}`);
    }
  }
  logger.info(`Contests migrated: ${count}`);
}

async function migratePerformancePrizes(conn) {
  logger.info('Migrating contest performance prizes...');
  try {
    const [rows] = await conn.execute('SELECT * FROM contest_performance_prizes');
    const contests = await Contest.find().select('_id old_id').lean();
    const byOld = new Map(contests.map((contest) => [contest.old_id, contest._id]));
    let count = 0;
    for (const row of rows) {
      await ContestPerformancePrize.updateOne(
        { old_id: row.id },
        {
          $setOnInsert: {
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
            created_at: row.created_at,
            updated_at: row.updated_at,
          },
        },
        { upsert: true, timestamps: false }
      );
      count++;
    }
    logger.info(`Performance prizes migrated: ${count}`);
  } catch (e) {
    logger.warn('contest_performance_prizes skip: ' + e.message);
  }
}

async function migrateSavedBaskets(conn) {
  logger.info('Migrating saved baskets...');
  const [rows] = await conn.execute('SELECT * FROM saved_baskets');
  let count = 0;
  for (const row of rows) {
    try {
      const user = await User.findOne({ old_id: row.user_id }).select('_id').lean();
      const session = await LeagueSession.findOne({ old_id: row.session_id }).select('_id').lean();
      const contest = row.contest_id ? await Contest.findOne({ old_id: row.contest_id }).select('_id').lean() : null;

      await SavedBasket.updateOne(
        { old_id: row.id },
        { $setOnInsert: {
          old_id: row.id,
          user_id: user?._id || row.user_id,
          session_id: session?._id || row.session_id,
          contest_id: contest?._id || null,
          serial_no: row.serial_no || 'B1',
          is_standalone: !!row.is_standalone,
          assets: safeJson(row.assets, []),
          multipliers: safeJson(row.multipliers, []),
          total_score: parseFloat(row.total_score || 0),
          rank: row.rank || null,
          starting_prices: safeJson(row.starting_prices),
          ending_prices: safeJson(row.ending_prices),
          created_at: row.created_at,
          updated_at: row.updated_at,
        }},
        { upsert: true }
      );
      count++;
    } catch (e) {
      logger.warn(`Basket ${row.id} skip: ${e.message}`);
    }
  }
  logger.info(`Baskets migrated: ${count}`);
}

async function migrateContestEntries(conn) {
  logger.info('Migrating contest entries...');
  const [rows] = await conn.execute('SELECT * FROM contest_entries');
  let count = 0;
  for (const row of rows) {
    try {
      const user = await User.findOne({ old_id: row.user_id }).select('_id').lean();
      const contest = await Contest.findOne({ old_id: row.contest_id }).select('_id').lean();
      const basket = await SavedBasket.findOne({ old_id: row.basket_id }).select('_id').lean();
      const session = row.session_id ? await LeagueSession.findOne({ old_id: row.session_id }).select('_id').lean() : null;

      await ContestEntry.updateOne(
        { old_id: row.id },
        { $setOnInsert: {
          old_id: row.id,
          user_id: user?._id || row.user_id,
          contest_id: contest?._id || row.contest_id,
          basket_id: basket?._id || row.basket_id,
          session_id: session?._id || row.session_id,
          total_score: parseFloat(row.total_score || 0),
          rank: row.rank || null,
          prize_amount: parseFloat(row.prize_amount || 0),
          starting_prices: safeJson(row.starting_prices),
          ending_prices: safeJson(row.ending_prices),
          created_at: row.created_at,
          updated_at: row.updated_at,
        }},
        { upsert: true }
      );
      count++;
    } catch (e) {
      logger.warn(`Entry ${row.id} skip: ${e.message}`);
    }
  }
  logger.info(`Contest entries migrated: ${count}`);
}

async function migrateTransactions(conn) {
  logger.info('Migrating transactions...');
  const [rows] = await conn.execute('SELECT * FROM transactions');
  let count = 0;
  for (const row of rows) {
    try {
      const user = await User.findOne({ old_id: row.user_id }).select('_id').lean();
      await Transaction.updateOne(
        { old_id: row.id },
        { $setOnInsert: {
          old_id: row.id,
          user_id: user?._id || row.user_id,
          type: row.type || 'deposit',
          amount: parseFloat(row.amount || 0),
          description: row.description,
          status: row.status || 'success',
          transaction_id: row.transaction_id,
          created_at: row.created_at,
          updated_at: row.updated_at,
        }},
        { upsert: true }
      );
      count++;
    } catch (e) {
      logger.warn(`Transaction ${row.id} skip: ${e.message}`);
    }
  }
  logger.info(`Transactions migrated: ${count}`);
}

async function migratePayments(conn) {
  logger.info('Migrating payments...');
  try {
    const [rows] = await conn.execute('SELECT * FROM payments');
    let count = 0;
    for (const row of rows) {
      try {
        const user = await User.findOne({ old_id: row.user_id }).select('_id').lean();
        await Payment.updateOne(
          { order_id: row.order_id },
          { $setOnInsert: {
            old_id: row.id,
            order_id: row.order_id,
            user_id: user?._id || row.user_id,
            amount: parseFloat(row.amount || 0),
            payment_status: row.payment_status || 0,
            created_at: row.created_at,
            updated_at: row.updated_at,
          }},
          { upsert: true }
        );
        count++;
      } catch (e) {
        logger.warn(`Payment ${row.id} skip: ${e.message}`);
      }
    }
    logger.info(`Payments migrated: ${count}`);
  } catch {
    logger.warn('payments table not found, skipping');
  }
}

async function migrateWithdrawalRequests(conn) {
  logger.info('Migrating withdrawal requests...');
  try {
    const [rows] = await conn.execute('SELECT * FROM withdrawal_requests');
    let count = 0;
    for (const row of rows) {
      try {
        const user = await User.findOne({ old_id: row.user_id }).select('_id').lean();
        await WithdrawalRequest.updateOne(
          { old_id: row.id },
          { $setOnInsert: {
            old_id: row.id,
            user_id: user?._id || row.user_id,
            amount: parseFloat(row.amount || 0),
            status: row.status || 'pending',
            message: row.message,
            usdt_wallet_address: row.usdt_wallet_address,
            usdt_network: row.usdt_network || 'BEP20',
            created_at: row.created_at,
            updated_at: row.updated_at,
          }},
          { upsert: true }
        );
        count++;
      } catch (e) {
        logger.warn(`Withdrawal ${row.id} skip: ${e.message}`);
      }
    }
    logger.info(`Withdrawal requests migrated: ${count}`);
  } catch {
    logger.warn('withdrawal_requests table not found, skipping');
  }
}

async function migrateNotifications(conn) {
  logger.info('Migrating notifications...');
  try {
    const [rows] = await conn.execute('SELECT * FROM notifications');
    let count = 0;
    for (const row of rows) {
      try {
        const user = await User.findOne({ old_id: row.user_id }).select('_id').lean();
        await Notification.updateOne(
          { old_id: row.id },
          { $setOnInsert: {
            old_id: row.id,
            user_id: user?._id || row.user_id,
            title: row.title,
            description: row.description || row.body,
            type: row.type || 'update',
            is_read: !!row.is_read,
            created_at: row.created_at,
            updated_at: row.updated_at,
          }},
          { upsert: true }
        );
        count++;
      } catch (e) {
        logger.warn(`Notification ${row.id} skip: ${e.message}`);
      }
    }
    logger.info(`Notifications migrated: ${count}`);
  } catch {
    logger.warn('notifications table not found, skipping');
  }
}

async function migrateBanners(conn) {
  logger.info('Migrating banners...');
  try {
    const [rows] = await conn.execute('SELECT * FROM banners');
    let count = 0;
    for (const row of rows) {
      try {
        await Banner.updateOne(
          { old_id: row.id },
          { $setOnInsert: { old_id: row.id, title: row.title, image: row.image, link: row.link, status: row.status || 'active', created_at: row.created_at, updated_at: row.updated_at } },
          { upsert: true }
        );
        count++;
      } catch (e) {
        logger.warn(`Banner ${row.id} skip: ${e.message}`);
      }
    }
    logger.info(`Banners migrated: ${count}`);
  } catch {
    logger.warn('banners table not found, skipping');
  }
}

async function migrateSettings(conn) {
  logger.info('Migrating settings...');
  try {
    const [rows] = await conn.execute('SELECT * FROM settings');
    let count = 0;
    for (const row of rows) {
      try {
        await Setting.updateOne(
          { key: row.key },
          { $set: { key: row.key, value: row.value } },
          { upsert: true }
        );
        count++;
      } catch (e) {
        logger.warn(`Setting ${row.id} skip: ${e.message}`);
      }
    }
    logger.info(`Settings migrated: ${count}`);
  } catch {
    logger.warn('settings table not found, skipping');
  }
}

async function main() {
  logger.info('=== ProbTrade MySQL → MongoDB Migration ===');
  logger.info(`Source: MySQL ${config.MYSQL.database}@${config.MYSQL.host}`);
  logger.info(`Target: MongoDB ${config.MONGODB_URI}`);

  let conn;
  try {
    await mongoose.connect(config.MONGODB_URI);
    logger.info('MongoDB connected');

    conn = await getConnection();
    logger.info('MySQL connected');

    await migrateMarketCategories(conn);
    await migrateAssets(conn);
    await migrateUsers(conn);
    await migrateSessions(conn);
    await migrateTemplates(conn);
    await migrateContests(conn);
    await migratePerformancePrizes(conn);
    await migrateSavedBaskets(conn);
    await migrateContestEntries(conn);
    await migrateTransactions(conn);
    await migratePayments(conn);
    await migrateWithdrawalRequests(conn);
    await migrateNotifications(conn);
    await migrateBanners(conn);
    await migrateSettings(conn);

    logger.info('=== Migration Complete! ===');
  } catch (err) {
    logger.error('Migration failed:', err);
    process.exit(1);
  } finally {
    if (conn) await conn.end();
    await mongoose.disconnect();
    process.exit(0);
  }
}

main();
