'use strict';

/**
 * HTML escaping for the public templates.
 *
 * Two jobs at once:
 *
 *  1. Security - every value that reaches a public page is escaped, so content
 *     entered in the admin can never inject markup or script.
 *
 *  2. Fidelity - only the five characters that carry markup meaning are
 *     escaped. Typographic characters are emitted as UTF-8 literals rather than
 *     named entities, because the original pages are inconsistent about this:
 *     index.html writes `&mdash;` where portfolio.html writes a literal "—", so
 *     no single spelling reproduces both files byte for byte. Every page
 *     declares `charset="utf-8"`, which makes the two spellings render
 *     identically; `tools/verify-parity.js` compares entity-decoded documents
 *     to prove it.
 */

const NAMED_ENTITIES = new Map([
  ['&', '&amp;'],
  ['<', '&lt;'],
  ['>', '&gt;'],
  ['"', '&quot;'],
  ["'", '&#39;']
]);

const ESCAPE_RE = /[&<>"']/g;

/** Escapes text for an HTML text node or a double-quoted attribute value. */
function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(ESCAPE_RE, (ch) => NAMED_ENTITIES.get(ch));
}

const DECODE_ENTITIES = new Map([
  ['amp', '&'],
  ['lt', '<'],
  ['gt', '>'],
  ['quot', '"'],
  ['apos', "'"],
  ['nbsp', ' '],
  ['copy', '©'],
  ['reg', '®'],
  ['ndash', '–'],
  ['mdash', '—'],
  ['lsquo', '‘'],
  ['rsquo', '’'],
  ['ldquo', '“'],
  ['rdquo', '”'],
  ['bull', '•'],
  ['hellip', '…'],
  ['trade', '™']
]);

/** Inverse of `esc`. Used when seeding content lifted out of the original HTML. */
function decodeEntities(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, body) => {
    if (body[0] === '#') {
      const code =
        body[1] === 'x' || body[1] === 'X'
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    const decoded = DECODE_ENTITIES.get(body);
    return decoded === undefined ? match : decoded;
  });
}

/**
 * Restricts a stored link to something safe to put in an href.
 *
 * Allows site-relative paths, absolute paths, anchors, and http(s)/mailto/tel
 * URLs. Anything else (notably `javascript:` and `data:`) collapses to '#'.
 */
function safeUrl(value) {
  const raw = String(value === null || value === undefined ? '' : value).trim();
  if (!raw) return '';
  if (/^(https?:|mailto:|tel:)/i.test(raw)) return raw;
  if (/^[#/]/.test(raw)) return raw;
  // Relative path such as "portfolio.html" or "images/img-1.webp".
  if (/^[\w.][\w.\-/]*(\?[^\s]*)?(#[^\s]*)?$/.test(raw)) return raw;
  return '#';
}

module.exports = { esc, decodeEntities, safeUrl };
