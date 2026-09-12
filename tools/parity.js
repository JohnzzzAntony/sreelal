'use strict';

/**
 * Shared parity rules, used by both verify-parity.js (renders templates
 * directly) and smoke-test.js (checks a running server), so the two can never
 * disagree about what counts as a match.
 */

const { decodeEntities } = require('../app/lib/html');

/**
 * Content corrections applied to the original before comparing.
 *
 * Deliberate, enumerated changes - each one a defect in the hand-written markup
 * that the data model does not reproduce. Listing them here keeps the check
 * strict for everything else: any drift not on this list still fails.
 */
const KNOWN_CORRECTIONS = [
  {
    page: 'index.html',
    from: 'alt="Sreelalal C K"',
    to: 'alt="Sreelal C K"',
    why: 'typo in one brand logo alt attribute; alt text is stored per brand, not per grid slot'
  }
];

/**
 * Collapses differences that are not visible to a browser: entity spelling
 * (`&mdash;` vs a literal em dash on a UTF-8 page) and line endings.
 */
function normalise(html) {
  return decodeEntities(html).replace(/\r\n/g, '\n');
}

/** Applies a page's known corrections, reporting how many landed. */
function applyCorrections(page, html) {
  const applied = [];
  let out = html;

  for (const fix of KNOWN_CORRECTIONS.filter((c) => c.page === page)) {
    const count = out.split(fix.from).length - 1;
    if (count > 0) {
      out = out.split(fix.from).join(fix.to);
      applied.push({ ...fix, count });
    }
  }
  return { html: out, applied };
}

/** The original page as it should be compared against: corrected, then normalised. */
function baselineFor(page, original) {
  return normalise(applyCorrections(page, original).html);
}

module.exports = { KNOWN_CORRECTIONS, normalise, applyCorrections, baselineFor };
