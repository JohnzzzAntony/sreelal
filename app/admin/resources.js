'use strict';

const caseStudies = require('../models/caseStudies');
const testimonials = require('../models/testimonials');
const clientProjects = require('../models/clientProjects');
const brands = require('../models/brands');
const settings = require('../models/settings');
const services = require('../models/services');
const portfolio = require('../models/portfolio');

/**
 * Declarative definitions for every managed content type.
 *
 * All seven entities have the same shape - ordered, hideable rows with a mix of
 * text, image and link fields - so they share one list view, one form view and
 * one set of CRUD handlers. Adding a field here is the only change needed for it
 * to appear in the admin, be validated, and be persisted.
 *
 * Field types map to the validators in lib/validate.js:
 *   text | textarea | number | checkbox | select | image | link | tags | gallery
 *   | slug | reference
 */

const VISIBILITY_FIELD = {
  name: 'is_visible',
  label: 'Visible on the site',
  type: 'checkbox',
  default: 1
};

const resources = {
  'case-studies': {
    key: 'case-studies',
    group: 'Homepage',
    title: 'Selected Work',
    singular: 'Case study',
    description: 'The CASE STUDIES grid on the homepage.',
    model: caseStudies,
    listColumns: ['image', 'title', 'metric_value', 'link'],
    fields: [
      { name: 'title', label: 'Title', type: 'text', required: true },
      {
        name: 'link',
        label: 'Link',
        type: 'link',
        help: 'A page on this site (portfolio.html) or a full external URL.'
      },
      {
        name: 'open_in_new_tab',
        label: 'Open link in a new tab',
        type: 'checkbox'
      },
      {
        name: 'description',
        label: 'Short description',
        type: 'textarea',
        help: 'Stored for reference and search. The homepage card design has no slot for it, so it is not displayed.'
      },
      { name: 'image', label: 'Thumbnail', type: 'image' },
      { name: 'image_alt', label: 'Image alt text', type: 'text' },
      {
        name: 'metric_value',
        label: 'Overlay heading',
        type: 'text',
        help: 'Large text on the image overlay, e.g. "Branding".'
      },
      {
        name: 'metric_label',
        label: 'Overlay subheading',
        type: 'text',
        help: 'Small text under the heading, e.g. "IT Consulting".'
      },
      {
        name: 'tags',
        label: 'Tags',
        type: 'tags',
        column: 'tags_json',
        defaultLink: 'portfolio.html',
        help: 'One per line. Use "Label | link" to point a tag somewhere other than portfolio.html.'
      },
      {
        name: 'cta_label',
        label: 'Call-to-action label',
        type: 'text',
        help: 'Footer link wording, e.g. "VIEW CASE STUDY".'
      },
      VISIBILITY_FIELD
    ]
  },

  testimonials: {
    key: 'testimonials',
    group: 'Homepage',
    title: 'Testimonials',
    singular: 'Testimonial',
    description: 'The "Trusted by those I’ve designed for" grid.',
    model: testimonials,
    listColumns: ['avatar', 'client_name', 'company', 'rating'],
    fields: [
      { name: 'client_name', label: 'Client name', type: 'text', required: true },
      { name: 'role_title', label: 'Role / title', type: 'text', help: 'Stored for reference; the card design shows the company only.' },
      { name: 'company', label: 'Company', type: 'text' },
      { name: 'quote', label: 'Testimonial', type: 'textarea', required: true, rows: 6 },
      { name: 'avatar', label: 'Avatar', type: 'image' },
      { name: 'avatar_alt', label: 'Avatar alt text', type: 'text' },
      { name: 'rating', label: 'Rating', type: 'number', min: 0, max: 5, default: 5 },
      {
        name: 'layout',
        label: 'Card layout',
        type: 'select',
        default: 'header_top',
        options: [
          { value: 'header_top', label: 'Name bar above the quote' },
          { value: 'header_bottom', label: 'Name bar below the quote' }
        ]
      },
      {
        name: 'column_classes',
        label: 'Grid column classes',
        type: 'text',
        advanced: true,
        help: 'Bootstrap ordering utilities for this card, e.g. "order-md-2 order-3". Leave as-is unless you are adjusting the grid.'
      },
      VISIBILITY_FIELD
    ]
  },

  'client-projects': {
    key: 'client-projects',
    group: 'Homepage',
    title: 'Selected Client Projects',
    singular: 'Client project',
    description: 'The "Selected client projects" row on the homepage.',
    model: clientProjects,
    listColumns: ['image', 'title', 'card_style', 'link'],
    fields: [
      { name: 'title', label: 'Title', type: 'text', required: true },
      {
        name: 'card_style',
        label: 'Card style',
        type: 'select',
        default: 'blog',
        options: clientProjects.CARD_STYLES
      },
      {
        name: 'description',
        label: 'Short description',
        type: 'textarea',
        help: 'Shown on feature cards only.'
      },
      { name: 'image', label: 'Image', type: 'image' },
      { name: 'image_alt', label: 'Image alt text', type: 'text' },
      { name: 'link', label: 'Link', type: 'link' },
      { name: 'open_in_new_tab', label: 'Open link in a new tab', type: 'checkbox' },
      {
        name: 'category_label',
        label: 'Category label',
        type: 'text',
        help: 'The pill on a feature card, or the text after the dash on a blog card.'
      },
      {
        name: 'role_label',
        label: 'Role',
        type: 'text',
        help: 'Shown on blog cards, e.g. "UI/UX Designer".'
      },
      VISIBILITY_FIELD
    ]
  },

  brands: {
    key: 'brands',
    group: 'Homepage',
    title: 'Brand Logos',
    singular: 'Brand',
    description: 'Logos shown in the "brands collaborated with" wall.',
    model: brands.brands,
    listColumns: ['image', 'name', 'usage'],
    fields: [
      { name: 'name', label: 'Brand name', type: 'text', required: true },
      {
        name: 'image',
        label: 'Logo',
        type: 'image',
        help: 'Upload a file, or paste a path or full URL. The current logos are hosted on iamsreelalck.com.'
      },
      { name: 'image_alt', label: 'Logo alt text', type: 'text' },
      { name: 'link', label: 'Link', type: 'link', help: 'Optional. Not shown by the current design.' },
      VISIBILITY_FIELD
    ]
  },

  'brand-tiles': {
    key: 'brand-tiles',
    group: 'Homepage',
    title: 'Brand Grid Layout',
    singular: 'Grid tile',
    description:
      'The cells of the logo wall. Each cell cycles through the logos assigned to it. Decorative - most edits belong in Brand Logos.',
    model: brands.tiles,
    childResource: 'brand-tile-slides',
    listColumns: ['delay', 'slideSummary'],
    fields: [
      {
        name: 'delay',
        label: 'Animation delay',
        type: 'text',
        default: '.4',
        help: 'Stagger for the fade-in, e.g. ".4".'
      },
      { name: 'fade_from', label: 'Fade from', type: 'text', default: 'bottom', advanced: true },
      { name: 'ease', label: 'Easing', type: 'text', default: 'bounce', advanced: true },
      VISIBILITY_FIELD
    ]
  },

  'brand-tile-slides': {
    key: 'brand-tile-slides',
    group: 'Homepage',
    title: 'Tile Logos',
    singular: 'Tile logo',
    description: 'Which logos cycle in this grid cell, and in what order.',
    model: brands.slides,
    hidden: true,
    parentResource: 'brand-tiles',
    parentKey: 'tile_id',
    listColumns: ['brand', 'data_logo'],
    fields: [
      {
        name: 'brand_id',
        label: 'Brand',
        type: 'reference',
        required: true,
        source: () => brands.brands.list()
      },
      {
        name: 'data_logo',
        label: 'Slide marker',
        type: 'text',
        advanced: true,
        help: 'Written to the data-logo attribute. Nothing reads it; kept so the markup matches the original.'
      },
      VISIBILITY_FIELD
    ]
  },

  'page-text': {
    key: 'page-text',
    group: 'Homepage',
    title: 'Page Text',
    singular: 'Text',
    description: 'Standing copy that is not part of a repeatable list.',
    model: settings,
    // Each key is referenced by name from a template, so rows are edited but
    // never added or removed from the admin.
    fixedRows: true,
    listColumns: ['label', 'value'],
    fields: [
      {
        name: 'value',
        label: 'Text',
        type: 'textarea',
        rows: 3
      }
    ]
  },

  'service-sections': {
    key: 'service-sections',
    group: 'Services page',
    title: 'Service Sections',
    singular: 'Service section',
    description: 'The expandable service index. Each section has its own list of deliverables.',
    model: services.sections,
    listColumns: ['thumb_image', 'name', 'tag', 'slug'],
    childResource: 'service-items',
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      {
        name: 'slug',
        label: 'Slug',
        type: 'slug',
        from: 'name',
        unique: true,
        required: true,
        help: 'Used for the section anchor and its accordion id. Changing it changes the #link to this section.'
      },
      {
        name: 'label',
        label: 'Admin label',
        type: 'text',
        help: 'Short name used in the page source comment.'
      },
      { name: 'tag', label: 'Subtitle', type: 'text', help: 'e.g. "Research · user flows · interfaces".' },
      { name: 'description', label: 'Description', type: 'textarea', rows: 4 },
      { name: 'thumb_image', label: 'Row thumbnail', type: 'image' },
      { name: 'preview_image', label: 'Hover preview image', type: 'image' },
      { name: 'visual_image', label: 'Expanded panel image', type: 'image' },
      { name: 'visual_alt', label: 'Panel image alt text', type: 'text' },
      { name: 'link_label', label: 'Link label', type: 'text' },
      { name: 'link_url', label: 'Link URL', type: 'link' },
      { name: 'aside_label_1', label: 'Aside label 1', type: 'text' },
      { name: 'aside_value_1', label: 'Aside value 1', type: 'text' },
      { name: 'aside_label_2', label: 'Aside label 2', type: 'text' },
      { name: 'aside_value_2', label: 'Aside value 2', type: 'text' },
      VISIBILITY_FIELD
    ]
  },

  'service-items': {
    key: 'service-items',
    group: 'Services page',
    title: 'Service Deliverables',
    singular: 'Deliverable',
    description: 'Bullet points inside a service section.',
    model: services.items,
    hidden: true,
    parentResource: 'service-sections',
    parentKey: 'section_id',
    listColumns: ['text', 'link'],
    fields: [
      { name: 'text', label: 'Text', type: 'text', required: true },
      { name: 'link', label: 'Link', type: 'link', help: 'Optional. When set, the bullet becomes a link.' },
      { name: 'icon', label: 'Icon', type: 'text', help: 'Optional icon class. Not rendered by the current design.' },
      VISIBILITY_FIELD
    ]
  },

  'portfolio-projects': {
    key: 'portfolio-projects',
    group: 'Portfolio page',
    title: 'Projects',
    singular: 'Project',
    description: 'The filterable project grid on the portfolio page.',
    model: portfolio.projects,
    listColumns: ['cover_image', 'title', 'category', 'year', 'link'],
    filters: ['category', 'visibility'],
    fields: [
      { name: 'title', label: 'Title', type: 'text', required: true },
      { name: 'slug', label: 'Slug', type: 'slug', from: 'title', unique: true, required: true },
      {
        name: 'category_id',
        label: 'Filter category',
        type: 'reference',
        source: () => portfolio.categories.list(),
        help: 'Decides which filter button shows this project.'
      },
      {
        name: 'category_label',
        label: 'Card label',
        type: 'text',
        help: 'The pill on the card overlay. Often differs from the filter category.'
      },
      {
        name: 'short_description',
        label: 'Short description',
        type: 'textarea',
        rows: 3,
        help: 'Shown on the grid card and in other projects\' "Related projects" strips.'
      },
      { name: 'cover_image', label: 'Cover image', type: 'image' },
      { name: 'cover_alt', label: 'Cover alt text', type: 'text' },
      { name: 'badge_text', label: 'Badge', type: 'text', help: 'Corner ribbon, e.g. "FEATURED CASE". Leave empty for none.' },
      { name: 'cta_label', label: 'Call-to-action label', type: 'text' },
      VISIBILITY_FIELD,

      // ---- Detail page -----------------------------------------------------
      {
        name: 'page_title',
        label: 'Browser tab title',
        type: 'text',
        section: 'Detail page',
        help: 'The <title> of this project\'s page.'
      },
      { name: 'meta_description', label: 'Meta description', type: 'textarea', rows: 2, section: 'Detail page' },
      {
        name: 'hero_subtitle',
        label: 'Subtitle',
        type: 'text',
        section: 'Detail page',
        help: 'The line under the project name, e.g. "UI/UX Design · Mobile UI · Real Estate UX".'
      },
      {
        name: 'hero_superscript',
        label: 'Title superscript',
        type: 'text',
        section: 'Detail page',
        help: 'Small mark after the project name, e.g. ®. Leave empty for none.'
      },
      {
        name: 'live_demo_url',
        label: 'Live demo URL',
        type: 'link',
        section: 'Detail page',
        help: 'The client\'s own site. Shown as a button; hidden when empty.'
      },
      { name: 'live_demo_label', label: 'Live demo button label', type: 'text', section: 'Detail page' },
      { name: 'hero_image', label: 'Hero image', type: 'image', section: 'Detail page' },
      { name: 'secondary_image', label: 'Second image', type: 'image', section: 'Detail page' },
      {
        name: 'full_description',
        label: 'Introduction',
        type: 'textarea',
        rows: 6,
        section: 'Detail page',
        help: 'The opening paragraph. Appears twice on the page, as in the original design.'
      },
      { name: 'client_name', label: 'Client', type: 'text', section: 'Detail page' },
      { name: 'year', label: 'Release date', type: 'text', section: 'Detail page' },
      { name: 'role', label: 'Role', type: 'text', section: 'Detail page' },
      {
        name: 'solution_text',
        label: 'The Solution',
        type: 'textarea',
        rows: 4,
        section: 'Detail page'
      },
      {
        name: 'features',
        label: 'Key features',
        type: 'lines',
        column: 'features_json',
        rows: 5,
        section: 'Detail page',
        help: 'One per line. The whole block is hidden when empty.'
      },
      { name: 'outcome_text', label: 'Outcome', type: 'textarea', rows: 4, section: 'Detail page' },
      {
        name: 'gallery',
        label: 'Gallery images',
        type: 'gallery',
        column: 'gallery_json',
        section: 'Detail page',
        help: 'One path per line, optionally "path | alt text". Shown as the slider; hidden when empty.'
      },
      {
        name: 'testimonial_id',
        label: 'Testimonial',
        type: 'reference',
        section: 'Detail page',
        source: () => testimonials.list().map((t) => ({ id: t.id, name: t.client_name })),
        help: 'Quotes one of the homepage testimonials. Hidden when none is chosen.'
      },
      { name: 'closing_image_1', label: 'Closing image 1', type: 'image', section: 'Detail page' },
      { name: 'closing_image_2', label: 'Closing image 2', type: 'image', section: 'Detail page' },
      {
        name: 'related_image',
        label: 'Related-strip image',
        type: 'image',
        section: 'Detail page',
        help: 'Used when this project appears in another project\'s "Related projects" strip. Falls back to the cover image.'
      },
      {
        name: 'related',
        label: 'Related projects',
        type: 'lines',
        column: 'related_slugs_json',
        rows: 3,
        section: 'Detail page',
        help: 'One project slug per line. Leave empty to use the next few projects automatically.'
      }
    ]
  },

  'portfolio-categories': {
    key: 'portfolio-categories',
    group: 'Portfolio page',
    title: 'Categories',
    singular: 'Category',
    description: 'The filter buttons above the project grid.',
    model: portfolio.categories,
    listColumns: ['name', 'slug', 'projectCount'],
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      {
        name: 'slug',
        label: 'Slug',
        type: 'slug',
        from: 'name',
        unique: true,
        required: true,
        help: 'Used as the filter value in the markup. Changing it re-tags every project in this category.'
      },
      VISIBILITY_FIELD
    ]
  }
};

/**
 * A human label for one row, for breadcrumbs and flash messages.
 *
 * Entities name their primary column differently, and some (grid tiles) have no
 * natural name at all, so fall back to a positional label rather than an id.
 */
function rowLabel(resource, row) {
  if (!row) return '';
  const named = row.name || row.title || row.client_name || row.label || row.text;
  if (named) return named;
  return `${resource.singular} ${row.position + 1}`;
}

/** Navigation structure for the admin sidebar, grouped in page order. */
function navigation() {
  const groups = new Map();
  for (const resource of Object.values(resources)) {
    if (resource.hidden) continue;
    if (!groups.has(resource.group)) groups.set(resource.group, []);
    groups.get(resource.group).push(resource);
  }
  return [...groups.entries()];
}

module.exports = { resources, navigation, rowLabel };
