'use strict';

const express = require('express');

const { config } = require('../config');
const auth = require('../middleware/auth');
const { csrf, verifyCsrf } = require('../middleware/csrf');
const { upload } = require('../middleware/upload');
const { resources, navigation, rowLabel } = require('../admin/resources');
const fields = require('../admin/fields');
const portfolio = require('../models/portfolio');
const services = require('../models/services');
const brands = require('../models/brands');

const router = express.Router();

/**
 * Shared view locals. Registered before the CSRF check so that an error raised
 * there still has everything the error template needs.
 */
router.use((req, res, next) => {
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;

  res.locals.adminPath = config.admin.mountPath;
  res.locals.navigation = navigation();
  res.locals.currentResource = null;
  res.locals.formValue = fields.formValue;
  res.locals.resources = resources;
  res.locals.rowLabel = rowLabel;
  next();
});

router.use(csrf);

function flash(req, type, message) {
  req.session.flash = { type, message };
}

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------
router.get('/login', auth.redirectIfAuthenticated, (req, res) => {
  res.render('admin/login', { title: 'Sign in', error: null, username: '' });
});

router.post('/login', auth.redirectIfAuthenticated, (req, res) => {
  const { username, password } = req.body || {};

  if (auth.tooManyAttempts(req)) {
    return res.status(429).render('admin/login', {
      title: 'Sign in',
      error: 'Too many failed attempts. Try again later.',
      username: ''
    });
  }

  if (!auth.verifyCredentials(username, password)) {
    auth.recordFailure(req);
    return res.status(401).render('admin/login', {
      title: 'Sign in',
      error: 'Incorrect username or password.',
      username: ''
    });
  }

  auth.clearAttempts(req);
  const returnTo = req.session.returnTo;

  // A new session id on privilege change closes off session fixation.
  return req.session.regenerate((err) => {
    if (err) throw err;
    req.session.admin = { username: config.admin.username, since: Date.now() };
    req.session.save(() => res.redirect(returnTo || config.admin.mountPath));
  });
});

router.post('/logout', auth.requireAuth, (req, res) => {
  req.session.destroy(() => res.redirect(config.admin.mountPath + '/login'));
});

// Everything below requires a signed-in admin.
router.use(auth.requireAuth);

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
router.get('/', (req, res) => {
  const summary = Object.values(resources)
    .filter((r) => !r.hidden)
    .map((r) => ({
      resource: r,
      total: r.model.count(),
      visible: r.model.count({ visibleOnly: true })
    }));

  res.render('admin/dashboard', { title: 'Dashboard', summary });
});

// ---------------------------------------------------------------------------
// Generic resource handling
// ---------------------------------------------------------------------------

/** Resolves `:resource` once for every route below. */
router.param('resource', (req, res, next, key) => {
  const resource = resources[key];
  if (!resource) {
    const err = new Error('Unknown content type.');
    err.status = 404;
    return next(err);
  }
  req.resource = resource;
  res.locals.currentResource = resource;
  return next();
});

/**
 * Blocks adding and removing rows of a fixed resource.
 *
 * Enforced here rather than only hiding the buttons: every key in `page-text`
 * is referenced by name from a template, so a deleted row would render as empty
 * copy on the public site.
 */
function blockIfFixed(req, res, next) {
  if (req.resource.fixedRows) {
    const err = new Error(`${req.resource.title} rows cannot be added or deleted, only edited.`);
    err.status = 403;
    return next(err);
  }
  return next();
}

/** The parent row a nested resource belongs to, if any. */
function parentOf(req) {
  const resource = req.resource;
  if (!resource.parentResource) return null;

  const id = req.query[resource.parentKey] || req.body[resource.parentKey];
  const parent = resources[resource.parentResource].model.find(id);
  if (!parent) {
    const err = new Error('That section no longer exists.');
    err.status = 404;
    throw err;
  }
  return parent;
}

function listUrl(resource, parent) {
  const base = `${config.admin.mountPath}/${resource.key}`;
  return parent ? `${base}?${resource.parentKey}=${parent.id}` : base;
}

