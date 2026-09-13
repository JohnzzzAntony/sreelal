'use strict';

const express = require('express');
const session = require('express-session');
const path = require('path');

const { config, validate } = require('./config');
const { migrate } = require('./db');
const { SqliteStore } = require('./lib/sessionStore');
const pageData = require('./lib/pageData');
const publicRoutes = require('./routes/public');
const adminRoutes = require('./routes/admin');

validate();
migrate();

const app = express();

app.set('view engine', 'ejs');
app.set('views', config.paths.views);
// The public templates carry the original markup's exact whitespace; EJS must
// not touch it.
app.set('view options', { rmWhitespace: false });

if (config.trustProxy) app.set('trust proxy', 1);
app.disable('x-powered-by');

/**
 * Baseline response headers.
 *
 * Deliberately narrow: the public pages load third-party fonts and inline
 * scripts from the original build, so a strict CSP would break them. These
 * headers harden the transport without touching what the pages may load.
 */
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});

/**
 * Rendered pages are never cached by the browser.
 *
 * Their content changes the moment something is saved in the admin, and without
 * this a browser will happily keep showing a page from before the edit - which
 * looks exactly like the change not working. Static assets below are still
 * cached normally; this only covers HTML the server renders.
 */
app.use((req, res, next) => {
  const send = res.render.bind(res);
  res.render = (...args) => {
    res.setHeader('Cache-Control', 'no-store, must-revalidate');
    return send(...args);
  };
  next();
});

app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(express.json({ limit: '1mb' }));

app.use(
  session({
    name: config.session.name,
    secret: config.session.secret,
    store: new SqliteStore({ ttlMs: config.session.maxAgeMs }),
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.isProduction,
      maxAge: config.session.maxAgeMs
    }
  })
);

// Admin-only assets, kept out of the public site directory.
app.use(
  '/admin-assets',
  express.static(path.join(__dirname, 'public'), {
    index: false,
    maxAge: config.isProduction ? '1d' : 0
  })
);

/**
 * Uploaded images, served at the URL their stored paths use.
 *
 * Mounted explicitly so UPLOAD_DIR can point anywhere - in particular at a
 * mounted volume on a host with an otherwise ephemeral filesystem. Registered
 * before the site directory so it still works when the upload directory happens
 * to sit inside it, which is the default.
 */
app.use(
  '/' + config.uploadUrlPrefix.replace(/^\/+|\/+$/g, ''),
  express.static(config.paths.uploads, {
    index: false,
    dotfiles: 'ignore',
    maxAge: config.isProduction ? '7d' : 0
  })
);

app.use(config.admin.mountPath, adminRoutes);
app.use('/', publicRoutes);

// Everything else - css, js, fonts, images, the PDF - is served straight from
// the original site directory. `index: false` keeps it from serving index.html
// for "/", which the routes above own.
app.use(
  express.static(config.paths.site, {
    index: false,
    dotfiles: 'ignore',
    maxAge: config.isProduction ? '7d' : 0
  })
);

// The site has no dedicated 404 page. Render the homepage template rather than
// sending the original index.html file, which still holds the pre-database
// content and would show stale cards after any edit.
app.use((req, res) => {
  res.status(404).render('public/index', pageData.homepage());
});

// eslint-disable-next-line no-unused-vars -- Express identifies error handlers by arity.
app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);

  if (req.path.startsWith(config.admin.mountPath)) {
    if (req.accepts(['html', 'json']) === 'json') {
      return res.status(status).json({ error: err.message });
    }
    return res.status(status).render('admin/error', {
      title: 'Something went wrong',
      message: status >= 500 ? 'An unexpected error occurred.' : err.message,
      status
    });
  }

  return res.status(status).send(status >= 500 ? 'Internal Server Error' : err.message);
});

if (require.main === module) {
  app.listen(config.port, () => {
    console.log(`Site      http://localhost:${config.port}/`);
    console.log(`Admin     http://localhost:${config.port}${config.admin.mountPath}`);
    console.log(`Database  ${config.db.file}`);
  });
}

module.exports = app;
