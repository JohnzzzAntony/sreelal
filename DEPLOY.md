# Deploying

## Option 0 — no server at all (recommended if you want free)

The public site is templates over a database, so it can be rendered to plain HTML
once and hosted anywhere that serves files. The admin still exists — you run it
on your own machine while editing, not on the host.

```bash
npm start              # edit content at http://localhost:3000/admin
npm run build:static   # render everything to dist/
npm run verify:static  # check dist/ is self-contained
```

Then upload the contents of `dist/` to GitHub Pages, Netlify, Cloudflare Pages,
Vercel, or the existing PHP host — all free, all fine, because nothing needs to
run. `dist/` is about 50 MB, almost all of it the existing images.

The workflow is: **edit locally → build → upload.** Nothing you publish can be
edited from the public site, which also means there is no admin login exposed to
the internet and nothing to keep patched.

### The one difference

A static host cannot route a query string, so project pages are written as
separate files:

| Served by the app | In `dist/` |
|---|---|
| `portfolio-details.html?slug=krooqi` | `portfolio-details-krooqi.html` |

The build rewrites every link for you, including links typed into the admin. The
templates are unchanged — they call `detailUrl()`, and the build passes a
different one.

Everything else is identical: same markup, same CSS, same 14 project pages, same
related-projects strips.

### What you give up

- **No live editing.** Content changes need a rebuild and re-upload.
- **No contact form handling**, if one is ever added — that needs a server or a
  third-party form service.
- `data/site.db` becomes the master copy of your content. Back it up; without it
  you would be editing HTML by hand again.

---

## If you do want it running as a server

## The one thing that decides everything

This app keeps all its content in two places on disk:

- `data/site.db` — every word and setting in the admin
- `IAMSREE/images/uploads/` — every image you upload

**Most free hosting has an ephemeral filesystem.** The container is rebuilt from
the last deploy on every restart, sleep-wake, or redeploy, and anything written
since is gone. On this app that means every edit you made in the admin silently
reverts to the seeded content.

So the only question that matters when picking a free host is: *does it give me a
persistent disk?*

| Host | Free? | Persistent disk | Verdict |
|---|---|---|---|
| Oracle Cloud Always Free | Yes, no expiry | Yes, a real VM disk | **Best free option** |
| Google Cloud `e2-micro` free tier | Yes, one region | Yes | Equivalent, slightly smaller |
| Fly.io | Small monthly allowance | Yes, volumes | Easiest deploy of the three |
| Railway | No — trial credit, then paid | Yes, volumes | Simplest if you are happy to pay |
| Render free | Yes | **No** — disks are paid | Loses all edits on restart |
| Vercel / Netlify / Cloudflare | Yes | **No** — serverless | Will not run this at all |
| GitHub Pages / S3 | Yes | No server at all | Will not run this |

Free-tier terms change often. Check the current terms before committing.

---

## Option A — Oracle Cloud Always Free (recommended)

A genuinely free, non-expiring VM with a real disk. Needs a card for identity
verification; the Always Free resources are not charged.

Create an **Ampere A1 (ARM)** or **VM.Standard.E2.1.Micro** instance running
Ubuntu, open ports 80 and 443 in its security list, then:

```bash
# On the VM
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs nginx certbot python3-certbot-nginx git

sudo mkdir -p /srv/iamsree && sudo chown $USER /srv/iamsree
# Copy the project up from your machine, e.g.:
#   rsync -av --exclude node_modules --exclude data --exclude .env ./ user@SERVER:/srv/iamsree/
cd /srv/iamsree
npm ci --omit=dev

cp .env.example .env
npm run hash -- "a long admin password"        # paste result into .env
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Set in `.env`: `NODE_ENV=production`, `TRUST_PROXY=1`, the `SESSION_SECRET`, and
the `ADMIN_PASSWORD_HASH`. Then:

```bash
npm run setup
npm run db:fill-details -- --apply
sudo cp deploy/iamsree.service /etc/systemd/system/
sudo systemctl enable --now iamsree

sudo cp deploy/nginx.conf /etc/nginx/sites-available/iamsree
sudo ln -sf /etc/nginx/sites-available/iamsree /etc/nginx/sites-enabled/iamsree
sudo nginx -t && sudo systemctl reload nginx

