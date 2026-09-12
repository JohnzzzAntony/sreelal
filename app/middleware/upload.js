'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const { config } = require('../config');

/**
 * Image uploads.
 *
 * Files land inside the statically served site directory (IAMSREE/images/uploads
 * by default) so the stored value is an ordinary site-relative path - exactly the
 * shape every existing `src` attribute in the markup already uses.
 */

const EXTENSION_BY_MIME = {
  'image/webp': '.webp',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  // Only reachable if svg is added to ALLOWED_UPLOAD_TYPES; see config.js.
  'image/svg+xml': '.svg'
};

fs.mkdirSync(config.paths.uploads, { recursive: true });

const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, config.paths.uploads);
  },
  filename(req, file, cb) {
    // The client-supplied name is never trusted for the path: only a slugified
    // stem is kept, and the extension is derived from the accepted MIME type.
    const stem =
      path
        .parse(file.originalname || 'image')
        .name.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48) || 'image';

    const unique = crypto.randomBytes(6).toString('hex');
    cb(null, `${stem}-${Date.now().toString(36)}-${unique}${EXTENSION_BY_MIME[file.mimetype] || ''}`);
  }
});

function fileFilter(req, file, cb) {
  if (!config.uploads.allowedMimeTypes.includes(file.mimetype)) {
    const err = new Error(
      `Unsupported file type "${file.mimetype}". Allowed: ${config.uploads.allowedMimeTypes.join(', ')}.`
    );
    err.status = 400;
    return cb(err);
  }

  // Refuse anything we cannot give a correct extension, rather than writing an
  // extensionless file that would later be served with a guessed type.
  if (!EXTENSION_BY_MIME[file.mimetype]) {
    const err = new Error(`No known file extension for "${file.mimetype}".`);
    err.status = 400;
    return cb(err);
  }

  return cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: config.uploads.maxBytes, files: 12 }
});

/** Converts a stored upload into the site-relative path used in the markup. */
function publicPath(file) {
  if (!file) return '';
  return config.uploadUrlPrefix.replace(/\/+$/, '') + '/' + file.filename;
}

/**
 * Picks the value for an image field: a freshly uploaded file wins, otherwise
 * the existing/typed path is kept. Lets one form serve both upload and
 * "reuse an existing image path" without a mode switch.
 */
function resolveImageField(req, fieldName, fallbackValue) {
  const uploaded = req.files && req.files[fieldName] && req.files[fieldName][0];
  if (uploaded) return publicPath(uploaded);
  return String(fallbackValue || '').trim();
}

module.exports = { upload, publicPath, resolveImageField };
