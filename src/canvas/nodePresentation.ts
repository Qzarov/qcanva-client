import { marked } from 'marked';

export interface CanvasPresentationNode {
  x: number;
  y: number;
  width: number;
  height: number;
  borderColor?: string;
  zIndex?: number;
  shape?: 'rect' | 'round';
  transparent?: boolean;
  borderStyle?: string;
  borderWidth?: number;
  color?: string;
  fillStyle?: 'gradient' | 'solid';
}

marked.setOptions({ breaks: true, gfm: true });

export const nodePosition = (node: CanvasPresentationNode): Record<string, string | undefined> => {
  const style: Record<string, string | undefined> = {
    left: `${node.x}px`,
    top: `${node.y}px`,
    width: `${node.width}px`,
    height: `${node.height}px`,
    borderColor: node.borderColor || undefined,
    zIndex: `${node.zIndex ?? 10}`,
  };
  if (node.shape === 'round') style.borderRadius = '9999px';
  if (node.transparent) {
    style.background = 'transparent';
    style.boxShadow = 'none';
  }
  const borderStyle = node.borderStyle || 'solid';
  const borderWidth = node.borderWidth || undefined;
  if (borderStyle === 'wavy' || borderStyle === 'sawtooth') {
    style.borderStyle = 'solid';
    style.borderWidth = borderWidth ? `${borderWidth}px` : undefined;
    const color = node.borderColor || (node.color ? undefined : 'rgba(255,255,255,0.1)');
    const strokeColor = color || 'currentColor';
    if (borderStyle === 'wavy') {
      style.borderImage = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32'><path d='M8 4 Q12 0 16 4 Q20 8 24 4 Q28 4 28 8 Q32 12 28 16 Q24 20 28 24 Q28 28 24 28 Q20 32 16 28 Q12 24 8 28 Q4 28 4 24 Q0 20 4 16 Q8 12 4 8 Q4 4 8 4 Z' fill='none' stroke='${strokeColor}' stroke-width='1.5'/></svg>`)}") 8 round`;
    } else {
      style.borderImage = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='12' height='4'><path d='M0 4 L6 0 L12 4' fill='none' stroke='${strokeColor}' stroke-width='1.5'/></svg>`)}") 2 round`;
    }
  } else {
    style.borderStyle = borderStyle;
    style.borderWidth = borderWidth ? `${borderWidth}px` : undefined;
  }
  return style;
};

export const nodePresentationClass = (node: CanvasPresentationNode) => ({
  'node-transparent': node.transparent === true,
  'node-round': node.shape === 'round',
});

export const nodeColorClass = (node: CanvasPresentationNode) => {
  if (!node.color) return '';
  return (node.fillStyle || 'gradient') === 'solid' ? `node-color-${node.color}-solid` : `node-color-${node.color}`;
};

export const groupColorClass = (node: CanvasPresentationNode) => node.color ? `group-color-${node.color}` : '';

const CALLOUT_STYLES: Record<string, { icon: string; color: string }> = {
  note: { icon: '📝', color: '#7c8aff' }, tip: { icon: '💡', color: '#44cf6e' }, warning: { icon: '⚠️', color: '#e9973f' },
  danger: { icon: '🔴', color: '#fb464c' }, error: { icon: '🔴', color: '#fb464c' }, info: { icon: 'ℹ️', color: '#53dfdd' },
  success: { icon: '✅', color: '#44cf6e' }, question: { icon: '❓', color: '#e0de71' }, bug: { icon: '🐛', color: '#fb464c' },
  example: { icon: '📋', color: '#a882ff' }, quote: { icon: '💬', color: '#999' }, abstract: { icon: '📄', color: '#53dfdd' },
  todo: { icon: '☑️', color: '#7c8aff' }, failure: { icon: '❌', color: '#fb464c' }, important: { icon: '🔥', color: '#e9973f' },
};

export const renderCanvasMarkdown = (text: string): string => {
  const html = marked.parse(text) as string;
  return html.replace(
    /<blockquote>\s*<p>\s*\[!\s*([\w-]+)\]\s*(.*?)<\/p>([\s\S]*?)<\/blockquote>/gi,
    (_match, type: string, title: string, body: string) => {
      const key = type.toLowerCase();
      const style = (CALLOUT_STYLES[key] || CALLOUT_STYLES.note)!;
      const displayTitle = title.trim() || key.charAt(0).toUpperCase() + key.slice(1);
      return `<div class="callout callout-${key}" style="border-left-color: ${style.color}">
            <div class="callout-title" style="color: ${style.color}">${style.icon} ${displayTitle}</div>
            <div class="callout-body">${body}</div>
          </div>`;
    },
  );
};

export const getNodeFirstLine = (text: string) => text.split(/\r?\n/, 1)[0] || '';
export const getNodeRestText = (text: string) => {
  const lines = text.split(/\r?\n/);
  return lines.length > 1 ? lines.slice(1).join('\n') : '';
};
export const getNodeFirstLineAlignValue = (node: { firstLineTextAlign?: string; textAlign?: string }) => node.firstLineTextAlign || node.textAlign || undefined;
