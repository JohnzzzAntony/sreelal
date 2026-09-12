'use strict';

const { createRepository } = require('./repository');

const repo = createRepository({
  table: 'testimonials',
  columns: [
    'client_name',
    'role_title',
    'company',
    'quote',
    'avatar',
    'avatar_alt',
    'rating',
    'column_classes',
    'layout',
    'position',
    'is_visible'
  ],
  searchColumns: ['client_name', 'role_title', 'company', 'quote']
});

module.exports = {
  ...repo,
  published: () => repo.list({ visibleOnly: true })
};
