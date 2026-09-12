'use strict';

const caseStudies = require('../models/caseStudies');
const testimonials = require('../models/testimonials');
const clientProjects = require('../models/clientProjects');
const brands = require('../models/brands');
const settings = require('../models/settings');
const services = require('../models/services');
const portfolio = require('../models/portfolio');
const { esc, safeUrl } = require('./html');

/**
 * View models for the public pages.
 *
 * Kept separate from the routes so the parity checker can render the exact
 * same locals the server uses, rather than an approximation of them.
 */

const helpers = { esc, safeUrl };

function homepage() {
  const values = settings.all();

  return {
    ...helpers,
    // Falls back to the stored default when a key was emptied, so a cleared
    // field never renders as a blank heading.
    setting: (key, fallback = '') => values[key] || fallback,
    caseStudies: caseStudies.published(),
    testimonials: testimonials.published(),
    clientProjects: clientProjects.published(),
    brandTiles: brands.publishedGrid()
  };
}

function servicesPage() {
  return {
    ...helpers,
    serviceSections: services.publishedWithItems()
  };
}

function portfolioPage() {
  return {
    ...helpers,
    portfolioCategories: portfolio.categories.published(),
    portfolioProjects: portfolio.projects.published()
  };
}

module.exports = { homepage, servicesPage, portfolioPage, helpers };
