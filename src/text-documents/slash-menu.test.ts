// @vitest-environment node
//
// The parts of the slash menu that need no editor: the item table itself and
// the filter. The trigger guards need a real ProseMirror state and are
// exercised in views/TextDocumentView.slashMenu.test.ts against the live
// editor.

import { describe, expect, it } from 'vitest';
import { SLASH_MENU_ITEMS, filterSlashItems, type SlashMenuItem } from './slash-menu';
import { messages } from '../composables/useI18n';

const label = (item: SlashMenuItem) => messages.en[item.labelKey];

describe('slash menu item table', () => {
  it('offers exactly the twelve blocks the editor can insert', () => {
    expect(SLASH_MENU_ITEMS.map((item) => item.id)).toEqual([
      'paragraph',
      'heading1',
      'heading2',
      'heading3',
      'bulletList',
      'orderedList',
      'taskList',
      'blockquote',
      'codeBlock',
      'callout',
      'horizontalRule',
      'image',
    ]);
  });

  it('has a unique id per item', () => {
    const ids = SLASH_MENU_ITEMS.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('labels every item from BOTH locale maps', () => {
    // The i18n suite already asserts the maps stay parallel; this asserts the
    // menu only ever names a key that is in them, so a new item cannot ship
    // with a label that renders as `undefined` in one language.
    for (const item of SLASH_MENU_ITEMS) {
      expect(messages.en[item.labelKey], `en.${item.labelKey}`).toBeTruthy();
      expect(messages.ru[item.labelKey], `ru.${item.labelKey}`).toBeTruthy();
    }
  });

  it('draws an inline Lucide-style svg per item, never an emoji', () => {
    for (const item of SLASH_MENU_ITEMS) {
      expect(item.icon, item.id).toContain('<svg');
      expect(item.icon, item.id).toContain('width="24"');
      expect(item.icon, item.id).toContain('height="24"');
      expect(item.icon, item.id).toContain('viewBox="0 0 24 24"');
      expect(item.icon, item.id).toContain('stroke-width="2"');
      // The project's standing rule. An emoji is outside the BMP's ascii range
      // and would show up here; a path definition never is.
      expect(/[^\x20-\x7E]/.test(item.icon), `${item.id} has non-ascii`).toBe(false);
    }
  });

  it('gives every item a DIFFERENT glyph, so the icons are not decoration', () => {
    expect(new Set(SLASH_MENU_ITEMS.map((item) => item.icon)).size).toBe(SLASH_MENU_ITEMS.length);
  });
});

describe('slash menu filtering', () => {
  it('returns everything for an empty query', () => {
    expect(filterSlashItems(SLASH_MENU_ITEMS, '', label)).toHaveLength(SLASH_MENU_ITEMS.length);
    expect(filterSlashItems(SLASH_MENU_ITEMS, '   ', label)).toHaveLength(SLASH_MENU_ITEMS.length);
  });

  it('matches the localized label, case-insensitively', () => {
    expect(filterSlashItems(SLASH_MENU_ITEMS, 'Divi', label).map((i) => i.id)).toEqual([
      'horizontalRule',
    ]);
  });

  it('matches the ascii shorthands people actually type', () => {
    expect(filterSlashItems(SLASH_MENU_ITEMS, 'h1', label).map((i) => i.id)).toEqual(['heading1']);
    expect(filterSlashItems(SLASH_MENU_ITEMS, 'todo', label).map((i) => i.id)).toEqual(['taskList']);
    expect(filterSlashItems(SLASH_MENU_ITEMS, 'hr', label).map((i) => i.id)).toEqual([
      'horizontalRule',
    ]);
  });

  it('matches by the Russian label while the ui is in English', () => {
    // The menu is searched by what the user sees, so the label function is the
    // caller's - injecting the Russian map must change what matches.
    const ru = (item: SlashMenuItem) => messages.ru[item.labelKey];
    expect(filterSlashItems(SLASH_MENU_ITEMS, 'цитат', ru).map((i) => i.id)).toEqual(['blockquote']);
  });

  it('returns nothing for a query that matches no block', () => {
    expect(filterSlashItems(SLASH_MENU_ITEMS, 'zzzz', label)).toEqual([]);
  });
});
