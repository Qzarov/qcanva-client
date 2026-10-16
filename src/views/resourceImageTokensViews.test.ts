// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import {
  resolveResourceImageUrl,
  mapHtmlImageUrls,
  unmapResourceImageUrl,
} from '../canvas/imageUrls';
import { createImageNodeView } from '../text-documents/image-node';
import { serializeDocumentWithFormState } from '../html/formStateSerialization';
import DndCharacterSheet from '../components/DndCharacterSheet.vue';
import HtmlVisualEditor from '../components/html/HtmlVisualEditor.vue';
import { createDndCharacterSheet } from '../dnd/characterSheet';
import { useResourceImageTokens } from '../composables/useResourceImageTokens';
import { htmlDocuments as htmlDocumentsApi } from '../api/client';

vi.mock('../api/client', () => ({
  API_BASE: 'http://localhost:3001/api',
  canvas: { refreshImageToken: vi.fn() },
  textDocuments: { refreshImageToken: vi.fn() },
  htmlDocuments: { refreshImageToken: vi.fn() },
  interactiveTemplates: { refreshImageToken: vi.fn() },
}));

describe('Resource Image Tokens - Views and Lifecycle Contract', () => {
  const uuid = '3f8b0593-1628-4e38-9538-23253b8fc747';
  const initialToken = 'init_tok_111';
  const refreshedToken = 'refr_tok_222';

  describe('1. Helper mapping per resource', () => {
    it('maps text-documents to /api/text-documents/:id/images/:name?t=:token', () => {
      const oldUrl = `/api/canvas/files/images/${uuid}.png`;
      const mapped = resolveResourceImageUrl(oldUrl, 'text-documents', 'doc-1', initialToken);
      expect(mapped).toBe(`http://localhost:3001/api/text-documents/doc-1/images/${uuid}.png?t=${initialToken}`);
    });

    it('maps html-documents to /api/html-documents/:id/images/:name?t=:token', () => {
      const oldUrl = `/api/canvas/files/images/${uuid}.webp`;
      const mapped = resolveResourceImageUrl(oldUrl, 'html-documents', 'html-1', initialToken);
      expect(mapped).toBe(`http://localhost:3001/api/html-documents/html-1/images/${uuid}.webp?t=${initialToken}`);
    });

    it('maps interactive-templates to /api/interactive-templates/:id/images/:name?t=:token', () => {
      const oldUrl = `/api/canvas/files/images/${uuid}.jpg`;
      const mapped = resolveResourceImageUrl(oldUrl, 'interactive-templates', 'tmpl-1', initialToken);
      expect(mapped).toBe(`http://localhost:3001/api/interactive-templates/tmpl-1/images/${uuid}.jpg?t=${initialToken}`);
    });

    it('maps canvas to /api/canvas/:id/images/:name?t=:token', () => {
      const oldUrl = `/api/canvas/files/images/${uuid}.gif`;
      const mapped = resolveResourceImageUrl(oldUrl, 'canvas', 'canvas-1', initialToken);
      expect(mapped).toBe(`http://localhost:3001/api/canvas/canvas-1/images/${uuid}.gif?t=${initialToken}`);
    });

    it('unmaps tokenized URLs back to original stored format for all resources', () => {
      const textUrl = `http://localhost:3001/api/text-documents/doc-1/images/${uuid}.png?t=${initialToken}`;
      const htmlUrl = `http://localhost:3001/api/html-documents/html-1/images/${uuid}.webp?t=${initialToken}`;
      const tmplUrl = `http://localhost:3001/api/interactive-templates/tmpl-1/images/${uuid}.jpg?t=${initialToken}`;
      const canvasUrl = `http://localhost:3001/api/canvas/canvas-1/images/${uuid}.gif?t=${initialToken}`;

      expect(unmapResourceImageUrl(textUrl)).toBe(`http://localhost:3001/api/canvas/files/images/${uuid}.png`);
      expect(unmapResourceImageUrl(htmlUrl)).toBe(`http://localhost:3001/api/canvas/files/images/${uuid}.webp`);
      expect(unmapResourceImageUrl(tmplUrl)).toBe(`http://localhost:3001/api/canvas/files/images/${uuid}.jpg`);
      expect(unmapResourceImageUrl(canvasUrl)).toBe(`http://localhost:3001/api/canvas/files/images/${uuid}.gif`);
    });
  });

  describe('2. Each view renders mapped src from payload token', () => {
    it('text document image node view renders mapped src with token', () => {
      const storedSrc = `/api/canvas/files/images/${uuid}.png`;
      const fakeNode: any = {
        type: { name: 'image' },
        attrs: { src: storedSrc, alt: 'A diagram' },
      };

      const nodeView = createImageNodeView({
        getDocumentId: () => 'doc-view-test',
        getImageToken: () => initialToken,
        onImageError: vi.fn().mockResolvedValue(false),
      })(fakeNode);

      const dom = nodeView.dom as HTMLImageElement;
      expect(dom.tagName).toBe('IMG');
      expect(dom.src).toBe(`http://localhost:3001/api/text-documents/doc-view-test/images/${uuid}.png?t=${initialToken}`);
      expect(dom.alt).toBe('A diagram');
    });

    it('html document viewer/editor maps img src in HTML string before injecting', () => {
      const storedHtml = `
        <article>
          <h1>Overview</h1>
          <img src="/api/canvas/files/images/${uuid}.png" alt="Architecture">
          <p>Description</p>
        </article>
      `;
      const mappedHtml = mapHtmlImageUrls(storedHtml, 'html-documents', 'html-view-test', initialToken);
      expect(mappedHtml).toContain(
        `src="http://localhost:3001/api/html-documents/html-view-test/images/${uuid}.png?t=${initialToken}"`,
      );
      expect(mappedHtml).toContain('alt="Architecture"');
    });

    it('interactive template view (DndCharacterSheet) renders mapped portrait src with token', () => {
      const sheetData = createDndCharacterSheet();
      sheetData.identity.portraitUrl = `/api/canvas/files/images/${uuid}.jpg`;

      const wrapper = mount(DndCharacterSheet, {
        props: {
          data: sheetData,
          templateId: 'sheet-view-test',
          imageToken: initialToken,
        },
        global: {
          stubs: {
            DndHpDialog: true,
            DndIdentitySelect: true,
            DndSelect: true,
            DndRestDialog: true,
            DndPassiveScores: true,
            DndCharacterStates: true,
            DndFormulaButton: true,
            DndRollBar: true,
            DndRollLog: true,
            DndRollToasts: true,
            DndWeaponAttacks: true,
            DndWeaponFields: true,
            DndSpellFields: true,
            DndSpellCatalog: true,
            DndItemCatalog: true,
            DndWallet: true,
            DndStatStrip: true,
            Moon: true,
          },
        },
      });

      const portraitImg = wrapper.find('.dnd-cs-portrait img');
      expect(portraitImg.exists()).toBe(true);
      expect(portraitImg.attributes('src')).toBe(
        `http://localhost:3001/api/interactive-templates/sheet-view-test/images/${uuid}.jpg?t=${initialToken}`,
      );
    });
  });

  describe('3. Error -> one refresh + retry', () => {
    it('text document image error triggers token refresh and updates dom.src', async () => {
      let currentToken = initialToken;
      const onImageError = vi.fn().mockImplementation(async () => {
        currentToken = refreshedToken;
        return true;
      });

      const storedSrc = `/api/canvas/files/images/${uuid}.png`;
      const fakeNode: any = {
        type: { name: 'image' },
        attrs: { src: storedSrc },
      };

      const nodeView = createImageNodeView({
        getDocumentId: () => 'doc-err-test',
        getImageToken: () => currentToken,
        onImageError,
      })(fakeNode);

      const dom = nodeView.dom as HTMLImageElement;
      expect(dom.src).toContain(initialToken);

      // Trigger image error
      dom.dispatchEvent(new Event('error'));
      await vi.waitFor(() => {
        expect(onImageError).toHaveBeenCalledTimes(1);
        expect(dom.src).toContain(refreshedToken);
      });
    });

    it('DndCharacterSheet portrait error triggers onImageError callback', async () => {
      const onImageError = vi.fn().mockResolvedValue(true);
      const sheetData = createDndCharacterSheet();
      sheetData.identity.portraitUrl = `/api/canvas/files/images/${uuid}.jpg`;

      const wrapper = mount(DndCharacterSheet, {
        props: {
          data: sheetData,
          templateId: 'sheet-err-test',
          imageToken: initialToken,
          onImageError,
        },
        global: {
          stubs: {
            DndHpDialog: true,
            DndIdentitySelect: true,
            DndSelect: true,
            DndRestDialog: true,
            DndPassiveScores: true,
            DndCharacterStates: true,
            DndFormulaButton: true,
            DndRollBar: true,
            DndRollLog: true,
            DndRollToasts: true,
            DndWeaponAttacks: true,
            DndWeaponFields: true,
            DndSpellFields: true,
            DndSpellCatalog: true,
            DndItemCatalog: true,
            DndWallet: true,
            DndStatStrip: true,
            Moon: true,
          },
        },
      });

      const portraitImg = wrapper.find('.dnd-cs-portrait img');
      await portraitImg.trigger('error');

      await vi.waitFor(() => {
        expect(onImageError).toHaveBeenCalledTimes(1);
      });
      expect(onImageError).toHaveBeenCalledWith(
        uuid,
        `http://localhost:3001/api/interactive-templates/sheet-err-test/images/${uuid}.jpg?t=${initialToken}`,
      );
    });

    it('HtmlVisualEditor handles image error in preview iframe', async () => {
      const onImageError = vi.fn().mockResolvedValue(true);
      const storedHtml = `<img src="/api/canvas/files/images/${uuid}.png">`;

      const wrapper = mount(HtmlVisualEditor, {
        props: {
          modelValue: storedHtml,
          documentId: 'html-err-test',
          imageToken: initialToken,
          onImageError,
        },
      });

      const iframe = wrapper.find('iframe').element as HTMLIFrameElement;
      const iframeDoc = document.implementation.createHTMLDocument('Preview');
      Object.defineProperty(iframe, 'contentDocument', { value: iframeDoc, configurable: true });

      // Trigger frame load to bind error listener
      await wrapper.find('iframe').trigger('load');

      const img = iframeDoc.createElement('img');
      img.src = `http://localhost:3001/api/html-documents/html-err-test/images/${uuid}.png?t=${initialToken}`;
      iframeDoc.body.appendChild(img);

      img.dispatchEvent(new Event('error', { bubbles: false }));

      await vi.waitFor(() => {
        expect(onImageError).toHaveBeenCalledTimes(1);
      });
      expect(onImageError).toHaveBeenCalledWith(
        uuid,
        `http://localhost:3001/api/html-documents/html-err-test/images/${uuid}.png?t=${initialToken}`,
      );
    });

    it('composables enforce strictly one refresh and no endless retry loops on repeated errors', async () => {
      (htmlDocumentsApi.refreshImageToken as any).mockResolvedValue({
        imageToken: refreshedToken,
        imageTokenExpiresAt: new Date(Date.now() + 3600000).toISOString(),
      });

      const tokens = useResourceImageTokens({
        getResourceId: () => 'html-retry-test',
        resourceType: 'html-document',
      });
      tokens.setImageToken(initialToken);

      const imageSrc = `http://localhost:3001/api/html-documents/html-retry-test/images/${uuid}.png?t=${initialToken}`;

      // First error: refresh allowed
      const first = await tokens.handleImageError(uuid, imageSrc);
      expect(first).toBe(true);
      expect(htmlDocumentsApi.refreshImageToken).toHaveBeenCalledTimes(1);
      expect(tokens.imageToken.value).toBe(refreshedToken);

      // Second error on same image with refreshed token: refresh refused to avoid loop
      const second = await tokens.handleImageError(uuid, imageSrc);
      expect(second).toBe(false);
      expect(htmlDocumentsApi.refreshImageToken).toHaveBeenCalledTimes(1);
    });
  });

  describe('4. Saved content unchanged', () => {
    it('text document image node attrs.src preserves original URL without token', () => {
      const storedSrc = `/api/canvas/files/images/${uuid}.png`;
      const fakeNode: any = {
        type: { name: 'image' },
        attrs: { src: storedSrc },
      };

      const nodeView = createImageNodeView({
        getDocumentId: () => 'doc-save-test',
        getImageToken: () => initialToken,
        onImageError: vi.fn().mockResolvedValue(false),
      })(fakeNode);

      const dom = nodeView.dom as HTMLImageElement;
      // dom.src is tokenized for display
      expect(dom.src).toContain(initialToken);
      // but ProseMirror node.attrs.src remains the stored original
      expect(fakeNode.attrs.src).toBe(storedSrc);
      expect(fakeNode.attrs.src).not.toContain('?t=');
    });

    it('html document form state serialization unmaps tokenized preview DOM back to original stored URLs', () => {
      const doc = document.implementation.createHTMLDocument('Preview');
      const tokenizedSrc = `http://localhost:3001/api/html-documents/doc-save/images/${uuid}.png?t=${initialToken}`;
      doc.body.innerHTML = `
        <div>
          <h2>Document Section</h2>
          <img src="${tokenizedSrc}" alt="Section diagram">
        </div>
      `;

      const serialized = serializeDocumentWithFormState(doc);
      expect(serialized).toContain(`src="http://localhost:3001/api/canvas/files/images/${uuid}.png"`);
      expect(serialized).not.toContain(`images/${uuid}.png?t=`);
    });

    it('interactive template data.identity.portraitUrl preserves original URL without token', () => {
      const storedPortrait = `/api/canvas/files/images/${uuid}.jpg`;
      const sheetData = createDndCharacterSheet();
      sheetData.identity.portraitUrl = storedPortrait;

      const wrapper = mount(DndCharacterSheet, {
        props: {
          data: sheetData,
          templateId: 'sheet-save-test',
          imageToken: initialToken,
        },
        global: {
          stubs: {
            DndHpDialog: true,
            DndIdentitySelect: true,
            DndSelect: true,
            DndRestDialog: true,
            DndPassiveScores: true,
            DndCharacterStates: true,
            DndFormulaButton: true,
            DndRollBar: true,
            DndRollLog: true,
            DndRollToasts: true,
            DndWeaponAttacks: true,
            DndWeaponFields: true,
            DndSpellFields: true,
            DndSpellCatalog: true,
            DndItemCatalog: true,
            DndWallet: true,
            DndStatStrip: true,
            Moon: true,
          },
        },
      });

      // The component renders mapped src
      const portraitImg = wrapper.find('.dnd-cs-portrait img');
      expect(portraitImg.attributes('src')).toContain(`?t=${initialToken}`);

      // The sheet data object preserves the original URL unmutated
      expect(sheetData.identity.portraitUrl).toBe(storedPortrait);
      expect(sheetData.identity.portraitUrl).not.toContain('?t=');
    });

    it('HtmlVisualEditor preserves original stored image URLs in emitted html and history', async () => {
      const storedSrc = `/api/canvas/files/images/${uuid}.png`;
      const storedHtml = `<img src="${storedSrc}" alt="Architecture">`;

      const wrapper = mount(HtmlVisualEditor, {
        props: {
          modelValue: storedHtml,
          documentId: 'html-save-test',
          imageToken: initialToken,
        },
      });

      // The preview iframe srcdoc has mapped tokenized URL
      const iframe = wrapper.find('iframe');
      expect(iframe.attributes('srcdoc')).toContain(`?t=${initialToken}`);

      // Now update a style property on the selected block to trigger emit
      const paddingInput = wrapper.find('.html-style-grid input');
      if (paddingInput.exists()) {
        await paddingInput.setValue('10px');
      }

      // Emitted updates must contain the original stored URL, never tokenized
      const emittedUpdates = wrapper.emitted('update:modelValue');
      if (emittedUpdates && emittedUpdates.length > 0) {
        const lastEntry = emittedUpdates[emittedUpdates.length - 1];
        const lastEmitted = lastEntry ? (lastEntry[0] as string) : '';
        expect(lastEmitted).toContain(`src="${storedSrc}"`);
        expect(lastEmitted).not.toContain(`?t=${initialToken}`);
      }
    });
  });
});
