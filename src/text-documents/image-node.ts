import { Extension } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { resolveResourceImageUrl } from '../canvas/imageUrls';

export interface ImageNodeViewConfig {
  getDocumentId: () => string;
  getImageToken: () => string;
  onImageError: (imageId: string, src?: string | null) => Promise<boolean>;
}

export function createImageNodeView(config: ImageNodeViewConfig) {
  return (node: ProseMirrorNode) => {
    const dom = document.createElement('img');
    let current = node;

    const getMappedSrc = (rawSrc: string, token: string) => {
      const docId = config.getDocumentId();
      return resolveResourceImageUrl(rawSrc, 'text-documents', docId, token);
    };

    const paint = () => {
      const rawSrc = (current.attrs.src as string) || '';
      const token = config.getImageToken();
      dom.src = getMappedSrc(rawSrc, token);
      if (current.attrs.alt) dom.alt = current.attrs.alt;
      else dom.removeAttribute('alt');
      if (current.attrs.title) dom.title = current.attrs.title;
      else dom.removeAttribute('title');
    };

    dom.addEventListener('error', async () => {
      const rawSrc = (current.attrs.src as string) || '';
      if (!rawSrc) return;
      const refreshed = await config.onImageError(rawSrc, dom.src);
      if (refreshed) {
        const nextToken = config.getImageToken();
        dom.src = getMappedSrc(rawSrc, nextToken);
      }
    });

    paint();

    return {
      dom,
      update: (updatedNode: ProseMirrorNode) => {
        if (updatedNode.type.name !== 'image') return false;
        current = updatedNode;
        paint();
        return true;
      },
    };
  };
}

export const TextDocumentImageNodeViewExtension = Extension.create<ImageNodeViewConfig>({
  name: 'textDocumentImageNodeView',

  addOptions() {
    return {
      getDocumentId: () => '',
      getImageToken: () => '',
      onImageError: async () => false,
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          nodeViews: {
            image: createImageNodeView(this.options),
          },
        },
      }),
    ];
  },
});

export default TextDocumentImageNodeViewExtension;
