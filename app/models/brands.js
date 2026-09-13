'use strict';

const db = require('../db');
const { createRepository } = require('./repository');

/**
 * The homepage brand wall.
 *
 * `brands` is the logo library - eight logos referenced thirty times across the
 * grid - and `tiles`/`slides` describe which logos cycle in which grid cell.
 */

const brands = createRepository({
  table: 'brands',
  columns: ['name', 'image', 'image_alt', 'link', 'position', 'is_visible'],
  searchColumns: ['name', 'image_alt']
});

const tiles = createRepository({
  table: 'brand_tiles',
  columns: ['delay', 'fade_from', 'ease', 'position', 'is_visible'],
  searchColumns: ['delay']
});

const slides = createRepository({
  table: 'brand_tile_slides',
  columns: ['tile_id', 'brand_id', 'data_logo', 'position', 'is_visible'],
  searchColumns: ['data_logo']
});

/** Slides of one tile, joined to the brand they display. */
function slidesFor(tileId, opts = {}) {
  const visible = opts.visibleOnly ? ' AND s.is_visible = 1 AND b.is_visible = 1' : '';
  return db.all(
    `SELECT s.*, b.name AS brand_name, b.image AS image, b.image_alt AS image_alt, b.link AS link
     FROM brand_tile_slides s
     JOIN brands b ON b.id = s.brand_id
     WHERE s.tile_id = ?${visible}
     ORDER BY s.position ASC, s.id ASC`,
    [Number(tileId)]
  );
}

/**
 * The grid as the homepage renders it: visible tiles, each with its visible
 * slides. A tile whose logos are all hidden is dropped rather than rendered as
 * an empty cell.
 */
function publishedGrid() {
  return tiles
    .list({ visibleOnly: true })
    .map((tile) => ({ ...tile, slides: slidesFor(tile.id, { visibleOnly: true }) }))
    .filter((tile) => tile.slides.length > 0);
}

function slideCounts() {
  const rows = db.all('SELECT tile_id, COUNT(*) AS n FROM brand_tile_slides GROUP BY tile_id');
  return new Map(rows.map((r) => [r.tile_id, r.n]));
}

/** How many grid slides each brand appears in - shown in the brands list. */
function usageCounts() {
  const rows = db.all('SELECT brand_id, COUNT(*) AS n FROM brand_tile_slides GROUP BY brand_id');
  return new Map(rows.map((r) => [r.brand_id, r.n]));
}

/**
 * Add a brand to the animated grid by creating slides in a balanced selection
 * of tiles. Picks the tiles with the fewest existing slides so the grid stays
 * even. Defaults to 3 tiles (matching the typical 3-5 appearances of the
 * original brands).
 *
 * Returns the number of tiles the brand was added to.
 */
function distributeToGrid(brandId, count = 3) {
  const brand = brands.find(brandId);
  if (!brand) return 0;

  // Tiles the brand already appears in - skip those.
  const existing = new Set(
    db
      .all('SELECT tile_id FROM brand_tile_slides WHERE brand_id = ?', [brandId])
      .map((r) => r.tile_id)
  );

  // All visible tiles, sorted by slide count ascending (fewest first).
  const eligible = tiles
    .list({ visibleOnly: true })
    .filter((t) => !existing.has(t.id))
    .map((t) => ({
      ...t,
      slideCount: db.get(
        'SELECT COUNT(*) AS n FROM brand_tile_slides WHERE tile_id = ?',
        [t.id]
      ).n
    }))
    .sort((a, b) => a.slideCount - b.slideCount);

  const toAdd = eligible.slice(0, count);

  for (const tile of toAdd) {
    const maxPos = db.get(
      'SELECT COALESCE(MAX(position), -1) AS m FROM brand_tile_slides WHERE tile_id = ?',
      [tile.id]
    ).m;
    db.run(
      `INSERT INTO brand_tile_slides (tile_id, brand_id, data_logo, position, is_visible)
       VALUES (?, ?, '', ?, 1)`,
      [tile.id, brandId, maxPos + 1]
    );
  }

  return toAdd.length;
}

/**
 * Remove a brand from every grid slot it appears in.
 * Returns the number of slides deleted.
 */
function removeFromGrid(brandId) {
  const result = db.run('DELETE FROM brand_tile_slides WHERE brand_id = ?', [brandId]);
  return result.changes || 0;
}

module.exports = {
  brands: {
    ...brands,
    published: () => brands.list({ visibleOnly: true }),
    usageCounts,
    distributeToGrid,
    removeFromGrid
  },
  tiles: {
    ...tiles,
    slideCounts
  },
  slides: {
    ...slides,
    forTile: slidesFor
  },
  publishedGrid
};
