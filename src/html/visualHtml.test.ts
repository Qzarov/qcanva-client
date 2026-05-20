// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  createBlock,
  parseVisualHtml,
  serializeVisualHtml,
  setBlockStyleProperty,
} from './visualHtml';

describe('visualHtml', () => {
  it('preserves head styles while rebuilding body blocks', () => {
    const parsed = parseVisualHtml('<!DOCTYPE html><html><head><style>.x{color:red}</style></head><body class="page"><h1>Hello</h1></body></html>');
    parsed.blocks = [createBlock('paragraph', { text: 'Updated' })];

    const html = serializeVisualHtml(parsed);

    expect(html).toContain('<style>.x{color:red}</style>');
    expect(html).toContain('<body class="page">');
    expect(html).toContain('<p>Updated</p>');
    expect(html).not.toContain('<h1>Hello</h1>');
  });

  it('parses known body children into editable blocks', () => {
    const parsed = parseVisualHtml('<main><h2>Title</h2><p>Copy</p><a class="button" href="/go">Go</a><ul><li>A</li><li>B</li></ul></main>');

    expect(parsed.blocks.map((block) => block.type)).toEqual(['heading', 'paragraph', 'button', 'list']);
    expect(parsed.blocks[0]).toMatchObject({ text: 'Title', level: 2 });
    expect(parsed.blocks[2]).toMatchObject({ text: 'Go', href: '/go' });
    expect(parsed.blocks[3]).toMatchObject({ items: ['A', 'B'], ordered: false });
  });

  it('preserves unsupported markup as raw blocks', () => {
    const parsed = parseVisualHtml('<main><video src="movie.mp4"></video></main>');

    expect(parsed.blocks).toHaveLength(1);
    expect(parsed.blocks[0]).toMatchObject({ type: 'raw' });
    expect(serializeVisualHtml(parsed)).toContain('<video src="movie.mp4"></video>');
  });

  it('updates one inline style property without deleting others', () => {
    const block = createBlock('paragraph', { text: 'Copy', style: 'color: red; padding: 8px;' });

    setBlockStyleProperty(block, 'padding', '16px');

    expect(block.style).toContain('color: red');
    expect(block.style).toContain('padding: 16px');
  });

  it("escapes single quotes in href and text content", () => {
    const parsed = parseVisualHtml(
      "<!DOCTYPE html><html><head></head><body><a href=\"/o'malley\">O'Malley</a></body></html>",
    );

    expect(parsed.blocks[0]).toMatchObject({ type: 'link', text: "O'Malley", href: "/o'malley" });

    const html = serializeVisualHtml(parsed);
    expect(html).toContain("href=\"/o&#39;malley\"");
    expect(html).toContain(">O&#39;Malley<");
    expect(html).not.toContain("/o'malley\"");
  });

  it("round-trips section without duplicating heading", () => {
    const source =
      '<!DOCTYPE html><html><head></head><body><section><h2>Title</h2><p>Body</p></section></body></html>';
    const once = serializeVisualHtml(parseVisualHtml(source));
    const twice = serializeVisualHtml(parseVisualHtml(once));

    const headingCount = (twice.match(/<h2[^>]*>Title<\/h2>/g) || []).length;
    expect(headingCount).toBe(1);
    expect(twice).toContain('<p>Body</p>');
  });

  it("round-trips card without duplicating heading", () => {
    const source =
      '<!DOCTYPE html><html><head></head><body><article class="card"><h2>T</h2><p>B</p></article></body></html>';
    const twice = serializeVisualHtml(parseVisualHtml(serializeVisualHtml(parseVisualHtml(source))));
    expect((twice.match(/<h2[^>]*>T<\/h2>/g) || []).length).toBe(1);
  });
});
