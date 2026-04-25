// DOM normalizer for visual snapshots (ADR-0012, issue #67).
//
// `normalize(html)` returns a string that is stable across runs for visually
// equivalent webview output. It is the deep module: small interface,
// encapsulates all of the "what is stable vs volatile" decisions for the
// visual snapshot suite.
//
// Rules:
//   1. Parse with `node-html-parser` (lenient HTML5 parser, ~50 KB).
//   2. Alphabetize attributes on every element.
//   3. Replace dynamic ID values with the literal string `[uuid]`:
//        - any UUID (8-4-4-4-12 hex) anywhere in attribute values or text;
//        - the entire value of any `data-*-id` or `data-id`, `data-session-id`,
//          `data-task-id` attribute (these are application-generated and
//          visually irrelevant).
//   4. Trim whitespace: collapse runs of whitespace inside text nodes to a
//      single space; drop pure-whitespace text nodes between elements.
//   5. Normalize self-closing/void tags to `<tag />`.

import { parse, HTMLElement, TextNode, Node } from 'node-html-parser';

const UUID_RE = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g;

// HTML void elements — never have content, are always rendered self-closing
// in our normalized output as `<tag />`.
const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

// Attributes whose entire value should be tokenized regardless of format.
// These are application-generated identifiers that are stable in shape but
// volatile in value across runs.
const ID_ATTRIBUTES = new Set([
  'data-id',
  'data-session-id',
  'data-task-id',
  'data-phase-id',
  'data-claude-session-id',
]);

function tokenizeValue(name: string, value: string): string {
  if (ID_ATTRIBUTES.has(name)) return '[uuid]';
  return value.replace(UUID_RE, '[uuid]');
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function isElement(n: Node): n is HTMLElement {
  return n instanceof HTMLElement;
}

function serialize(node: Node): string {
  if (node instanceof TextNode) {
    // Collapse whitespace runs inside text to a single space.
    const collapsed = node.rawText.replace(/\s+/g, ' ');
    // If the text is only whitespace, drop it entirely (between-element ws).
    if (collapsed.trim() === '') return '';
    // Replace UUIDs in text content.
    return escapeText(collapsed.replace(UUID_RE, '[uuid]'));
  }
  if (!isElement(node)) {
    // CommentNode and other unknown nodes — skip.
    return '';
  }

  const tag = node.rawTagName ? node.rawTagName.toLowerCase() : '';
  if (!tag) {
    // Document fragment / root — just serialize children.
    return node.childNodes.map(serialize).join('');
  }

  // Build attribute list sorted alphabetically.
  const rawAttrs = node.attributes; // {name: value}
  const names = Object.keys(rawAttrs).sort();
  const attrParts: string[] = [];
  for (const name of names) {
    const value = tokenizeValue(name, rawAttrs[name] ?? '');
    attrParts.push(`${name}="${escapeAttr(value)}"`);
  }
  const attrStr = attrParts.length > 0 ? ' ' + attrParts.join(' ') : '';

  if (VOID_ELEMENTS.has(tag)) {
    return `<${tag}${attrStr} />`;
  }

  // For <style>, <script>, and similar raw-text elements, the children come
  // through as text nodes. We still collapse whitespace but DON'T want to
  // mangle CSS/JS by tokenizing UUIDs in CSS — but in practice the only
  // contents are the THEME_CSS string which has no UUIDs, so it's safe.
  const inner = node.childNodes.map(serialize).join('');
  return `<${tag}${attrStr}>${inner}</${tag}>`;
}

export function normalize(html: string): string {
  if (html === '') return '';
  // `parse` accepts a fragment OR a full document. We use the lower-case
  // option to avoid case-folding surprises and `comment: false` to drop them.
  const root = parse(html, {
    lowerCaseTagName: true,
    comment: false,
    voidTag: { closingSlash: true, tags: Array.from(VOID_ELEMENTS) },
  });
  return serialize(root).trim();
}
