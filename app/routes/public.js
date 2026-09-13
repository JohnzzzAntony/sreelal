'use strict';

const express = require('express');
const path = require('path');

const { config } = require('../config');
const pageData = require('../lib/pageData');

/**
 * Public site routes.
 *
 * The original URLs are preserved exactly - including the `.html` suffix - so
 * every internal link, canonical URL and bookmark in the existing markup keeps
 * working untouched. Pages that hold managed content are rendered from
 * templates; the rest are served as the original files.
 */
const router = express.Router();

const staticPage = (file) => (req, res) => res.sendFile(path.join(config.paths.site, file));

// Managed pages. These must be registered before the static middleware so the
// original .html files on disk are never served in their place.
router.get(['/', '/index.html'], (req, res) => {
  res.render('public/index', pageData.homepage());
});

router.get('/services.html', (req, res) => {
  res.render('public/services', pageData.servicesPage());
});

router.get('/portfolio.html', (req, res) => {
  res.render('public/portfolio', pageData.portfolioPage());
});

/**
 * A project's own page.
 *
 * The slug travels as a query parameter so the URL stays at the site root: every
 * asset and nav link in the markup is relative ("css/main.css", "portfolio.html"),
 * and a path like /portfolio/<slug> would resolve all of them one level deep.
 */
router.get('/portfolio-details.html', (req, res) => {
  const slug = String(req.query.slug || '').trim();

  // No slug: send visitors to the listing rather than guessing a project.
  if (!slug) return res.redirect('/portfolio.html');

  const locals = pageData.projectPage(slug);

  // Answer here rather than falling through: the original portfolio-details.html
  // still sits in the static directory, and passing the request on would serve
  // that stale file for any unknown or hidden project.
  if (!locals) return res.status(404).render('public/portfolio', pageData.portfolioPage());

  return res.render('public/portfolio-details', locals);
});

// Unmanaged pages, served verbatim.
router.get('/about.html', staticPage('about.html'));
router.get('/contact.html', staticPage('contact.html'));

module.exports = router;
