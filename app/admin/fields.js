'use strict';

const v = require('../lib/validate');
const { resolveImageField } = require('../middleware/upload');

/**
 * Turns a submitted admin form into validated column values.
 *
 * Each field type maps to a validator in lib/validate.js. Nothing is written
 * that a resource did not declare, so extra keys in a form post are discarded
 * rather than reaching the database.
 */

/** The multer field names a resource needs for its image inputs. */
function uploadFields(resource) {
  return resource.fields
    .filter((f) => f.type === 'image')
    .map((f) => ({ name: f.name, maxCount: 1 }));
}

/** Value shown in the form for a field, given an existing row (or none). */
function formValue(field, row) {
  if (field.type === 'tags') {
    const tags = (row && row.tags) || [];
    return tags
      .map((t) => (t.link && t.link !== field.defaultLink ? `${t.label} | ${t.link}` : t.label))
      .join('\n');
  }

  if (field.type === 'gallery') {
    const gallery = (row && row.gallery) || [];
    return gallery.map((g) => (g.alt ? `${g.src} | ${g.alt}` : g.src)).join('\n');
  }

  if (!row) return field.default === undefined ? '' : field.default;

  const value = row[field.name];
  return value === null || value === undefined ? '' : value;
}

/**
 * @returns {{ values: object, errors: import('../lib/validate').Errors }}
 */
function parse(resource, req, existing) {
  const body = req.body || {};
  const errors = new v.Errors();
  const values = {};

  for (const field of resource.fields) {
    const raw = body[field.name];

    switch (field.type) {
      case 'text':
        values[field.name] = v.str(raw);
        break;

      case 'textarea':
        values[field.name] = v.longText(raw);
        break;

      case 'number':
        values[field.name] = v.int(raw, {
          min: field.min === undefined ? -Infinity : field.min,
          max: field.max === undefined ? Infinity : field.max,
          fallback: field.default === undefined ? 0 : field.default
        });
        break;

      case 'checkbox':
        values[field.name] = v.bool(raw);
        break;

      case 'select': {
        const allowed = field.options.map((o) => o.value);
        const picked = v.str(raw);
        values[field.name] = allowed.includes(picked) ? picked : field.default || allowed[0];
        break;
      }

      case 'link':
        values[field.name] = v.link(raw);
        if (raw && !values[field.name]) {
          errors.add(field.name, 'Enter a relative path, or a full http(s), mailto or tel URL.');
        }
        break;

      case 'image': {
        // An upload wins; otherwise the existing/typed path is kept.
        const resolved = resolveImageField(req, field.name, v.imagePath(raw));
        values[field.name] = resolved;
        if (raw && !resolved) errors.add(field.name, 'That image path is not valid.');
        break;
      }

      case 'slug': {
        const source = v.str(raw) || v.str(body[field.from]);
        const slug = v.slugify(source);
        values[field.name] = slug;

        if (!slug) {
          errors.add(field.name, 'A slug is required.');
        } else if (field.unique && resource.model.slugExists) {
          const clashes = resource.model.slugExists(slug, existing ? existing.id : null);
          if (clashes) errors.add(field.name, `"${slug}" is already in use.`);
        }
        break;
      }

      case 'reference':
        values[field.name] = v.nullableInt(raw);
        break;

      case 'tags':
        values[field.column] = JSON.stringify(v.tagList(raw, field.defaultLink));
        break;

      case 'gallery':
        values[field.column] = JSON.stringify(v.galleryList(raw));
        break;

      default:
        throw new Error(`Unknown field type "${field.type}" on ${resource.key}.${field.name}`);
    }

    if (field.required && field.type !== 'slug') {
      const written = field.column ? values[field.column] : values[field.name];
      if (!String(written === undefined ? '' : written).trim()) {
        errors.add(field.name, `${field.label} is required.`);
      }
    }
  }

  return { values, errors };
}

module.exports = { parse, formValue, uploadFields };
