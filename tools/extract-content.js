'use strict';

/**
 * Development tool: lifts the hand-written content out of the original static
 * pages into app/db/seed-data.json.
 *
 * Run once against the pristine markup. The generated JSON is the durable
 * artifact that `npm run db:seed` consumes, so the seeding step itself never
 * has to parse HTML.
 *
 *   node tools/extract-content.js [sourceDir]
 */

const fs = require('fs');
const path = require('path');

const { decodeEntities } = require('../app/lib/html');

const SOURCE = path.resolve(process.argv[2] || path.join(__dirname, '..', 'IAMSREE'));
const OUT = path.join(__dirname, '..', 'app', 'db', 'seed-data.json');

const read = (file) => fs.readFileSync(path.join(SOURCE, file), 'utf8');
const text = (value) => decodeEntities(String(value == null ? '' : value)).trim();

function matchAll(source, re) {
  const out = [];
  let m;
  const rx = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  while ((m = rx.exec(source)) !== null) out.push(m);
  return out;
}

// --------------------------------------------------------------------------
// Homepage: case studies
// --------------------------------------------------------------------------
function extractCaseStudies(html) {
  const cards = matchAll(
    html,
    /<div class="card_case__studies-card card_case__studies-card--overlay bg-neutral-100">([\s\S]*?)\n {36}<\/div>/
  );

  return cards.map((m, index) => {
    const block = m[1];
    const visualAnchor = /<div class="card_case__studies-visual anim-zoomin">\s*<a ([^>]*)href="([^"]+)"/.exec(block);
    const img = /<img src="([^"]+)" alt="([^"]*)">/.exec(block) || [];
    const metricValue = /card_case__studies-metric-value">([\s\S]*?)<\/h3>/.exec(block) || [];
    const metricLabel = /card_case__studies-metric-label">([\s\S]*?)<\/span>/.exec(block) || [];
    const title = /card_case__studies-footer-title neutral-900">\s*<a href="[^"]*">\s*([\s\S]*?)\s*<\/a>/.exec(block) || [];
    // Kept verbatim - the original markup is inconsistent about a leading space
    // inside this span, and storing it as-is keeps the render byte-exact.
    const cta = /class="card_case__studies-link neutral-900">\s*<span class="neutral-900">([^<]*)<\/span>/.exec(block) || [];

    const tags = matchAll(block, /<a href="([^"]+)" class="card_case__studies-tag">([\s\S]*?)<\/a>/).map((t) => ({
      label: text(t[2]),
      link: t[1]
    }));

    return {
      title: text(title[1]),
      link: visualAnchor ? visualAnchor[2] : '',
      open_in_new_tab: visualAnchor && /target="_blank"/.test(visualAnchor[1]) ? 1 : 0,
      description: '',
      image: img[1] || '',
      image_alt: text(img[2]),
      metric_value: text(metricValue[1]),
      metric_label: text(metricLabel[1]),
      cta_label: decodeEntities(cta[1] || ''),
      tags_json: JSON.stringify(tags),
      position: index,
      is_visible: 1
    };
  });
}

// --------------------------------------------------------------------------
// Homepage: testimonials
// --------------------------------------------------------------------------
function extractTestimonials(html) {
  const cols = matchAll(
    html,
    /<div class="col-xxl-3 col-lg-4 col-md-6 col-12 ([^"]*)">\s*<div class="hover-unborder">([\s\S]*?)\n {28}<\/div>/
  );

  return cols.map((m, index) => {
    const block = m[2];
    // Anchored to the name bar: the inverted card layout puts star <span>s
    // before it, which an unanchored match would latch onto instead.
    const name =
      /<h3 class="h6 d-flex justify-content-between align-items-center mb-0">\s*<span>([^<]*)<\/span>/.exec(
        block
      ) || [];
    const company = /fz-font-md fw-500 text-end mb-0">\s*([\s\S]*?)\s*<\/p>/.exec(block) || [];
    const avatar = /<img class="img-cover" src="([^"]+)" alt="([^"]*)">/.exec(block) || [];
    const quote = /<blockquote[^>]*>([\s\S]*?)<\/blockquote>/.exec(block) || [];

    return {
      client_name: text(name[1]),
      role_title: '',
      company: text(company[1]),
      quote: text(quote[1]),
      avatar: avatar[1] || '',
      avatar_alt: text(avatar[2]),
      rating: (block.match(/<span class="star">/g) || []).length,
      column_classes: m[1].trim(),
      // Cards whose quote panel precedes the name bar are the inverted variant.
      layout: block.indexOf('rounded-4 p-5 mb-2') !== -1 ? 'header_bottom' : 'header_top',
      position: index,
      is_visible: 1
    };
  });
}

