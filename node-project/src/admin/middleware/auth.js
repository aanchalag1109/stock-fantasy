'use strict';

const requireAdmin = (req, res, next) => {
  if (req.session && req.session.admin) {
    return next();
  }
  req.flash('error', 'Please login to access the admin panel.');
  res.redirect('/login');
};

const guestOnly = (req, res, next) => {
  if (req.session && req.session.admin) {
    return res.redirect('/dashboard');
  }
  next();
};

module.exports = { requireAdmin, guestOnly };
