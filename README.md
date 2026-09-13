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

### Hosting without a server

The site can be rendered to plain HTML and hosted anywhere that serves files -
no Node, no database, no running process:

```bash
npm run build:static   # renders everything to dist/
npm run verify:static  # checks dist/ is self-contained
```

You keep the admin on your own machine for editing. See [DEPLOY.md](DEPLOY.md).

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
    detailDefaults.js    Starter content for a project detail page
    fill-details.js      Fills only empty detail fields (non-destructive)
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
  build-static.js        Renders the site to dist/ for hosting without a server
  verify-static.js       Checks the static export resolves every reference
  smoke-test.js          End-to-end checks against a running server
  hash-password.js       Generates ADMIN_PASSWORD_HASH
  find-unused-assets.js  Lists site files nothing references
  prune-assets.js        Moves those files to attic/ (non-destructive)
IAMSREE/                 The original site: css, js, fonts, images, static pages
attic/                   Unreferenced files moved out of the site (git-ignored)
dist/                    Static export (git-ignored)
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
EQUIVALENT  index.html             original 144861 bytes, rendered 144841 bytes
EQUIVALENT  services.html          original 84726 bytes, rendered 84720 bytes
EQUIVALENT  portfolio.html         original 74749 bytes, rendered 74542 bytes
EQUIVALENT  portfolio-details.html original  62002 bytes, rendered 61909 bytes
```

Across all four pages **6 lines out of 4,182** differ, and every one is an entity
spelling: `—` where the original wrote `&mdash;`. The original files are
internally inconsistent about this (`index.html` writes `&mdash;`,
`portfolio.html` writes a literal `—`), so no single escaping rule can reproduce
both. Every page declares `charset="utf-8"`, which makes the two spellings render
identically. Once entities are decoded, **zero** lines differ.

Class names, attribute order, indentation, comments and whitespace are unchanged.

### What `verify` deliberately does not compare

Three kinds of allowance, all enumerated in `tools/parity.js` and printed on
every run, so nothing is waved through silently:

- **Corrections** — defects in the hand-written markup the data model does not
  reproduce. There are six; see below.
- **Masked links** — the project-card hrefs that changed on purpose when detail
  pages were added. They are blanked on *both* sides, so the comparison still
  proves every byte around them is identical.
- **Masked region** — the related-projects strip on the detail page, which is now
  derived from the project list rather than hand-written.

Anything not on those lists still fails the check.

### URLs

The original `.html` URLs are preserved exactly, so every internal link,
`href="portfolio.html"` and bookmark keeps working. `/`, `/index.html`,
`/services.html`, `/portfolio.html` and `/portfolio-details.html?slug=...` render
from the database; `/about.html` and `/contact.html` are served as the original files;
everything else (css, js, fonts, images, the PDF) is served straight from
`IAMSREE/`.

## What is editable

| Section | Content |
|---|---|
| Homepage | Selected Work (case studies), Testimonials, Selected Client Projects, Brand Logos, Brand Grid Layout, Page Text |
| Services page | Service sections, and the deliverables inside each section |
| Portfolio page | Projects (grid card **and** detail page), and the filter categories |

Each entity supports create, edit, delete, show/hide, and reordering by drag or
by arrow buttons. Lists have search and visibility filters; projects also filter
by category.

### Project detail pages

Every project has its own page at `/portfolio-details.html?slug=<slug>`, and
every card in the portfolio grid opens it. The client's own site is still one
click away — it became the "live demo" button on the detail page.

The slug travels as a query parameter rather than a path segment
(`/portfolio/<slug>`) for a concrete reason: every asset and nav link in the
original markup is relative (`css/main.css`, `href="portfolio.html"`), so a page
served one level deep would resolve all of them against `/portfolio/` and break.
Pretty URLs are possible later, but only after rewriting those references.

The whole page is editable under **Portfolio page → Projects**, in the
*Detail page* section of the form: browser title and meta description, subtitle,
live demo link, hero and secondary images, introduction, the Client / Release
date / Role / Category rows, The Solution, Key features, Outcome, the gallery
slider, a testimonial, two closing images, and the related-projects strip.

All fourteen pages render the same nine structural blocks. Only Krooqi was
written as a full case study in the original site, so the other thirteen were
given the same structure with **placeholder copy to replace** — "Add a short
description of the solution you designed for SEDCO." and so on — and their own
cover image standing in for the secondary, gallery and closing images.

That placeholder text is public until it is replaced. `app/db/detailDefaults.js`
holds it, under two rules:

- **Nothing asserts a fact about a client.** Placeholders read as instructions to
  the editor, never as case-study claims — invented outcomes on a real portfolio
  would be worse than a short page.
- **Images reuse the project's own cover**, the only image every project has.

Two things are deliberately left empty, because filling them would be wrong
rather than merely incomplete:

- **The testimonial**, which would otherwise credit a real person with words
  about a project they never discussed. Pick one per project in the admin.
- **The second closing image**, because a second full-width copy of the same
  picture directly beneath the first reads as a bug, not a placeholder.

Sections still collapse when genuinely empty, so clearing a field removes its
heading rather than leaving one over blank space.

```bash
npm run db:fill-details            # report what a new project is missing
npm run db:fill-details -- --apply # give it the full structure
```

Unlike `db:seed --force`, this only writes columns that are still empty — it
never overwrites anything entered in the admin, and is safe to re-run.

Two per-project fields control the related strip: **Related projects** (one slug
per line, empty means "the next few projects automatically") and
**Related-strip image** (the crop used when this project appears in someone
else's strip, falling back to the cover image).

### Card sizing

The fourteen portfolio covers were exported at **seven different aspect ratios**
(770×560, 101×272, 499×310, 435×431, 435×509, 435×552, 435×336). The card markup
sizes the image with `w-100` and no height, so each card took the shape of its
own image and the grid came out ragged.

`IAMSREE/css/site-overrides.css` pins one ratio (770:560) and crops to fill, on
both the portfolio grid and the related-projects strip, so every card is the same
size whatever gets uploaded later. It is a **new file** loaded after `main.css` —
no original stylesheet was edited.

Four covers are only 101px wide and get upscaled about 7.6× to fill a card:
Al Saafah Dates, Al Ershad Online, Hotpack Global and Empower e-Services. They
will look soft until they are re-exported at roughly 770×560 and re-uploaded
under **Portfolio page → Projects → Cover image**.

### Caching

Rendered pages are served `Cache-Control: no-store`. Without it a browser keeps
showing the page from before an edit, which is indistinguishable from the edit
not having worked. Static assets are still cached normally.

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

### Deliberate content changes

Six, all listed in `tools/parity.js` and all in `alt`/image attributes rather
than anything visible in layout. Remove an entry there to make the check enforce
the original spelling again.

1. **A typo.** Of the thirty brand logo `<img>` tags, one reads
   `alt="Sreelalal C K"` where the rest read `alt="Sreelal C K"`. Alt text
   describes the logo, so it is stored once per brand rather than once per grid
   slot, and that single misspelling is not reproduced.

2. **Detail page image alt text** (four images). The original labelled every
   project screenshot `alt="Sreelal C K"` — the designer's name, not the image's
   content. Alt is now derived from the project, so Krooqi's screenshots read
   `alt="Krooqi"`. On a template serving fourteen projects the old value would
   have been wrong on all of them.

3. **The detail page testimonial avatar.** The quote is now linked to the
   testimonial record it duplicates, so it uses that record's avatar
   (`avatar-10`) rather than the page's own copy (`avatar-20`). Same person,
   different crop; swap it in **Testimonials** if you prefer the other one.

### Fields that are stored but not displayed

The spec asked for some fields the current design has no slot for. They are
stored and editable, and the admin labels them as such, but rendering them would
change the design:

- Case study **short description** — the card shows an overlay heading and
  subheading instead.
- Testimonial **role/title** — the card shows the company only.

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
| `portfolio_projects` | Portfolio grid cards and their detail pages |
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
| `npm run db:seed -- --force` | Replace all managed content with the original page content. **Destroys admin edits.** |
| `npm run db:fill-details -- --apply` | Fill only the empty detail-page fields. Never overwrites. |
| `npm run verify` | Check the rendered pages against the original files. |
| `npm run build:static` | Render the whole site to dist/ as plain HTML. |
| `npm run verify:static` | Check dist/ is self-contained. |
| `npm run hash -- "pw"` | Generate a password hash. |
| `npm run build:templates` | Regenerate `seed-data.json` and the public templates from `IAMSREE/*.html`. |

`tools/smoke-test.js` runs 56 end-to-end checks against a running server —
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

- The git repository this was found in is rooted at the user's home directory and
  has no commits. Initialising a repository in this project directory before
  committing is worth doing.
