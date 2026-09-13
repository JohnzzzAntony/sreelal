'use strict';

/**
 * Gives every project the full detail-page structure, without touching content
 * that already exists.
 *
 *   node app/db/fill-details.js           report what would change
 *   node app/db/fill-details.js --apply   write the changes
 *
 * Only columns that are currently empty are written, so this is safe to re-run
 * and will never overwrite something written in the admin. Unlike
 * `db:seed --force`, it does not delete anything.
 */

const db = require('./index');
const { detailDefaultsFor, isEmpty } = require('./detailDefaults');

const APPLY = process.argv.includes('--apply');

function main() {
  const projects = db.all('SELECT * FROM portfolio_projects ORDER BY position, id');
  if (!projects.length) {
    console.log('No projects found. Run "npm run setup" first.');
    return;
  }

  let changedRows = 0;
  let changedFields = 0;

  db.transaction(() => {
    for (const project of projects) {
      const defaults = detailDefaultsFor(project);

      const updates = Object.entries(defaults).filter(
        ([column, value]) => isEmpty(project[column]) && !isEmpty(value)
      );

      if (!updates.length) {
        console.log(`  ${project.slug.padEnd(24)} already complete`);
        continue;
      }

      changedRows += 1;
      changedFields += updates.length;
      console.log(
        `  ${project.slug.padEnd(24)} ${APPLY ? 'filling' : 'would fill'} ` +
          updates.map(([c]) => c).join(', ')
      );

      if (!APPLY) continue;

      db.run(
        `UPDATE portfolio_projects SET ${updates.map(([c]) => `${c} = ?`).join(', ')}, ` +
          `updated_at = datetime('now') WHERE id = ?`,
        [...updates.map(([, v]) => v), project.id]
      );
    }
  });

  console.log(
    `\n${changedFields} field(s) across ${changedRows} project(s) ` +
      (APPLY ? 'filled.' : 'would be filled. Re-run with --apply to write them.')
  );

  if (APPLY && changedFields) {
    console.log('Placeholder text is visible on the public site until you replace it in the admin.');
  }
}

main();