/**
 * Where to send the browser after an in-place action (toggle, move).
 *
 * Returns to the referring page so filters and scroll position survive, but only
 * when that page is inside the admin - an attacker-supplied Referer must not
 * turn this into an open redirect.
 */
function backTo(req, resource, row) {
  const referer = req.get('Referer');
  if (referer) {
    try {
      const url = new URL(referer, `${req.protocol}://${req.get('host')}`);
      if (url.host === req.get('host') && url.pathname.startsWith(config.admin.mountPath)) {
        return url.pathname + url.search;
      }
    } catch {
      /* fall through to the resource list */
    }
  }

  const parent =
    resource.parentResource && row
      ? resources[resource.parentResource].model.find(row[resource.parentKey])
      : null;
  return listUrl(resource, parent);
}

/**
 * Middleware chain for the two routes that accept file uploads.
 *
 * Ordering matters: multer must parse the multipart body before the CSRF token
 * is readable, so verification is deferred until after it. `requireAuth` has
 * already run by this point, so an anonymous request can never reach multer and
 * write a file.
 */
const withUploads = [
  (req, res, next) => upload.fields(fields.uploadFields(req.resource))(req, res, next),
  verifyCsrf
];

/** Guards the deferred-CSRF invariant rather than relying on route ordering. */
function assertCsrfChecked(req) {
  if (req.csrfDeferred && !req.csrfChecked) {
    throw Object.assign(new Error('CSRF token was never verified for this upload.'), {
      status: 500
    });
  }
}

/** Extra display data the list view needs beyond the raw rows. */
function decorateRows(resource, rows) {
  if (resource.key === 'portfolio-categories') {
    const counts = portfolio.categories.projectCounts();
    return rows.map((r) => ({ ...r, projectCount: counts.get(r.id) || 0 }));
  }

  if (resource.key === 'service-sections') {
    const counts = services.sections.itemCounts();
    return rows.map((r) => ({ ...r, itemCount: counts.get(r.id) || 0 }));
  }

  if (resource.key === 'brands') {
    const usage = brands.brands.usageCounts();
    return rows.map((r) => ({ ...r, usage: usage.get(r.id) || 0 }));
  }

  if (resource.key === 'brand-tiles') {
    const counts = brands.tiles.slideCounts();
    return rows.map((r) => ({
      ...r,
      itemCount: counts.get(r.id) || 0,
      slideSummary: brands.slides
        .forTile(r.id)
        .map((s) => s.brand_name)
        .join(', ')
    }));
  }

  if (resource.key === 'brand-tile-slides') {
    const names = new Map(brands.brands.list().map((b) => [b.id, b.name]));
    return rows.map((r) => ({ ...r, brand: names.get(r.brand_id) || '(deleted brand)' }));
  }

  return rows;
}

router.get('/:resource', (req, res) => {
  const resource = req.resource;
  const parent = parentOf(req);
  const search = (req.query.q || '').toString().trim();
  const visibility = (req.query.visibility || '').toString();

  let rows;
  if (resource.key === 'portfolio-projects') {
    rows = portfolio.projects.listWithCategory({
      search,
      visibility,
      categoryId: req.query.category || null
    });
  } else {
    const where = parent ? { [resource.parentKey]: parent.id } : {};
    rows = resource.model.list({ search, where });
    if (visibility === 'visible') rows = rows.filter((r) => r.is_visible);
    if (visibility === 'hidden') rows = rows.filter((r) => !r.is_visible);
  }

  res.render('admin/list', {
    title: resource.title,
    resource,
    parent,
    rows: decorateRows(resource, rows),
    search,
    visibility,
    categoryId: req.query.category || '',
    categories: resource.key === 'portfolio-projects' ? portfolio.categories.list() : [],
    listUrl: listUrl(resource, parent)
  });
});

/**
 * Drag-and-drop reordering. Called with the full list of ids in their new order.
 * Registered before `/:resource/:id` so "reorder" is not read as a row id.
 */
router.post('/:resource/reorder', (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
  const moved = req.resource.model.reorder(ids);
  res.json({ ok: true, reordered: moved });
});

