'use strict';

const crypto = require('crypto');

/**
 * Synchroniser-token CSRF protection.
 *
 * A random token is minted per session and compared - in constant time - against
 * the `_csrf` field of every state-changing request. `csurf` is deprecated and
 * unmaintained, so this implements the same pattern directly.
 */

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Mints the session token, exposes it to views, and verifies it on
 * state-changing requests.
 *
 * Multipart requests are the exception: their body has not been parsed yet at
 * this point, so `_csrf` is not readable. Those are deferred and must be
 * verified by `verifyCsrf` after the upload middleware has run - see the upload
 * routes in routes/admin.js, which also assert that this happened.
 */
function csrf(req, res, next) {
  if (!req.session) return next(new Error('CSRF middleware requires a session'));

  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }

  const token = req.session.csrfToken;
  req.csrfToken = () => token;
  res.locals.csrfToken = token;

  if (SAFE_METHODS.has(req.method)) return next();

  if (req.is('multipart/form-data')) {
    req.csrfDeferred = true;
    return next();
  }

  return verifyCsrf(req, res, next);
}

/** Compares the submitted token against the session's. */
function verifyCsrf(req, res, next) {
  const token = req.session && req.session.csrfToken;
  if (!token) {
    const err = new Error('Your session expired. Reload the page and try again.');
    err.status = 403;
    return next(err);
  }

  const submitted =
    (req.body && req.body._csrf) ||
    req.get('x-csrf-token') ||
    req.get('x-xsrf-token') ||
    '';

  if (!timingSafeEqual(String(submitted), token)) {
    const err = new Error('Invalid CSRF token. Reload the page and try again.');
    err.status = 403;
    err.code = 'EBADCSRFTOKEN';
    return next(err);
  }

  req.csrfChecked = true;
  return next();
}

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

module.exports = { csrf, verifyCsrf };
