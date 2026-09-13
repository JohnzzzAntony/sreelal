'use strict';

const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const { config } = require('../config');

/**
 * Single-admin authentication.
 *
 * Credentials come from the environment (ADMIN_USERNAME + ADMIN_PASSWORD_HASH),
 * so there is no user table to compromise and no self-service password reset
 * surface. The session cookie is the only bearer of authenticated state.
 */

// Resolved once at boot. ADMIN_PASSWORD is a development convenience; config
// validation rejects it in production in favour of a pre-computed hash.
const passwordHash =
  config.admin.passwordHash || (config.admin.password ? bcrypt.hashSync(config.admin.password, 12) : '');

// Rate limiting is per-process and in-memory: enough to blunt online guessing
// against a single-admin login without adding a dependency or a table.
const attemptsByKey = new Map();

function attemptKey(req) {
  return req.ip || 'unknown';
}

function tooManyAttempts(req) {
  const entry = attemptsByKey.get(attemptKey(req));
  if (!entry) return false;
  if (Date.now() - entry.first > config.admin.loginWindowMs) {
    attemptsByKey.delete(attemptKey(req));
    return false;
  }
  return entry.count >= config.admin.maxLoginAttempts;
}

function recordFailure(req) {
  const key = attemptKey(req);
  const entry = attemptsByKey.get(key);
  if (!entry || Date.now() - entry.first > config.admin.loginWindowMs) {
    attemptsByKey.set(key, { count: 1, first: Date.now() });
  } else {
    entry.count += 1;
  }
}

function clearAttempts(req) {
  attemptsByKey.delete(attemptKey(req));
}

/**
 * Verifies a username/password pair.
 *
 * Always runs a bcrypt comparison, even when the username is wrong, so response
 * timing does not reveal whether the username exists.
 */
function verifyCredentials(username, password) {
  const expected = Buffer.from(config.admin.username, 'utf8');
  const provided = Buffer.from(String(username || ''), 'utf8');
  const userMatches =
    expected.length === provided.length && crypto.timingSafeEqual(expected, provided);

  const passwordMatches = bcrypt.compareSync(String(password || ''), passwordHash || '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin');

  return userMatches && passwordMatches;
}

/** Blocks unauthenticated access; remembers where the user was heading. */
function requireAuth(req, res, next) {
  if (req.session && req.session.admin) {
    res.locals.currentAdmin = req.session.admin;
    return next();
  }

  if (req.accepts(['html', 'json']) === 'json') {
    return res.status(401).json({ error: 'Authentication required' });
  }

  req.session.returnTo = req.originalUrl;
  return res.redirect(config.admin.mountPath + '/login');
}

/** Sends already-signed-in visitors away from the login screen. */
function redirectIfAuthenticated(req, res, next) {
  if (req.session && req.session.admin) {
    return res.redirect(config.admin.mountPath);
  }
  return next();
}

module.exports = {
  requireAuth,
  redirectIfAuthenticated,
  verifyCredentials,
  tooManyAttempts,
  recordFailure,
  clearAttempts,
  hasPasswordConfigured: () => Boolean(passwordHash)
};
