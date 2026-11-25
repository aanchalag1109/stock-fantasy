'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 * KYC documents sit in public/uploads/kyc but must not be downloadable by anyone with the link.
 * Mounted before express.static; admins open them at /kyc/:id/document/:key (kyc.view permission).
 * The path is decoded and normalised first, as express.static does, so /uploads/%6byc or
 * /uploads//kyc do not get around it.
 */

const path = require('path');

function isPrivate(url) {
  let p = String(url || '').split('?')[0];
  try { p = decodeURIComponent(p); } catch (e) { return false; } // express.static refuses these itself
  p = path.posix.normalize(p.replace(/\\/g, '/')).replace(/\/+/g, '/').toLowerCase();
  return /^\/(uploads|storage)\/(.*\/)?kyc[^/]*\//.test(p); // kyc, kyc_docs
}

function blockPrivateUploads(req, res, next) {
  return isPrivate(req.originalUrl) ? res.status(404).send('Not found') : next();
}

module.exports = { blockPrivateUploads, isPrivate };
