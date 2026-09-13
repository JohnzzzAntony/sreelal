'use strict';

const db = require('../db');
const { createRepository } = require('./repository');

/**
 * Editable page copy, keyed by name.
 *
 * Templates read values through `get(key)`, so a missing or emptied row falls
 * back to the default passed at the call site rather than rendering a blank.
 */
const repo = createRepository({
  table: 'site_settings',
  columns: ['key', 'label', 'description', 'value', 'multiline', 'position', 'is_visible'],
  searchColumns: ['key', 'label', 'value']
});

function get(key, fallback = '') {
  const row = db.get('SELECT value FROM site_settings WHERE key = ? AND is_visible = 1', [key]);
  if (!row) return fallback;
  return row.value === '' ? fallback : row.value;
}

/** All settings as a plain object, for passing into a template in one go. */
function all() {
  const map = {};
  for (const row of db.all('SELECT key, value FROM site_settings WHERE is_visible = 1')) {
    map[row.key] = row.value;
  }
  return map;
}

module.exports = { ...repo, get, all };
