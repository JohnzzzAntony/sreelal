'use strict';

/**
 * Lists files under IAMSREE/ that nothing references.
 *
 * Searches every place an asset can be named: the site's own HTML, CSS and JS
 * (CSS backgrounds and script-built paths count), the EJS templates, the app
 * source, the docs, and the content stored in the database.
 *
 * Reports only. Deleting is a separate, deliberate step.
 *
 *   node tools/find-unused-assets.js
 */

const fs = require('fs');
const path = require('path');

const { config } = require('../app/config');
const db = require('../app/db');

const SITE = config.paths.site;

/** Every file under the site directory, excluding uploads (owned by the admin). */
function siteAssets() {
  const out = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (full !== config.paths.uploads) walk(full);
      } else {
        out.push(path.relative(SITE, full).split(path.sep).join('/'));
      }
    }
  })(SITE);
  return out;
}

/** Everything that could name an asset, concatenated. */
function searchCorpus(assets) {
  const parts = [];
  const add = (file) => {
    try {
      parts.push(fs.readFileSync(file, 'utf8'));
    } catch {
      /* unreadable files simply contribute nothing */
    }
  };

  for (const rel of assets) {
    if (/\.(css|js|html)$/i.test(rel)) add(path.join(SITE, rel));
  }

  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ejs|js|json|sql|md)$/i.test(entry.name)) add(full);
    }
  })(path.join(config.paths.root, 'app'));

  for (const doc of ['README.md', 'DEPLOY.md']) add(path.join(config.paths.root, doc));

  const tables = [
    'case_studies',
    'testimonials',
    'client_projects',
    'brands',
    'portfolio_projects',
    'service_sections',
    'site_settings'
  ];
  for (const table of tables) {
    try {
      parts.push(JSON.stringify(db.all(`SELECT * FROM ${table}`)));
    } catch {
      /* a table that does not exist yet cannot reference anything */
    }
  }

  return parts.join('\n');
}

const assets = siteAssets();
const corpus = searchCorpus(assets);

// A file counts as referenced if either its path or its bare filename appears -
// scripts and stylesheets often build paths from the name alone.
const unused = assets.filter((rel) => {
  const base = rel.split('/').pop();
  return !corpus.includes(rel) && !corpus.includes(base);
});

let bytes = 0;
for (const rel of unused.sort()) {
  const size = fs.statSync(path.join(SITE, rel)).size;
  bytes += size;
  console.log(`  ${String(size).padStart(9)}  ${rel}`);
}

console.log();
console.log(`${assets.length} files under IAMSREE/, ${unused.length} unreferenced (${(bytes / 1048576).toFixed(1)} MB)`);
