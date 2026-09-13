'use strict';

/**
 * Starter content for a project's detail page.
 *
 * Every project renders through the same template, so a page only looks
 * different from the others when its fields are empty - empty sections hide
 * themselves. These defaults give a new project the full page structure
 * immediately, with obviously-placeholder text to replace.
 *
 * Two rules:
 *
 *  - Nothing here asserts a fact about a real client. The placeholders read as
 *    instructions to the editor, never as case-study claims, because this is a
 *    public portfolio and invented outcomes would be worse than a short page.
 *  - Images reuse the project's own cover. It is the only image a project is
 *    guaranteed to have.
 *
 * Used both when seeding from scratch and by `npm run db:fill-details`, which
 * fills only the fields that are still empty.
 */

const PLACEHOLDER_PREFIX = 'Add ';

/** True when a column holds nothing worth keeping. */
function isEmpty(value) {
  if (value === null || value === undefined) return true;
  const text = String(value).trim();
  return text === '' || text === '[]' || text === '0';
}

/**
 * @param {object} project a portfolio_projects row
 * @returns {object} column -> starter value, for columns that have a sensible one
 */
function detailDefaultsFor(project) {
  const title = project.title || 'this project';
  const cover = project.cover_image || '';

  return {
    // The layout puts an image beside the Introduction box; without it that row
    // sits lopsided.
    secondary_image: cover,
    // A single slide keeps the slider present without showing the same picture
    // five times over.
    gallery_json: cover ? JSON.stringify([{ src: cover, alt: title }]) : '[]',
    closing_image_1: cover,
    // Deliberately not defaulted: a second full-width copy of the same image
    // directly under the first reads as a mistake rather than a placeholder.
    // closing_image_2

    client_name: `${PLACEHOLDER_PREFIX}the client name`,
    year: `${PLACEHOLDER_PREFIX}the year`,
    role: 'UI/UX Designer',

    solution_text: `${PLACEHOLDER_PREFIX}a short description of the solution you designed for ${title}.`,
    features_json: JSON.stringify([
      `${PLACEHOLDER_PREFIX}a key feature of ${title}`,
      `${PLACEHOLDER_PREFIX}another key feature`,
      `${PLACEHOLDER_PREFIX}a third key feature`
    ]),
    outcome_text: `${PLACEHOLDER_PREFIX}the outcome of the ${title} project.`

    // Deliberately not defaulted: testimonial_id. Attaching an existing quote
    // would credit a real person with words about a project they never spoke
    // about. Pick one per project in the admin instead.
  };
}

module.exports = { detailDefaultsFor, isEmpty };
