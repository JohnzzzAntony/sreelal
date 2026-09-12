-- Schema for the IAMSREE portfolio admin panel.
--
-- Conventions:
--   * `position`   -> the spec's `order` field ("order" is a SQL reserved word).
--   * `is_visible` -> 1 shows the row on the public site, 0 hides it.
--   * Columns that mirror a literal in the existing markup keep the markup's
--     wording so the rendered HTML stays byte-identical to the original site.

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- Homepage : CASE STUDIES - "Selected work"
-- Source markup: IAMSREE/index.html, .card_case__studies-card--overlay
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS case_studies (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  title           TEXT    NOT NULL,
  link            TEXT    NOT NULL DEFAULT '',
  open_in_new_tab INTEGER NOT NULL DEFAULT 0,
  description     TEXT    NOT NULL DEFAULT '',
  image           TEXT    NOT NULL DEFAULT '',
  image_alt       TEXT    NOT NULL DEFAULT '',
  metric_value    TEXT    NOT NULL DEFAULT '',
  metric_label    TEXT    NOT NULL DEFAULT '',
  -- Footer call-to-action wording; varies per card in the original markup
  -- ("VIEW CASE STUDY" vs "VIEW PROJECT").
  cta_label       TEXT    NOT NULL DEFAULT 'VIEW CASE STUDY',
  -- JSON array of {"label": "...", "link": "..."} rendered as the tag pills.
  tags_json       TEXT    NOT NULL DEFAULT '[]',
  position        INTEGER NOT NULL DEFAULT 0,
  is_visible      INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_case_studies_order ON case_studies (is_visible, position);

-- ---------------------------------------------------------------------------
-- Homepage : Testimonials
-- Source markup: IAMSREE/index.html, .sec-2-home-5__avatar-sm cards
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS testimonials (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  client_name    TEXT    NOT NULL,
  role_title     TEXT    NOT NULL DEFAULT '',
  company        TEXT    NOT NULL DEFAULT '',
  quote          TEXT    NOT NULL DEFAULT '',
  avatar         TEXT    NOT NULL DEFAULT '',
  avatar_alt     TEXT    NOT NULL DEFAULT '',
  rating         INTEGER NOT NULL DEFAULT 5,
  -- Bootstrap responsive ordering utilities for this card's grid column.
  -- Stored rather than derived so the original hand-tuned layout is preserved.
  column_classes TEXT    NOT NULL DEFAULT '',
  -- The original grid alternates card composition: most cards put the name bar
  -- above the quote ('header_top'), the middle one puts it below ('header_bottom').
  layout         TEXT    NOT NULL DEFAULT 'header_top',
  position       INTEGER NOT NULL DEFAULT 0,
  is_visible     INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  CHECK (rating BETWEEN 0 AND 5)
);
CREATE INDEX IF NOT EXISTS idx_testimonials_order ON testimonials (is_visible, position);

-- ---------------------------------------------------------------------------
-- Homepage : "Selected client projects"
-- Two card treatments exist in the original markup:
--   card_style = 'feature' -> .alt-portfolio-item (pill + title + description)
--   card_style = 'blog'    -> .blog-card          (title link + role meta)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS client_projects (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  title           TEXT    NOT NULL,
  description     TEXT    NOT NULL DEFAULT '',
  image           TEXT    NOT NULL DEFAULT '',
  image_alt       TEXT    NOT NULL DEFAULT '',
  link            TEXT    NOT NULL DEFAULT '',
  open_in_new_tab INTEGER NOT NULL DEFAULT 0,
  card_style      TEXT    NOT NULL DEFAULT 'blog',
  category_label  TEXT    NOT NULL DEFAULT '',
  role_label      TEXT    NOT NULL DEFAULT '',
  position        INTEGER NOT NULL DEFAULT 0,
  is_visible      INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  CHECK (card_style IN ('feature', 'blog'))
);
CREATE INDEX IF NOT EXISTS idx_client_projects_order ON client_projects (is_visible, position);

-- ---------------------------------------------------------------------------
-- Homepage : "15+ brands collaborated with" logo wall
--
-- Modelled in two parts because the original markup separates them:
--   brands            - the logo library. Eight logos are referenced thirty
--                       times across the grid, so they live in one place and are
--                       edited once.
--   brand_tiles       - the grid cells. Each cell cycles through several logos.
--   brand_tile_slides - which brands cycle in which cell, and in what order.
--
-- Day to day only `brands` needs touching; the tile layout is decorative and
-- carries the original hand-authored arrangement.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS brands (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  image      TEXT    NOT NULL DEFAULT '',
  image_alt  TEXT    NOT NULL DEFAULT '',
  link       TEXT    NOT NULL DEFAULT '',
  position   INTEGER NOT NULL DEFAULT 0,
  is_visible INTEGER NOT NULL DEFAULT 1,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_brands_order ON brands (is_visible, position);

CREATE TABLE IF NOT EXISTS brand_tiles (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  -- Animation attributes emitted on the tile wrapper.
  delay      TEXT    NOT NULL DEFAULT '.4',
  fade_from  TEXT    NOT NULL DEFAULT 'bottom',
  ease       TEXT    NOT NULL DEFAULT 'bounce',
  position   INTEGER NOT NULL DEFAULT 0,
  is_visible INTEGER NOT NULL DEFAULT 1,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_brand_tiles_order ON brand_tiles (is_visible, position);

CREATE TABLE IF NOT EXISTS brand_tile_slides (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  tile_id    INTEGER NOT NULL REFERENCES brand_tiles (id) ON DELETE CASCADE,
  brand_id   INTEGER NOT NULL REFERENCES brands (id) ON DELETE CASCADE,
  -- Inert in the original markup: no CSS rule or script reads it. Preserved so
  -- the rendered page keeps matching the hand-written original.
  data_logo  TEXT    NOT NULL DEFAULT '',
  position   INTEGER NOT NULL DEFAULT 0,
  is_visible INTEGER NOT NULL DEFAULT 1,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_brand_tile_slides_tile ON brand_tile_slides (tile_id, is_visible, position);

-- ---------------------------------------------------------------------------
-- Editable page copy
--
-- Standing text that belongs to a section rather than to a repeatable row, such
-- as the brand wall's heading and intro paragraph. Rows are seeded and edited;
-- the admin does not offer adding or deleting them, because each key is
-- referenced by name from a template.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS site_settings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  key         TEXT    NOT NULL UNIQUE,
  label       TEXT    NOT NULL,
  description TEXT    NOT NULL DEFAULT '',
  value       TEXT    NOT NULL DEFAULT '',
  multiline   INTEGER NOT NULL DEFAULT 0,
  position    INTEGER NOT NULL DEFAULT 0,
  is_visible  INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- Services page : accordion sections and their deliverable lists
-- Source markup: IAMSREE/services.html, .svc4-item
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS service_sections (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  -- Drives the DOM ids: id="svc4-{slug}" and the collapse target
  -- id="svc4Col{PascalCase(slug)}".
  slug           TEXT    NOT NULL UNIQUE,
  label          TEXT    NOT NULL DEFAULT '',
  name           TEXT    NOT NULL,
  tag            TEXT    NOT NULL DEFAULT '',
  description    TEXT    NOT NULL DEFAULT '',
  thumb_image    TEXT    NOT NULL DEFAULT '',
  preview_image  TEXT    NOT NULL DEFAULT '',
  visual_image   TEXT    NOT NULL DEFAULT '',
  visual_alt     TEXT    NOT NULL DEFAULT '',
  link_label     TEXT    NOT NULL DEFAULT '',
  link_url       TEXT    NOT NULL DEFAULT '',
  aside_label_1  TEXT    NOT NULL DEFAULT '',
  aside_value_1  TEXT    NOT NULL DEFAULT '',
  aside_label_2  TEXT    NOT NULL DEFAULT '',
  aside_value_2  TEXT    NOT NULL DEFAULT '',
  position       INTEGER NOT NULL DEFAULT 0,
  is_visible     INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_service_sections_order ON service_sections (is_visible, position);

CREATE TABLE IF NOT EXISTS service_items (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  section_id INTEGER NOT NULL REFERENCES service_sections (id) ON DELETE CASCADE,
  text       TEXT    NOT NULL,
  link       TEXT    NOT NULL DEFAULT '',
  icon       TEXT    NOT NULL DEFAULT '',
  position   INTEGER NOT NULL DEFAULT 0,
  is_visible INTEGER NOT NULL DEFAULT 1,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_service_items_section ON service_items (section_id, is_visible, position);

-- ---------------------------------------------------------------------------
-- Portfolio page : Isotope filter categories
-- Source markup: IAMSREE/portfolio.html, .filter-btn[data-filter]
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS portfolio_categories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  slug       TEXT    NOT NULL UNIQUE,
  position   INTEGER NOT NULL DEFAULT 0,
  is_visible INTEGER NOT NULL DEFAULT 1,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_portfolio_categories_order ON portfolio_categories (is_visible, position);

-- ---------------------------------------------------------------------------
-- Portfolio page : projects
-- Source markup: IAMSREE/portfolio.html, .alt-portfolio-item.card-portfolio
--
-- full_description and gallery_json are captured and managed in the admin but
-- are not rendered by portfolio.html, which only shows the grid card. They feed
-- the project detail page, which remains static in this pass.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS portfolio_projects (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  title            TEXT    NOT NULL,
  slug             TEXT    NOT NULL UNIQUE,
  -- Drives the data-category attribute Isotope filters on.
  category_id      INTEGER REFERENCES portfolio_categories (id) ON DELETE SET NULL,
  -- The pill shown on the card overlay. Deliberately separate from the filter
  -- category: the original markup labels e.g. a "mobile" project "Real Estate UX".
  category_label   TEXT    NOT NULL DEFAULT '',
  short_description TEXT   NOT NULL DEFAULT '',
  full_description TEXT    NOT NULL DEFAULT '',
  cover_image      TEXT    NOT NULL DEFAULT '',
  cover_alt        TEXT    NOT NULL DEFAULT '',
  gallery_json     TEXT    NOT NULL DEFAULT '[]',
  client_name      TEXT    NOT NULL DEFAULT '',
  year             TEXT    NOT NULL DEFAULT '',
  link             TEXT    NOT NULL DEFAULT '',
  open_in_new_tab  INTEGER NOT NULL DEFAULT 0,
  badge_text       TEXT    NOT NULL DEFAULT '',
  -- Card call-to-action wording ("View case" vs "Project").
  cta_label        TEXT    NOT NULL DEFAULT 'View case',

  -- ---- Detail page ------------------------------------------------------
  -- Every project has its own page at /portfolio-details.html?slug=<slug>.
  -- Empty optional fields cause their section to be skipped rather than
  -- rendered blank, so a project with only the basics still produces a clean
  -- page.
  page_title       TEXT    NOT NULL DEFAULT '',
  meta_description TEXT    NOT NULL DEFAULT '',
  hero_superscript TEXT    NOT NULL DEFAULT '',
  hero_subtitle    TEXT    NOT NULL DEFAULT '',
  hero_image       TEXT    NOT NULL DEFAULT '',
  secondary_image  TEXT    NOT NULL DEFAULT '',
  -- The project's own site. Was the grid card's link before detail pages
  -- existed; the card now points at the detail page instead.
  live_demo_url    TEXT    NOT NULL DEFAULT '',
  live_demo_label  TEXT    NOT NULL DEFAULT 'live demo',
  role             TEXT    NOT NULL DEFAULT '',
  solution_text    TEXT    NOT NULL DEFAULT '',
  features_json    TEXT    NOT NULL DEFAULT '[]',
  outcome_text     TEXT    NOT NULL DEFAULT '',
  closing_image_1  TEXT    NOT NULL DEFAULT '',
  closing_image_2  TEXT    NOT NULL DEFAULT '',
  -- Reuses a homepage testimonial rather than duplicating the quote.
  testimonial_id   INTEGER REFERENCES testimonials (id) ON DELETE SET NULL,
  -- Image used when this project appears in another project's related strip.
  -- Falls back to cover_image when empty.
  related_image    TEXT    NOT NULL DEFAULT '',
  -- Slugs of the projects shown in this page's "Related projects" strip.
  -- Empty means "the next few projects in order".
  related_slugs_json TEXT  NOT NULL DEFAULT '[]',
  position         INTEGER NOT NULL DEFAULT 0,
  is_visible       INTEGER NOT NULL DEFAULT 1,
  created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_portfolio_projects_order ON portfolio_projects (is_visible, position);
CREATE INDEX IF NOT EXISTS idx_portfolio_projects_category ON portfolio_projects (category_id);

-- ---------------------------------------------------------------------------
-- Login sessions (express-session backing store)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
  sid        TEXT PRIMARY KEY,
  data       TEXT    NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires_at);
