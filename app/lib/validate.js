'use strict';

/**
 * Input coercion and validation for admin form posts.
 *
 * Everything written to the database goes through here first: strings are
 * trimmed and length-capped, booleans and integers are coerced from the strings
 * a form always sends, and links are restricted to safe schemes. Output escaping
 * happens separately at render time (see lib/html.js).
 */

// Control characters (tab and newline excepted) would corrupt rendered markup.
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const COMBINING_MARKS = /[\u0300-\u036F]/g;

const MAX_TEXT = 500;
const MAX_LONG_TEXT = 20000;

function str(value, { max = MAX_TEXT } = {}) {
  if (value === null || value === undefined) return '';
  return String(value).replace(CONTROL_CHARS, '').trim().slice(0, max);
}

function longText(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/\r\n/g, '\n')
    .replace(CONTROL_CHARS, '')
    .trim()
    .slice(0, MAX_LONG_TEXT);
}

function bool(value) {
  if (Array.isArray(value)) value = value[value.length - 1];
  return /^(1|true|on|yes)$/i.test(String(value === undefined ? '' : value)) ? 1 : 0;
}

function int(value, { min = -Infinity, max = Infinity, fallback = 0 } = {}) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function nullableInt(value) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Normalises a link for storage. Rejects anything that is not a relative path,
 * an anchor, or an http(s)/mailto/tel URL - which is what keeps `javascript:`
 * and `data:` payloads out of the database entirely.
 */
function link(value) {
  const raw = str(value, { max: 2000 });
  if (!raw) return '';
  if (/^(https?:\/\/|mailto:|tel:)/i.test(raw)) return raw;
  if (/^[#/]/.test(raw)) return raw;
  if (/^[\w.][\w.\-/]*(\?[^\s]*)?(#[^\s]*)?$/.test(raw)) return raw;
  return '';
}

/** Same rules as `link`, but for image paths. */
function imagePath(value) {
  const raw = str(value, { max: 2000 });
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/\.\./.test(raw) || /\\/.test(raw)) return '';
  if (/^[\w.][\w.\-/]*$/.test(raw)) return raw;
  return '';
}

function slugify(value, fallback = '') {
  const slug = String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(COMBINING_MARKS, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
  return slug || fallback;
}

/** Parses a "one per line" textarea into trimmed, non-empty values. */
function lines(value, { max = 50 } = {}) {
  return longText(value)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, max);
}

/** Parses the tag textarea. Each line is `Label` or `Label | link`. */
function tagList(value, defaultLink = '') {
  return lines(value, { max: 20 })
    .map((line) => {
      const [label, href] = line.split('|').map((p) => p.trim());
      return { label: str(label, { max: 120 }), link: link(href || defaultLink) };
    })
    .filter((t) => t.label);
}

/** Parses the gallery textarea. Each line is `path` or `path | alt text`. */
function galleryList(value) {
  return lines(value, { max: 40 })
    .map((line) => {
      const [src, alt] = line.split('|').map((p) => p.trim());
      return { src: imagePath(src), alt: str(alt || '', { max: 200 }) };
    })
    .filter((g) => g.src);
}

/** Collects validation errors as `{ field: message }`. */
class Errors {
  constructor() {
    this.fields = {};
  }

  add(field, message) {
    if (!this.fields[field]) this.fields[field] = message;
    return this;
  }

  require(values, field, label) {
    if (!String(values[field] || '').trim()) this.add(field, `${label} is required.`);
    return this;
  }

  get any() {
    return Object.keys(this.fields).length > 0;
  }
}

module.exports = {
  str,
  longText,
  bool,
  int,
  nullableInt,
  link,
  imagePath,
  slugify,
  lines,
  tagList,
  galleryList,
  Errors
};