// --------------------------------------------------------------------------
// Homepage: selected client projects
// --------------------------------------------------------------------------
function extractClientProjects(html) {
  const section = /<h3 class="alt-section-title lh-1 neutral-900 fw-700 mb-30 reveal-text mb-0">Selected <br> client projects\.<\/h3>([\s\S]*?)<\/main>/.exec(html);
  if (!section) return [];
  const scope = section[1];
  const out = [];

  // Capture the whole attribute list: attribute order is not consistent across
  // the original markup (some anchors put href first, others target first).
  const feature = /<div class="alt-portfolio-item mb-30 at-hover-item">\s*<a ([^>]*class="alt-portfolio-thumb[^"]*"[^>]*)>([\s\S]*?)<\/a>/.exec(scope);
  if (feature) {
    const attrs = feature[1];
    const body = feature[2];
    const img = /<img class="w-100 scale-img-from-to"[^>]*src="([^"]+)" alt="([^"]*)">/.exec(body) || [];
    const pill = /rounded-pill text-white fz-font-label">([\s\S]*?)<\/span>/.exec(body) || [];
    const title = /<h2 class="h4 fw-200 text-white mb-0 mt-20">([\s\S]*?)<\/h2>/.exec(body) || [];
    const desc = /<p class="text-white fz-font-lg mb-0 mt-10 text-truncate-3 des">([\s\S]*?)<\/p>/.exec(body) || [];

    out.push({
      title: text(title[1]),
      description: text(desc[1]),
      image: img[1] || '',
      image_alt: text(img[2]),
      link: (/href="([^"]+)"/.exec(attrs) || [, ''])[1],
      open_in_new_tab: /target="_blank"/.test(attrs) ? 1 : 0,
      card_style: 'feature',
      category_label: text(pill[1]),
      role_label: '',
      position: out.length,
      is_visible: 1
    });
  }

  matchAll(
    scope,
    /<div class="blog-card__thumb rounded-4 hover-effect-1">\s*<a ([^>]*class="blog-card__img-link")>([\s\S]*?)<\/div>\s*<div class="blog-card__content mt-30">([\s\S]*?)<\/div>/
  ).forEach((m) => {
    const attrs = m[1];
    const img = /<img src="([^"]+)" class="blog-card__img" alt="([^"]*)">/.exec(m[2]) || [];
    const content = m[3];
    const title = /class="blog-card__title-link">([\s\S]*?)<\/a>/.exec(content) || [];
    const author = /<span class="blog-card__author">([\s\S]*?)<\/span>/.exec(content) || [];
    const suffix = /<span class="blog-card__meta-text">\s*&ndash;([\s\S]*?)<\/span>/.exec(content) || [];

    out.push({
      title: text(title[1]),
      description: '',
      image: img[1] || '',
      image_alt: text(img[2]),
      link: (/href="([^"]+)"/.exec(attrs) || [, ''])[1],
      open_in_new_tab: /target="_blank"/.test(attrs) ? 1 : 0,
      card_style: 'blog',
      category_label: text(suffix[1]),
      role_label: text(author[1]),
      position: out.length,
      is_visible: 1
    });
  });

  return out;
}

