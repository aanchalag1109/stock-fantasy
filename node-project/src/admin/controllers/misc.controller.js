'use strict';

const Ticket = require('../../models/ticket.model');
const Banner = require('../../models/banner.model');
const Announcement = require('../../models/announcement.model');
const Notification = require('../../models/notification.model');
const Setting = require('../../models/setting.model');
const CronLog = require('../../models/cron-log.model');
const User = require('../../models/user.model');
const { render } = require('../helpers/render');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// ─── TICKETS ──────────────────────────────────────────────────────────────────
const tickets = {
  index: async (req, res) => {
    const { status, page = 1 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    const limit = 20; const skip = (page - 1) * limit;
    const [tickets, total] = await Promise.all([
      Ticket.find(filter).sort({ created_at: -1 }).skip(skip).limit(limit)
        .populate({ path: 'user_id', model: 'User', select: 'name mobile' }).lean(),
      Ticket.countDocuments(filter),
    ]);
    render(res, 'tickets/index', { title: 'Support Tickets', tickets, total, pages: Math.ceil(total / limit), page: parseInt(page), status, admin: req.session.admin });
  },
  show: async (req, res) => {
    const ticket = await Ticket.findById(req.params.id)
      .populate({ path: 'user_id', model: 'User', select: 'name mobile email' }).lean();
    if (!ticket) { req.flash('error', 'Not found'); return res.redirect('/tickets'); }
    render(res, 'tickets/show', { title: 'Ticket #' + req.params.id, ticket, admin: req.session.admin });
  },
  close: async (req, res) => {
    await Ticket.findByIdAndUpdate(req.params.id, { status: 'closed' });
    req.flash('success', 'Ticket closed');
    res.redirect('/tickets');
  },
  reply: async (req, res) => {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) { req.flash('error', 'Not found'); return res.redirect('/tickets'); }
    ticket.replies.push({ admin_id: req.session.admin?.id, message: req.body.message });
    await ticket.save();
    req.flash('success', 'Reply sent');
    res.redirect('/tickets/' + req.params.id);
  },
};

// ─── BANNERS ──────────────────────────────────────────────────────────────────
const bannerStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../../../public/uploads/banners');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, `banner_${Date.now()}${path.extname(file.originalname)}`),
});
const bannerUpload = multer({ storage: bannerStorage }).single('image');

const banners = {
  index: async (req, res) => {
    const items = await Banner.find().sort({ created_at: -1 }).lean();
    render(res, 'banners/index', { title: 'Banners', items, admin: req.session.admin });
  },
  create: (req, res) => render(res, 'banners/create', { title: 'Add Banner', admin: req.session.admin }),
  store: (req, res) => {
    bannerUpload(req, res, async (err) => {
      if (err) { req.flash('error', err.message); return res.redirect('/banners/create'); }
      try {
        await Banner.create({ title: req.body.title, image: req.file ? 'uploads/banners/' + req.file.filename : req.body.image_url, link: req.body.link, status: 'active' });
        req.flash('success', 'Banner created!');
        res.redirect('/banners');
      } catch (e) { req.flash('error', e.message); res.redirect('/banners/create'); }
    });
  },
  destroy: async (req, res) => {
    await Banner.findByIdAndDelete(req.params.id);
    req.flash('success', 'Banner deleted');
    res.redirect('/banners');
  },
};

