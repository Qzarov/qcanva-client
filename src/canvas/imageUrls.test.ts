import { describe, expect, it } from 'vitest';
import {
  resolveCanvasImageUrl,
  isCanvasImageUrl,
  resolveResourceImageUrl,
  isResourceImageUrl,
  mapHtmlImageUrls,
  unmapResourceImageUrl,
  unmapHtmlImageUrls,
} from './imageUrls';

describe('imageUrls helper', () => {
  const canvasId = 'c-12345';
  const token = 'tok_xyz123';
  const uuid = '3f8b0593-1628-4e38-9538-23253b8fc747';

  it('maps an absolute old URL on localhost to API_BASE endpoint', () => {
    const oldUrl = `http://localhost:3001/api/canvas/files/images/${uuid}.png`;
    const mapped = resolveCanvasImageUrl(oldUrl, canvasId, token);
    expect(mapped).toBe(`http://localhost:3001/api/canvas/${canvasId}/images/${uuid}.png?t=${token}`);
  });

  it('maps an absolute old URL on an external S3/CDN host to API_BASE endpoint', () => {
    const s3Url = `https://s3.eu-central-1.amazonaws.com/my-bucket/api/canvas/files/images/${uuid}.jpg`;
    const mapped = resolveCanvasImageUrl(s3Url, canvasId, token);
    expect(mapped).toBe(`http://localhost:3001/api/canvas/${canvasId}/images/${uuid}.jpg?t=${token}`);
  });

  it('maps a relative old URL to API_BASE endpoint', () => {
    const relativeUrl = `/api/canvas/files/images/${uuid}.webp`;
    const mapped = resolveCanvasImageUrl(relativeUrl, canvasId, token);
    expect(mapped).toBe(`http://localhost:3001/api/canvas/${canvasId}/images/${uuid}.webp?t=${token}`);
  });

  it('preserves all supported extensions (png, jpg, jpeg, webp, gif) case-insensitively', () => {
    for (const ext of ['png', 'jpg', 'jpeg', 'webp', 'gif', 'PNG', 'JPEG']) {
      const url = `/api/canvas/files/images/${uuid}.${ext}`;
      const mapped = resolveCanvasImageUrl(url, canvasId, token);
      expect(mapped).toBe(`http://localhost:3001/api/canvas/${canvasId}/images/${uuid}.${ext}?t=${token}`);
    }
  });

  it('avoids /api/api even if apiBase has trailing slash or /api', () => {
    const relativeUrl = `/api/canvas/files/images/${uuid}.png`;
    const withSlash = resolveCanvasImageUrl(relativeUrl, canvasId, token, 'http://localhost:3001/api/');
    expect(withSlash).toBe(`http://localhost:3001/api/canvas/${canvasId}/images/${uuid}.png?t=${token}`);
    expect(withSlash).not.toContain('/api/api');

    const relativeBase = resolveCanvasImageUrl(relativeUrl, canvasId, token, '/api');
    expect(relativeBase).toBe(`/api/canvas/${canvasId}/images/${uuid}.png?t=${token}`);
    expect(relativeBase).not.toContain('/api/api');
  });

  it('leaves external image URLs unchanged', () => {
    const external = 'https://images.unsplash.com/photo-1512345-abc.png';
    expect(resolveCanvasImageUrl(external, canvasId, token)).toBe(external);

    const otherApi = 'https://other-domain.com/api/v1/files/images/cat.jpg';
    expect(resolveCanvasImageUrl(otherApi, canvasId, token)).toBe(otherApi);
  });

  it('leaves URLs with non-matching extensions unchanged', () => {
    const pdf = `/api/canvas/files/images/${uuid}.pdf`;
    expect(resolveCanvasImageUrl(pdf, canvasId, token)).toBe(pdf);

    const svg = `/api/canvas/files/images/${uuid}.svg`;
    expect(resolveCanvasImageUrl(svg, canvasId, token)).toBe(svg);
  });

  it('leaves old URLs unchanged when token is missing or empty', () => {
    const oldUrl = `/api/canvas/files/images/${uuid}.png`;
    expect(resolveCanvasImageUrl(oldUrl, canvasId, null)).toBe(oldUrl);
    expect(resolveCanvasImageUrl(oldUrl, canvasId, undefined)).toBe(oldUrl);
    expect(resolveCanvasImageUrl(oldUrl, canvasId, '')).toBe(oldUrl);
  });

  it('leaves old URLs unchanged when canvasId is missing or empty', () => {
    const oldUrl = `/api/canvas/files/images/${uuid}.png`;
    expect(resolveCanvasImageUrl(oldUrl, null, token)).toBe(oldUrl);
    expect(resolveCanvasImageUrl(oldUrl, undefined, token)).toBe(oldUrl);
    expect(resolveCanvasImageUrl(oldUrl, '', token)).toBe(oldUrl);
  });

  it('returns empty string when url is empty or null', () => {
    expect(resolveCanvasImageUrl('', canvasId, token)).toBe('');
    expect(resolveCanvasImageUrl(null, canvasId, token)).toBe('');
    expect(resolveCanvasImageUrl(undefined, canvasId, token)).toBe('');
  });

  it('encodes special characters in token and canvasId', () => {
    const specialCanvasId = 'canvas/room 1';
    const specialToken = 'tok+123/abc==&foo';
    const oldUrl = `/api/canvas/files/images/${uuid}.png`;
    const mapped = resolveCanvasImageUrl(oldUrl, specialCanvasId, specialToken);
    expect(mapped).toBe(
      `http://localhost:3001/api/canvas/${encodeURIComponent(specialCanvasId)}/images/${uuid}.png?t=${encodeURIComponent(specialToken)}`,
    );
  });

  it('isCanvasImageUrl identifies canvas image URLs correctly', () => {
    expect(isCanvasImageUrl(`http://localhost:3001/api/canvas/files/images/${uuid}.png`)).toBe(true);
    expect(isCanvasImageUrl(`/api/canvas/files/images/${uuid}.jpg`)).toBe(true);
    expect(isCanvasImageUrl('https://external.com/photo.png')).toBe(false);
    expect(isCanvasImageUrl(null)).toBe(false);
  });

  describe('resolveResourceImageUrl per resource type', () => {
    it('maps text-document image URLs', () => {
      const docId = 'doc-xyz';
      const oldUrl = `/api/canvas/files/images/${uuid}.png`;
      const mapped = resolveResourceImageUrl(oldUrl, 'text-documents', docId, token);
      expect(mapped).toBe(`http://localhost:3001/api/text-documents/${docId}/images/${uuid}.png?t=${token}`);

      const mappedSingular = resolveResourceImageUrl(oldUrl, 'text-document', docId, token);
      expect(mappedSingular).toBe(`http://localhost:3001/api/text-documents/${docId}/images/${uuid}.png?t=${token}`);
    });

    it('maps html-document image URLs', () => {
      const docId = 'html-123';
      const oldUrl = `http://localhost:3001/api/canvas/files/images/${uuid}.webp`;
      const mapped = resolveResourceImageUrl(oldUrl, 'html-documents', docId, token);
      expect(mapped).toBe(`http://localhost:3001/api/html-documents/${docId}/images/${uuid}.webp?t=${token}`);

      const mappedSingular = resolveResourceImageUrl(oldUrl, 'html-document', docId, token);
      expect(mappedSingular).toBe(`http://localhost:3001/api/html-documents/${docId}/images/${uuid}.webp?t=${token}`);
    });

    it('maps interactive-template image URLs (e.g. D&D portrait)', () => {
      const sheetId = 'sheet-456';
      const oldUrl = `/api/canvas/files/images/${uuid}.jpg`;
      const mapped = resolveResourceImageUrl(oldUrl, 'interactive-templates', sheetId, token);
      expect(mapped).toBe(`http://localhost:3001/api/interactive-templates/${sheetId}/images/${uuid}.jpg?t=${token}`);

      const mappedSingular = resolveResourceImageUrl(oldUrl, 'interactive-template', sheetId, token);
      expect(mappedSingular).toBe(`http://localhost:3001/api/interactive-templates/${sheetId}/images/${uuid}.jpg?t=${token}`);
    });

    it('maps canvas image URLs through resolveResourceImageUrl', () => {
      const oldUrl = `/api/canvas/files/images/${uuid}.gif`;
      const mapped = resolveResourceImageUrl(oldUrl, 'canvas', canvasId, token);
      expect(mapped).toBe(`http://localhost:3001/api/canvas/${canvasId}/images/${uuid}.gif?t=${token}`);
    });

    it('isResourceImageUrl identifies both old and tokenized resource URLs', () => {
      expect(isResourceImageUrl(`/api/canvas/files/images/${uuid}.png`)).toBe(true);
      expect(isResourceImageUrl(`http://localhost:3001/api/text-documents/doc-1/images/${uuid}.png?t=abc`)).toBe(true);
      expect(isResourceImageUrl(`/api/html-documents/h-1/images/${uuid}.webp`)).toBe(true);
      expect(isResourceImageUrl(`/api/interactive-templates/s-1/images/${uuid}.jpg?t=xyz`)).toBe(true);
      expect(isResourceImageUrl('https://external.com/photo.jpg')).toBe(false);
    });
  });

  describe('mapHtmlImageUrls and unmapHtmlImageUrls', () => {
    it('maps img src attributes within HTML string to resource tokenized route', () => {
      const rawHtml = `
        <div class="content">
          <h1>Title</h1>
          <img src="/api/canvas/files/images/${uuid}.png" alt="Test 1">
          <p>Text</p>
          <img src="https://example.com/other.jpg" alt="External">
        </div>
      `;
      const mapped = mapHtmlImageUrls(rawHtml, 'html-documents', 'doc-99', token);
      expect(mapped).toContain(`src="http://localhost:3001/api/html-documents/doc-99/images/${uuid}.png?t=${token}"`);
      expect(mapped).toContain('src="https://example.com/other.jpg"');
    });

    it('unmaps tokenized resource URLs back to original stored format', () => {
      const tokenized = `http://localhost:3001/api/html-documents/doc-99/images/${uuid}.png?t=${token}`;
      const unmapped = unmapResourceImageUrl(tokenized);
      expect(unmapped).toBe(`http://localhost:3001/api/canvas/files/images/${uuid}.png`);

      const relativeTokenized = `/api/text-documents/doc-77/images/${uuid}.jpg?t=tok123`;
      expect(unmapResourceImageUrl(relativeTokenized)).toBe(`/api/canvas/files/images/${uuid}.jpg`);
    });

    it('unmaps tokenized HTML img src back to original stored format', () => {
      const tokenizedHtml = `
        <div>
          <img src="http://localhost:3001/api/html-documents/doc-99/images/${uuid}.png?t=${token}" alt="Test">
          <img src="https://external.com/cat.png">
        </div>
      `;
      const unmapped = unmapHtmlImageUrls(tokenizedHtml);
      expect(unmapped).toContain(`src="http://localhost:3001/api/canvas/files/images/${uuid}.png"`);
      expect(unmapped).toContain('src="https://external.com/cat.png"');
    });
  });
});
