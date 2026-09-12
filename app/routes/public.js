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

// Unmanaged pages, served verbatim.
router.get('/about.html', staticPage('about.html'));
router.get('/contact.html', staticPage('contact.html'));
router.get('/portfolio-details.html', staticPage('portfolio-details.html'));

module.exports = router;