// --------------------------------------------------------------------------
// Homepage: "15+ brands collaborated with" logo wall
//
// The grid reuses a handful of logos across many cells, so the images are
// de-duplicated into a brand library and each cell records which brands it
// cycles through.
// --------------------------------------------------------------------------
function extractBrands(html) {
  const tileRe =
    /<div class="at-brand-item at_fade_anim" data-delay="([^"]*)" data-fade-from="([^"]*)" data-ease="([^"]*)">([\s\S]*?)\n {28}<\/div>/;

  const brandsByImage = new Map();
  const tiles = [];

  matchAll(html, tileRe).forEach((m, index) => {
    const slides = matchAll(
      m[4],
      /<span class="brand-logo-slide" data-logo="([^"]*)">\s*<img decoding="async" class="dark-mode-invert" src="([^"]+)" alt="([^"]*)">/
    ).map((s, slideIndex) => {
      const image = s[2];

      if (!brandsByImage.has(image)) {
        brandsByImage.set(image, {
          // The original markup has no brand names - every alt is the site
          // owner's name - so a readable placeholder is derived from the file
          // name for the admin list. Editors rename these.
          name: (image.split('/').pop() || 'brand')
            .replace(/\.[a-z0-9]+$/i, '')
            .replace(/^thumb_/, '')
            .replace(/[_-]+/g, ' ')
            .replace(/\b\w/g, (c) => c.toUpperCase()),
          image,
          image_alt: text(s[3]),
          link: '',
          position: brandsByImage.size,
          is_visible: 1
        });
      }

      return { image, data_logo: s[1], position: slideIndex, is_visible: 1 };
    });

    tiles.push({
      tile: {
        delay: m[1],
        fade_from: m[2],
        ease: m[3],
        position: index,
        is_visible: 1
      },
      slides
    });
  });

  return { brands: [...brandsByImage.values()], tiles };
}

// --------------------------------------------------------------------------
// Editable page copy
// --------------------------------------------------------------------------
function extractSettings(html) {
  const heading = /<h3 class="h6 fz-font-md text-uppercase neutral-500 fw-200 mb-30">\s*([\s\S]*?)\s*<\/h3>/.exec(html) || [];
  const intro = /<h4 class="h5 fw-200 reveal-text pe-xxl-5">\s*([\s\S]*?)\s*<\/h4>/.exec(html) || [];

  return [
    {
      key: 'brands_heading',
      label: 'Brand wall heading',
      description: 'The small uppercase line above the intro, on the homepage.',
      value: text(heading[1]),
      multiline: 0,
      position: 0,
      is_visible: 1
    },
    {
      key: 'brands_intro',
      label: 'Brand wall intro',
      description: 'The sentence beside the homepage logo grid.',
      value: text(intro[1]),
      multiline: 1,
      position: 1,
      is_visible: 1
    }
  ];
}

// --------------------------------------------------------------------------
// Services page: accordion sections + deliverables
// --------------------------------------------------------------------------
function extractServices(html) {
  const items = matchAll(
    html,
    /<!-- ([^>]*?) -->\s*<div class="svc4-item" id="svc4-([a-z0-9-]+)" data-svc4-item="" data-preview="([^"]*)">([\s\S]*?)\n {28}<\/div>/
  );

  return items.map((m, index) => {
    const block = m[4];
    const thumb = /<span class="svc4-item__thumb">\s*<img src="([^"]+)"/.exec(block) || [];
    const name = /<span class="svc4-item__name">([\s\S]*?)<\/span>/.exec(block) || [];
    const tag = /<span class="svc4-item__tag">([\s\S]*?)<\/span>/.exec(block) || [];
    const visual = /<div class="svc4-item__visual">\s*<img class="anim-zoomin" src="([^"]+)" alt="([^"]*)"/.exec(block) || [];
    const desc = /<div class="svc4-item__copy">\s*<p>([\s\S]*?)<\/p>/.exec(block) || [];
    const link = /<a class="svc4-item__link" href="([^"]+)">([\s\S]*?)<\/a>/.exec(block) || [];
    const asideLabels = matchAll(block, /<p class="svc4-item__aside-label">([\s\S]*?)<\/p>/).map((x) => text(x[1]));
    const asideValues = matchAll(block, /<p class="svc4-item__aside-value">([\s\S]*?)<\/p>/).map((x) => text(x[1]));

    const deliverables = matchAll(block, /<li>([\s\S]*?)<\/li>/).map((li, i) => ({
      text: text(li[1]),
      link: '',
      icon: '',
      position: i,
      is_visible: 1
    }));

    return {
      section: {
        slug: m[2],
        label: text(m[1]),
        name: text(name[1]),
        tag: text(tag[1]),
        description: text(desc[1]),
        thumb_image: thumb[1] || '',
        preview_image: m[3],
        visual_image: visual[1] || '',
        visual_alt: text(visual[2]),
        link_label: text(link[2]),
        link_url: link[1] || '',
        aside_label_1: asideLabels[0] || '',
        aside_value_1: asideValues[0] || '',
        aside_label_2: asideLabels[1] || '',
        aside_value_2: asideValues[1] || '',
        position: index,
        is_visible: 1
      },
      items: deliverables
    };
  });
}

