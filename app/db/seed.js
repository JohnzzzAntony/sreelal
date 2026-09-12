'use strict';

/**
 * Loads seed-data.json - the content lifted out of the original static pages -
 * into the database.
 *
 * Idempotent by design: it refuses to touch a table that already holds rows
 * unless --force is passed, so re-running setup on a live site cannot wipe
 * edits made through the admin.
 *
 *   node app/db/seed.js          seed only empty tables
 *   node app/db/seed.js --force  wipe managed tables and reseed from scratch
 */

const fs = require('fs');
const path = require('path');

const db = require('./index');
const { migrate } = require('./index');

const FORCE = process.argv.includes('--force');
const DATA_FILE = path.join(__dirname, 'seed-data.json');

function columnsOf(table) {
  return db.all(`PRAGMA table_info(${table})`).map((c) => c.name);
}

function insert(table, row) {
  const allowed = new Set(columnsOf(table));
  const names = Object.keys(row).filter((k) => allowed.has(k));
  const result = db.run(
    `INSERT INTO ${table} (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`,
    names.map((n) => row[n])
  );
  return result.lastInsertRowid;
}

function isEmpty(table) {
  return db.get(`SELECT COUNT(*) AS n FROM ${table}`).n === 0;
}

function main() {
  migrate();

  if (!fs.existsSync(DATA_FILE)) {
    console.error(
      'Missing ' + DATA_FILE + '\nRegenerate it with: node tools/extract-content.js'
    );
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));

  // Children first, so foreign keys never block a delete.
  const managed = [
    'service_items',
    'service_sections',
    'portfolio_projects',
    'portfolio_categories',
    'brand_tile_slides',
    'brand_tiles',
    'brands',
    'site_settings',
    'client_projects',
    'testimonials',
    'case_studies'
  ];

  if (FORCE) {
    db.transaction(() => managed.forEach((t) => db.run(`DELETE FROM ${t}`)));
    console.log('Cleared managed tables (--force).');
  }

  const skipped = [];

  db.transaction(() => {
    if (isEmpty('case_studies')) {
      data.caseStudies.forEach((row) => insert('case_studies', row));
      console.log('  case_studies        : ' + data.caseStudies.length);
    } else skipped.push('case_studies');

    if (isEmpty('testimonials')) {
      data.testimonials.forEach((row) => insert('testimonials', row));
      console.log('  testimonials        : ' + data.testimonials.length);
    } else skipped.push('testimonials');

    if (isEmpty('client_projects')) {
      data.clientProjects.forEach((row) => insert('client_projects', row));
      console.log('  client_projects     : ' + data.clientProjects.length);
    } else skipped.push('client_projects');

    if (isEmpty('brands')) {
      // Insert the logo library first, then resolve each grid slide to it.
      const brandIdByImage = new Map();
      data.brands.brands.forEach((brand) => {
        brandIdByImage.set(brand.image, insert('brands', brand));
      });

      let slideCount = 0;
      data.brands.tiles.forEach((entry) => {
        const tileId = insert('brand_tiles', entry.tile);
        entry.slides.forEach((slide) => {
          const { image, ...rest } = slide;
          insert('brand_tile_slides', {
            ...rest,
            tile_id: tileId,
            brand_id: brandIdByImage.get(image)
          });
          slideCount += 1;
        });
      });

      console.log(
        '  brands              : ' + data.brands.brands.length +
          ' (' + data.brands.tiles.length + ' tiles, ' + slideCount + ' slides)'
      );
    } else skipped.push('brands');

    if (isEmpty('site_settings')) {
      data.settings.forEach((row) => insert('site_settings', row));
      console.log('  site_settings       : ' + data.settings.length);
    } else skipped.push('site_settings');

    if (isEmpty('service_sections')) {
      let itemCount = 0;
      data.services.forEach((entry) => {
        const sectionId = insert('service_sections', entry.section);
        entry.items.forEach((item) => {
          insert('service_items', { ...item, section_id: sectionId });
          itemCount += 1;
        });
      });
      console.log('  service_sections    : ' + data.services.length + ' (' + itemCount + ' items)');
    } else skipped.push('service_sections');

    if (isEmpty('portfolio_categories')) {
      data.portfolio.categories.forEach((row) => insert('portfolio_categories', row));
      console.log('  portfolio_categories: ' + data.portfolio.categories.length);
    } else skipped.push('portfolio_categories');

    if (isEmpty('portfolio_projects')) {
      // Resolve each project's category slug to the row just inserted.
      const bySlug = new Map(
        db.all('SELECT id, slug FROM portfolio_categories').map((c) => [c.slug, c.id])
      );
      data.portfolio.projects.forEach((project) => {
        const { category_slug: categorySlug, ...rest } = project;
        insert('portfolio_projects', {
          ...rest,
          category_id: bySlug.get(categorySlug) || null
        });
      });
      console.log('  portfolio_projects  : ' + data.portfolio.projects.length);
    } else skipped.push('portfolio_projects');
  });

  if (skipped.length) {
    console.log(
      '\nSkipped (already populated): ' + skipped.join(', ') +
        '\nRe-run with --force to replace existing content.'
    );
  }
}

main();
