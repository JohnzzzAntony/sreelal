'use strict';

/**
 * Proves the dynamic pages render the same document as the original static
 * files.
 *
 * Per page the run reports:
 *
 *   exact      - byte-for-byte identical output.
 *   equivalent - identical once entity spelling, deliberate corrections and
 *                deliberately changed links are accounted for. That is the
 *                guarantee that matters: `&mdash;` and a literal "—" are the
 *                same character to a browser on a UTF-8 page, and the original
 *                files are internally inconsistent about which they use.
 *
 * Every allowance is enumerated in tools/parity.js and printed here, so nothing
 * is waved through silently. A page that is not at least `equivalent` fails.
 *
 *   node tools/verify-parity.js
 */

const fs = require('fs');
const path = require('path');
const ejs = require('ejs');

const { applyCorrections, maskLinks, maskRegions, comparable } = require('./parity');
const pageData = require('../app/lib/pageData');

const SITE = path.join(__dirname, '..', 'IAMSREE');
const VIEWS = path.join(__dirname, '..', 'app', 'views', 'public');

const PAGES = [
  { name: 'index.html', template: 'index.ejs', locals: pageData.homepage },
  { name: 'services.html', template: 'services.ejs', locals: pageData.servicesPage },
  { name: 'portfolio.html', template: 'portfolio.ejs', locals: pageData.portfolioPage },
  {
    name: 'portfolio-details.html',
    template: 'portfolio-details.ejs',
    // The original detail page is Krooqi's; the other thirteen render from the
    // same template with their own content.
    locals: () => pageData.projectPage('krooqi')
  }
];

/** Reports the first differing line, with context, for a failed comparison. */
function firstDifference(a, b) {
  const linesA = a.split('\n');
  const linesB = b.split('\n');
  const max = Math.max(linesA.length, linesB.length);

  for (let i = 0; i < max; i++) {
    if (linesA[i] !== linesB[i]) {
      // Printed raw (quoted) so whitespace-only differences stay visible.
      return {
        line: i + 1,
        original: linesA[i] === undefined ? '<missing>' : JSON.stringify(linesA[i]),
        rendered: linesB[i] === undefined ? '<missing>' : JSON.stringify(linesB[i])
      };
    }
  }
  return null;
}

let failures = 0;

for (const page of PAGES) {
  const original = fs.readFileSync(path.join(SITE, page.name), 'utf8');
  const templatePath = path.join(VIEWS, page.template);
  const rendered = ejs.render(fs.readFileSync(templatePath, 'utf8'), page.locals(), {
    filename: templatePath
  });

  const corrected = applyCorrections(page.name, original);
  // Reported on newline-normalised text for the same reason `comparable` does.
  const normalisedOriginal = corrected.html.replace(/\r\n/g, '\n');
  const masked = maskLinks(page.name, normalisedOriginal);
  const maskedRegions = maskRegions(page.name, normalisedOriginal);

  const exact = corrected.html === rendered;
  const equivalent = comparable(page.name, corrected.html) === comparable(page.name, rendered);

  const status = exact ? 'EXACT' : equivalent ? 'EQUIVALENT' : 'DIFFERENT';
  console.log(
    `${status.padEnd(11)} ${page.name.padEnd(22)} ` +
      `original ${original.length} bytes, rendered ${rendered.length} bytes`
  );

  for (const fix of corrected.applied) {
    console.log(`            corrected x${fix.count}: ${fix.why}`);
  }
  for (const rule of masked.applied) {
    console.log(`            ${rule.count} links not compared: ${rule.why}`);
  }
  for (const rule of maskedRegions.applied) {
    console.log(`            section not compared: ${rule.why}`);
  }

  if (!equivalent) {
    failures += 1;
    const diff = firstDifference(
      comparable(page.name, corrected.html),
      comparable(page.name, rendered)
    );
    if (diff) {
      console.log(`            first difference at line ${diff.line}`);
      console.log('              original: ' + diff.original.slice(0, 170));
      console.log('              rendered: ' + diff.rendered.slice(0, 170));
    }
  } else if (!exact) {
    const spellings =
      (corrected.html.match(/&[a-zA-Z]+;/g) || []).length -
      (rendered.match(/&[a-zA-Z]+;/g) || []).length;
    if (spellings) {
      console.log(`            ${spellings} named entities rendered as UTF-8 literals instead`);
    }
  }
}

if (failures) {
  console.error(`\n${failures} page(s) do not match the original markup.`);
  process.exit(1);
}

console.log('\nAll public pages render the original document.');
