'use strict';

/**
 * Renders the whole site to plain HTML in dist/, so it can be hosted anywhere
 * that serves files - GitHub Pages, Netlify, Cloudflare Pages, or the existing
 * PHP host - with no Node process running.
 *
 *   npm run build:static
 *
 * The admin still needs `npm start`, but only on your own machine while you are
 * editing. The workflow is: edit locally -> build -> upload dist/.
 *
 * The one difference from the served site is the project URLs. A static host
 * cannot route `portfolio-details.html?slug=krooqi`, so each project is written
 * to its own file instead. The templates are untouched: they call `detailUrl()`
 * from the page data, and this build passes a different one.
 */

const fs = require('fs');
const path = require('path');
const ejs = require('ejs');

const { config } = require('../app/config');
const { migrate } = require('../app/db');
const pageData = require('../app/lib/pageData');
const portfolio = require('../app/models/portfolio');

const OUT = path.join(config.paths.root, process.env.STATIC_OUT_DIR || 'dist');
const VIEWS = path.join(config.paths.views, 'public');

/** Filename a project's page is written to. Root level, so relative asset paths still resolve. */
const staticDetailUrl = (project) => `portfolio-details-${project.slug}.html`;

/**
 * Rewrites the served site's project URLs to their static filenames.
 *
 * Links typed into the admin - a case study pointing at a project, say - are
 * stored in the served form. The templates cannot rewrite those because they are
 * opaque strings, so it happens here, once, over the rendered HTML.
 */
function rewriteProjectLinks(html) {
  return (
    html
      .replace(
        /portfolio-details\.html\?slug=([a-z0-9-]+)/g,
        (match, slug) => `portfolio-details-${slug}.html`
      )
      // A slugless link has no project to point at; the server answers it with a
      // redirect to the listing, so match that rather than leave a dead file.
      .replace(/(href=")portfolio-details\.html(")/g, '$1portfolio.html$2')
  );
}

function render(template, locals) {
  const file = path.join(VIEWS, template);
  return rewriteProjectLinks(
    ejs.render(fs.readFileSync(file, 'utf8'), locals, { filename: file })
  );
}

function write(relativePath, html) {
  const target = path.join(OUT, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, html);
  return relativePath;
}

/** Pages the build generates rather than copies. */
const GENERATED = new Set(['index.html', 'services.html', 'portfolio.html', 'portfolio-details.html']);

function copySiteAssets() {
  let count = 0;

  fs.cpSync(config.paths.site, OUT, {
    recursive: true,
    filter: (src) => {
      const rel = path.relative(config.paths.site, src);
      if (!rel) return true;

      // The dynamic pages are written from templates; copying the originals
      // would leave the pre-database content sitting next to them.
      if (GENERATED.has(rel.replace(/\\/g, '/'))) return false;
      if (rel === '.DS_Store') return false;

      if (fs.statSync(src).isFile()) count += 1;
      return true;
    }
  });

  return count;
}

/** Uploaded images, which may live outside the site directory. */
function copyUploads() {
  if (!fs.existsSync(config.paths.uploads)) return 0;

  const target = path.join(OUT, config.uploadUrlPrefix.replace(/^\/+/, ''));
  fs.mkdirSync(target, { recursive: true });

  let count = 0;
  for (const entry of fs.readdirSync(config.paths.uploads, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    fs.copyFileSync(path.join(config.paths.uploads, entry.name), path.join(target, entry.name));
    count += 1;
  }
  return count;
}

function main() {
  migrate();

  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  const assets = copySiteAssets();
  const uploads = copyUploads();

  const pages = [];

  pages.push(write('index.html', render('index.ejs', pageData.homepage())));
  pages.push(write('services.html', render('services.ejs', pageData.servicesPage())));
  pages.push(
    write('portfolio.html', render('portfolio.ejs', {
      ...pageData.portfolioPage(),
      detailUrl: staticDetailUrl
    }))
  );

  for (const project of portfolio.projects.published()) {
    const locals = pageData.projectPage(project.slug);
    if (!locals) continue;
    pages.push(
      write(staticDetailUrl(project), render('portfolio-details.ejs', {
        ...locals,
        detailUrl: staticDetailUrl
      }))
    );
  }

  // Hosts that support a custom 404 will use this; the rest ignore it.
  pages.push(write('404.html', render('index.ejs', pageData.homepage())));

  console.log(`Wrote ${OUT}`);
  console.log(`  ${pages.length} pages`);
  console.log(`  ${assets} asset files`);
  console.log(`  ${uploads} uploaded image(s)`);
  console.log('\nUpload the contents of dist/ to any static host.');
}

main();
