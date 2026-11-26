// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { getNodeFirstLine, getNodeFirstLineAlignValue, getNodeRestText, groupColorClass, nodeColorClass, nodePosition, nodePresentationClass, renderCanvasMarkdown } from './nodePresentation';

describe('nodePresentation', () => {
  it('keeps node geometry and visual modifiers in the same style contract', () => {
    const node = { x: 12, y: 24, width: 320, height: 180, color: '4', fillStyle: 'solid' as const, shape: 'round' as const, transparent: true, borderStyle: 'dashed', borderWidth: 3, zIndex: 8 };
    expect(nodePosition(node)).toMatchObject({ left: '12px', top: '24px', width: '320px', height: '180px', borderRadius: '9999px', background: 'transparent', borderStyle: 'dashed', borderWidth: '3px', zIndex: '8' });
    expect(nodePresentationClass(node)).toEqual({ 'node-transparent': true, 'node-round': true });
    expect(nodeColorClass(node)).toBe('node-color-4-solid');
    expect(groupColorClass(node)).toBe('group-color-4');
  });

  it('renders callouts and preserves text line helpers', () => {
    expect(renderCanvasMarkdown('> [!tip] Hint\n> Body')).toContain('callout-tip');
    expect(getNodeFirstLine('First\nSecond')).toBe('First');
    expect(getNodeRestText('First\nSecond')).toBe('Second');
    expect(getNodeFirstLineAlignValue({ firstLineTextAlign: 'center', textAlign: 'left' })).toBe('center');
  });

  it('sanitizes XSS payloads, strips inline styles, and hardens external links in canvas markdown', () => {
    const md = [
      'Hello **world**',
      '<script>alert(1)</script>',
      '<img src="https://example.com/a.png" onerror="alert(2)">',
      '<svg><animate attributeName="href" to="javascript:alert(3)"></svg>',
      '<iframe src="https://evil.example"></iframe>',
      '<form action="https://evil.example"><input name="x"></form>',
      '<div style="position:fixed;inset:0">overlay</div>',
      '<a href="javascript:alert(4)">bad</a>',
      '<a href="//evil.example/phish">proto-rel</a>',
      '[Safe](https://qzarov.pro/docs)',
    ].join('\n\n');

    const html = renderCanvasMarkdown(md);
    expect(html).toContain('<strong>world</strong>');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('<svg');
    expect(html).not.toContain('<iframe');
    expect(html).not.toContain('<form');
    expect(html).not.toContain('<input');
    expect(html).not.toContain('style=');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('//evil.example');
    expect(html).toContain('href="https://qzarov.pro/docs"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('rejects non-CSS borderColor values before interpolating into wavy/sawtooth SVG', () => {
    const style = nodePosition({
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      borderStyle: 'wavy',
      borderColor: "' onload='alert(1)",
    });
    expect(style.borderImage).toContain("stroke%3D'currentColor'");
    expect(style.borderImage).not.toContain('onload');
  });
});
