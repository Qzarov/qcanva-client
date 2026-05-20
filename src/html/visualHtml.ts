export type VisualBlockType =
  | 'heading'
  | 'paragraph'
  | 'section'
  | 'card'
  | 'list'
  | 'button'
  | 'link'
  | 'image'
  | 'raw';

export type VisualBlock = {
  id: string;
  type: VisualBlockType;
  text?: string;
  body?: string;
  href?: string;
  src?: string;
  alt?: string;
  caption?: string;
  level?: number;
  items?: string[];
  ordered?: boolean;
  style?: string;
  rawHtml?: string;
};

export type ParsedVisualHtml = {
  doctype: string;
  htmlAttrs: string;
  headHtml: string;
  bodyAttrs: string;
  blocks: VisualBlock[];
};

let nextId = 1;

function genId() {
  nextId += 1;
  return `html-block-${nextId}`;
}

function escapeHtml(value = '') {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function attrsToString(element: Element | null) {
  if (!element) return '';
  return Array.from(element.attributes)
    .map((attr) => `${attr.name}="${escapeHtml(attr.value)}"`)
    .join(' ');
}

function styleAttr(style?: string) {
  const normalized = (style || '').trim();
  return normalized ? ` style="${escapeHtml(normalized)}"` : '';
}

function textFrom(element: Element) {
  return element.textContent?.trim() || '';
}

function parseBlock(element: Element): VisualBlock {
  const tag = element.tagName.toLowerCase();
  const style = element.getAttribute('style') || '';

  if (/^h[1-6]$/.test(tag)) {
    return createBlock('heading', {
      text: textFrom(element),
      level: Number(tag.slice(1)),
      style,
    });
  }

  if (tag === 'p') {
    return createBlock('paragraph', { text: textFrom(element), style });
  }

  if (tag === 'a' && element.classList.contains('button')) {
    return createBlock('button', {
      text: textFrom(element),
      href: element.getAttribute('href') || '',
      style,
    });
  }

  if (tag === 'a') {
    return createBlock('link', {
      text: textFrom(element),
      href: element.getAttribute('href') || '',
      style,
    });
  }

  if (tag === 'ul' || tag === 'ol') {
    return createBlock('list', {
      items: Array.from(element.children).map((item) => item.textContent?.trim() || '').filter(Boolean),
      ordered: tag === 'ol',
      style,
    });
  }

  if (tag === 'img') {
    return createBlock('image', {
      src: element.getAttribute('src') || '',
      alt: element.getAttribute('alt') || '',
      style,
    });
  }

  if (tag === 'section') {
    return createBlock('section', {
      text: element.querySelector('h1,h2,h3,h4,h5,h6')?.textContent?.trim() || '',
      body: element.innerHTML,
      style,
    });
  }

  if (tag === 'article' || (tag === 'div' && element.classList.contains('card'))) {
    return createBlock('card', {
      text: element.querySelector('h1,h2,h3,h4,h5,h6')?.textContent?.trim() || textFrom(element),
      body: element.querySelector('p')?.textContent?.trim() || '',
      style,
    });
  }

  return createBlock('raw', { rawHtml: element.outerHTML });
}

function bodyElements(doc: Document) {
  const bodyChildren = Array.from(doc.body.children);
  if (
    bodyChildren.length === 1 &&
    ['main', 'body'].includes(bodyChildren[0]?.tagName.toLowerCase() || '')
  ) {
    return Array.from(bodyChildren[0].children);
  }
  return bodyChildren;
}

export function createBlock(type: VisualBlockType, input: Partial<VisualBlock> = {}): VisualBlock {
  return {
    id: input.id || genId(),
    type,
    text: input.text || '',
    body: input.body || '',
    href: input.href || '',
    src: input.src || '',
    alt: input.alt || '',
    caption: input.caption || '',
    level: input.level || (type === 'heading' ? 2 : undefined),
    items: input.items ? [...input.items] : type === 'list' ? [] : undefined,
    ordered: input.ordered || false,
    style: input.style || '',
    rawHtml: input.rawHtml || '',
  };
}

export function duplicateBlock(block: VisualBlock): VisualBlock {
  return {
    ...block,
    id: genId(),
    items: block.items ? [...block.items] : undefined,
  };
}

export function parseVisualHtml(source: string): ParsedVisualHtml {
  const parser = new DOMParser();
  const doc = parser.parseFromString(source || '<!DOCTYPE html><html><head></head><body></body></html>', 'text/html');
  const doctype = doc.doctype ? `<!DOCTYPE ${doc.doctype.name}>` : '<!DOCTYPE html>';

  return {
    doctype,
    htmlAttrs: attrsToString(doc.documentElement),
    headHtml: doc.head.innerHTML,
    bodyAttrs: attrsToString(doc.body),
    blocks: bodyElements(doc).map(parseBlock),
  };
}

export function blockToHtml(block: VisualBlock): string {
  const style = styleAttr(block.style);
  const text = escapeHtml(block.text || '');

  if (block.type === 'heading') {
    const level = Math.min(Math.max(block.level || 2, 1), 6);
    return `<h${level}${style}>${text || 'Heading'}</h${level}>`;
  }

  if (block.type === 'paragraph') return `<p${style}>${text || 'Paragraph text'}</p>`;
  if (block.type === 'button') return `<a class="button" href="${escapeHtml(block.href || '#')}"${style}>${text || 'Button'}</a>`;
  if (block.type === 'link') return `<a href="${escapeHtml(block.href || '#')}"${style}>${text || 'Link'}</a>`;

  if (block.type === 'list') {
    const tag = block.ordered ? 'ol' : 'ul';
    const items = (block.items || []).map((item) => `<li>${escapeHtml(item)}</li>`).join('');
    return `<${tag}${style}>${items || '<li>List item</li>'}</${tag}>`;
  }

  if (block.type === 'image') {
    const image = `<img src="${escapeHtml(block.src || '')}" alt="${escapeHtml(block.alt || '')}"${style}>`;
    if (!block.caption) return image;
    return `<figure>${image}<figcaption>${escapeHtml(block.caption)}</figcaption></figure>`;
  }

  if (block.type === 'section') {
    const heading = block.text ? `<h2>${text}</h2>` : '';
    return `<section${style}>${heading}${block.body || '<p>Section content</p>'}</section>`;
  }

  if (block.type === 'card') {
    return `<article class="card"${style}><h2>${text || 'Card title'}</h2><p>${escapeHtml(block.body || 'Card body')}</p></article>`;
  }

  return block.rawHtml || '';
}

export function serializeVisualHtml(parsed: ParsedVisualHtml): string {
  const htmlAttrs = parsed.htmlAttrs ? ` ${parsed.htmlAttrs}` : '';
  const bodyAttrs = parsed.bodyAttrs ? ` ${parsed.bodyAttrs}` : '';
  const bodyHtml = parsed.blocks.map(blockToHtml).join('\n');
  return `${parsed.doctype}\n<html${htmlAttrs}>\n<head>${parsed.headHtml}</head>\n<body${bodyAttrs}>\n${bodyHtml}\n</body>\n</html>`;
}

export function setBlockStyleProperty(block: VisualBlock, property: string, value: string): void {
  const styles = new Map<string, string>();
  for (const part of (block.style || '').split(';')) {
    const [key, ...rest] = part.split(':');
    if (!key || !rest.length) continue;
    styles.set(key.trim(), rest.join(':').trim());
  }
  if (value.trim()) styles.set(property, value.trim());
  else styles.delete(property);
  block.style = Array.from(styles.entries()).map(([key, val]) => `${key}: ${val}`).join('; ');
}
