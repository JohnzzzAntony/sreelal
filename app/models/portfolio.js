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
    // `link` and `open_in_new_tab` are intentionally absent. Cards used to link
    // straight out to the client's site; they now open the project's own page,
    // and that URL moved to `live_demo_url`. The columns still hold the original
    // values, but nothing reads or writes them.
    'badge_text',
    'cta_label',
    'page_title',
    'meta_description',
    'hero_superscript',
    'hero_subtitle',
    'hero_image',
    'secondary_image',
    'live_demo_url',
    'live_demo_label',
    'role',
    'solution_text',
    'features_json',
    'outcome_text',
    'closing_image_1',
    'closing_image_2',
    'testimonial_id',
    'related_image',
    'related_slugs_json',
    'position',
    'is_visible'
  ],
  searchColumns: ['title', 'slug', 'short_description', 'client_name', 'year']
});

/** Tolerant JSON array read - a malformed column must not break a page. */
function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseGallery(row) {
  if (!row) return row;

  const gallery = parseJsonArray(row.gallery_json)
    .map((g) =>
      typeof g === 'string'
        ? { src: g, alt: '' }
        : { src: String(g.src || ''), alt: String(g.alt || '') }
    )
    .filter((g) => g.src);

  const features = parseJsonArray(row.features_json)
    .map((f) => String(typeof f === 'string' ? f : f.text || ''))
    .filter(Boolean);

  const relatedSlugs = parseJsonArray(row.related_slugs_json)
    .map((s) => String(s || ''))
    .filter(Boolean);

  return { ...row, gallery, features, relatedSlugs };
}

/** The URL of a project's own page. */
function detailUrl(project) {
  return 'portfolio-details.html?slug=' + encodeURIComponent(project.slug);
}

/**
 * The projects shown in a page's "Related projects" strip.
 *
 * An explicit list wins; otherwise the following projects in display order are
 * used, wrapping around, so a new project gets a sensible strip with no setup.
 */
function relatedFor(project, limit = 3) {
  const all = listWithCategory({ visibleOnly: true });
  const others = all.filter((p) => p.id !== project.id);

  if (project.relatedSlugs && project.relatedSlugs.length) {
    const bySlug = new Map(others.map((p) => [p.slug, p]));
    const chosen = project.relatedSlugs.map((s) => bySlug.get(s)).filter(Boolean);
    if (chosen.length) return chosen.slice(0, limit);
  }

  const start = others.findIndex((p) => p.position > project.position);
  const from = start === -1 ? 0 : start;
  const wrapped = others.slice(from).concat(others.slice(0, from));
  return wrapped.slice(0, limit);
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
    detailUrl,
    relatedFor,
    published: () => listWithCategory({ visibleOnly: true })
  }
};
