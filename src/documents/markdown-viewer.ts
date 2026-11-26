import DOMPurify from 'dompurify';
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

const MARKDOWN_ALLOWED_TAGS = [
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'br', 'hr', 'blockquote', 'pre', 'code',
  'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
  'a', 'img',
  'strong', 'b', 'em', 'i', 'u', 's', 'del', 'ins', 'mark', 'sub', 'sup', 'small',
  'kbd', 'samp', 'var', 'abbr', 'cite', 'q', 'span', 'div',
  'details', 'summary', 'figure', 'figcaption',
  'input',
];

const MARKDOWN_ALLOWED_ATTR = [
  'href', 'src', 'alt', 'title', 'id', 'class',
  'target', 'rel',
  'type', 'checked', 'disabled',
  'start', 'colspan', 'rowspan', 'align', 'open',
  'width', 'height', 'loading', 'decoding', 'referrerpolicy',
  'data-md-callout',
];

const MARKDOWN_FORBIDDEN_TAGS = [
  'script', 'style', 'iframe', 'object', 'embed', 'form',
  'noscript', 'svg', 'math', 'template',
  'link', 'meta', 'base', 'applet', 'frame', 'frameset',
];

const SAFE_DATA_IMAGE_RE = /^data:image\/(?:png|jpeg|jpg|gif|webp);base64,[a-z0-9+/=\s]+$/i;

function normalizeUrlForCheck(value: string): string {
  return value.replace(/[\u0000-\u0020\u007f]+/g, '');
}

function isSafeMarkdownHref(raw: string): boolean {
  const normalized = normalizeUrlForCheck(raw);
  if (!normalized) return false;
  if (normalized.startsWith('//') || normalized.startsWith('/\\')) return false;
  if (normalized.startsWith('#') || normalized.startsWith('/')) return true;
  const lower = normalized.toLowerCase();
  if (lower.startsWith('http://') || lower.startsWith('https://') || lower.startsWith('mailto:')) {
    return true;
  }
  // Reject any other explicit URI scheme (javascript:, vbscript:, data:, etc.).
  if (/^[a-z][a-z0-9+.-]*:/i.test(lower)) return false;
  return true;
}

function isSafeMarkdownImageSrc(raw: string): boolean {
  const normalized = normalizeUrlForCheck(raw);
  if (!normalized) return false;
  if (normalized.startsWith('//') || normalized.startsWith('/\\')) return false;
  if (normalized.startsWith('/')) return true;
  const lower = normalized.toLowerCase();
  if (lower.startsWith('http://') || lower.startsWith('https://')) return true;
  return SAFE_DATA_IMAGE_RE.test(normalized);
}

function escapeHtmlFallback(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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
      const key = rawType.toLowerCase().replace(/[^a-z0-9-]/g, '') || 'note';
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

  if (!DOMPurify.isSupported || typeof document === 'undefined') {
    return { html: escapeHtmlFallback(source), headings: [] };
  }

  const uponAttrHook = (node: Element, data: { attrName: string; attrValue: string; keepAttr: boolean }) => {
    const tag = node.tagName?.toLowerCase();
    const attrName = data.attrName.toLowerCase();
    if (tag === 'a' && attrName === 'href') {
      if (!isSafeMarkdownHref(data.attrValue)) {
        data.attrValue = '#';
      }
    } else if (tag === 'img' && attrName === 'src') {
      if (!isSafeMarkdownImageSrc(data.attrValue)) {
        data.keepAttr = false;
      }
    }
  };

  DOMPurify.addHook('uponSanitizeAttribute', uponAttrHook);
  let fragment: DocumentFragment;
  try {
    fragment = DOMPurify.sanitize(withCallouts, {
      ALLOWED_TAGS: MARKDOWN_ALLOWED_TAGS,
      ALLOWED_ATTR: MARKDOWN_ALLOWED_ATTR,
      FORBID_TAGS: MARKDOWN_FORBIDDEN_TAGS,
      FORBID_ATTR: ['style', 'srcdoc', 'formaction'],
      ALLOW_DATA_ATTR: false,
      RETURN_DOM_FRAGMENT: true,
    });
  } finally {
    DOMPurify.removeHook('uponSanitizeAttribute');
  }

  const root = document.createElement('div');
  root.appendChild(fragment);

  for (const el of Array.from(root.querySelectorAll('a, img, input'))) {
    const tag = el.tagName.toLowerCase();
    if (tag === 'a') {
      const href = el.getAttribute('href');
      if (href !== null) {
        if (!isSafeMarkdownHref(href)) {
          el.setAttribute('href', '#');
          el.removeAttribute('target');
          el.removeAttribute('rel');
        } else if (/^https?:\/\//i.test(normalizeUrlForCheck(href))) {
          el.setAttribute('target', '_blank');
          el.setAttribute('rel', 'noopener noreferrer');
        } else {
          el.removeAttribute('target');
          el.removeAttribute('rel');
        }
      }
    } else if (tag === 'img') {
      const src = el.getAttribute('src');
      if (src !== null && !isSafeMarkdownImageSrc(src)) {
        el.removeAttribute('src');
      } else if (src !== null && /^https?:\/\//i.test(normalizeUrlForCheck(src))) {
        el.setAttribute('referrerpolicy', 'no-referrer');
      }
    } else if (tag === 'input') {
      const type = (el.getAttribute('type') || '').toLowerCase();
      if (type !== 'checkbox') {
        el.remove();
      } else {
        el.setAttribute('disabled', '');
      }
    }
  }

  // Assign deterministic IDs to headings and collect outline from the sanitized DOM
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
