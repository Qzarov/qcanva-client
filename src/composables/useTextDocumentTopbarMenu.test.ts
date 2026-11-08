// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { useTextDocumentTopbarMenu } from './useTextDocumentTopbarMenu';

describe('useTextDocumentTopbarMenu', () => {
  it('positions the menu and routes actions while closing it', async () => {
    const calls = { share: vi.fn(), history: vi.fn(), copy: vi.fn(), outline: vi.fn() };
    const menu = useTextDocumentTopbarMenu({ toggleShare: calls.share, toggleHistory: calls.history, copyLink: calls.copy, toggleOutline: calls.outline });
    const trigger = document.createElement('button');
    trigger.getBoundingClientRect = () => ({ bottom: 100, right: 300 } as DOMRect);
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1000 });

    menu.toggleDocMenu({ currentTarget: trigger } as unknown as Event);
    await nextTick();
    expect(menu.docMenuOpen.value).toBe(true);
    expect(menu.docMenuStyle.value).toMatchObject({ top: '106px', right: '700px' });

    menu.openAccessFromDocMenu();
    menu.openHistoryFromDocMenu();
    menu.copyDocumentLinkFromDocMenu();
    menu.toggleOutlinePanelFromDocMenu();
    expect(calls.share).toHaveBeenCalledOnce();
    expect(calls.history).toHaveBeenCalledOnce();
    expect(calls.copy).toHaveBeenCalledOnce();
    expect(calls.outline).toHaveBeenCalledOnce();
    expect(menu.docMenuOpen.value).toBe(false);
  });
});
