'use strict';

const { createRepository } = require('./repository');

const repo = createRepository({
  table: 'case_studies',
  columns: [
    'title',
    'link',
    'open_in_new_tab',
    'description',
    'image',
    'image_alt',
    'metric_value',
    'metric_label',
    'cta_label',
    'tags_json',
    'position',
    'is_visible'
  ],
  searchColumns: ['title', 'description', 'metric_value', 'metric_label']
});

function parseTags(row) {
  if (!row) return row;
  let tags = [];
  try {
    const parsed = JSON.parse(row.tags_json || '[]');
    if (Array.isArray(parsed)) {
      tags = parsed
        .map((t) => ({ label: String(t.label || '').trim(), link: String(t.link || '').trim() }))
        .filter((t) => t.label);
    }
  } catch {
    tags = [];
  }
  return { ...row, tags };
}

module.exports = {
  ...repo,
  list: (opts) => repo.list(opts).map(parseTags),
  find: (id) => parseTags(repo.find(id)),
  /** Ordered, visible-only - what the homepage renders. */
  published: () => repo.list({ visibleOnly: true }).map(parseTags)
};
