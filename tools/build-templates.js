'use strict';

/**
 * Development tool: generates the public EJS templates from the original static
 * pages.
 *
 * The generated templates are ordinary committed files - edit them directly from
 * then on. This tool exists so the first conversion is mechanical rather than
 * retyped: every byte of markup outside the repeated blocks is carried across
 * verbatim, and only the repeated blocks become loops.
 *
 * A replacement that fails to match raises, so a markup change can never
 * silently produce a template that drops content.
 *
 *   node tools/build-templates.js
 */

const fs = require('fs');
const path = require('path');

const SOURCE = path.join(__dirname, '..', 'IAMSREE');
const OUT = path.join(__dirname, '..', 'app', 'views', 'public');

// Produced by tools/extract-content.js. Used to locate the literal content a
// prototype block contains, so each replacement is anchored to real values
// rather than to strings duplicated by hand in this file.
const seed = require('../app/db/seed-data.json');

// The original pages use CRLF throughout. Manipulation happens in LF so the
// anchors below stay readable, and CRLF is restored on write - EJS slurps a
// CRLF after `-%>` correctly, so the rendered pages come back out byte-identical.
const read = (file) =>
  fs.readFileSync(path.join(SOURCE, file), 'utf8').replace(/\r\n/g, '\n');

const write = (file, content) =>
  fs.writeFileSync(file, content.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n'));

/** Replaces `needle` exactly once, raising if it is missing or ambiguous. */
function replaceOnce(haystack, needle, replacement, label) {
  const first = haystack.indexOf(needle);
  if (first === -1) throw new Error(`build-templates: "${label}" not found`);
  if (haystack.indexOf(needle, first + 1) !== -1) {
    throw new Error(`build-templates: "${label}" is ambiguous (matches more than once)`);
  }
  return haystack.slice(0, first) + replacement + haystack.slice(first + needle.length);
}

/** Replaces every occurrence, raising if there are none. */
function replaceAll(haystack, needle, replacement, label) {
  if (!haystack.includes(needle)) throw new Error(`build-templates: "${label}" not found`);
  return haystack.split(needle).join(replacement);
}

/**
 * Returns the text between two anchors, plus a function that rebuilds the whole
 * document with that region swapped for new content.
 */
function region(source, startAnchor, endAnchor, label) {
  // Anchors are matched with their leading newline so an anchor that begins
  // with indentation cannot match inside a more deeply indented line - e.g.
  // 24 spaces + "</div>" is a substring of 40 spaces + "</div>".
  const start = source.indexOf('\n' + startAnchor);
  if (start === -1) throw new Error(`build-templates: start anchor for "${label}" not found`);
  const from = start + 1 + startAnchor.length;

  const endMatch = source.indexOf('\n' + endAnchor, from);
  if (endMatch === -1) throw new Error(`build-templates: end anchor for "${label}" not found`);
  const end = endMatch + 1;

  return {
    body: source.slice(from, end),
    replace: (replacement) => source.slice(0, from) + replacement + source.slice(end)
  };
}

/**
 * Returns the indentation of the line `index` sits on.
 *
 * Slicing a string at a tag boundary drops that line's leading whitespace, which
 * would silently reflow the generated markup; callers re-emit this.
 */
function indentBefore(text, index) {
  const lineStart = text.lastIndexOf('\n', index - 1) + 1;
  return text.slice(lineStart, index);
}

/** Splits a region into its repeated top-level blocks. */
function splitBlocks(body, openTag) {
  const parts = body.split(openTag);
  const lead = parts.shift();
  return { lead, blocks: parts.map((p) => openTag + p) };
}

// ===========================================================================
// index.html
// ===========================================================================
function buildIndex() {
  let html = read('index.html');

  // -- CASE STUDIES : "Selected work" ---------------------------------------
  {
    const r = region(
      html,
      '                        <div class="container pt-70">\n                            <div class="row g-4">\n',
      '                            <div class="row pt-100">',
      'case studies'
    );

    const { blocks } = splitBlocks(r.body, '                                <div class="col-lg-6">\n');
    if (blocks.length !== 4) {
      throw new Error(`build-templates: expected 4 case study cards, found ${blocks.length}`);
    }

    // Card 1 is the prototype; what trails the last card closes the enclosing row.
    let card = blocks[0];
    const rowClose = blocks[3].lastIndexOf('</div>\n');
    const tail = indentBefore(blocks[3], rowClose) + blocks[3].slice(rowClose);

    card = replaceOnce(
      card,
      '<a target="_blank" rel="noopener" href="https://iamsreelalck.com/project/branding-and-digital-presence">',
      '<a<% if (item.open_in_new_tab) { %> target="_blank" rel="noopener"<% } %> href="<%- esc(safeUrl(item.link)) %>">',
      'case study visual link'
    );
    card = replaceOnce(
      card,
      '<img src="images/img-107.webp" alt="Spunk Systems">',
      '<img src="<%- esc(item.image) %>" alt="<%- esc(item.image_alt) %>">',
      'case study image'
    );
    card = replaceOnce(
      card,
      '<h3 class="h4 card_case__studies-metric-value">Branding</h3>',
      '<h3 class="h4 card_case__studies-metric-value"><%- esc(item.metric_value) %></h3>',
      'case study metric value'
    );
    card = replaceOnce(
      card,
      '<span class="card_case__studies-metric-label">IT Consulting</span>',
      '<span class="card_case__studies-metric-label"><%- esc(item.metric_label) %></span>',
      'case study metric label'
    );

    // The four tag pills become one loop.
    const tagsOpen = '<div class="card_case__studies-tags-overlay">\n';
    const tagsStart = card.indexOf(tagsOpen);
    const tagsEnd = card.indexOf('</div>', tagsStart);
    const firstTag = card.indexOf('<a href=', tagsStart);
    card =
      card.slice(0, tagsStart + tagsOpen.length) +
      '<% item.tags.forEach(function (tag) { -%>\n' +
      indentBefore(card, firstTag) +
      '<a href="<%- esc(safeUrl(tag.link)) %>" class="card_case__studies-tag"><%- esc(tag.label) %></a>\n' +
      '<% }); -%>\n' +
      indentBefore(card, tagsEnd) +
      card.slice(tagsEnd);

    card = replaceAll(
      card,
      '<a href="https://iamsreelalck.com/project/branding-and-digital-presence">\n' +
        ' '.repeat(56) + 'Spunk Systems\n',
      '<a href="<%- esc(safeUrl(item.link)) %>">\n' +
        ' '.repeat(56) + '<%- esc(item.title) %>\n',
      'case study footer title'
    );
    card = replaceOnce(
      card,
      '<a href="https://iamsreelalck.com/project/branding-and-digital-presence" class="card_case__studies-link neutral-900">',
      '<a href="<%- esc(safeUrl(item.link)) %>" class="card_case__studies-link neutral-900">',
      'case study footer link'
    );
    card = replaceOnce(
      card,
      '<span class="neutral-900"> VIEW CASE STUDY</span>',
      '<span class="neutral-900"><%- esc(item.cta_label) %></span>',
      'case study cta label'
    );

    html = r.replace(
      '<% caseStudies.forEach(function (item) { -%>\n' +
        '                                <div class="col-lg-6">\n' +
        card.slice('                                <div class="col-lg-6">\n'.length) +
        '<% }); -%>\n' +
        tail
    );
  }

  // -- Testimonials ---------------------------------------------------------
  {
    const r = region(
      html,
      '                    <div class="container pt-80">\n                        <div class="row g-2">\n',
      '                            <div class="col-xxl-3 col-md-6 order-4 d-lg-none d-xxl-block">',
      'testimonials'
    );

    const { blocks } = splitBlocks(
      r.body,
      '                            <div class="col-xxl-3 col-lg-4 col-md-6 col-12 '
    );
    if (blocks.length !== 3) {
      throw new Error(`build-templates: expected 3 testimonials, found ${blocks.length}`);
    }

    // The grid alternates two card compositions: name bar above the quote, or
    // below it. Both are carried across verbatim and selected by `item.layout`,
    // rather than trying to derive one from the other.
    const parameterise = (block, sample) => {
      let card = replaceOnce(
        block,
        `<div class="col-xxl-3 col-lg-4 col-md-6 col-12 ${sample.column_classes}">`,
        '<div class="col-xxl-3 col-lg-4 col-md-6 col-12 <%- esc(item.column_classes) %>">',
        'testimonial column classes'
      );
      card = replaceOnce(
        card,
        `<span>${sample.client_name}</span>`,
        '<span><%- esc(item.client_name) %></span>',
        'testimonial name'
      );
      card = replaceOnce(
        card,
        `${sample.company}\n`,
        '<%- esc(item.company) %>\n',
        'testimonial company'
      );
      card = replaceOnce(
        card,
        `<img class="img-cover" src="${sample.avatar}" alt="${sample.avatar_alt}">`,
        '<img class="img-cover" src="<%- esc(item.avatar) %>" alt="<%- esc(item.avatar_alt) %>">',
        'testimonial avatar'
      );

      const quoteOpen = '<blockquote class="neutral-500 fz-font-lg fw-500 mb-3 mt-30 text-truncate-5">';
      const qStart = card.indexOf(quoteOpen);
      if (qStart === -1) throw new Error('build-templates: testimonial quote not found');
      const qEnd = card.indexOf('</blockquote>', qStart);
      card = card.slice(0, qStart + quoteOpen.length) + '<%- esc(item.quote) %>' + card.slice(qEnd);

      // Five star glyphs, the first `rating` of them carrying the filled `star`
      // class. The first glyph is reused verbatim - including its own
      // indentation and inline SVG - so only the class attribute is conditional.
      const starsOpen = '<div class="d-flex">\n';
      const sStart = card.indexOf(starsOpen);
      const firstStar = card.indexOf('<span class="star">', sStart);
      const firstStarEnd = card.indexOf('</span>\n', firstStar) + '</span>\n'.length;

      const starBlock = (
        indentBefore(card, firstStar) + card.slice(firstStar, firstStarEnd)
      ).replace('<span class="star">', '<span<% if (s <= item.rating) { %> class="star"<% } %>>');

      const starsClose = card.indexOf('</div>', firstStarEnd);

      return (
        card.slice(0, sStart + starsOpen.length) +
        '<% for (var s = 1; s <= 5; s++) { -%>\n' +
        starBlock +
        '<% } -%>\n' +
        indentBefore(card, starsClose) +
        card.slice(starsClose)
      );
    };

    const headerTop = parameterise(blocks[0], seed.testimonials[0]);
    const headerBottom = parameterise(blocks[1], seed.testimonials[1]);

    if (seed.testimonials[0].layout !== 'header_top' || seed.testimonials[1].layout !== 'header_bottom') {
      throw new Error('build-templates: testimonial layout prototypes are not the expected variants');
    }

    html = r.replace(
      '<% testimonials.forEach(function (item) { -%>\n' +
        "<% if (item.layout === 'header_bottom') { -%>\n" +
        headerBottom +
        '<% } else { -%>\n' +
        headerTop +
        '<% } -%>\n' +
        '<% }); -%>\n'
    );
  }

  // -- Brand wall heading and intro -----------------------------------------
  {
    html = replaceOnce(
      html,
      '                    15+ brands collaborated with\n',
      "                    <%- esc(setting('brands_heading')) %>\n",
      'brand wall heading'
    );
    html = replaceOnce(
      html,
      '                    Sreelal C K is a UI/UX Designer crafting responsive, user-centered digital experiences for web and mobile applications.\n',
      "                    <%- esc(setting('brands_intro')) %>\n",
      'brand wall intro'
    );
  }

  // -- Brand wall logo grid -------------------------------------------------
  {
    const r = region(
      html,
      '                        <div class="at-brand-scroll-wrap d-flex flex-wrap gap-2">\n',
      '                            <div class="flex-grow-1 text-center d-flex flex-column justify-content-center ml-100 py-5">',
      'brand grid'
    );

    const { lead, blocks } = splitBlocks(
      r.body,
      '                            <div class="at-brand-item at_fade_anim" '
    );
    if (blocks.length !== 10) {
      throw new Error(`build-templates: expected 10 brand tiles, found ${blocks.length}`);
    }

    let tile = blocks[0];

    tile = replaceOnce(
      tile,
      'data-delay=".4" data-fade-from="bottom" data-ease="bounce">',
      'data-delay="<%- esc(tile.delay) %>" data-fade-from="<%- esc(tile.fade_from) %>" data-ease="<%- esc(tile.ease) %>">',
      'brand tile attributes'
    );

    // The three logo slides become one loop over the tile's brands.
    const slideOpen = '<span class="brand-logo-slide"';
    const firstSlide = tile.indexOf(slideOpen);
    const lastSlideEnd = tile.lastIndexOf('</span>\n') + '</span>\n'.length;
    const slideIndent = indentBefore(tile, firstSlide);
    const imgIndent = indentBefore(tile, tile.indexOf('<img ', firstSlide));

    tile =
      tile.slice(0, firstSlide - slideIndent.length) +
      '<% tile.slides.forEach(function (slide) { -%>\n' +
      slideIndent + '<span class="brand-logo-slide" data-logo="<%- esc(slide.data_logo) %>">\n' +
      imgIndent + '<img decoding="async" class="dark-mode-invert" src="<%- esc(slide.image) %>" alt="<%- esc(slide.image_alt) %>">\n' +
      slideIndent + '</span>\n' +
      '<% }); -%>\n' +
      tile.slice(lastSlideEnd);

    // Tiles are separated by a blank line; the last one is not followed by one.
    if (!tile.endsWith('\n\n')) {
      throw new Error('build-templates: brand tile prototype has no trailing blank line');
    }
    tile = tile.slice(0, -1);

    html = r.replace(
      lead +
        '<% brandTiles.forEach(function (tile, tileIndex) { -%>\n' +
        tile +
        '<% if (tileIndex < brandTiles.length - 1) { -%>\n' +
        '\n' +
        '<% } -%>\n' +
        '<% }); -%>\n' +
        '\n'
    );
  }

  // -- Selected client projects ---------------------------------------------
  {
    const r = region(
      html,
      '                                <h3 class="alt-section-title lh-1 neutral-900 fw-700 mb-30 reveal-text mb-0">Selected <br> client projects.</h3>',
      '                    </div>\n                </div>\n            </main>',
      'client projects'
    );

    const gridAnchor = '                        <div class="row g-4">\n';
    const gridStart = r.body.indexOf(gridAnchor);
    if (gridStart === -1) throw new Error('build-templates: client projects grid not found');

    const head = r.body.slice(0, gridStart + gridAnchor.length);
    const grid = r.body.slice(gridStart + gridAnchor.length);

    const { blocks } = splitBlocks(grid, '                            <div class="col-lg-4 col-12">\n');
    if (blocks.length !== 3) {
      throw new Error(`build-templates: expected 3 client projects, found ${blocks.length}`);
    }

    // Two card treatments: keep both, selected per row by card_style.
    let feature = blocks[0];
    const featureTail = '';
    feature = replaceAll(
      feature,
      '<a href="https://www.vperfumes.com" target="_blank" rel="noopener" class="alt-portfolio-thumb mb-15 p-relative fix d-block">',
      '<a href="<%- esc(safeUrl(item.link)) %>"<% if (item.open_in_new_tab) { %> target="_blank" rel="noopener"<% } %> class="alt-portfolio-thumb mb-15 p-relative fix d-block">',
      'client feature link'
    );
    feature = replaceOnce(
      feature,
      'src="images/img-113.webp" alt="Sreelal C K"',
      'src="<%- esc(item.image) %>" alt="<%- esc(item.image_alt) %>"',
      'client feature image'
    );
    feature = replaceOnce(
      feature,
      '>e-commerce</span>',
      '><%- esc(item.category_label) %></span>',
      'client feature pill'
    );
    feature = replaceOnce(
      feature,
      '<h2 class="h4 fw-200 text-white mb-0 mt-20">V Perfumes</h2>',
      '<h2 class="h4 fw-200 text-white mb-0 mt-20"><%- esc(item.title) %></h2>',
      'client feature title'
    );
    feature = replaceOnce(
      feature,
      'Luxury perfume e-commerce platform &mdash; responsive product discovery and checkout screens.',
      '<%- esc(item.description) %>',
      'client feature description'
    );

    let blog = blocks[1];
    blog = replaceAll(
      blog,
      '<a href="https://www.thefreshmarketdubai.com" target="_blank" rel="noopener" class="blog-card__img-link">',
      '<a href="<%- esc(safeUrl(item.link)) %>"<% if (item.open_in_new_tab) { %> target="_blank" rel="noopener"<% } %> class="blog-card__img-link">',
      'client blog image link'
    );
    blog = replaceOnce(
      blog,
      '<img src="images/img-114.webp" class="blog-card__img" alt="Sreelal C K">',
      '<img src="<%- esc(item.image) %>" class="blog-card__img" alt="<%- esc(item.image_alt) %>">',
      'client blog image'
    );
    blog = replaceOnce(
      blog,
      '<a href="https://www.thefreshmarketdubai.com" target="_blank" rel="noopener" class="blog-card__title-link">The Fresh Market Dubai &mdash; fresh produce &amp; grocery retail</a>',
      '<a href="<%- esc(safeUrl(item.link)) %>"<% if (item.open_in_new_tab) { %> target="_blank" rel="noopener"<% } %> class="blog-card__title-link"><%- esc(item.title) %></a>',
      'client blog title'
    );
    blog = replaceOnce(
      blog,
      '<span class="blog-card__author">UI/UX Designer</span>',
      '<span class="blog-card__author"><%- esc(item.role_label) %></span>',
      'client blog role'
    );
    blog = replaceOnce(
      blog,
      '<span class="blog-card__meta-text"> &ndash; E-Commerce &amp; Retail</span>',
      '<span class="blog-card__meta-text"> &ndash; <%- esc(item.category_label) %></span>',
      'client blog category'
    );

    // Trailing markup after the last card closes the grid and section.
    const lastClose = blocks[2].lastIndexOf('                            </div>\n');
    const tail = blocks[2].slice(lastClose + '                            </div>\n'.length);

    html = r.replace(
      head +
        '<% clientProjects.forEach(function (item) { -%>\n' +
        "<% if (item.card_style === 'feature') { -%>\n" +
        feature +
        '<% } else { -%>\n' +
        blog +
        '<% } -%>\n' +
        '<% }); -%>\n' +
        tail +
        featureTail
    );
  }

  return html;
}

// ===========================================================================
// services.html
// ===========================================================================
function buildServices() {
  let html = read('services.html');

  const r = region(
    html,
    '                        <div class="accordion svc4-list" id="svc4Accordion">\n',
    '                        </div>\n',
    'service accordion'
  );

  const { blocks } = splitBlocks(r.body, '                            <!-- ');
  if (blocks.length !== 5) {
    throw new Error(`build-templates: expected 5 service sections, found ${blocks.length}`);
  }

  let section = blocks[0];

  section = replaceOnce(section, '<!-- Brand -->', '<!-- <%- esc(section.label) %> -->', 'section comment');
  section = replaceOnce(
    section,
    'id="svc4-brand" data-svc4-item="" data-preview="images/sec-2-project-2.webp"',
    'id="<%- esc(section.anchorId) %>" data-svc4-item="" data-preview="<%- esc(section.preview_image) %>"',
    'section wrapper'
  );
  section = replaceOnce(
    section,
    '<button class="svc4-item__btn" type="button" data-bs-toggle="collapse" data-bs-target="#svc4ColBrand" aria-expanded="true" aria-controls="svc4ColBrand">',
    '<button class="svc4-item__btn<% if (!section.isFirst) { %> collapsed<% } %>" type="button" data-bs-toggle="collapse" data-bs-target="#<%- esc(section.collapseId) %>" aria-expanded="<%- section.isFirst ? \'true\' : \'false\' %>" aria-controls="<%- esc(section.collapseId) %>">',
    'section button'
  );
  section = replaceOnce(
    section,
    '<img src="images/sec-2-project-2.webp" alt="" width="72" height="72" loading="lazy">',
    '<img src="<%- esc(section.thumb_image) %>" alt="" width="72" height="72" loading="lazy">',
    'section thumb'
  );
  section = replaceOnce(
    section,
    '<span class="svc4-item__num">01</span>',
    '<span class="svc4-item__num"><%- esc(section.number) %></span>',
    'section number'
  );
  section = replaceOnce(
    section,
    '<span class="svc4-item__name">UI/UX Design</span>',
    '<span class="svc4-item__name"><%- esc(section.name) %></span>',
    'section name'
  );
  section = replaceOnce(
    section,
    '<span class="svc4-item__tag">Research · user flows · interfaces</span>',
    '<span class="svc4-item__tag"><%- esc(section.tag) %></span>',
    'section tag'
  );
  section = replaceOnce(
    section,
    '<div id="svc4ColBrand" class="collapse show" data-bs-parent="#svc4Accordion">',
    '<div id="<%- esc(section.collapseId) %>" class="collapse<% if (section.isFirst) { %> show<% } %>" data-bs-parent="#svc4Accordion">',
    'section collapse'
  );
  section = replaceOnce(
    section,
    '<img class="anim-zoomin" src="images/sec-2-project-2.webp" alt="Brand systems work" width="640" height="480" loading="lazy">',
    '<img class="anim-zoomin" src="<%- esc(section.visual_image) %>" alt="<%- esc(section.visual_alt) %>" width="640" height="480" loading="lazy">',
    'section visual'
  );
  section = replaceOnce(
    section,
    '<p>User-centered interface design for web and mobile, grounded in UX research, competitor analysis and user journey mapping.</p>',
    '<p><%- esc(section.description) %></p>',
    'section description'
  );

  // Deliverables become a loop.
  const ulOpen = '<ul class="svc4-item__deliverables">\n';
  const ulStart = section.indexOf(ulOpen);
  const ulEnd = section.indexOf('</ul>', ulStart);
  const firstLi = section.indexOf('<li>', ulStart);
  section =
    section.slice(0, ulStart + ulOpen.length) +
    '<% section.items.forEach(function (entry) { -%>\n' +
    indentBefore(section, firstLi) +
    '<li><% if (entry.link) { %><a href="<%- esc(safeUrl(entry.link)) %>"><%- esc(entry.text) %></a><% } else { %><%- esc(entry.text) %><% } %></li>\n' +
    '<% }); -%>\n' +
    indentBefore(section, ulEnd) +
    section.slice(ulEnd);

  section = replaceOnce(
    section,
    '<a class="svc4-item__link" href="contact.html">Start a project</a>',
    '<a class="svc4-item__link" href="<%- esc(safeUrl(section.link_url)) %>"><%- esc(section.link_label) %></a>',
    'section link'
  );
  section = replaceOnce(
    section,
    '<p class="svc4-item__aside-label">Scope</p>',
    '<p class="svc4-item__aside-label"><%- esc(section.aside_label_1) %></p>',
    'aside label 1'
  );
  section = replaceOnce(
    section,
    '<p class="svc4-item__aside-value">Scoped per project</p>',
    '<p class="svc4-item__aside-value"><%- esc(section.aside_value_1) %></p>',
    'aside value 1'
  );
  section = replaceOnce(
    section,
    '<p class="svc4-item__aside-label">Best when</p>',
    '<p class="svc4-item__aside-label"><%- esc(section.aside_label_2) %></p>',
    'aside label 2'
  );
  section = replaceOnce(
    section,
    '<p class="svc4-item__aside-value">New products, redesigns, or usability problems</p>',
    '<p class="svc4-item__aside-value"><%- esc(section.aside_value_2) %></p>',
    'aside value 2'
  );

  // Sections are separated by a blank line, but the last one is not followed by
  // one. Drop it from the prototype and emit it between iterations instead.
  if (!section.endsWith('\n\n')) {
    throw new Error('build-templates: service section prototype has no trailing blank line');
  }
  section = section.slice(0, -1);

  return r.replace(
    '<% serviceSections.forEach(function (section, sectionIndex) { -%>\n' +
      section +
      '<% if (sectionIndex < serviceSections.length - 1) { -%>\n' +
      '\n' +
      '<% } -%>\n' +
      '<% }); -%>\n'
  );
}

// ===========================================================================
// portfolio.html
// ===========================================================================
function buildPortfolio() {
  let html = read('portfolio.html');

  // -- Filter buttons -------------------------------------------------------
  {
    const r = region(
      html,
      '                                    <a href="#" class="at-btn filter-btn btn-sm active" data-filter="all">All Work</a>\n',
      '                                </div>',
      'portfolio filters'
    );

    html = r.replace(
      '<% portfolioCategories.forEach(function (category) { -%>\n' +
        ' '.repeat(36) +
        '<a href="#" class="at-btn filter-btn btn-sm" data-filter="<%- esc(category.slug) %>"><%- esc(category.name) %></a>\n' +
        '<% }); -%>\n'
    );
  }

  // -- Project grid ---------------------------------------------------------
  {
    const r = region(
      html,
      '                            <!-- beautify ignore:start -->\n',
      '            <!-- beautify ignore:end -->',
      'portfolio grid'
    );

    // This grid sits inside a `beautify ignore` block: only the first card is
    // indented, the rest start at column 0. `lead` carries that one indent and is
    // emitted once, outside the loop.
    const { lead, blocks } = splitBlocks(
      r.body,
      '<div class="alt-portfolio-item card-portfolio mb-50 at-hover-item col-lg-6" data-category="'
    );
    if (blocks.length !== 14) {
      throw new Error(`build-templates: expected 14 portfolio projects, found ${blocks.length}`);
    }

    let card = blocks[0];

    card = replaceOnce(
      card,
      'data-category="branding">',
      'data-category="<%- esc(item.category_slug || \'\') %>">',
      'project category'
    );
    card = replaceAll(
      card,
      '<a target="_blank" rel="noopener" href="https://iamsreelalck.com/project/branding-and-digital-presence"',
      '<a<% if (item.open_in_new_tab) { %> target="_blank" rel="noopener"<% } %> href="<%- esc(safeUrl(item.link)) %>"',
      'project links'
    );
    card = replaceOnce(
      card,
      '<img class="w-100" src="images/img-45.webp" alt="Spunk Systems">',
      '<img class="w-100" src="<%- esc(item.cover_image) %>" alt="<%- esc(item.cover_alt) %>">',
      'project cover'
    );
    card = replaceOnce(
      card,
      '>Branding</span>',
      '><%- esc(item.category_label) %></span>',
      'project pill'
    );
    card = replaceOnce(
      card,
      '<h1 class="h4 fw-400 text-white mb-0 mt-15">Spunk Systems</h1>',
      '<h1 class="h4 fw-400 text-white mb-0 mt-15"><%- esc(item.title) %></h1>',
      'project overlay title'
    );
    card = replaceOnce(
      card,
      'Brand identity for an IT consulting and managed services firm — logo, colour, typography and a complete brand system across digital and print.',
      '<%- esc(item.short_description) %>',
      'project description'
    );

    // The featured badge is optional.
    card = replaceOnce(
      card,
      '        <span class="alt-portfolio-tag bg-theme-primary px-3 py-2 rounded-pill p-absolute top-0 end-0 m-4 fz-10 fw-600 text-white">FEATURED CASE</span>\n',
      '<% if (item.badge_text) { -%>\n' +
        '        <span class="alt-portfolio-tag bg-theme-primary px-3 py-2 rounded-pill p-absolute top-0 end-0 m-4 fz-10 fw-600 text-white"><%- esc(item.badge_text) %></span>\n' +
        '<% } -%>\n',
      'project badge'
    );
    card = replaceOnce(
      card,
      'class="common-underline">Spunk Systems</a>',
      'class="common-underline"><%- esc(item.title) %></a>',
      'project title link'
    );
    card = replaceOnce(
      card,
      '<span class="fz-font-label neutral-900 text-uppercase fw-600">View case</span>',
      '<span class="fz-font-label neutral-900 text-uppercase fw-600"><%- esc(item.cta_label) %></span>',
      'project cta label'
    );

    html = r.replace(
      lead + '<% portfolioProjects.forEach(function (item) { -%>\n' + card + '<% }); -%>\n'
    );
  }

  return html;
}

// ===========================================================================

fs.mkdirSync(OUT, { recursive: true });

const outputs = {
  'index.ejs': buildIndex(),
  'services.ejs': buildServices(),
  'portfolio.ejs': buildPortfolio()
};

for (const [name, content] of Object.entries(outputs)) {
  write(path.join(OUT, name), content);
  console.log('Wrote app/views/public/' + name + ' (' + content.split('\n').length + ' lines)');
}
