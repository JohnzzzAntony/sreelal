'use strict';

const db = require('../db');

/**
 * Shared CRUD + ordering behaviour for the content tables.
 *
 * Every managed entity has the same shape - a set of content columns plus
 * `position` and `is_visible` - so the query building lives here once and each
 * model file only declares its columns and any entity-specific reads.
 */
function createRepository({ table, columns, searchColumns = [], defaultOrder = 'position ASC, id ASC' }) {
  const columnList = columns.join(', ');

  function rowsFor(values) {
    // Only ever writes columns this repository declared, so a stray field in a
    // form post can never reach the database.
    const present = columns.filter((c) => Object.prototype.hasOwnProperty.call(values, c));
    return {
      names: present,
      values: present.map((c) => values[c])
    };
  }

  const repo = {
    table,
    columns,

    /**
     * @param {object} [opts]
     * @param {boolean} [opts.visibleOnly] restrict to rows shown on the public site
     * @param {string}  [opts.search]      case-insensitive match across searchColumns
     * @param {object}  [opts.where]       extra equality filters
     */
    list(opts = {}) {
      const clauses = [];
      const params = [];

      if (opts.visibleOnly) clauses.push('is_visible = 1');

      if (opts.search && searchColumns.length) {
        const like = '%' + opts.search.toLowerCase() + '%';
        clauses.push(
          '(' + searchColumns.map((c) => `LOWER(${c}) LIKE ?`).join(' OR ') + ')'
        );
        searchColumns.forEach(() => params.push(like));
      }

      if (opts.where) {
        for (const [key, value] of Object.entries(opts.where)) {
          if (value === undefined || value === null || value === '') continue;
          if (!columns.includes(key) && key !== 'id') continue;
          clauses.push(`${key} = ?`);
          params.push(value);
        }
      }

      const where = clauses.length ? ' WHERE ' + clauses.join(' AND ') : '';
      return db.all(
        `SELECT id, ${columnList}, created_at, updated_at FROM ${table}${where} ORDER BY ${defaultOrder}`,
        params
      );
    },

    find(id) {
      return db.get(
        `SELECT id, ${columnList}, created_at, updated_at FROM ${table} WHERE id = ?`,
        [Number(id)]
      );
    },

    create(values) {
      const data = { ...values };
      if (data.position === undefined || data.position === null || data.position === '') {
        data.position = repo.nextPosition();
      }
      const { names, values: vals } = rowsFor(data);
      const result = db.run(
        `INSERT INTO ${table} (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`,
        vals
      );
      return repo.find(result.lastInsertRowid);
    },

    update(id, values) {
      const { names, values: vals } = rowsFor(values);
      if (!names.length) return repo.find(id);

      db.run(
        `UPDATE ${table} SET ${names.map((n) => `${n} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`,
        [...vals, Number(id)]
      );
      return repo.find(id);
    },

    remove(id) {
      return db.run(`DELETE FROM ${table} WHERE id = ?`, [Number(id)]).changes > 0;
    },

    toggleVisibility(id) {
      db.run(
        `UPDATE ${table} SET is_visible = CASE is_visible WHEN 1 THEN 0 ELSE 1 END, updated_at = datetime('now') WHERE id = ?`,
        [Number(id)]
      );
      return repo.find(id);
    },

    nextPosition(where = {}) {
      const keys = Object.keys(where).filter((k) => columns.includes(k));
      const clause = keys.length ? ' WHERE ' + keys.map((k) => `${k} = ?`).join(' AND ') : '';
      const row = db.get(
        `SELECT COALESCE(MAX(position), -1) + 1 AS next FROM ${table}${clause}`,
        keys.map((k) => where[k])
      );
      return row ? row.next : 0;
    },

    /**
     * Writes an explicit ordering. `ids` is the full list of row ids in their
     * new order; positions are rewritten as 0..n-1 in a single transaction so a
     * failure part-way cannot leave a half-applied order.
     */
    reorder(ids) {
      const numeric = ids.map(Number).filter(Number.isInteger);
      if (!numeric.length) return 0;

      return db.transaction(() => {
        const stmt = `UPDATE ${table} SET position = ?, updated_at = datetime('now') WHERE id = ?`;
        numeric.forEach((id, index) => db.run(stmt, [index, id]));
        return numeric.length;
      });
    },

    /** Moves one row up or down among its siblings by swapping positions. */
    move(id, direction, where = {}) {
      const rows = repo.list({ where });
      const index = rows.findIndex((r) => r.id === Number(id));
      if (index === -1) return false;

      const target = direction === 'up' ? index - 1 : index + 1;
      if (target < 0 || target >= rows.length) return false;

      const reordered = rows.slice();
      const [moved] = reordered.splice(index, 1);
      reordered.splice(target, 0, moved);
      repo.reorder(reordered.map((r) => r.id));
      return true;
    },

    count(opts = {}) {
      const clauses = [];
      if (opts.visibleOnly) clauses.push('is_visible = 1');
      const where = clauses.length ? ' WHERE ' + clauses.join(' AND ') : '';
      const row = db.get(`SELECT COUNT(*) AS n FROM ${table}${where}`);
      return row ? row.n : 0;
    }
  };

  return repo;
}

module.exports = { createRepository };
