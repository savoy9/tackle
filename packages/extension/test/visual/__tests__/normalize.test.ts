import { describe, it, expect } from 'vitest';
import { normalize } from '../normalize';

describe('normalize() — DOM normalizer for visual snapshots', () => {
  it('alphabetizes attributes on a single element', () => {
    const input = '<div class="x" id="y" data-z="1"></div>';
    const out = normalize(input);
    // After normalization, attributes should appear in alphabetical order.
    expect(out).toContain('class="x"');
    const cls = out.indexOf('class="x"');
    const dataZ = out.indexOf('data-z="1"');
    const id = out.indexOf('id="y"');
    expect(cls).toBeLessThan(dataZ);
    expect(dataZ).toBeLessThan(id);
  });

  it('alphabetizes attributes on nested elements', () => {
    const input = '<section id="s" class="c"><span data-x="1" aria-label="a"></span></section>';
    const out = normalize(input);
    const sectionClassIdx = out.indexOf('class="c"');
    const sectionIdIdx = out.indexOf('id="s"');
    expect(sectionClassIdx).toBeGreaterThan(-1);
    expect(sectionClassIdx).toBeLessThan(sectionIdIdx);
    const ariaIdx = out.indexOf('aria-label="a"');
    const dataIdx = out.indexOf('data-x="1"');
    expect(ariaIdx).toBeGreaterThan(-1);
    expect(ariaIdx).toBeLessThan(dataIdx);
  });

  it('replaces UUIDs in attribute values with [uuid]', () => {
    const input = '<div data-id="3f1c2a4e-9d8b-4a8e-bc12-1234567890ab"></div>';
    expect(normalize(input)).toContain('data-id="[uuid]"');
  });

  it('replaces UUIDs in text content with [uuid]', () => {
    const input = '<span>session a1b2c3d4-e5f6-7890-abcd-ef0123456789 ready</span>';
    expect(normalize(input)).toContain('[uuid]');
    expect(normalize(input)).not.toContain('a1b2c3d4');
  });

  it('replaces data-session-id values with [uuid] regardless of format', () => {
    const input = '<div data-session-id="anything-here-42"></div>';
    expect(normalize(input)).toContain('data-session-id="[uuid]"');
  });

  it('replaces data-task-id and data-id with [uuid]', () => {
    const input = '<a data-id="some-volatile-id" data-task-id="42"></a>';
    const out = normalize(input);
    expect(out).toContain('data-id="[uuid]"');
    expect(out).toContain('data-task-id="[uuid]"');
  });

  it('trims whitespace between tags', () => {
    const input = '<div>\n   <span>x</span>\n\n   <span>y</span>\n</div>';
    const out = normalize(input);
    expect(out).not.toMatch(/\n\s*\n/);
    // Should not contain multi-space runs between tags
    expect(out).not.toMatch(/>\s{2,}</);
  });

  it('collapses redundant whitespace inside text nodes', () => {
    const input = '<p>hello   world</p>';
    expect(normalize(input)).toContain('<p>hello world</p>');
  });

  it('normalizes self-closing tags consistently', () => {
    const input = '<div><br><img src="a.png"><hr/></div>';
    const out = normalize(input);
    // Void elements should appear in the canonical form `<tag />` (or `<tag>`),
    // but consistently — pick one style. We canonicalize to `<tag />`.
    expect(out).toMatch(/<br\s*\/>/);
    expect(out).toMatch(/<img[^>]*\/>/);
    expect(out).toMatch(/<hr\s*\/>/);
  });

  it('produces stable output for two equivalent inputs', () => {
    const a = '<div class="a" id="b"><span>hi</span></div>';
    const b = '<div  id="b"   class="a"  >\n  <span>hi</span>\n</div>';
    expect(normalize(a)).toBe(normalize(b));
  });

  it('replaces UUIDs in href and other URL attributes', () => {
    const input =
      '<a href="vscode://x/3f1c2a4e-9d8b-4a8e-bc12-1234567890ab/edit">go</a>';
    expect(normalize(input)).toContain('[uuid]');
  });

  it('handles empty input', () => {
    expect(normalize('')).toBe('');
  });
});
