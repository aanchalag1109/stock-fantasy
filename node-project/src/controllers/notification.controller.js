'use strict';

const Notification = require('../models/notification.model');
const logger = require('../config/logger');

async function getUnreadCount(userId) {
  if (!userId) return 0;
  return Notification.countDocuments({ user_id: userId, is_read: false });
}

const getUserNotifications = async (req, res) => {
  try {
    const userId = req.body.user_id || req.query.user_id;
    if (!userId) return res.json({ success: true, notifications: [] });

    const notifications = await Notification.find({ user_id: userId })
      .sort({ created_at: -1 })
      .lean();

    return res.json({
      success: true,
      notifications: notifications.map((n) => ({
        id: n._id,
        title: n.title,
        description: n.description,
        type: n.type,
        created_at: n.created_at,
        is_read: !!n.is_read,
      })),
    });
  } catch (err) {
    logger.error('getUserNotifications error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch notifications' });
  }
};

const markAsRead = async (req, res) => {
  try {
    const notificationId = req.body.notification_id;
    if (!notificationId) return res.status(400).json({ success: false, message: 'Notification ID is required' });

    const notification = await Notification.findById(notificationId);
    if (!notification) return res.status(404).json({ success: false, message: 'Notification not found' });

    notification.is_read = true;
    await notification.save();
    return res.json({ success: true, message: 'Notification marked as read' });
  } catch (err) {
    logger.error('markAsRead error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to mark notification' });
  }
};

const markAllAsRead = async (req, res) => {
  try {
    const userId = req.body.user_id;
    if (!userId) return res.status(400).json({ success: false, message: 'User ID is required' });

    await Notification.updateMany({ user_id: userId, is_read: false }, { is_read: true });
    return res.json({ success: true, message: 'All notifications marked as read' });
  } catch (err) {
    logger.error('markAllAsRead error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to mark notifications' });
  }
};

module.exports = { getUserNotifications, markAsRead, markAllAsRead, getUnreadCount };
