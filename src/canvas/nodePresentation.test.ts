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
});
