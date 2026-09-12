'use strict';

/**
 * End-to-end checks against a running server.
 *
 *   node app/server.js &
 *   node tools/smoke-test.js [baseUrl]
 *
 * Exercises the public pages, the auth gate, CSRF, CRUD, reordering, visibility
 * and uploads. Exits non-zero on the first failing expectation.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const BASE = process.argv[2] || 'http://localhost:3000';
const USERNAME = process.env.ADMIN_USERNAME || 'admin';
const PASSWORD = process.env.SMOKE_PASSWORD || 'local-dev-password-123';

const { comparable, baselineFor } = require('./parity');

let cookie = '';
let passed = 0;

// Every row this run creates, so cleanup can run even when a check fails
// part-way and leaves the database holding test content.
const created = [];
const uploadedFiles = [];

// Undo actions for rows this run *edits* rather than creates. Registered before
// the edit, so a failure mid-check still restores the original content.
const restores = [];

function onCleanup(fn) {
  restores.push(fn);
}

function ok(label) {
  passed += 1;
  console.log('  ok  ' + label);
}

function track(resource, id) {
  created.push({ resource, id });
  return id;
}

async function cleanup() {
  for (const undo of restores.reverse()) {
    try {
      await undo();
    } catch {
      console.error('  !!  could not restore edited content; run "npm run db:seed -- --force"');
    }
  }
  restores.length = 0;

  for (const entry of created.reverse()) {
    try {
      const token = await csrfFrom(`/admin/${entry.resource}/${entry.id}/edit`);
      await request(`/admin/${entry.resource}/${entry.id}/delete`, {
        method: 'POST',
        headers: POST_FORM,
        body: form({ _csrf: token })
      });
    } catch {
      console.error(`  !!  could not remove ${entry.resource}#${entry.id}; run "npm run db:seed -- --force"`);
    }
  }
  for (const file of uploadedFiles) {
    fs.rmSync(path.join(__dirname, '..', 'IAMSREE', file), { force: true });
  }
  created.length = 0;
}

async function request(url, options = {}) {
  const res = await fetch(BASE + url, {
    redirect: 'manual',
    ...options,
    headers: { ...(options.headers || {}), ...(cookie ? { cookie } : {}) }
  });

  const setCookie = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  for (const entry of setCookie) {
    const pair = entry.split(';')[0];
    if (pair.startsWith('iamsree.sid=')) cookie = pair;
  }
  return res;
}

/** Pulls the CSRF token out of a rendered admin page. */
async function csrfFrom(url) {
  const res = await request(url);
  const html = await res.text();
  const match = /name="_csrf" value="([^"]+)"/.exec(html);
  assert(match, `no CSRF token on ${url}`);
  return match[1];
}

function form(fields) {
  return new URLSearchParams(fields).toString();
}

const POST_FORM = { 'content-type': 'application/x-www-form-urlencoded' };

