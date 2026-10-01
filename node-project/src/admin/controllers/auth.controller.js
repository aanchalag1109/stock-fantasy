'use strict';

const bcrypt = require('bcryptjs');
const User = require('../../models/user.model');
const { renderStandalone } = require('../helpers/render');

const showLogin = (req, res) => {
  renderStandalone(res, 'auth/login', {
    error: req.flash('error'),
    success: req.flash('success'),
  });
};

const login = async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({
      $or: [{ email }, { mobile: email }],
      is_admin: true,
    });

    if (!user) {
      req.flash('error', 'Invalid credentials or not an admin.');
      return res.redirect('/login');
    }

    const valid = await bcrypt.compare(password, user.password || '');
    if (!valid) {
      req.flash('error', 'Invalid password.');
      return res.redirect('/login');
    }

    req.session.admin = {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
    };

    req.flash('success', `Welcome back, ${user.name}!`);
    res.redirect('/dashboard');
  } catch (err) {
    req.flash('error', 'Login failed: ' + err.message);
    res.redirect('/login');
  }
};

const logout = (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
};

module.exports = { showLogin, login, logout };
