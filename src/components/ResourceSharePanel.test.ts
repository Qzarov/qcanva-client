// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ResourceSharePanel from './ResourceSharePanel.vue';
import { slugFormatIsValid } from '../sharing/slug';

let wrapper: ReturnType<typeof mount> | null = null;

const mountPanel = (props: Record<string, unknown> = {}) => {
  wrapper = mount(ResourceSharePanel, {
    attachTo: document.body,
    props: {
      open: true,
      title: 'Share canvas',
      url: 'https://qcanva.example/canvas/c1',
      copyLink: vi.fn().mockResolvedValue(undefined),
      slugPrefix: '/canvas/',
      visibility: 'private',
      allowPublicEdit: false,
      listedInPublic: true,
      permissions: [{ id: 'p1', userId: 'u2', role: 'edit', user: { email: 'teammate@example.com' } }],
      slug: '',
      shareEmail: '',
      shareRole: 'read',
      passwordAccessEnabled: false,
      passwordAccessPassword: '',
      passwordAccessRole: 'read',
      ...props,
    },
  });
  return wrapper;
};

const $ = <T extends Element = HTMLElement>(selector: string) => document.querySelector<T>(selector);

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

describe('ResourceSharePanel', () => {
  it('renders the document sheet layout: link first, then access, custom link, invites', () => {
    mountPanel();
    const titles = Array.from(document.querySelectorAll('.share-section-title')).map((el) => el.textContent?.trim().toLowerCase());
    expect(titles.length).toBe(4);
    expect($('.text-doc-share-panel .share-panel-body > .share-section .share-link-row')).toBeTruthy();
    expect($('.slug-prefix')?.textContent).toBe('/canvas/');
    expect($('.share-item')?.textContent).toContain('teammate@example.com');
  });

  it('is plain by default and Liquid Glass (sheet + backdrop) when asked', async () => {
    mountPanel();
    expect($('.share-panel-glass')).toBeNull();
    await wrapper!.setProps({ glass: true });
    expect($('.share-panel.share-panel-glass')).toBeTruthy();
    expect($('.text-doc-share-backdrop.share-backdrop-glass')).toBeTruthy();
  });

  it('reports access changes without applying them itself', async () => {
    mountPanel();
    const select = $<HTMLSelectElement>('.share-visibility-select')!;
    select.value = 'public';
    select.dispatchEvent(new Event('change'));
    const [allowEdit] = Array.from(document.querySelectorAll<HTMLInputElement>('.share-checkbox input'));
    allowEdit!.checked = true;
    allowEdit!.dispatchEvent(new Event('change'));

    expect(wrapper!.emitted('update:visibility')).toEqual([['public']]);
    expect(wrapper!.emitted('update:allowPublicEdit')).toEqual([[true]]);
  });

  it('copies from the link row and shows "copied" there', async () => {
    const copyLink = vi.fn().mockResolvedValue(undefined);
    mountPanel({ copyLink });
    $<HTMLButtonElement>('.share-link-row')!.click();
    await flushPromises();
    expect(copyLink).toHaveBeenCalledOnce();
    expect($('.share-link-row-copied .share-link-copied')).toBeTruthy();
  });

  it('blocks saving a malformed custom link and says why', async () => {
    mountPanel({ slug: 'Bad Slug!' });
    await flushPromises();
    expect($('.slug-error')).toBeTruthy();
    expect($<HTMLButtonElement>('.share-save-slug-btn')!.disabled).toBe(true);
    $<HTMLInputElement>('.slug-input')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(wrapper!.emitted('save-slug')).toBeUndefined();

    await wrapper!.setProps({ slug: 'team-roadmap' });
    $<HTMLButtonElement>('.share-save-slug-btn')!.click();
    expect(wrapper!.emitted('save-slug')).toHaveLength(1);
  });

  it('closes on Escape from anywhere and on a backdrop tap', () => {
    mountPanel();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    $<HTMLElement>('.text-doc-share-backdrop')!.click();
    expect(wrapper!.emitted('close')).toHaveLength(2);
  });

  it('stops listening for Escape once closed', async () => {
    mountPanel();
    await wrapper!.setProps({ open: false });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(wrapper!.emitted('close')).toBeUndefined();
  });
});

describe('slugFormatIsValid', () => {
  it('mirrors the backend slug format', () => {
    for (const ok of ['', 'ab', 'team-roadmap', 'v1-7-8', 'a'.repeat(64)]) expect(slugFormatIsValid(ok)).toBe(true);
    for (const bad of ['a', 'Bad Slug!', '-lead', 'trail-', 'dou--ble', 'a'.repeat(65), 'кириллица']) {
      expect(slugFormatIsValid(bad)).toBe(false);
    }
  });
});
