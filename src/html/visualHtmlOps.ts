export type HtmlVisualOpKind = 'add' | 'update' | 'delete' | 'move';

export type HtmlVisualOp =
  | { type: 'html-block-add'; html: string; blockId?: string }
  | { type: 'html-block-update'; html: string; blockId?: string }
  | { type: 'html-block-delete'; html: string; blockId?: string }
  | { type: 'html-block-move'; html: string; blockId?: string; fromIndex?: number; toIndex?: number };

const opTypes: Record<HtmlVisualOpKind, HtmlVisualOp['type']> = {
  add: 'html-block-add',
  update: 'html-block-update',
  delete: 'html-block-delete',
  move: 'html-block-move',
};

export function createHtmlVisualOp(
  kind: HtmlVisualOpKind,
  html: string,
  meta: { blockId?: string; fromIndex?: number; toIndex?: number } = {},
): HtmlVisualOp {
  return {
    type: opTypes[kind],
    html,
    ...meta,
  } as HtmlVisualOp;
}
