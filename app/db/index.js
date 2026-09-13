'use strict';

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const { config } = require('../config');

let db = null;

/**
 * Opens (and lazily creates) the SQLite database.
 *
 * Uses Node's built-in `node:sqlite`, so the project has no native build step
 * and installs identically on every host. Requires Node >= 22.5.
 */
function getDb() {
  if (db) return db;

  fs.mkdirSync(path.dirname(config.db.file), { recursive: true });
  db = new DatabaseSync(config.db.file);

  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');

  return db;
}

/**
 * Applies schema.sql, then adds any column that schema.sql declares but the
 * existing database is missing.
 *
 * `CREATE TABLE IF NOT EXISTS` is a no-op on a table that already exists, so
 * without the second step a new column added to schema.sql would never reach a
 * database created by an earlier version. This keeps schema.sql the single
 * source of truth and makes `npm run db:migrate` safe to re-run.
 */
function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  const database = getDb();
  database.exec(sql);

  for (const [table, columns] of parseTableColumns(sql)) {
    const existing = new Set(database.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name));
    for (const column of columns) {
      if (existing.has(column.name)) continue;
      database.exec(`ALTER TABLE ${table} ADD COLUMN ${column.definition}`);
      console.log(`  added ${table}.${column.name}`);
    }
  }
}

/** Extracts `table -> [{ name, definition }]` from the CREATE TABLE statements. */
function parseTableColumns(sql) {
  const tables = new Map();
  const createRe = /CREATE TABLE IF NOT EXISTS\s+(\w+)\s*\(([\s\S]*?)\n\);/g;
  let match;

  while ((match = createRe.exec(sql)) !== null) {
    const [, table, body] = match;
    const columns = [];

    for (const rawLine of body.split('\n')) {
      const line = rawLine.replace(/--.*$/, '').trim().replace(/,$/, '');
      if (!line) continue;
      // Skip table-level constraints; only real column definitions have a name
      // followed by a type.
      if (/^(PRIMARY|FOREIGN|UNIQUE|CHECK|CONSTRAINT)\b/i.test(line)) continue;

      const name = /^(\w+)\s+\S/.exec(line);
      if (!name) continue;
      // ALTER TABLE ADD COLUMN cannot add a PRIMARY KEY or a UNIQUE column.
      if (/\b(PRIMARY KEY|UNIQUE)\b/i.test(line)) {
        columns.push({ name: name[1], definition: null });
        continue;
      }
      columns.push({ name: name[1], definition: line });
    }

    tables.set(
      table,
      columns.filter((c) => c.definition)
    );
  }

  return tables;
}

function all(sql, params = []) {
  return getDb().prepare(sql).all(...params);
}

function get(sql, params = []) {
  return getDb().prepare(sql).get(...params);
}

function run(sql, params = []) {
  return getDb().prepare(sql).run(...params);
}

/**
 * Runs `fn` inside a transaction, rolling back if it throws.
 * node:sqlite has no transaction helper, so this wraps the statements directly.
 */
function transaction(fn) {
  const database = getDb();
  database.exec('BEGIN');
  try {
    const result = fn();
    database.exec('COMMIT');
    return result;
  } catch (err) {
    database.exec('ROLLBACK');
    throw err;
  }
}

module.exports = { getDb, migrate, all, get, run, transaction };