sudo certbot --nginx -d iamsreelalck.com -d www.iamsreelalck.com
```

Certbot supplies the HTTPS that the admin login requires, and nginx sends the
`X-Forwarded-Proto` header that `TRUST_PROXY=1` reads.

## Option B — Railway

Railway builds from the `Dockerfile`, injects its own `PORT`, and terminates TLS
in front of the container. `railway.toml` points it at the Dockerfile and pins a
single replica, because SQLite is one file that only one instance may write to.

**Attach the volume before the first deploy.** Without it the database and every
uploaded image are wiped on each restart and redeploy.

```bash
npm i -g @railway/cli
railway login
railway init                    # or: link an existing project

# The volume. Mount path must be /data, which is what the Dockerfile expects.
railway volume add --mount-path /data

railway variables set \
  SESSION_SECRET="$(node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))")" \
  ADMIN_PASSWORD_HASH='<output of: npm run hash -- "your password">'

railway up
railway domain                  # generates the public URL
```

`NODE_ENV=production` and `TRUST_PROXY=1` are already set in the Dockerfile, so
there is nothing else to configure. Railway's router sets `X-Forwarded-Proto`,
which is what lets the secure session cookie be issued.

Checked here against the exact environment Railway provides — production mode,
an injected `PORT`, the database on a separate volume path, and a request
arriving with `X-Forwarded-Proto: https` — the site serves and admin login
returns `302 /admin`.

### Costs

Railway is **not free**. New accounts get a small one-off trial credit; after
that a Hobby plan is required (about $5/month at time of writing, plus usage).
If free is the requirement, use the static export at the top of this file, or
Oracle Cloud Always Free below.

### Two things that bite on Railway specifically

- **Volume permissions.** A mounted volume replaces the image's directory and
  arrives owned by root, while the app runs as the `node` user. The container
  therefore starts as root, and `docker-entrypoint.sh` takes ownership of
  `/data` before dropping privileges. Doing the `chown` in the Dockerfile alone
  is not enough — the mount hides it.
- **One replica only.** Scaling past one would give each instance its own view
  of a file-based database. Change to Postgres before scaling out.

## Option C — Fly.io

Uses the `Dockerfile` and `fly.toml` in this repo.

```bash
fly launch --no-deploy --name your-app-name
fly volumes create iamsree_data --size 1 --region fra
fly secrets set SESSION_SECRET="$(node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))")"
fly secrets set ADMIN_PASSWORD_HASH='<output of: npm run hash -- "your password">'
fly deploy
```

HTTPS and `X-Forwarded-Proto` are handled by Fly. The `[[mounts]]` block is what
keeps your content; without it this has the same problem as Render's free tier.

## Option D — Render free tier, honestly

It will run, and it is the least work. But the free plan has no disk, so **every
admin edit is lost** whenever the service restarts or sleeps (it sleeps after
15 minutes of no traffic).

That is only tolerable if you treat the deploy as the source of truth: edit
locally, commit `data/site.db`, and redeploy. Workable for a portfolio that
changes rarely, miserable otherwise.

---

## Required settings, whichever host

| Variable | Value | Why |
|---|---|---|
| `NODE_ENV` | `production` | Enables secure cookies and asset caching |
| `SESSION_SECRET` | 32+ random characters | Startup fails without it |
| `ADMIN_PASSWORD_HASH` | from `npm run hash` | Plaintext is rejected in production |
| `TRUST_PROXY` | `1` | **Required behind any proxy or PaaS router** |

`TRUST_PROXY` is not optional. In production the session cookie is `secure`, so
without HTTPS *and* a correct `X-Forwarded-Proto`, no cookie is issued and the
login fails with a 403 that cannot be fixed from the UI.

## Backups

```bash
tar czf backup-$(date +%F).tar.gz data/site.db IAMSREE/images/uploads/
```

Nothing else is stateful. On Fly, use `fly ssh console` and copy from `/data`.

## Node version

The app uses Node's built-in SQLite and so needs **Node 22.5 or newer**. That
dependency is confined to `app/db/index.js`; swapping it for `better-sqlite3`
(Node 18+) is a one-file change if a host caps you lower.
