'use strict';

const session = require('express-session');
const db = require('../db');

/**
 * SQLite-backed session store.
 *
 * express-session's default MemoryStore leaks and drops every login on restart,
 * which is not acceptable for the admin. The usual store packages pull in a
 * native sqlite build; this reuses the database connection the app already has.
 */
class SqliteStore extends session.Store {
  constructor(options = {}) {
    super(options);
    this.ttlMs = options.ttlMs || 1000 * 60 * 60 * 8;

    // Sweep expired rows periodically; unref so it never holds the process open.
    const interval = setInterval(() => this.clearExpired(), 1000 * 60 * 15);
    if (typeof interval.unref === 'function') interval.unref();
  }

  clearExpired() {
    try {
      db.run('DELETE FROM sessions WHERE expires_at <= ?', [Date.now()]);
    } catch {
      /* a sweep failure must never take down the server */
    }
  }

  get(sid, callback) {
    try {
      const row = db.get('SELECT data, expires_at FROM sessions WHERE sid = ?', [sid]);
      if (!row) return callback(null, null);
      if (row.expires_at <= Date.now()) {
        db.run('DELETE FROM sessions WHERE sid = ?', [sid]);
        return callback(null, null);
      }
      return callback(null, JSON.parse(row.data));
    } catch (err) {
      return callback(err);
    }
  }

  set(sid, sessionData, callback) {
    try {
      const expires = sessionData.cookie && sessionData.cookie.expires
        ? new Date(sessionData.cookie.expires).getTime()
        : Date.now() + this.ttlMs;

      db.run(
        `INSERT INTO sessions (sid, data, expires_at) VALUES (?, ?, ?)
         ON CONFLICT(sid) DO UPDATE SET data = excluded.data, expires_at = excluded.expires_at`,
        [sid, JSON.stringify(sessionData), expires]
      );
      return callback(null);
    } catch (err) {
      return callback(err);
    }
  }

  destroy(sid, callback) {
    try {
      db.run('DELETE FROM sessions WHERE sid = ?', [sid]);
      return callback(null);
    } catch (err) {
      return callback(err);
    }
  }

  touch(sid, sessionData, callback) {
    try {
      const expires = sessionData.cookie && sessionData.cookie.expires
        ? new Date(sessionData.cookie.expires).getTime()
        : Date.now() + this.ttlMs;
      db.run('UPDATE sessions SET expires_at = ? WHERE sid = ?', [expires, sid]);
      return callback(null);
    } catch (err) {
      return callback(err);
    }
  }
}

module.exports = { SqliteStore };
