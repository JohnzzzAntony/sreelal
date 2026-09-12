'use strict';

/**
 * Proves the dynamic pages render the same document as the original static
 * files.
 *
 * Two comparisons are reported per page:
 *
 *   exact      - byte-for-byte identical output.
 *   equivalent - identical after decoding HTML entities, which is the guarantee
 *                that actually matters: `&mdash;` and a literal "—" are the same
 *                character to a browser on a UTF-8 page. The original files are
 *                internally inconsistent about which spelling they use.
 *
 * A page that is not at least `equivalent` fails the run.
 *
 *   node tools/verify-parity.js
 */

const fs = require('fs');
const path = require('path');
const ejs = require('ejs');

const { normalise, applyCorrections } = require('./parity');
const pageData = require('../app/lib/pageData');

const SITE = path.join(__dirname, '..', 'IAMSREE');
const VIEWS = path.join(__dirname, '..', 'app', 'views', 'public');

const PAGES = [
  { name: 'index.html', template: 'index.ejs', locals: pageData.homepage },
  { name: 'services.html', template: 'services.ejs', locals: pageData.servicesPage },
  { name: 'portfolio.html', template: 'portfolio.ejs', locals: pageData.portfolioPage }
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
  const baseline = corrected.html;

  const exact = baseline === rendered;
  const equivalent = normalise(baseline) === normalise(rendered);

  const status = exact ? 'EXACT' : equivalent ? 'EQUIVALENT' : 'DIFFERENT';
  console.log(
    `${status.padEnd(11)} ${page.name.padEnd(15)} ` +
      `original ${original.length} bytes, rendered ${rendered.length} bytes`
  );

  for (const fix of corrected.applied) {
    console.log(`            corrected x${fix.count}: ${fix.why}`);
  }

  if (!equivalent) {
    failures += 1;
    const diff = firstDifference(normalise(baseline), normalise(rendered));
    if (diff) {
      console.log(`            first difference at line ${diff.line}`);
      console.log('              original: ' + diff.original.slice(0, 160));
      console.log('              rendered: ' + diff.rendered.slice(0, 160));
    }
  } else if (!exact) {
    // Show how many entity spellings differ, so the gap stays visible and small.
    const spellings = (baseline.match(/&[a-zA-Z]+;/g) || []).length -
      (rendered.match(/&[a-zA-Z]+;/g) || []).length;
    console.log(`            ${spellings} named entities rendered as UTF-8 literals instead`);
  }
}

if (failures) {
  console.error(`\n${failures} page(s) do not match the original markup.`);
  process.exit(1);
}

console.log('\nAll public pages render the original document.');
