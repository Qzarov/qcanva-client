// @vitest-environment node
//
// The parts of the mention menu that need no editor: the item builder. The
// trigger guards are reused from slash-menu.ts (see mention-menu.ts's own
// comment) and are exercised together with the real editor in
// views/TextDocumentView.mentionMenu.test.ts - including the email case,
// which needs a real ProseMirror doc to place the `@` mid-word.

import { describe, expect, it } from 'vitest';
import { buildMentionMenuItems, type MentionMenuItem } from './mention-menu';

describe('mention menu item builder', () => {
  it('lists the matching documents, then "create page" always last', () => {
    const items = buildMentionMenuItems(
      [
        { id: 'doc-1', title: 'Roadmap' },
        { id: 'doc-2', title: 'Roadmap Q3' },
      ],
      'road',
    );

    expect(items).toEqual<MentionMenuItem[]>([
      { kind: 'document', id: 'doc-1', title: 'Roadmap' },
      { kind: 'document', id: 'doc-2', title: 'Roadmap Q3' },
      { kind: 'create', query: 'road' },
    ]);
  });

  it('still offers "create page" as the only item when nothing matched', () => {
    expect(buildMentionMenuItems([], 'zzzz')).toEqual<MentionMenuItem[]>([
      { kind: 'create', query: 'zzzz' },
    ]);
  });

  it('offers "create page" even for an empty query, carrying the empty text', () => {
    expect(buildMentionMenuItems([], '')).toEqual<MentionMenuItem[]>([{ kind: 'create', query: '' }]);
  });
});
