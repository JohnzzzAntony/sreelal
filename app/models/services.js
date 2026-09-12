'use strict';

const db = require('../db');
const { createRepository } = require('./repository');

const sections = createRepository({
  table: 'service_sections',
  columns: [
    'slug',
    'label',
    'name',
    'tag',
    'description',
    'thumb_image',
    'preview_image',
    'visual_image',
    'visual_alt',
    'link_label',
    'link_url',
    'aside_label_1',
    'aside_value_1',
    'aside_label_2',
    'aside_value_2',
    'position',
    'is_visible'
  ],
  searchColumns: ['name', 'tag', 'description', 'slug']
});

const items = createRepository({
  table: 'service_items',
  columns: ['section_id', 'text', 'link', 'icon', 'position', 'is_visible'],
  searchColumns: ['text']
});

/** `svc4ColBrand` style collapse ids are derived from the section slug. */
function pascalCase(slug) {
  return String(slug || '')
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

function decorate(section) {
  if (!section) return section;
  return {
    ...section,
    anchorId: 'svc4-' + section.slug,
    collapseId: 'svc4Col' + pascalCase(section.slug)
  };
}

function itemsFor(sectionId, opts = {}) {
  return items.list({ where: { section_id: Number(sectionId) }, visibleOnly: opts.visibleOnly });
}

/**
 * Sections in order with their deliverable lists attached, ready for the
 * services page accordion.
 */
function publishedWithItems() {
  return sections.list({ visibleOnly: true }).map((section, index) => ({
    ...decorate(section),
    // The accordion numbers its rows 01, 02, ... by displayed order.
    number: String(index + 1).padStart(2, '0'),
    isFirst: index === 0,
    items: itemsFor(section.id, { visibleOnly: true })
  }));
}

function itemCounts() {
  const rows = db.all(
    'SELECT section_id, COUNT(*) AS n FROM service_items GROUP BY section_id'
  );
  return new Map(rows.map((r) => [r.section_id, r.n]));
}

module.exports = {
  sections: {
    ...sections,
    find: (id) => decorate(sections.find(id)),
    list: (opts) => sections.list(opts).map(decorate),
    itemCounts
  },
  items: {
    ...items,
    forSection: itemsFor,
    nextPositionIn: (sectionId) => items.nextPosition({ section_id: Number(sectionId) }),
    moveIn: (id, direction, sectionId) =>
      items.move(id, direction, { section_id: Number(sectionId) })
  },
  publishedWithItems,
  pascalCase
};
