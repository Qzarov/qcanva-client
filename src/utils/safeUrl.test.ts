import { describe, expect, it } from 'vitest';
import { safeExternalHref, safeHref, safeImageSrc } from './safeUrl';

describe('safeUrl helpers', () => {
  describe('safeExternalHref', () => {
    it('allows http, https, and mailto URLs', () => {
      expect(safeExternalHref('https://example.com/path?a=1')).toBe('https://example.com/path?a=1');
      expect(safeExternalHref('  http://localhost:3000/test  ')).toBe('http://localhost:3000/test');
      expect(safeExternalHref('mailto:user@example.com')).toBe('mailto:user@example.com');
    });

    it('rejects javascript, vbscript, data, relative paths, and obfuscated schemes', () => {
      expect(safeExternalHref('javascript:alert(1)')).toBeNull();
      expect(safeExternalHref('  \u0001java\tscript:alert(1)')).toBeNull();
      expect(safeExternalHref('java script:alert(1)')).toBeNull();
      expect(safeExternalHref('vbscript:msgbox(1)')).toBeNull();
      expect(safeExternalHref('data:text/html,<script>alert(1)</script>')).toBeNull();
      expect(safeExternalHref('/local/path')).toBeNull();
      expect(safeExternalHref('#hash')).toBeNull();
      expect(safeExternalHref('//evil.tld')).toBeNull();
      expect(safeExternalHref(null)).toBeNull();
    });
  });

  describe('safeHref', () => {
    it('allows external hrefs, fragments, and single-slash local paths', () => {
      expect(safeHref('https://example.com')).toBe('https://example.com');
      expect(safeHref('mailto:user@example.com')).toBe('mailto:user@example.com');
      expect(safeHref('#section-1')).toBe('#section-1');
      expect(safeHref('/docs/abc')).toBe('/docs/abc');
    });

    it('rejects protocol-relative //, backslash /\\, and unsafe schemes', () => {
      expect(safeHref('//evil.tld/x')).toBeNull();
      expect(safeHref('/\\evil.tld/x')).toBeNull();
      expect(safeHref('/\t/evil.tld/x')).toBeNull();
      expect(safeHref('javascript:alert(1)')).toBeNull();
      expect(safeHref('java\nscript:alert(1)')).toBeNull();
      expect(safeHref('data:text/html,hi')).toBeNull();
    });
  });

  describe('safeImageSrc', () => {
    it('allows http, https, single-slash paths, and safe raster base64 data URLs', () => {
      expect(safeImageSrc('https://cdn.example.com/a.png')).toBe('https://cdn.example.com/a.png');
      expect(safeImageSrc('/api/canvas/files/images/1.png')).toBe('/api/canvas/files/images/1.png');
      expect(safeImageSrc('data:image/png;base64,iVBORw0KGgo=')).toBe('data:image/png;base64,iVBORw0KGgo=');
      expect(safeImageSrc('data:image/webp;base64,UklGRg==')).toBe('data:image/webp;base64,UklGRg==');
    });

    it('rejects svg data URLs, html data URLs, javascript URLs, and // paths', () => {
      expect(safeImageSrc('data:image/svg+xml;base64,PHN2Zz4=')).toBeNull();
      expect(safeImageSrc('data:text/html;base64,PHNjcmlwdD4=')).toBeNull();
      expect(safeImageSrc('javascript:alert(1)')).toBeNull();
      expect(safeImageSrc('//evil.tld/x.png')).toBeNull();
      expect(safeImageSrc('/\\evil.tld/x.png')).toBeNull();
    });
  });
});
