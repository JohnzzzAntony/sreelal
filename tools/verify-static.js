'use strict';

/**
 * Checks the static export in dist/ is self-contained and complete.
 *
 *   npm run build:static && npm run verify:static
 *
 * A static host has no routing and no fallbacks, so anything the pages reference
 * has to exist as a file next to them. This walks every local href and src and
 * fails on the first one that does not resolve.
 */

const fs = require('fs');
const path = require('path');

const { config } = require('../app/config');
const portfolio = require('../app/models/portfolio');

const DIST = path.resolve(config.paths.root, process.env.STATIC_OUT_DIR || 'dist');

let failures = 0;

function fail(message) {
  failures += 1;
  console.error('  FAIL  ' + message);
}

function ok(message) {
  console.log('  ok    ' + message);
}

if (!fs.existsSync(DIST)) {
  console.error(`No ${DIST}. Run "npm run build:static" first.`);
  process.exit(1);
}

const pages = fs.readdirSync(DIST).filter((f) => f.endsWith('.html'));

// -- One page per visible project, plus the three shared pages ---------------
const projects = portfolio.projects.published();
for (const project of projects) {
  const file = `portfolio-details-${project.slug}.html`;
  if (!fs.existsSync(path.join(DIST, file))) fail(`missing page for "${project.slug}"`);
}
for (const file of ['index.html', 'services.html', 'portfolio.html', 'about.html', 'contact.html']) {
  if (!fs.existsSync(path.join(DIST, file))) fail(`missing ${file}`);
}
if (!failures) ok(`${projects.length} project pages + the shared pages are present`);

// -- Nothing may depend on the server ---------------------------------------
for (const page of pages) {
  const html = fs.readFileSync(path.join(DIST, page), 'utf8');
  if (html.includes('portfolio-details.html?slug=')) {
    fail(`${page} still uses a query-string project URL, which a static host cannot route`);
  }
  if (/href="\/admin/.test(html)) fail(`${page} links to the admin, which is not part of the export`);
}
if (!failures) ok('no page depends on server-side routing');

// -- Every local reference resolves ------------------------------------------
let checked = 0;
const missing = new Map();

for (const page of pages) {
  const html = fs.readFileSync(path.join(DIST, page), 'utf8');
  const refs = [...html.matchAll(/(?:href|src)="([^"]+)"/g)]
    .map((m) => m[1])
    .filter((r) => r && !/^(https?:|mailto:|tel:|data:|#|\/\/)/.test(r));

  for (const ref of new Set(refs)) {
    const clean = ref.split('?')[0].split('#')[0];
    if (!clean) continue;
    checked += 1;

    const target = path.resolve(DIST, clean);
    if (!target.startsWith(DIST) || !fs.existsSync(target)) {
      if (!missing.has(clean)) missing.set(clean, new Set());
      missing.get(clean).add(page);
    }
  }
}

for (const [ref, onPages] of missing) {
  fail(`broken reference "${ref}" on ${[...onPages].slice(0, 3).join(', ')}`);
}
if (!missing.size) ok(`${checked} local references across ${pages.length} pages all resolve`);

if (failures) {
  console.error(`\n${failures} problem(s) in the static export.`);
  process.exit(1);
}

console.log('\nThe static export is self-contained.');
