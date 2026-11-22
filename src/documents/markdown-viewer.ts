import { marked } from 'marked';
import { downloadFileFromUrl } from '../api/drive';

export type MarkdownHeading = {
  id: string;
  level: number;
  text: string;
};

export type RenderedMarkdownDocument = {
  html: string;
  headings: MarkdownHeading[];
};

const FORBIDDEN_TAGS = new Set([
  'script',
  'iframe',
  'object',
  'embed',
  'form',
  'style',
  'link',
  'meta',
  'base',
  'applet',
  'frame',
  'frameset',
]);

const UNSAFE_URL_RE = /^\s*(?:javascript|vbscript|data\s*:\s*text\/html)\s*:/i;

const CALLOUT_LABELS: Record<string, { icon: string; tone: string }> = {
  note: { icon: 'ℹ️', tone: 'info' },
  info: { icon: 'ℹ️', tone: 'info' },
  tip: { icon: '💡', tone: 'tip' },
  important: { icon: '🔥', tone: 'warning' },
  warning: { icon: '⚠️', tone: 'warning' },
  caution: { icon: '🔴', tone: 'danger' },
  danger: { icon: '🔴', tone: 'danger' },
  error: { icon: '🔴', tone: 'danger' },
};

function transformCallouts(rawHtml: string): string {
  return rawHtml.replace(
    /<blockquote>\s*<p>\s*\[!\s*([\w-]+)\]\s*(?:<br\s*\/?>\s*)?(.*?)<\/p>([\s\S]*?)<\/blockquote>/gi,
    (_match, rawType: string, firstLine: string, rest: string) => {
      const key = rawType.toLowerCase();
      const meta = CALLOUT_LABELS[key] ?? CALLOUT_LABELS.note!;
      const label = key.charAt(0).toUpperCase() + key.slice(1);
      const bodyParts = [firstLine.trim() ? `<p>${firstLine}</p>` : '', rest.trim()].filter(Boolean).join('');
      return `<blockquote class="md-callout md-callout-${meta.tone}" data-md-callout="${key}"><p class="md-callout-title"><strong>${meta.icon} ${label}</strong></p>${bodyParts}</blockquote>`;
    },
  );
}

/**
 * Renders Markdown text into sanitized document HTML and extracts an outline
 * of headings (h1..h6) with deterministic anchor IDs.
 */
export function renderMarkdownDocument(markdown: string): RenderedMarkdownDocument {
  const source = (markdown ?? '').replace(/^\uFEFF/, '');
  if (!source.trim()) {
    return { html: '', headings: [] };
  }

  const parsed = marked.parse(source, { async: false, gfm: true, breaks: true }) as string;
  const withCallouts = transformCallouts(parsed);

  if (typeof DOMParser === 'undefined') {
    const fallbackHtml = withCallouts
      .replace(/<(script|iframe|object|embed|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
      .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
    return { html: fallbackHtml, headings: [] };
  }

  const doc = new DOMParser().parseFromString(`<div id="md-root">${withCallouts}</div>`, 'text/html');
  const root = doc.getElementById('md-root');
  if (!root) {
    return { html: '', headings: [] };
  }

  // Strip dangerous elements
  for (const tag of FORBIDDEN_TAGS) {
    for (const el of Array.from(root.querySelectorAll(tag))) {
      el.remove();
    }
  }

  // Sanitize attributes on all remaining elements
  for (const el of Array.from(root.querySelectorAll('*'))) {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on') || name === 'srcdoc' || name === 'formaction') {
        el.removeAttribute(attr.name);
        continue;
      }
      if ((name === 'href' || name === 'src' || name === 'xlink:href' || name === 'action') && UNSAFE_URL_RE.test(attr.value)) {
        if (name === 'href') {
          el.setAttribute(attr.name, '#');
        } else {
          el.removeAttribute(attr.name);
        }
      }
    }

    if (el.tagName.toLowerCase() === 'a') {
      const href = el.getAttribute('href') || '';
      if (/^https?:\/\//i.test(href)) {
        el.setAttribute('target', '_blank');
        el.setAttribute('rel', 'noopener noreferrer');
      }
    }

    if (el.tagName.toLowerCase() === 'input') {
      const type = (el.getAttribute('type') || '').toLowerCase();
      if (type !== 'checkbox') {
        el.remove();
      } else {
        el.setAttribute('disabled', '');
      }
    }
  }

  // Assign deterministic IDs to headings and collect outline
  const headings: MarkdownHeading[] = [];
  const headingEls = Array.from(root.querySelectorAll('h1, h2, h3, h4, h5, h6'));
  headingEls.forEach((el, index) => {
    const level = Number(el.tagName.slice(1)) || 1;
    const text = (el.textContent || '').trim();
    const id = `md-heading-${index}`;
    el.setAttribute('id', id);
    if (text) {
      headings.push({ id, level, text });
    }
  });

  return {
    html: root.innerHTML,
    headings,
  };
}

/**
 * Fetches UTF-8 Markdown content from a URL (signed hub download link or direct link).
 */
export async function fetchMarkdownTextFromUrl(url: string, init?: RequestInit): Promise<string> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const text = await response.text();
  return text.replace(/^\uFEFF/, '');
}

/**
 * Downloads a Markdown string as a local `.md` file in the browser.
 */
export function downloadMarkdownBlob(content: string, filename: string): void {
  const safeName = filename && /\.(md|markdown)$/i.test(filename) ? filename : `${filename || 'document'}.md`;
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const objectUrl = URL.createObjectURL(blob);
  try {
    downloadFileFromUrl(objectUrl, safeName);
  } finally {
    setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  }
}
