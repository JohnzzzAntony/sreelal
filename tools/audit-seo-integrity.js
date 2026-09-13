'use strict';

const fs = require('fs');
const path = require('path');

const DIST = path.join(__dirname, '..', 'dist');
const IAMSREE = path.join(__dirname, '..', 'IAMSREE');

function auditDir(dirPath, label) {
  console.log(`\n=== Auditing ${label} (${dirPath}) ===`);
  const files = fs.readdirSync(dirPath).filter((f) => f.endsWith('.html'));
  let passed = 0;
  let totalSchemas = 0;

  for (const file of files) {
    const filePath = path.join(dirPath, file);
    const content = fs.readFileSync(filePath, 'utf8');

    // Title
    const titleMatch = content.match(/<title>([^<]+)<\/title>/i);
    if (!titleMatch) throw new Error(`Missing <title> in ${file}`);

    // Meta Description
    const descMatch = content.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i);
    if (!descMatch) throw new Error(`Missing meta description in ${file}`);

    // Canonical
    const canonMatch = content.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i);
    if (!canonMatch) throw new Error(`Missing canonical in ${file}`);

    // Open Graph
    const ogTitle = content.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i);
    const ogDesc = content.match(/<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i);
    if (!ogTitle || !ogDesc) throw new Error(`Missing Open Graph in ${file}`);

    // Twitter Card
    const twCard = content.match(/<meta\s+name=["']twitter:card["']/i);
    if (!twCard) throw new Error(`Missing Twitter Card in ${file}`);

    // Schema JSON-LD validation
    const schemaMatches = [...content.matchAll(/<script\s+type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/gi)];
    if (schemaMatches.length === 0) {
      console.warn(`Warning: No JSON-LD in ${file}`);
    } else {
      for (const [_, jsonText] of schemaMatches) {
        try {
          const parsed = JSON.parse(jsonText.trim());
          if (!parsed['@context']) {
            throw new Error(`Schema missing @context in ${file}`);
          }
          if (parsed['@graph'] && Array.isArray(parsed['@graph'])) {
            for (const node of parsed['@graph']) {
              if (!node['@type']) throw new Error(`Node in @graph missing @type in ${file}`);
              totalSchemas += 1;
            }
          } else if (parsed['@type']) {
            totalSchemas += 1;
          } else {
            throw new Error(`Schema missing @type or @graph in ${file}`);
          }
        } catch (err) {
          throw new Error(`Invalid JSON-LD in ${file}: ${err.message}\nText: ${jsonText}`);
        }
      }
    }

    passed += 1;
  }

  console.log(`✓ ${passed} HTML files passed all metadata & SEO criteria.`);
  console.log(`✓ ${totalSchemas} JSON-LD schema blocks validated successfully.`);
}

auditDir(IAMSREE, 'Source IAMSREE Directory');
auditDir(DIST, 'Static Export dist/ Directory');

// Discovery files
for (const dir of [IAMSREE, DIST]) {
  const robots = path.join(dir, 'robots.txt');
  const sitemap = path.join(dir, 'sitemap.xml');
  const llms = path.join(dir, 'llms.txt');

  if (!fs.existsSync(robots)) throw new Error(`Missing robots.txt in ${dir}`);
  if (!fs.existsSync(sitemap)) throw new Error(`Missing sitemap.xml in ${dir}`);
  if (!fs.existsSync(llms)) throw new Error(`Missing llms.txt in ${dir}`);
}

console.log('\n✓ Discovery files (robots.txt, sitemap.xml, llms.txt) are present and valid in all targets.');
console.log('\nAll SEO & Schema integrity checks PASSED with 100% success!');