// ─── ANNOUNCEMENTS ────────────────────────────────────────────────────────────
const announcements = {
  index: async (req, res) => {
    const items = await Announcement.find().sort({ created_at: -1 }).lean();
    render(res, 'announcements/index', { title: 'Announcements', items, admin: req.session.admin });
  },
  create: (req, res) => render(res, 'announcements/create', { title: 'Create Announcement', admin: req.session.admin }),
  store: async (req, res) => {
    try {
      await Announcement.create({ title: req.body.title, message: req.body.message, type: req.body.type || 'info', start_date: req.body.start_date, end_date: req.body.end_date });
      req.flash('success', 'Announcement created!');
      res.redirect('/announcements');
    } catch (e) { req.flash('error', e.message); res.redirect('/announcements/create'); }
  },
  show: async (req, res) => {
    const announcement = await Announcement.findById(req.params.id).lean();
    if (!announcement) { req.flash('error', 'Announcement not found'); return res.redirect('/announcements'); }
    render(res, 'announcements/show', { title: 'View Announcement', announcement, admin: req.session.admin });
  },
  bulkDelete: async (req, res) => {
    const ids = [].concat(req.body.ids || []).filter(Boolean);
    if (ids.length) await Announcement.deleteMany({ _id: { $in: ids } });
    req.flash('success', 'Selected announcements deleted');
    res.redirect('/announcements');
  },
  destroy: async (req, res) => {
    await Announcement.findByIdAndDelete(req.params.id);
    req.flash('success', 'Deleted');
    res.redirect('/announcements');
  },
};

// ─── NOTIFICATIONS ────────────────────────────────────────────────────────────
const notifications = {
  create: async (req, res) => {
    const users = await User.find({ is_test_user: { $ne: true }, fcm_token: { $exists: true, $ne: null } }).select('_id name mobile').lean();
    render(res, 'notifications/create', { title: 'Send Notification', users, admin: req.session.admin });
  },
  send: async (req, res) => {
    try {
      const { title, description, type, user_ids } = req.body;
      const ids = Array.isArray(user_ids) ? user_ids : (user_ids === 'all' ? [] : [user_ids]);
      const filter = ids.length > 0 ? { _id: { $in: ids } } : {};
      const users = await User.find(filter).select('_id').lean();
      const notifs = users.map(u => ({ user_id: u._id, title, description, type: type || 'update', is_read: false }));
      await Notification.insertMany(notifs);
      req.flash('success', `Notification sent to ${notifs.length} users`);
      res.redirect('/notifications');
    } catch (e) { req.flash('error', e.message); res.redirect('/notifications'); }
  },
};

// ─── SETTINGS ─────────────────────────────────────────────────────────────────
const settings = {
  index: async (req, res) => {
    const items = await Setting.find().lean();
    const settingsMap = {};
    items.forEach(s => { settingsMap[s.key] = s.value; });
    render(res, 'settings/index', { title: 'Settings', settingsMap, admin: req.session.admin });
  },
  update: async (req, res) => {
    try {
      const pairs = Object.entries(req.body);
      await Promise.all(pairs.map(([key, value]) => Setting.findOneAndUpdate({ key }, { key, value }, { upsert: true })));
      req.flash('success', 'Settings saved!');
      res.redirect('/settings');
    } catch (e) { req.flash('error', e.message); res.redirect('/settings'); }
  },
  saveKey: (key) => async (req, res) => {
    try {
      const value = req.body[key];
      await Setting.findOneAndUpdate({ key }, { key, value }, { upsert: true });
      req.flash('success', 'Settings saved!');
      res.redirect('/settings');
    } catch (e) { req.flash('error', e.message); res.redirect('/settings'); }
  },
};

// ─── CRON LOGS ────────────────────────────────────────────────────────────────
const cron = {
  index: async (req, res) => {
    const { page = 1 } = req.query;
    const limit = 30; const skip = (page - 1) * limit;
    const [logs, total] = await Promise.all([
      CronLog.find().sort({ created_at: -1 }).skip(skip).limit(limit).lean(),
      CronLog.countDocuments(),
    ]);
    render(res, 'cron/index', { title: 'Cron Check Logs', logs, total, pages: Math.ceil(total / limit), page: parseInt(page), admin: req.session.admin });
  },
  clear: async (req, res) => {
    await CronLog.deleteMany({});
    req.flash('success', 'Cron logs cleared');
    res.redirect('/cron-logs');
  },
};

module.exports = { tickets, banners, announcements, notifications, settings, cron };
