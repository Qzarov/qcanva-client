import { characterSheetTitle } from '../dnd/characterSheet';
import type { ResourceFolderSummary } from '../api/client';

export type NormalizedTag = { id: string; name: string; color: string };

export const DEFAULT_TAG_COLOR = '#50d1b2';
export const genTagId = () => Math.random().toString(36).slice(2, 10);

export const normalizeTags = (tags: unknown): NormalizedTag[] => {
  if (!Array.isArray(tags)) return [];
  return tags
    .map((tag) => {
      if (typeof tag === 'string') return { id: genTagId(), name: tag, color: DEFAULT_TAG_COLOR };
      if (tag && typeof tag === 'object' && typeof (tag as any).name === 'string') {
        return {
          id: genTagId(),
          name: (tag as any).name,
          color: typeof (tag as any).color === 'string' ? (tag as any).color : DEFAULT_TAG_COLOR,
        };
      }
      return null;
    })
    .filter((tag): tag is NormalizedTag => Boolean(tag));
};

export const normalizeCanvas = (canvas: any, isOwn = false): any => ({
  ...canvas,
  type: 'canvas',
  isOwn,
  folder: canvas.folder || '',
  folderId: canvas.folderId || null,
  tags: normalizeTags(canvas.tags),
});

export const normalizeHtmlDocument = (document: any): any => ({
  ...document,
  type: 'html-document',
  folderId: document.folderId || null,
  pinned: Boolean(document.pinned),
  tags: normalizeTags(document.tags),
});

export const normalizeTextDocument = (document: any): any => ({
  ...document,
  type: 'text-document',
  folderId: document.folderId || null,
  pinned: Boolean(document.pinned),
  tags: normalizeTags(document.tags),
});

export const normalizeInteractiveTemplate = (template: any): any => ({
  ...template,
  title: template.templateType === 'dnd-character' ? characterSheetTitle(template.data, template.title || 'Новый персонаж') : template.title,
  type: 'interactive-template',
  folderId: template.folderId || null,
  tags: normalizeTags(template.tags),
  pinned: false,
});

export const normalizeResourceFolder = (folder: ResourceFolderSummary): ResourceFolderSummary => {
  const canvases = folder.items?.canvases || folder.canvases || [];
  const htmlDocuments = folder.items?.htmlDocuments || folder.htmlDocuments || [];
  const docs = folder.items?.textDocuments || folder.textDocuments || [];
  const templates = folder.items?.interactiveTemplates || folder.interactiveTemplates || [];
  return {
    ...folder,
    canvasCount: folder.canvasCount ?? canvases.length,
    htmlDocumentCount: folder.htmlDocumentCount ?? htmlDocuments.length,
    textDocumentCount: folder.textDocumentCount ?? docs.length,
    interactiveTemplateCount: folder.interactiveTemplateCount ?? templates.length,
    items: {
      canvases,
      htmlDocuments,
      textDocuments: docs,
      interactiveTemplates: templates,
    },
  };
};