// --------------------------------------------------------------------------
// Portfolio page: categories + projects
// --------------------------------------------------------------------------
function extractPortfolio(html) {
  const categories = matchAll(
    html,
    /<a href="#" class="at-btn filter-btn btn-sm[^"]*" data-filter="([^"]+)">([\s\S]*?)<\/a>/
  )
    // "all" is the built-in reset button, not a stored category.
    .filter((m) => m[1] !== 'all')
    .map((m, index) => ({
      name: text(m[2]),
      slug: m[1],
      position: index,
      is_visible: 1
    }));

  const projects = matchAll(
    html,
    /<div class="alt-portfolio-item card-portfolio mb-50 at-hover-item col-lg-6" data-category="([^"]+)">([\s\S]*?)\n<\/div>/
  ).map((m, index) => {
    const block = m[2];
    const anchor = /<a ([^>]*?)href="([^"]+)" class="alt-portfolio-thumb/.exec(block) || [];
    const img = /<img class="w-100" src="([^"]+)" alt="([^"]*)">/.exec(block) || [];
    const pill = /rounded-pill common-white fz-font-label">([\s\S]*?)<\/span>/.exec(block) || [];
    const title = /<h1 class="h4 fw-400 text-white mb-0 mt-15">([\s\S]*?)<\/h1>/.exec(block) || [];
    const desc = /<p class="text-white fz-font-md mb-0 mt-10 text-truncate-3 des pr-250">([\s\S]*?)<\/p>/.exec(block) || [];
    const badge = /<span class="alt-portfolio-tag[^"]*">([\s\S]*?)<\/span>/.exec(block) || [];
    const cta = /<span class="fz-font-label neutral-900 text-uppercase fw-600">([\s\S]*?)<\/span>/.exec(block) || [];

    const titleText = text(title[1]);

    return {
      title: titleText,
      slug: titleText
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, ''),
      category_slug: m[1],
      short_description: text(desc[1]),
      full_description: '',
      cover_image: img[1] || '',
      cover_alt: text(img[2]),
      gallery_json: '[]',
      client_name: '',
      year: '',
      link: anchor[2] || '',
      open_in_new_tab: /target="_blank"/.test(anchor[1] || '') ? 1 : 0,
      // The pill text duplicates the category name in the card overlay.
      category_label: text(pill[1]),
      badge_text: text(badge[1]),
      cta_label: text(cta[1]),
      position: index,
      is_visible: 1
    };
  });

  return { categories, projects };
}

