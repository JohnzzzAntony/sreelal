# IAMSREE — portfolio site with admin panel

The public site is unchanged. What was hardcoded HTML is now stored in SQLite and
rendered back through templates that reproduce the original markup, plus an admin
panel at `/admin` for editing it.

## Quick start

```bash
npm install
cp .env.example .env
npm run hash -- "a long admin password"   # paste the output into .env
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"  # SESSION_SECRET
npm run setup                             # create the database, load current content
npm start
```

Then open <http://localhost:3000/> for the site and <http://localhost:3000/admin>
to sign in.

## What the audit found

The starting point was a purely static site: six hand-written HTML files, plus
Bootstrap 5, jQuery, Isotope, Swiper and Magnific Popup. No server, no build step,
no database, no authentication, no upload handling, and no `package.json`.

Because there was no existing backend to be consistent with, one had to be
introduced. The stack was chosen to add as little as possible:

| Concern | Choice | Why |
|---|---|---|
| Runtime | Node 22.5+ | Required for the built-in `node:sqlite`. |
| Server | Express 4 | Minimal, matches the plain-HTML nature of the site. |
| Templates | EJS | Closest thing to raw HTML, so the original markup carries over verbatim. |
| Database | SQLite via `node:sqlite` | Built into Node — no native compilation, no separate database server, deploys anywhere. |
| Auth | Single admin, bcrypt hash in env | No user table to breach, no password-reset surface. |
| Uploads | multer, written into `IAMSREE/images/uploads/` | Stored paths are ordinary site-relative URLs, identical in shape to every existing `src` in the markup. |

Total runtime dependencies: six, all pure JavaScript. `npm audit` reports zero
vulnerabilities.

## Layout

```
app/
  server.js              Express app: static, sessions, routes, error handling
  config.js              Environment configuration and startup validation
  db/
    schema.sql           Single source of truth for the schema
    index.js             Connection, migrations, transactions
    seed.js              Loads seed-data.json (idempotent; --force to replace)
    seed-data.json       The original page content, extracted once
  models/
    repository.js        Shared CRUD + ordering used by every entity
    *.js                 One module per entity
  admin/
    resources.js         Declarative definition of every managed content type
    fields.js            Form parsing and validation per field type
  middleware/
    auth.js  csrf.js  upload.js
  lib/
    html.js  validate.js  pageData.js  sessionStore.js
  routes/
    public.js  admin.js
  views/
    public/              Generated from the original pages
    admin/               Admin UI
  public/                admin.css, admin.js (served at /admin-assets)
tools/
  extract-content.js     Lifts content out of the original HTML into seed-data.json
  build-templates.js     Generates the public templates from the original HTML
  parity.js              Shared parity rules and the list of deliberate corrections
  verify-parity.js       Proves the rendered pages match the originals
  smoke-test.js          End-to-end checks against a running server
  hash-password.js       Generates ADMIN_PASSWORD_HASH
IAMSREE/                 The original site: css, js, fonts, images, static pages
IAMSREE.orig/            Untouched reference copy
```

## How the public pages stayed identical

No public markup was rewritten by hand. `tools/build-templates.js` reads the
original HTML, finds each repeated block, and replaces just that block with a
loop — every other byte is carried across. Each replacement is anchored to a
literal string and fails loudly if it is missing or ambiguous, so the conversion
cannot silently drop content.

`npm run verify` renders each page with the seeded content and compares it to the
original file:

```
EQUIVALENT  index.html      original 144861 bytes, rendered 144871 bytes
EQUIVALENT  services.html   original 84726 bytes, rendered 84720 bytes
EXACT       portfolio.html  original 74749 bytes, rendered 74749 bytes
```

`portfolio.html` is byte-for-byte identical. Across all three pages only **7 lines
of 3,528** differ, and every one is an entity spelling: `&quot;` where the original
wrote `"`, and `—` where it wrote `&mdash;`. The original files are internally
inconsistent about this (`index.html` writes `&mdash;`, `portfolio.html` writes a
literal `—`), so no single escaping rule can reproduce both. Every page declares
`charset="utf-8"`, which makes the two spellings render identically. `verify`
compares entity-decoded documents to prove that.