router.get('/:resource/new', blockIfFixed, (req, res) => {
  const resource = req.resource;
  const parent = parentOf(req);

  res.render('admin/form', {
    title: `New ${resource.singular.toLowerCase()}`,
    resource,
    parent,
    row: null,
    values: null,
    errors: {},
    listUrl: listUrl(resource, parent)
  });
});

router.post(
  '/:resource',
  blockIfFixed,
  withUploads,
  (req, res) => {
    assertCsrfChecked(req);

    const resource = req.resource;
    const parent = parentOf(req);
    const { values, errors } = fields.parse(resource, req, null);

    if (errors.any) {
      return res.status(422).render('admin/form', {
        title: `New ${resource.singular.toLowerCase()}`,
        resource,
        parent,
        row: null,
        values: req.body,
        errors: errors.fields,
        listUrl: listUrl(resource, parent)
      });
    }

    if (parent) values[resource.parentKey] = parent.id;
    const created = resource.model.create(values);

    flash(req, 'success', `${resource.singular} "${rowLabel(resource, created)}" created.`);
    return res.redirect(listUrl(resource, parent));
  }
);

router.get('/:resource/:id/edit', (req, res, next) => {
  const resource = req.resource;
  const row = resource.model.find(req.params.id);
  if (!row) return next(Object.assign(new Error('Not found.'), { status: 404 }));

  const parent = resource.parentResource
    ? resources[resource.parentResource].model.find(row[resource.parentKey])
    : null;

  return res.render('admin/form', {
    title: `Edit ${resource.singular.toLowerCase()}`,
    resource,
    parent,
    row,
    values: null,
    errors: {},
    listUrl: listUrl(resource, parent)
  });
});

router.post(
  '/:resource/:id',
  withUploads,
  (req, res, next) => {
    assertCsrfChecked(req);

    const resource = req.resource;
    const row = resource.model.find(req.params.id);
    if (!row) return next(Object.assign(new Error('Not found.'), { status: 404 }));

    const parent = resource.parentResource
      ? resources[resource.parentResource].model.find(row[resource.parentKey])
      : null;

    const { values, errors } = fields.parse(resource, req, row);

    if (errors.any) {
      return res.status(422).render('admin/form', {
        title: `Edit ${resource.singular.toLowerCase()}`,
        resource,
        parent,
        row,
        values: req.body,
        errors: errors.fields,
        listUrl: listUrl(resource, parent)
      });
    }

    resource.model.update(row.id, values);
    flash(req, 'success', `${resource.singular} updated.`);
    return res.redirect(listUrl(resource, parent));
  }
);

router.post('/:resource/:id/delete', blockIfFixed, (req, res, next) => {
  const resource = req.resource;
  const row = resource.model.find(req.params.id);
  if (!row) return next(Object.assign(new Error('Not found.'), { status: 404 }));

  const parent = resource.parentResource
    ? resources[resource.parentResource].model.find(row[resource.parentKey])
    : null;

  resource.model.remove(row.id);
  flash(req, 'success', `${resource.singular} deleted.`);
  return res.redirect(listUrl(resource, parent));
});

router.post('/:resource/:id/visibility', (req, res, next) => {
  const resource = req.resource;
  const row = resource.model.find(req.params.id);
  if (!row) return next(Object.assign(new Error('Not found.'), { status: 404 }));

  const updated = resource.model.toggleVisibility(row.id);

  if (req.accepts(['html', 'json']) === 'json') {
    return res.json({ id: updated.id, is_visible: updated.is_visible });
  }

  flash(req, 'success', updated.is_visible ? `${resource.singular} is now visible.` : `${resource.singular} is now hidden.`);
  return res.redirect(backTo(req, resource, row));
});

router.post('/:resource/:id/move', (req, res, next) => {
  const resource = req.resource;
  const row = resource.model.find(req.params.id);
  if (!row) return next(Object.assign(new Error('Not found.'), { status: 404 }));

  const direction = req.body.direction === 'up' ? 'up' : 'down';
  const where = resource.parentKey ? { [resource.parentKey]: row[resource.parentKey] } : {};
  resource.model.move(row.id, direction, where);

  return res.redirect(backTo(req, resource, row));
});

module.exports = router;