// --------------------------------------------------------------------------
// Project detail page
//
// The original ships one hand-written detail page (Krooqi). Its content becomes
// that project's detail fields; every other project gets the same page driven by
// what is already known about it, so all fourteen have a working page on day one.
// --------------------------------------------------------------------------
function extractProjectDetail(html) {
  const pick = (re, group = 1) => {
    const m = re.exec(html);
    return m ? text(m[group]) : '';
  };

  const gallery = matchAll(
    html,
    /<div class="about-me-slider-thumb at-item-anime marque">\s*<img class="w-100 rounded-4" src="([^"]+)" alt="([^"]*)">/
  ).map((m) => ({ src: m[1], alt: text(m[2]) }));

  const features = matchAll(html, /<li class="neutral-950">([\s\S]*?)<\/li>/).map((m) => text(m[1]));

  const related = matchAll(
    html,
    /<h3 class="h5 alt-portfolio-title mb-0"><a href="([^"]+)"[^>]*class="common-underline">([\s\S]*?)<\/a>/
  ).map((m) => text(m[2]));

  const relatedImages = matchAll(
    html,
    /<img class="w-100 scale-img-from-to" data-value-1="1.5" data-value-2="1" src="([^"]+)" alt="([^"]*)">/
  ).map((m) => m[1]);

  const metaPairs = matchAll(
    html,
    /<p class="fz-font-md neutral-900 mb-0">([\s\S]*?)<\/p>\s*<p class="fz-font-lg fw-600 mb-0 neutral-900">([\s\S]*?)<\/p>/
  ).map((m) => ({ label: text(m[1]), value: text(m[2]) }));

  const metaValue = (label) => {
    const found = metaPairs.find((p) => p.label.toLowerCase() === label);
    return found ? found.value : '';
  };

  return {
    // Which project this page belongs to.
    slug: 'krooqi',
    page_title: pick(/<title>([\s\S]*?)<\/title>/),
    meta_description: pick(/<meta name="description" content="([^"]*)"/),
    hero_superscript: pick(/<sup class="fz-80 fw-400 top-0">([\s\S]*?)<\/sup>/),
    hero_subtitle: pick(/<h2 class="h5 fw-600 mb-0">([\s\S]*?)<\/h2>/),
    hero_image: (/<div class="col-12 pt-30">\s*<img src="([^"]+)"/.exec(html) || [])[1] || '',
    secondary_image:
      (/<div class="col-lg-5 pr-100 pb-lg-0 pb-40">\s*<img src="([^"]+)"/.exec(html) || [])[1] || '',
    live_demo_url: (/<a href="([^"]+)"[^>]*class="border-bottom-900 d-inline-block">/.exec(html) || [])[1] || '',
    live_demo_label: pick(/<span class="text-1">(live demo)<\/span>/),
    full_description: pick(/<p class="fz-font-2xl fw-400 neutral-900 mt-60 mb-60">([\s\S]*?)<\/p>/),
    client_name: metaValue('client'),
    year: metaValue('release date'),
    role: metaValue('role'),
    detail_category: metaValue('category'),
    solution_text: pick(/<p class="fz-font-xl neutral-900">([\s\S]*?)<\/p>/),
    features_json: JSON.stringify(features),
    outcome_text: pick(/<p class="fz-font-xl fw-500 neutral-900 mb-0">([\s\S]*?)<\/p>/),
    gallery_json: JSON.stringify(gallery),
    closing_image_1:
      (/<div class="col-12 pb-50">\s*<img src="([^"]+)"/.exec(html) || [])[1] || '',
    closing_image_2:
      (/<div class="col-12">\s*<img src="([^"]+)" alt="[^"]*" class="w-100">\s*<\/div>\s*<\/div>/.exec(html) || [])[1] || '',
    testimonial_name: pick(/<h3 class="h6 testimonial-content-author-name fw-600 mb-0 fz-font-md">([\s\S]*?)<\/h3>/),
    related_titles: related,
    related_images: relatedImages
  };
}

// --------------------------------------------------------------------------

const indexHtml = read('index.html');
const servicesHtml = read('services.html');
const portfolioHtml = read('portfolio.html');
const detailHtml = read('portfolio-details.html');

/**
 * Merges the hand-written detail page into the project it describes, and gives
 * every other project the same page shape from what is already known about it.
 */