async function main() {
  console.log('\n== public pages');
  for (const page of ['index.html', 'services.html', 'portfolio.html', 'portfolio-details.html']) {
    const url =
      page === 'index.html'
        ? '/'
        : page === 'portfolio-details.html'
          ? // The original detail page is Krooqi's.
            '/portfolio-details.html?slug=krooqi'
          : '/' + page;
    const res = await request(url);
    assert.strictEqual(res.status, 200, `${url} returned ${res.status}`);

    const live = await res.text();
    const original = fs.readFileSync(path.join(__dirname, '..', 'IAMSREE', page), 'utf8');
    assert.strictEqual(
      comparable(page, live),
      baselineFor(page, original),
      `${url} does not match ${page}`
    );
    ok(`${url} renders ${page}`);
  }

  for (const asset of ['/css/main.css', '/js/main.js', '/images/img-45.webp', '/about.html']) {
    const res = await request(asset);
    assert.strictEqual(res.status, 200, `${asset} returned ${res.status}`);
    ok(`${asset} served`);
  }

  console.log('\n== project detail pages');
  {
    const grid = await (await request('/portfolio.html')).text();
    const slugs = [
      ...new Set(
        [...grid.matchAll(/href="portfolio-details\.html\?slug=([a-z0-9-]+)"/g)].map((m) => m[1])
      )
    ];
    assert.strictEqual(slugs.length, 14, `expected 14 linked projects, found ${slugs.length}`);
    assert(
      !/href="https?:\/\/[^"]*"(?= class="alt-portfolio-thumb)/.test(grid),
      'a project card still links straight to an external site'
    );
    ok(`all ${slugs.length} grid cards link to their own detail page`);

    for (const slug of slugs) {
      const res = await request(`/portfolio-details.html?slug=${slug}`);
      assert.strictEqual(res.status, 200, `${slug} returned ${res.status}`);
      const html = await res.text();
      assert(!html.includes('src=""'), `${slug} renders an empty image source`);
      assert(!html.includes('href=""'), `${slug} renders an empty link`);
      const related = (html.match(/alt-portfolio-thumb p-relative/g) || []).length;
      assert.strictEqual(related, 3, `${slug} shows ${related} related projects`);
    }
    ok('every project page renders with no empty images, links or related slots');

    // Krooqi is the one project with full content in the original markup.
    const krooqi = await (await request('/portfolio-details.html?slug=krooqi')).text();
    assert(krooqi.includes('<title>Krooqi'), 'per-project title missing');
    assert(krooqi.includes('>The Solution<'), 'solution block missing');
    assert(krooqi.includes('>Outcome<'), 'outcome block missing');
    assert.strictEqual(
      (krooqi.match(/about-me-slider-thumb/g) || []).length,
      5,
      'gallery slide count changed'
    );
    assert.strictEqual(
      (krooqi.match(/<li class="neutral-950">/g) || []).length,
      4,
      'key feature count changed'
    );
    assert(krooqi.includes('Alphan Abdul Rub'), 'testimonial missing');
    ok('krooqi keeps its full case study');

    // A project with only the basics must not show empty sections.
    const sparse = await (await request('/portfolio-details.html?slug=mamame')).text();
    assert(!sparse.includes('>The Solution<'), 'empty solution block rendered');
    assert(!sparse.includes('>Outcome<'), 'empty outcome block rendered');
    assert(!sparse.includes('about-me-slider-active'), 'empty gallery slider rendered');
    assert(!sparse.includes('testimonial-content'), 'empty testimonial rendered');
    assert(!sparse.includes('border-bottom-900'), 'live demo button rendered without a URL');
    ok('a project without extra content hides those sections');

    const missing = await request('/portfolio-details.html?slug=does-not-exist');
    assert.strictEqual(missing.status, 404, `unknown slug returned ${missing.status}`);
    const missingBody = await missing.text();
    assert(!missingBody.includes('Ewaantech'), 'unknown slug served the stale static page');
    ok('an unknown slug answers 404 instead of the stale static file');

    const bare = await request('/portfolio-details.html');
    assert.strictEqual(bare.status, 302);
    assert.match(bare.headers.get('location'), /portfolio\.html$/);
    ok('the bare detail URL redirects to the listing');
  }

  console.log('\n== authentication');
  {
    const res = await request('/admin');
    assert.strictEqual(res.status, 302);
    assert.match(res.headers.get('location'), /\/admin\/login$/);
    ok('/admin redirects anonymous visitors to the login page');
  }
  {
    const res = await request('/admin/case-studies');
    assert.strictEqual(res.status, 302);
    ok('/admin/case-studies is gated');
  }
  {
    // A write with no session and no token must not succeed.
    const res = await request('/admin/case-studies/1/delete', {
      method: 'POST',
      headers: POST_FORM,
      body: ''
    });
    assert.notStrictEqual(res.status, 200);
    ok('unauthenticated delete is rejected (' + res.status + ')');
  }
  {
    const token = await csrfFrom('/admin/login');
    const res = await request('/admin/login', {
      method: 'POST',
      headers: POST_FORM,
      body: form({ _csrf: token, username: USERNAME, password: 'wrong-password' })
    });
    assert.strictEqual(res.status, 401);
    ok('wrong password is rejected');
  }
  {
    const token = await csrfFrom('/admin/login');
    const res = await request('/admin/login', {
      method: 'POST',
      headers: POST_FORM,
      body: form({ _csrf: token, username: USERNAME, password: PASSWORD })
    });
    assert.strictEqual(res.status, 302, 'login should redirect');
    ok('correct password signs in');
  }
  {
    const res = await request('/admin');
    assert.strictEqual(res.status, 200);
    const html = await res.text();
    assert(html.includes('Dashboard'), 'dashboard did not render');
    ok('dashboard reachable when signed in');
  }

  console.log('\n== CSRF');
  {
    const res = await request('/admin/case-studies', {
      method: 'POST',
      headers: POST_FORM,
      body: form({ title: 'No token' })
    });
    assert.strictEqual(res.status, 403, `expected 403, got ${res.status}`);
    ok('POST without a CSRF token is refused');
  }
  {
    const res = await request('/admin/case-studies', {
      method: 'POST',
      headers: POST_FORM,
      body: form({ _csrf: 'not-the-real-token', title: 'Bad token' })
    });
    assert.strictEqual(res.status, 403);
    ok('POST with a wrong CSRF token is refused');
  }

  console.log('\n== admin pages render');
  const resourceKeys = [
    'case-studies',
    'testimonials',
    'client-projects',
    'brands',
    'brand-tiles',
    'service-sections',
    'portfolio-projects',
    'portfolio-categories'
  ];
  for (const key of resourceKeys) {
    const list = await request('/admin/' + key);
    assert.strictEqual(list.status, 200, `${key} list returned ${list.status}`);
    const create = await request(`/admin/${key}/new`);
    assert.strictEqual(create.status, 200, `${key} form returned ${create.status}`);
    ok(`${key}: list + form render`);
  }

  console.log('\n== brand wall');
  {
    const list = await (await request('/admin/brands')).text();
    const brandIds = [...list.matchAll(/data-id="(\d+)"/g)].map((m) => Number(m[1]));
    assert.strictEqual(brandIds.length, 8, `expected 8 brands, found ${brandIds.length}`);
    assert(/in \d+ grid slot/.test(list), 'brand usage count not shown');

    // How many grid slots the first brand occupies, read from its own row
    // rather than assumed - the logos are reused an uneven number of times.
    const firstRow = list.slice(list.indexOf(`data-id="${brandIds[0]}"`));
    const expectedUses = Number(/in (\d+) grid slot/.exec(firstRow)[1]);
    ok(`8 brand logos listed with their grid usage (first is used ${expectedUses}x)`);

    // Editing a logo must change every grid slot that uses it.
    const token = await csrfFrom(`/admin/brands/${brandIds[0]}/edit`);

    onCleanup(async () => {
      const restoreToken = await csrfFrom(`/admin/brands/${brandIds[0]}/edit`);
      await request(`/admin/brands/${brandIds[0]}`, {
        method: 'POST',
        headers: POST_FORM,
        body: form({
          _csrf: restoreToken,
          name: 'Partner1',
          image: 'https://iamsreelalck.com/uploads/client/thumb_partner1.png',
          image_alt: 'Sreelal C K',
          is_visible: '1'
        })
      });
    });
    const res = await request(`/admin/brands/${brandIds[0]}`, {
      method: 'POST',
      headers: POST_FORM,
      body: form({
        _csrf: token,
        name: 'Renamed Brand',
        image: 'images/img-45.webp',
        image_alt: 'Renamed brand logo',
        is_visible: '1'
      })
    });
    assert.strictEqual(res.status, 302);

    const home = await (await request('/')).text();
    const uses = (home.match(/alt="Renamed brand logo"/g) || []).length;
    assert.strictEqual(
      uses,
      expectedUses,
      `edited logo should appear in ${expectedUses} slots, found ${uses}`
    );
    ok(`editing one brand updates all ${expectedUses} grid slots that use it`);

    // Hiding a brand must drop it from the grid.
    await request(`/admin/brands/${brandIds[0]}/visibility`, {
      method: 'POST',
      headers: { ...POST_FORM, accept: 'application/json' },
      body: form({ _csrf: token })
    });
    const hidden = await (await request('/')).text();
    assert(!hidden.includes('alt="Renamed brand logo"'), 'hidden brand still on the page');
    ok('hiding a brand removes it from the wall');

    // Unhide; the registered undo restores the rest of the row.
    await request(`/admin/brands/${brandIds[0]}/visibility`, {
      method: 'POST',
      headers: { ...POST_FORM, accept: 'application/json' },
      body: form({ _csrf: token })
    });
  }

  console.log('\n== page text');
  {
    const list = await (await request('/admin/page-text')).text();
    assert(list.includes('Brand wall heading'), 'page text rows missing');
    assert(!list.includes('Add text'), 'fixed resource should not offer adding rows');
    ok('page text lists its rows without an add button');

    const id = Number(/data-id="(\d+)"/.exec(list)[1]);
    const token = await csrfFrom(`/admin/page-text/${id}/edit`);

    onCleanup(async () => {
      const restore = await csrfFrom(`/admin/page-text/${id}/edit`);
      await request(`/admin/page-text/${id}`, {
        method: 'POST',
        headers: POST_FORM,
        body: form({ _csrf: restore, value: '15+ brands collaborated with' })
      });
    });

    const res = await request(`/admin/page-text/${id}`, {
      method: 'POST',
      headers: POST_FORM,
      body: form({ _csrf: token, value: '20+ brands collaborated with' })
    });
    assert.strictEqual(res.status, 302);

    const home = await (await request('/')).text();
    assert(home.includes('20+ brands collaborated with'), 'heading edit not reflected');
    ok('editing the heading changes the homepage');

    // Adding and deleting fixed rows must be refused, not just hidden.
    const added = await request('/admin/page-text', {
      method: 'POST',
      headers: POST_FORM,
      body: form({ _csrf: token, value: 'should not be creatable' })
    });
    assert.strictEqual(added.status, 403, `expected 403, got ${added.status}`);

    const deleted = await request(`/admin/page-text/${id}/delete`, {
      method: 'POST',
      headers: POST_FORM,
      body: form({ _csrf: token })
    });
    assert.strictEqual(deleted.status, 403, `expected 403, got ${deleted.status}`);
    ok('fixed rows cannot be created or deleted');
  }

  console.log('\n== CRUD');
  let createdId;
  {
    const token = await csrfFrom('/admin/case-studies/new');
    const res = await request('/admin/case-studies', {
      method: 'POST',
      headers: POST_FORM,
      body: form({
        _csrf: token,
        title: 'Smoke Test Study',
        link: 'portfolio.html',
        open_in_new_tab: '1',
        description: 'Created by the smoke test.',
        image: 'images/img-45.webp',
        image_alt: 'Smoke',
        metric_value: 'Testing',
        metric_label: 'Automated',
        tags: 'Alpha\nBeta | portfolio.html',
        cta_label: 'VIEW CASE STUDY',
        is_visible: '1'
      })
    });
    assert.strictEqual(res.status, 302, `create returned ${res.status}`);

    const list = await (await request('/admin/case-studies?q=Smoke')).text();
    assert(list.includes('Smoke Test Study'), 'created row missing from search results');
    createdId = track('case-studies', Number(/data-id="(\d+)"/.exec(list)[1]));
    ok('create + search');
  }
  {
    const home = await (await request('/')).text();
    assert(home.includes('Smoke Test Study'), 'new case study not on the homepage');
    assert(home.includes('>Alpha</a>'), 'tags not rendered');
    ok('new case study appears on the public homepage');
  }
  {
    const token = await csrfFrom(`/admin/case-studies/${createdId}/edit`);
    const res = await request(`/admin/case-studies/${createdId}`, {
      method: 'POST',
      headers: POST_FORM,
      body: form({
        _csrf: token,
        title: 'Smoke Test Renamed',
        link: 'portfolio.html',
        metric_value: 'Testing',
        metric_label: 'Automated',
        tags: 'Alpha',
        cta_label: 'VIEW CASE STUDY',
        is_visible: '1'
      })
    });
    assert.strictEqual(res.status, 302);
    const home = await (await request('/')).text();
    assert(home.includes('Smoke Test Renamed'), 'update not reflected publicly');
    ok('update');
  }
  {
    const token = await csrfFrom(`/admin/case-studies/${createdId}/edit`);
    const res = await request(`/admin/case-studies/${createdId}/visibility`, {
      method: 'POST',
      headers: { ...POST_FORM, accept: 'application/json' },
      body: form({ _csrf: token })
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.is_visible, 0, 'toggle did not hide the row');

    const home = await (await request('/')).text();
    assert(!home.includes('Smoke Test Renamed'), 'hidden case study still on the homepage');
    ok('visibility toggle hides the row from the public page');
  }
  {
    const token = await csrfFrom('/admin/case-studies');
    const listHtml = await (await request('/admin/case-studies')).text();
    const ids = [...listHtml.matchAll(/data-id="(\d+)"/g)].map((m) => Number(m[1]));
    const reversed = ids.slice().reverse();

    const res = await request('/admin/case-studies/reorder', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-csrf-token': token },
      body: JSON.stringify({ ids: reversed })
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual((await res.json()).reordered, reversed.length);

    const after = await (await request('/admin/case-studies')).text();
    const nowIds = [...after.matchAll(/data-id="(\d+)"/g)].map((m) => Number(m[1]));
    assert.deepStrictEqual(nowIds, reversed, 'order was not persisted');

    // Put it back so parity still holds.
    await request('/admin/case-studies/reorder', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-csrf-token': token },
      body: JSON.stringify({ ids })
    });
    ok('drag-and-drop reorder persists and restores');
  }

  console.log('\n== validation');
  {
    const token = await csrfFrom('/admin/case-studies/new');
    const res = await request('/admin/case-studies', {
      method: 'POST',
      headers: POST_FORM,
      body: form({ _csrf: token, title: '' })
    });
    assert.strictEqual(res.status, 422, `expected 422, got ${res.status}`);
    assert((await res.text()).includes('Title is required'), 'missing field error not shown');
    ok('required fields are enforced');
  }
  {
    const token = await csrfFrom('/admin/case-studies/new');
    const res = await request('/admin/case-studies', {
      method: 'POST',
      headers: POST_FORM,
      body: form({ _csrf: token, title: 'XSS probe', link: 'javascript:alert(1)' })
    });
    assert.strictEqual(res.status, 422);
    ok('javascript: links are rejected');
  }
  {
    const token = await csrfFrom('/admin/portfolio-categories/new');
    const res = await request('/admin/portfolio-categories', {
      method: 'POST',
      headers: POST_FORM,
      body: form({ _csrf: token, name: 'Branding', slug: 'branding', is_visible: '1' })
    });
    assert.strictEqual(res.status, 422, 'duplicate slug should be rejected');
    ok('duplicate slugs are rejected');
  }
  {
    // Script in a text field must be escaped, not executed.
    const token = await csrfFrom('/admin/testimonials/new');
    const res = await request('/admin/testimonials', {
      method: 'POST',
      headers: POST_FORM,
      body: form({
        _csrf: token,
        client_name: '<script>alert(1)</script>',
        quote: 'Quote with <img src=x onerror=alert(1)>',
        rating: '5',
        layout: 'header_top',
        is_visible: '1'
      })
    });
    assert.strictEqual(res.status, 302);

    const home = await (await request('/')).text();
    assert(!home.includes('<script>alert(1)</script>'), 'script tag was not escaped');
    assert(home.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), 'escaped form missing');
    assert(!home.includes('onerror=alert(1)>'), 'img payload was not escaped');
    ok('injected markup is escaped on the public page');

    const listHtml = await (await request('/admin/testimonials?q=script')).text();
    track('testimonials', Number(/data-id="(\d+)"/.exec(listHtml)[1]));
  }

  console.log('\n== uploads');
  {
    const token = await csrfFrom('/admin/case-studies/new');
    // A 1x1 PNG.
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64'
    );

    const body = new FormData();
    body.set('_csrf', token);
    body.set('title', 'Upload Probe');
    body.set('metric_value', 'x');
    body.set('metric_label', 'y');
    body.set('cta_label', 'VIEW');
    body.set('is_visible', '0');
    body.set('image', new Blob([png], { type: 'image/png' }), 'probe image.png');

    const res = await request('/admin/case-studies', { method: 'POST', body });
    assert.strictEqual(res.status, 302, `upload returned ${res.status}`);

    const listHtml = await (await request('/admin/case-studies?q=Upload')).text();
    const src = /src="\/(images\/uploads\/[^"]+)"/.exec(listHtml);
    assert(src, 'uploaded image not referenced in the list');
    assert(/^images\/uploads\/probe-image-[a-z0-9-]+\.png$/.test(src[1]), 'unexpected stored filename: ' + src[1]);

    const fetched = await request('/' + src[1]);
    assert.strictEqual(fetched.status, 200, 'uploaded file not served');
    ok('image upload stored, sanitised and served at ' + src[1]);

    track('case-studies', Number(/data-id="(\d+)"/.exec(listHtml)[1]));
    uploadedFiles.push(src[1]);
  }
  {
    const token = await csrfFrom('/admin/case-studies/new');
    const body = new FormData();
    body.set('_csrf', token);
    body.set('title', 'Bad upload');
    body.set('image', new Blob([Buffer.from('#!/bin/sh\necho hi')], { type: 'text/x-sh' }), 'evil.sh');

    const res = await request('/admin/case-studies', { method: 'POST', body });
    assert.strictEqual(res.status, 400, `expected 400 for a disallowed type, got ${res.status}`);
    ok('disallowed upload types are refused');
  }

  console.log('\n== delete');
  {
    const token = await csrfFrom(`/admin/case-studies/${createdId}/edit`);
    const res = await request(`/admin/case-studies/${createdId}/delete`, {
      method: 'POST',
      headers: POST_FORM,
      body: form({ _csrf: token })
    });
    assert.strictEqual(res.status, 302);

    const gone = await request(`/admin/case-studies/${createdId}/edit`);
    assert.strictEqual(gone.status, 404, 'deleted row is still reachable');

    // Already removed, so cleanup must not try again.
    const index = created.findIndex((e) => e.id === createdId);
    if (index !== -1) created.splice(index, 1);
    ok('delete');
  }

  // Remove the remaining test content before checking parity, so the comparison
  // runs against the same content the original files hold.
  await cleanup();

  console.log('\n== parity after all changes');
  for (const page of ['index.html', 'services.html', 'portfolio.html', 'portfolio-details.html']) {
    const url =
      page === 'index.html'
        ? '/'
        : page === 'portfolio-details.html'
          ? '/portfolio-details.html?slug=krooqi'
          : '/' + page;
    const live = await (await request(url)).text();
    const original = fs.readFileSync(path.join(__dirname, '..', 'IAMSREE', page), 'utf8');
    assert.strictEqual(
      comparable(page, live),
      baselineFor(page, original),
      `${url} drifted from ${page}`
    );
    ok(`${url} still matches ${page}`);
  }

  console.log('\n== sign out');
  {
    const token = await csrfFrom('/admin');
    const res = await request('/admin/logout', {
      method: 'POST',
      headers: POST_FORM,
      body: form({ _csrf: token })
    });
    assert.strictEqual(res.status, 302);

    const after = await request('/admin/case-studies');
    assert.strictEqual(after.status, 302, 'session survived logout');
    ok('logout ends the session');
  }

  console.log(`\nAll ${passed} checks passed.`);
}

main()
  .then(cleanup)
  .catch(async (err) => {
    console.error('\nFAILED: ' + err.message);
    if (err.stack) console.error(err.stack.split('\n').slice(1, 4).join('\n'));
    // Best effort: a failure before sign-out can still undo its own writes.
    await cleanup();
    process.exit(1);
  });
