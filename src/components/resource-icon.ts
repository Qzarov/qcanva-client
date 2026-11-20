/** Which icon a resource gets (ResourceIcon.vue), from its kind and, for a template, its template type. */
export type ResourceIconKey = 'canvas' | 'text-document' | 'html-document' | 'board' | 'sheet' | 'template' | 'file';

export function resourceIconKey(kind: string | null | undefined, templateType?: string | null): ResourceIconKey {
  switch (kind) {
    case 'canvas':
    case 'text-document':
    case 'html-document':
    case 'board':
    case 'sheet':
    case 'file':
      return kind;
    case 'interactive-template':
      if (templateType === 'trello-board') return 'board';
      if (templateType === 'dnd-character') return 'sheet';
      return 'template';
    default:
      return 'file';
  }
}
