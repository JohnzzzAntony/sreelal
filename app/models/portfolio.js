'use strict';

const db = require('../db');
const { createRepository } = require('./repository');

const categories = createRepository({
  table: 'portfolio_categories',
  columns: ['name', 'slug', 'position', 'is_visible'],
  searchColumns: ['name', 'slug']
});

const projects = createRepository({
  table: 'portfolio_projects',
  columns: [
    'title',
    'slug',
    'category_id',
    'category_label',
    'short_description',
    'full_description',
    'cover_image',
    'cover_alt',
    'gallery_json',
    'client_name',
    'year',
    'link',
    'open_in_new_tab',
    'badge_text',
    'cta_label',
    'position',
    'is_visible'
  ],
  searchColumns: ['title', 'slug', 'short_description', 'client_name', 'year']
});

function parseGallery(row) {
  if (!row) return row;
  let gallery = [];
  try {
    const parsed = JSON.parse(row.gallery_json || '[]');
    if (Array.isArray(parsed)) {
      gallery = parsed
        .map((g) =>
          typeof g === 'string'
            ? { src: g, alt: '' }
            : { src: String(g.src || ''), alt: String(g.alt || '') }
        )
        .filter((g) => g.src);
    }
  } catch {
    gallery = [];
  }
  return { ...row, gallery };
}

/**
 * Projects joined to their category slug, which the markup emits as the
 * `data-category` attribute Isotope filters on.
 */
function listWithCategory(opts = {}) {
  const clauses = [];
  const params = [];

  if (opts.visibleOnly) clauses.push('p.is_visible = 1');

  if (opts.search) {
    const like = '%' + opts.search.toLowerCase() + '%';
    clauses.push('(LOWER(p.title) LIKE ? OR LOWER(p.short_description) LIKE ? OR LOWER(p.client_name) LIKE ?)');
    params.push(like, like, like);
  }

  if (opts.categoryId) {
    clauses.push('p.category_id = ?');
    params.push(Number(opts.categoryId));
  }

  if (opts.visibility === 'visible') clauses.push('p.is_visible = 1');
  if (opts.visibility === 'hidden') clauses.push('p.is_visible = 0');

  const where = clauses.length ? ' WHERE ' + clauses.join(' AND ') : '';

  return db
    .all(
      `SELECT p.*, c.slug AS category_slug, c.name AS category_name
       FROM portfolio_projects p
       LEFT JOIN portfolio_categories c ON c.id = p.category_id
       ${where}
       ORDER BY p.position ASC, p.id ASC`,
      params
    )
    .map(parseGallery);
}

function findBySlug(slug) {
  return parseGallery(
    db.get(
      `SELECT p.*, c.slug AS category_slug, c.name AS category_name
       FROM portfolio_projects p
       LEFT JOIN portfolio_categories c ON c.id = p.category_id
       WHERE p.slug = ?`,
      [String(slug)]
    )
  );
}

function slugExists(slug, exceptId) {
  const row = exceptId
    ? db.get('SELECT id FROM portfolio_projects WHERE slug = ? AND id != ?', [slug, Number(exceptId)])
    : db.get('SELECT id FROM portfolio_projects WHERE slug = ?', [slug]);
  return Boolean(row);
}

function categorySlugExists(slug, exceptId) {
  const row = exceptId
    ? db.get('SELECT id FROM portfolio_categories WHERE slug = ? AND id != ?', [slug, Number(exceptId)])
    : db.get('SELECT id FROM portfolio_categories WHERE slug = ?', [slug]);
  return Boolean(row);
}

function projectCountsByCategory() {
  const rows = db.all(
    'SELECT category_id, COUNT(*) AS n FROM portfolio_projects GROUP BY category_id'
  );
  return new Map(rows.map((r) => [r.category_id, r.n]));
}

module.exports = {
  categories: {
    ...categories,
    published: () => categories.list({ visibleOnly: true }),
    slugExists: categorySlugExists,
    projectCounts: projectCountsByCategory
  },
  projects: {
    ...projects,
    find: (id) => parseGallery(projects.find(id)),
    listWithCategory,
    findBySlug,
    slugExists,
    published: () => listWithCategory({ visibleOnly: true })
  }
};
