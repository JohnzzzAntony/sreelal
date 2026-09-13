'use strict';

/**
 * Shared parity rules, used by both verify-parity.js (renders templates
 * directly) and smoke-test.js (checks a running server), so the two can never
 * disagree about what counts as a match.
 *
 * Three kinds of allowance, all explicit:
 *
 *   corrections  - defects in the hand-written markup the data model does not
 *                  reproduce. Applied to the original before comparing.
 *   maskLinks    - hrefs that changed on purpose. Masked on BOTH sides, so the
 *                  comparison still proves everything around them is identical.
 *   collapseGaps - ignore whitespace between tags. Only for pages that are now
 *                  templates over varying-length content, where the original's
 *                  hand-formatting is not reproducible or meaningful.
 */

const { decodeEntities } = require('../app/lib/html');

const PAGE_RULES = {
  'index.html': {
    corrections: [
      {
        from: 'alt="Sreelalal C K"',
        to: 'alt="Sreelal C K"',
        why: 'typo in one brand logo alt attribute; alt text is stored per brand, not per grid slot'
      },
      {
        // All four occurrences on this page are the Krooqi card and the Krooqi
        // link below it. They pointed at the shared detail page, which now needs
        // to know which project to show.
        from: 'href="portfolio-details.html"',
        to: 'href="portfolio-details.html?slug=krooqi"',
        why: 'homepage Krooqi links now open that project rather than a slugless page'
      }
    ]
  },

  'portfolio.html': {
    corrections: [
      {
        from: '    <link rel="stylesheet" href="css/main.css">\n',
        to:
          '    <link rel="stylesheet" href="css/main.css">\n' +
          '    <link rel="stylesheet" href="css/site-overrides.css">\n',
        why: 'added stylesheet that gives every card the same size; main.css itself is untouched'
      }
    ],
    // Project cards used to link straight out to the client's site (or to a
    // single shared detail page). Each card now opens that project's own page.
    // Masking only the card anchors keeps the rest of the page under strict
    // comparison. Attribute order varies in the original, hence the two forms.
    maskLinks: [
      {
        pattern:
          /<a(?: target="_blank" rel="noopener")? href="[^"]*"(?: target="_blank" rel="noopener")?(?= class="(?:alt-portfolio-thumb|common-underline|alt-portfolio-plus))/g,
        why: 'project cards now open their own detail page'
      }
    ]
  },

  'portfolio-details.html': {
    corrections: [
      {
        from: '    <link rel="stylesheet" href="css/main.css">\n',
        to:
          '    <link rel="stylesheet" href="css/main.css">\n' +
          '    <link rel="stylesheet" href="css/site-overrides.css">\n',
        why: 'added stylesheet that gives every card the same size; main.css itself is untouched'
      },
      {
        from: '<img src="images/img-181.webp" alt="Sreelal C K" class="w-100">',
        to: '<img src="images/img-181.webp" alt="Krooqi" class="w-100">',
        why: 'image alt now describes the project instead of repeating the site owner\'s name'
      },
      {
        from: '<img src="images/img-182.webp" alt="Sreelal C K">',
        to: '<img src="images/img-182.webp" alt="Krooqi">',
        why: 'image alt now describes the project'
      },
      {
        from: '<img src="images/img-187.webp" alt="Sreelal C K" class="w-100">',
        to: '<img src="images/img-187.webp" alt="Krooqi" class="w-100">',
        why: 'image alt now describes the project'
      },
      {
        from: '<img src="images/img-188.webp" alt="Sreelal C K" class="w-100">',
        to: '<img src="images/img-188.webp" alt="Krooqi" class="w-100">',
        why: 'image alt now describes the project'
      },
      {
        from: '<img src="images/avatar-20.webp" alt="Sreelal C K">',
        to: '<img src="images/avatar-10.webp" alt="Sreelal C K">',
        why: 'the quote and its avatar now come from the one testimonial record, which uses avatar-10'
      }
    ],
    // The strip is now derived from the project list rather than hand-written,
    // so its contents legitimately differ. Everything outside it still compared.
    maskRegions: [
      {
        from: '<div class="row mt-30">',
        to: '</div>\n                    </div>\n                </div>\n            </main>',
        why: 'related projects are now derived from the project list'
      }
    ],
    // This page became a template for all fourteen projects, so the original's
    // one-off blank line inside the gallery cannot be reproduced meaningfully.
    collapseGaps: true
  }
};

/**
 * Collapses differences that are not visible to a browser: entity spelling
 * (`&mdash;` vs a literal em dash on a UTF-8 page) and line endings.
 */
function normalise(html) {
  return decodeEntities(html).replace(/\r\n/g, '\n');
}

/** Reduces a document to its tags and text, ignoring whitespace between them. */
function collapseGaps(html) {
  return html
    .replace(/>\s+</g, '>\n<')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
}

/**
 * Applies a page's known corrections, reporting how many landed.
 *
 * The originals are CRLF but corrections are written with plain newlines, so a
 * multi-line anchor is tried in both forms rather than silently not matching.
 */
function applyCorrections(page, html) {
  const rules = PAGE_RULES[page] || {};
  const applied = [];
  let out = html;

  for (const fix of rules.corrections || []) {
    if (fix.to.includes('site-overrides.css') && out.includes('css/site-overrides.css')) {
      continue;
    }
    const forms = [
      [fix.from, fix.to],
      [fix.from.replace(/\n/g, '\r\n'), fix.to.replace(/\n/g, '\r\n')]
    ];

    for (const [from, to] of forms) {
      const count = out.split(from).length - 1;
      if (count === 0) continue;
      out = out.split(from).join(to);
      applied.push({ ...fix, count });
      break;
    }
  }
  return { html: out, applied };
}

/** Blanks out hrefs that changed on purpose. Must be applied to both sides. */
function maskLinks(page, html) {
  const rules = PAGE_RULES[page] || {};
  const applied = [];
  let out = html;

  for (const rule of rules.maskLinks || []) {
    const count = (out.match(rule.pattern) || []).length;
    if (count > 0) {
      out = out.replace(rule.pattern, '<a href="[masked]"');
      applied.push({ ...rule, count });
    }
  }
  return { html: out, applied };
}

/** Blanks out whole sections that are now derived. Applied to both sides. */
function maskRegions(page, html) {
  const rules = PAGE_RULES[page] || {};
  const applied = [];
  let out = html;

  for (const rule of rules.maskRegions || []) {
    const start = out.indexOf(rule.from);
    if (start === -1) continue;
    const end = out.indexOf(rule.to, start + rule.from.length);
    if (end === -1) continue;

    out = out.slice(0, start + rule.from.length) + '\n[region masked]\n' + out.slice(end);
    applied.push({ ...rule, count: 1 });
  }
  return { html: out, applied };
}

/**
 * Prepares either side of a comparison identically.
 *
 * Line endings are normalised first: the original files are CRLF, and the
 * multi-line region anchors below are written with plain newlines.
 */
function comparable(page, html) {
  const rules = PAGE_RULES[page] || {};
  let out = html.replace(/\r\n/g, '\n');
  out = maskLinks(page, out).html;
  out = maskRegions(page, out).html;
  out = normalise(out);
  if (rules.collapseGaps) out = collapseGaps(out);
  return out;
}

/** The original page as it should be compared against. */
function baselineFor(page, original) {
  return comparable(page, applyCorrections(page, original).html);
}

module.exports = {
  PAGE_RULES,
  normalise,
  collapseGaps,
  applyCorrections,
  maskLinks,
  maskRegions,
  comparable,
  baselineFor
};