One further difference is deliberate and listed in `tools/parity.js` — see
[One deliberate content change](#one-deliberate-content-change).

Class names, attribute order, indentation, comments and whitespace are unchanged.

### URLs

The original `.html` URLs are preserved exactly, so every internal link,
`href="portfolio.html"` and bookmark keeps working. `/`, `/index.html`,
`/services.html` and `/portfolio.html` render from the database; `/about.html`,
`/contact.html` and `/portfolio-details.html` are served as the original files;
everything else (css, js, fonts, images, the PDF) is served straight from
`IAMSREE/`.

## What is editable

| Section | Content |
|---|---|
| Homepage | Selected Work (case studies), Testimonials, Selected Client Projects, Brand Logos, Brand Grid Layout, Page Text |
| Services page | Service sections, and the deliverables inside each section |
| Portfolio page | Projects, and the filter categories |

Each entity supports create, edit, delete, show/hide, and reordering by drag or
by arrow buttons. Lists have search and visibility filters; projects also filter
by category.

### The brand wall

The "15+ brands collaborated with" logo wall is split across three screens,
because the markup reuses eight logos across thirty grid slots:

- **Brand Logos** — the logo library. This is where day-to-day edits belong:
  changing a logo here updates every grid slot that uses it, and hiding one
  removes it from the wall everywhere.
- **Brand Grid Layout** — the grid cells and their fade-in delays. Each cell
  cycles through the logos assigned to it. Decorative; rarely needs touching.
- **Page Text** — the heading and the intro sentence beside the grid.

The current logos are absolute URLs on `iamsreelalck.com`, not local files. The
logo field accepts an upload, a local path, or a full URL, so they can be moved
onto this server one at a time without breaking the others.

`Page Text` rows are fixed: each key is read by name from a template, so the
admin lets you edit the values but not add or delete rows. That is enforced
server-side, not just hidden in the UI.

### One deliberate content change

The original markup contains a typo: of the thirty brand logo `<img>` tags, one
has `alt="Sreelalal C K"` where the rest have `alt="Sreelal C K"`. Alt text
describes the logo, so it is stored once per brand rather than once per grid
slot, which means that single misspelling is not reproduced.

It is an invisible accessibility attribute, not a design change, and it is
listed explicitly in `tools/parity.js` so the parity check stays strict about
everything else. Remove the entry there if you would rather keep the original
spelling.

### Fields that are stored but not displayed

The spec asked for some fields the current design has no slot for. They are
stored and editable, and the admin labels them as such, but rendering them would
change the design:

- Case study **short description** — the card shows an overlay heading and
  subheading instead.
- Testimonial **role/title** — the card shows the company only.
- Portfolio **full description** and **gallery images** — these belong to the
  project detail page, which is still a static file (see below).

### Not in scope

`portfolio-details.html` is still static. Portfolio projects already carry the
slug, full description and gallery needed to drive it, so making it dynamic is a
contained follow-up: add a `/portfolio-details.html` route that looks the project
up by slug, and convert that file the same way the other three were converted.

## Schema

Eleven tables plus a session store. `position` is the spec's `order` field
(`order` is reserved in SQL) and `is_visible` is the visibility flag.

| Table | Holds |
|---|---|
| `case_studies` | Homepage Selected Work |
| `testimonials` | Homepage testimonials |
| `client_projects` | Homepage Selected Client Projects |
| `service_sections` / `service_items` | Services page accordion and its bullet lists |
| `brands` / `brand_tiles` / `brand_tile_slides` | Homepage brand logo wall |
| `site_settings` | Editable page copy, keyed by name |
| `portfolio_projects` | Portfolio grid |
| `portfolio_categories` | Portfolio filter buttons |
| `sessions` | Signed-in admin sessions |

`app/db/schema.sql` is the single source of truth. `npm run db:migrate` applies it
and adds any column the file declares that an existing database is missing, so it
is safe to re-run after a schema change.

A few columns exist purely to preserve details of the original design that are not
derivable:

- `testimonials.layout` — the middle card in the original grid puts the name bar
  below the quote; the others put it above.
- `testimonials.column_classes` — the hand-tuned Bootstrap ordering utilities.
- `portfolio_projects.category_label` — the pill on the card, which deliberately
  differs from the filter category (a `mobile` project is labelled "Real Estate UX").
- `cta_label` on case studies and projects — the wording varies per card.

## Security

- All admin routes require a session; unauthenticated requests redirect to the
  login page, and writes are refused.
- Passwords are bcrypt hashed (cost 12). Comparison is constant-time and always
  runs, so timing does not reveal whether a username exists.
- Failed logins are rate limited per IP (8 per 15 minutes by default).
- The session id is regenerated on sign-in, closing off session fixation.
- Session cookies are `httpOnly`, `sameSite=lax`, and `secure` in production.
- CSRF is enforced on every state-changing request with a per-session token.
  Multipart requests are verified after the upload middleware parses the body,
  and the upload routes assert that the check actually ran.
- All input is validated and length-capped before storage; links are restricted
  to relative paths and `http(s)`/`mailto`/`tel`, so `javascript:` and `data:`
  URLs are rejected.
- All output is escaped at render time, so content entered in the admin cannot
  inject markup.
- Uploads are restricted by MIME type and size (5 MB default). The stored
  filename is derived from a slugified stem plus random bytes, and the extension
  comes from the accepted MIME type — the client-supplied name never reaches the
  filesystem path.
- Redirects after in-place actions are restricted to the admin path, so a crafted
  `Referer` cannot turn them into an open redirect.

## Configuration

Everything is environment-driven; see `.env.example` for the full list with
comments. The ones that matter:

| Variable | Notes |
|---|---|
| `SESSION_SECRET` | Required in production, 32+ characters. Startup fails without it. |
| `ADMIN_USERNAME` | Defaults to `admin`. |
| `ADMIN_PASSWORD_HASH` | Generate with `npm run hash -- "password"`. |
| `ADMIN_PASSWORD` | Plaintext, development only — rejected when `NODE_ENV=production`. |
| `ADMIN_PATH` | Where the admin mounts. Defaults to `/admin`. |
| `DATABASE_PATH` | Defaults to `data/site.db`. |
| `UPLOAD_DIR` / `UPLOAD_URL_PREFIX` | Must point at the same place; the default writes into the served site directory. |
| `TRUST_PROXY` | Set to `1` behind a reverse proxy so secure cookies and rate limiting see the real client IP. |

## Scripts

| Command | Does |
|---|---|
| `npm start` | Run the server. |
| `npm run dev` | Run with file watching. |
| `npm run setup` | Migrate and seed. |
| `npm run db:seed -- --force` | Replace all managed content with the original page content. |
| `npm run verify` | Check the rendered pages against the original files. |
| `npm run hash -- "pw"` | Generate a password hash. |
| `npm run build:templates` | Regenerate `seed-data.json` and the public templates from `IAMSREE/*.html`. |

`tools/smoke-test.js` runs 45 end-to-end checks against a running server —
auth, CSRF, CRUD, reordering, visibility, uploads, escaping and page parity:

```bash
npm start &
node tools/smoke-test.js
```

## Deploying

1. Set `NODE_ENV=production`, a real `SESSION_SECRET` and `ADMIN_PASSWORD_HASH`.
2. Run `npm ci --omit=dev` and `npm run setup`.
3. Run behind a TLS-terminating reverse proxy with `TRUST_PROXY=1`. Secure
   cookies require HTTPS.
4. Back up `data/site.db` and `IAMSREE/images/uploads/` — they hold all content
   and every uploaded image. Neither is in git.

The process is stateless apart from those two paths, so any Node host works.

## Notes

- `IAMSREE.orig/` is an untouched copy of the original site, kept for reference.
- The git repository this was found in is rooted at the user's home directory and
  has no commits. Initialising a repository in this project directory before
  committing is worth doing.
