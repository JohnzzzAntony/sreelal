'use strict';

const { createRepository } = require('./repository');

const repo = createRepository({
  table: 'client_projects',
  columns: [
    'title',
    'description',
    'image',
    'image_alt',
    'link',
    'open_in_new_tab',
    'card_style',
    'category_label',
    'role_label',
    'position',
    'is_visible'
  ],
  searchColumns: ['title', 'description', 'category_label', 'role_label']
});

const CARD_STYLES = [
  { value: 'feature', label: 'Feature card (large overlay: pill, title, description)' },
  { value: 'blog', label: 'Blog card (image, title link, role meta)' }
];

module.exports = {
  ...repo,
  CARD_STYLES,
  published: () => repo.list({ visibleOnly: true })
};