function applyProjectDetails(portfolio, detail) {
  const relatedImageBySlug = new Map();
  detail.related_titles.forEach((title, i) => {
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    if (detail.related_images[i]) relatedImageBySlug.set(slug, detail.related_images[i]);
  });

  return portfolio.projects.map((project) => {
    const isSource = project.slug === detail.slug;

    const base = {
      ...project,
      // The card used to link straight out to the client's site; that URL is now
      // the detail page's "live demo" link and the card points at the page.
      live_demo_url: project.link,
      live_demo_label: 'live demo',
      open_in_new_tab: 0,
      related_image: relatedImageBySlug.get(project.slug) || '',
      related_slugs_json: '[]'
    };

    if (isSource) {
      return {
        ...base,
        page_title: detail.page_title,
        meta_description: detail.meta_description,
        hero_superscript: detail.hero_superscript,
        hero_subtitle: detail.hero_subtitle,
        hero_image: detail.hero_image,
        secondary_image: detail.secondary_image,
        live_demo_url: detail.live_demo_url,
        live_demo_label: detail.live_demo_label,
        full_description: detail.full_description,
        client_name: detail.client_name,
        year: detail.year,
        role: detail.role,
        solution_text: detail.solution_text,
        features_json: detail.features_json,
        outcome_text: detail.outcome_text,
        gallery_json: detail.gallery_json,
        closing_image_1: detail.closing_image_1,
        closing_image_2: detail.closing_image_2,
        testimonial_name: detail.testimonial_name,
        related_slugs_json: JSON.stringify(
          detail.related_titles.map((t) =>
            t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
          )
        )
      };
    }

    return {
      ...base,
      page_title: `${project.title} — ${project.category_label} Case Study | Sreelal C K`,
      meta_description: detail.meta_description,
      hero_superscript: '',
      hero_subtitle: project.category_label,
      hero_image: project.cover_image,
      secondary_image: '',
      full_description: project.short_description,
      role: 'UI/UX Designer',
      solution_text: '',
      features_json: '[]',
      outcome_text: '',
      gallery_json: '[]',
      closing_image_1: '',
      closing_image_2: ''
    };
  });
}

const data = {
  generatedFrom: path.basename(SOURCE),
  caseStudies: extractCaseStudies(indexHtml),
  testimonials: extractTestimonials(indexHtml),
  clientProjects: extractClientProjects(indexHtml),
  brands: extractBrands(indexHtml),
  settings: extractSettings(indexHtml),
  services: extractServices(servicesHtml),
  portfolio: extractPortfolio(portfolioHtml)
};

data.portfolio.projects = applyProjectDetails(data.portfolio, extractProjectDetail(detailHtml));

/**
 * Content is stored decoded, so any named entity still present is one
 * `decodeEntities` does not know. Left alone it would be escaped again at render
 * time and show up as literal "&middot;" text on the page, so fail here instead.
 */
const undecoded = [...new Set([...JSON.stringify(data).matchAll(/&([a-zA-Z][a-zA-Z0-9]*);/g)].map((m) => m[1]))];
if (undecoded.length) {
  console.error(
    'Unknown HTML entities survived extraction: ' + undecoded.join(', ') +
      '\nAdd them to DECODE_ENTITIES in app/lib/html.js, then re-run.'
  );
  process.exit(1);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(data, null, 2) + '\n');

console.log('Wrote ' + path.relative(process.cwd(), OUT));
console.log('  case studies    : ' + data.caseStudies.length);
console.log('  testimonials    : ' + data.testimonials.length);
console.log('  client projects : ' + data.clientProjects.length);
console.log('  brands          : ' + data.brands.brands.length +
  ' logos across ' + data.brands.tiles.length + ' grid tiles (' +
  data.brands.tiles.reduce((n, t) => n + t.slides.length, 0) + ' slides)');
console.log('  page copy       : ' + data.settings.length);
console.log('  service sections: ' + data.services.length +
  ' (' + data.services.reduce((n, s) => n + s.items.length, 0) + ' deliverables)');
console.log('  portfolio       : ' + data.portfolio.projects.length +
  ' projects, ' + data.portfolio.categories.length + ' categories');
