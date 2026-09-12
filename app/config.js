'use strict';

const path = require('path');
require('dotenv').config();

const ROOT = path.resolve(__dirname, '..');

function int(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function bool(value, fallback) {
  if (value === undefined || value === '') return fallback;
  return /^(1|true|yes|on)$/i.test(String(value));
}

const isProduction = process.env.NODE_ENV === 'production';

/**
 * The original static site lives in IAMSREE/. It stays the single source of
 * truth for css/js/fonts/images and is served verbatim; only the handful of
 * .html pages that became dynamic are intercepted by routes before the static
 * middleware ever sees the request.
 */
const config = {
  isProduction,
  port: int(process.env.PORT, 3000),
  trustProxy: bool(process.env.TRUST_PROXY, false),

  paths: {
    root: ROOT,
    site: path.join(ROOT, 'IAMSREE'),
    views: path.join(__dirname, 'views'),
    data: path.join(ROOT, process.env.DATA_DIR || 'data'),
    uploads: path.join(ROOT, process.env.UPLOAD_DIR || path.join('IAMSREE', 'images', 'uploads'))
  },

  // Public URL prefix the uploaded files are reachable at. Must match where
  // `paths.uploads` sits inside the statically served site directory, because
  // every image path in the markup is site-root relative (e.g. "images/x.webp").
  uploadUrlPrefix: process.env.UPLOAD_URL_PREFIX || 'images/uploads',

  db: {
    file: path.join(ROOT, process.env.DATABASE_PATH || path.join('data', 'site.db'))
  },

  session: {
    name: process.env.SESSION_NAME || 'iamsree.sid',
    secret: process.env.SESSION_SECRET || '',
    maxAgeMs: int(process.env.SESSION_MAX_AGE_MS, 1000 * 60 * 60 * 8)
  },

  admin: {
    username: process.env.ADMIN_USERNAME || 'admin',
    passwordHash: process.env.ADMIN_PASSWORD_HASH || '',
    password: process.env.ADMIN_PASSWORD || '',
    mountPath: process.env.ADMIN_PATH || '/admin',
    maxLoginAttempts: int(process.env.ADMIN_MAX_LOGIN_ATTEMPTS, 8),
    loginWindowMs: int(process.env.ADMIN_LOGIN_WINDOW_MS, 15 * 60 * 1000)
  },

  uploads: {
    maxBytes: int(process.env.MAX_UPLOAD_BYTES, 5 * 1024 * 1024),
    // SVG is deliberately absent: an SVG can carry script, and uploads are
    // served from the site's own origin. Add it here only if you accept that.
    allowedMimeTypes: (
      process.env.ALLOWED_UPLOAD_TYPES || 'image/webp,image/png,image/jpeg,image/gif'
    )
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  }
};

/**
 * Fail fast on misconfiguration that would silently weaken security in
 * production rather than booting with an insecure default.
 */
function validate() {
  const problems = [];

  if (!config.session.secret) {
    if (isProduction) {
      problems.push('SESSION_SECRET must be set in production.');
    } else {
      config.session.secret = 'dev-only-insecure-secret-change-me';
    }
  } else if (isProduction && config.session.secret.length < 32) {
    problems.push('SESSION_SECRET must be at least 32 characters in production.');
  }

  if (!config.admin.passwordHash && !config.admin.password) {
    problems.push(
      'Set ADMIN_PASSWORD_HASH (preferred) or ADMIN_PASSWORD so the admin can sign in. ' +
        'Generate a hash with: npm run -s hash -- "your password"'
    );
  }

  if (isProduction && config.admin.password && !config.admin.passwordHash) {
    problems.push('Use ADMIN_PASSWORD_HASH instead of ADMIN_PASSWORD in production.');
  }

  if (problems.length) {
    throw new Error('Configuration error:\n  - ' + problems.join('\n  - '));
  }
}

module.exports = { config, validate };
