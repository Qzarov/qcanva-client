// @vitest-environment jsdom
//
// Front task 7/8/9: the Share sheet, its outside-tap/Escape closing, and the
// custom-slug save flow - including the root-cause fix for "custom link
// doesn't save": saving a slug canonicalises the URL, which remounts this
// view (view-remount.ts) and used to silently reset showShare to false. The
// `openShare=1` one-shot query param is tested the same way
// TextDocumentView.mentionCreatePage.test.ts already tests `mentionFocus=1`
// (a mutable routeState, since the real remount is the router's job, out of
// a component-level unit test's reach - what's testable here is that a
// fresh mount with the flag set reopens the sheet and strips the flag).

import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TextDocumentView from './TextDocumentView.vue';

const routeState = vi.hoisted(() => ({
  id: 'doc-1',
  query: {} as Record<string, string>,
}));

const mocks = vi.hoisted(() => ({
  push: vi.fn().mockResolvedValue(undefined),
  replace: vi.fn().mockResolvedValue(undefined),
  showToast: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
}));

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: routeState.id }, fullPath: `/docs/${routeState.id}`, query: routeState.query }),
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
}));

vi.mock('../api/client', () => ({
  accessRequests: { create: vi.fn() },
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message = 'API error') {
      super(message);
      this.status = status;
    }
  },
  auth: { resourcePasswordLogin: vi.fn() },
  getCurrentUser: vi.fn(() => ({ id: 'user-1', email: 'owner@example.com' })),
  isAuthenticated: vi.fn(() => true),
  setToken: vi.fn(),
  uploadImage: vi.fn(),
  textDocuments: {
    get: mocks.get,
    update: mocks.update,
    permissions: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../composables/useTextDocumentSocket', () => ({
  useTextDocumentSocket: () => ({
    connected: { value: true },
    currentRevision: { value: 0 },
    pendingUpdatesCount: { value: 0 },
    connect: vi.fn(),
    disconnect: vi.fn(),
    sendUpdate: vi.fn(),
    sendAwareness: vi.fn(),
    onRemoteUpdate: vi.fn(),
    onReject: vi.fn(),
    onAck: vi.fn(),
    setRevision: vi.fn(),
    clearPendingUpdates: vi.fn(),
  }),
}));

vi.mock('../composables/useToast', () => ({ useToast: () => ({ show: mocks.showToast }) }));

function docPayload(overrides: Record<string, unknown> = {}) {
  return {
    document: {
      id: 'doc-1',
      title: 'Editable doc',
      revision: 0,
      visibility: 'private',
      listedInPublic: true,
      slug: null,
      ...overrides,
    },
    role: 'owner',
  };
}

async function mountEditableDoc(): Promise<any> {
  const wrapper = mount(TextDocumentView, {
    global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    attachTo: document.body,
  });
  await flushPromises();
  await wrapper.vm.$nextTick();
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  vi.clearAllMocks();
  routeState.id = 'doc-1';
  routeState.query = {};
  mocks.get.mockResolvedValue(docPayload());
});

describe('Share sheet', () => {
  it('opens from the Share button', async () => {
    const wrapper = await mountEditableDoc();
    expect(wrapper.vm.showShare).toBe(false);

    await wrapper.get('.text-doc-access-btn').trigger('click');

    expect(wrapper.vm.showShare).toBe(true);
    expect(document.querySelector('.text-doc-share-panel')).toBeTruthy();

    wrapper.unmount();
  });

  it('closes on an outside tap (the backdrop)', async () => {
    const wrapper = await mountEditableDoc();
    await wrapper.get('.text-doc-access-btn').trigger('click');
    expect(wrapper.vm.showShare).toBe(true);

    document.querySelector('.text-doc-share-backdrop')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();

    expect(wrapper.vm.showShare).toBe(false);

    wrapper.unmount();
  });

  it('does NOT close on a tap inside the sheet', async () => {
    const wrapper = await mountEditableDoc();
    await wrapper.get('.text-doc-access-btn').trigger('click');

    document.querySelector('.text-doc-share-panel')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();

    expect(wrapper.vm.showShare).toBe(true);

    wrapper.unmount();
  });

  it('closes on Escape from anywhere on the page (Teleport breaks template-scoped keydown bubbling)', async () => {
    const wrapper = await mountEditableDoc();
    await wrapper.get('.text-doc-access-btn').trigger('click');
    expect(wrapper.vm.showShare).toBe(true);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await flushPromises();

    expect(wrapper.vm.showShare).toBe(false);

    wrapper.unmount();
  });

  it('reopens after a fresh mount carrying openShare=1, and strips the flag (front task 9 fix)', async () => {
    routeState.query = { openShare: '1' };

    const wrapper = await mountEditableDoc();

    expect(wrapper.vm.showShare).toBe(true);
    expect(mocks.replace).toHaveBeenCalledWith(
      expect.objectContaining({ params: { id: 'doc-1' }, query: {} }),
    );
    // The final URL must be exactly `/docs/doc-1`, no leftover `openShare`
    // AND no extra history entry - `replace` never `push`, at every step of
    // the cleanup, or the user's back button would land on a URL that
    // reopens the sheet all over again.
    expect(mocks.push).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it('does NOT reopen on a normal mount (no openShare flag)', async () => {
    const wrapper = await mountEditableDoc();
    expect(wrapper.vm.showShare).toBe(false);
    wrapper.unmount();
  });
});

describe('custom slug (front task 9/10)', () => {
  it('saves a valid slug, updates the URL to include openShare=1, and shows the saved value', async () => {
    mocks.update.mockResolvedValue({ slug: 'my-doc' });
    const wrapper = await mountEditableDoc();
    await wrapper.get('.text-doc-access-btn').trigger('click');

    wrapper.vm.slugInput = 'my-doc';
    await wrapper.vm.$nextTick();
    await wrapper.vm.saveSlug();

    expect(mocks.update).toHaveBeenCalledWith('doc-1', { slug: 'my-doc' });
    expect(mocks.replace).toHaveBeenCalledWith(
      expect.objectContaining({ params: { id: 'my-doc' }, query: expect.objectContaining({ openShare: '1' }) }),
    );
    expect(mocks.showToast).toHaveBeenCalledWith('Link saved', 'success');
    expect(wrapper.vm.slugInput).toBe('my-doc');
    // Canonicalising to the new slug must never add a history entry either -
    // only the fresh mount's own openShare cleanup (asserted above) and this
    // save both use `replace`.
    expect(mocks.push).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it('rejects an invalid format BEFORE calling the API (inline validation, front task 10)', async () => {
    const wrapper = await mountEditableDoc();
    await wrapper.get('.text-doc-access-btn').trigger('click');

    wrapper.vm.slugInput = 'Invalid Slug!';
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.slugFormatError).toBeTruthy();
    await wrapper.vm.saveSlug();

    expect(mocks.update).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it('surfaces a server-side conflict inline rather than silently resetting the field', async () => {
    const ApiErrorCtor = (await import('../api/client')).ApiError as any;
    mocks.update.mockRejectedValue(new ApiErrorCtor(409, 'This link is already taken'));
    const wrapper = await mountEditableDoc();
    await wrapper.get('.text-doc-access-btn').trigger('click');

    wrapper.vm.slugInput = 'taken-slug';
    await wrapper.vm.$nextTick();
    await wrapper.vm.saveSlug();

    expect(wrapper.vm.slugError).toBe('This link is already taken');
    // The typed value is NOT silently thrown away on failure.
    expect(wrapper.vm.slugInput).toBe('taken-slug');

    wrapper.unmount();
  });

  it('clears the server error as soon as the user edits the field again', async () => {
    const ApiErrorCtor = (await import('../api/client')).ApiError as any;
    mocks.update.mockRejectedValue(new ApiErrorCtor(409, 'This link is already taken'));
    const wrapper = await mountEditableDoc();
    await wrapper.get('.text-doc-access-btn').trigger('click');
    wrapper.vm.slugInput = 'taken-slug';
    await wrapper.vm.saveSlug();
    expect(wrapper.vm.slugError).toBeTruthy();

    wrapper.vm.slugInput = 'taken-slug-2';
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.slugError).toBe('');

    wrapper.unmount();
  });
});

describe('Password protected access (front task: merged into General Access)', () => {
  it('has no standalone Password Access section - the checkbox lives in General Access', async () => {
    const wrapper = await mountEditableDoc();
    await wrapper.get('.text-doc-access-btn').trigger('click');

    const sectionTitles = Array.from(document.querySelectorAll('.share-section-title')).map((el) => el.textContent);
    expect(sectionTitles.some((title) => /password/i.test(title || ''))).toBe(false);

    const generalSection = document.querySelector('.share-panel-body .share-section');
    const checkboxLabels = Array.from(generalSection!.querySelectorAll('label.share-checkbox')).map((el) => el.textContent);
    expect(checkboxLabels.some((label) => /password/i.test(label || ''))).toBe(true);

    wrapper.unmount();
  });

  it('shows the password field directly under the checkbox once checked, hides it otherwise', async () => {
    const wrapper = await mountEditableDoc();
    await wrapper.get('.text-doc-access-btn').trigger('click');

    expect(document.querySelector('.share-password-form')).toBeNull();

    wrapper.vm.passwordAccessEnabled = true;
    await wrapper.vm.$nextTick();
    expect(document.querySelector('.share-password-form')).toBeTruthy();

    wrapper.vm.passwordAccessEnabled = false;
    await wrapper.vm.$nextTick();
    expect(document.querySelector('.share-password-form')).toBeNull();

    wrapper.unmount();
  });

  it('saves the password settings via the existing backend call, unchanged', async () => {
    // vi.clearAllMocks() (beforeEach) resets call history but not a mock
    // implementation set via mockRejectedValue/mockResolvedValue - an
    // earlier test in this file leaves mocks.update rejecting, so this
    // needs its own explicit resolved value rather than relying on the
    // shared mock's default.
    mocks.update.mockResolvedValue({});
    const wrapper = await mountEditableDoc();
    await wrapper.get('.text-doc-access-btn').trigger('click');

    wrapper.vm.passwordAccessEnabled = true;
    await wrapper.vm.$nextTick();
    wrapper.vm.passwordAccessPassword = 'secret123';
    wrapper.vm.passwordAccessRole = 'edit';
    await wrapper.vm.savePasswordAccess();

    expect(mocks.update).toHaveBeenCalledWith('doc-1', {
      passwordAccessEnabled: true,
      passwordAccessPassword: 'secret123',
      passwordAccessRole: 'edit',
    });

    wrapper.unmount();
  });
});

describe('Copy link (front task 8/11)', () => {
  it('copies the default id-based URL when no custom slug is set', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const wrapper = await mountEditableDoc();

    await wrapper.vm.copyDocumentLink();

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/docs/doc-1'));
    expect(mocks.showToast).toHaveBeenCalledWith('Copied', 'success');

    wrapper.unmount();
  });

  it('copies the CUSTOM slug URL once one is set, not the id', async () => {
    mocks.get.mockResolvedValue(docPayload({ slug: 'my-doc' }));
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const wrapper = await mountEditableDoc();

    await wrapper.vm.copyDocumentLink();

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/docs/my-doc'));
    expect(writeText).not.toHaveBeenCalledWith(expect.stringContaining('/docs/doc-1'));

    wrapper.unmount();
  });

  it('has no standalone Copy Link button - the URL row itself is the control', async () => {
    const wrapper = await mountEditableDoc();
    await wrapper.get('.text-doc-access-btn').trigger('click');

    expect(document.querySelector('.share-copy-link-btn')).toBeNull();
    const row = document.querySelector('.share-link-row');
    expect(row).toBeTruthy();
    expect(row?.tagName).toBe('BUTTON');

    wrapper.unmount();
  });

  it('clicking the URL row copies the link and shows transient "Copied" feedback', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    vi.useFakeTimers();
    const wrapper = await mountEditableDoc();
    await wrapper.get('.text-doc-access-btn').trigger('click');

    document.querySelector<HTMLElement>('.share-link-row')!.click();
    await flushPromises();

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/docs/doc-1'));
    expect(document.querySelector('.share-link-copied')).toBeTruthy();

    vi.advanceTimersByTime(1500);
    await flushPromises();
    expect(document.querySelector('.share-link-copied')).toBeNull();

    vi.useRealTimers();
    wrapper.unmount();
  });

  it('never copies a service/navigation query param, even while one is live on the current route', async () => {
    // documentUrl is built from origin + slug-or-id alone (see the component)
    // and never reads route.query, but this pins that down as behaviour: a
    // user who opens Share via the one-shot openShare=1 URL and hits Copy
    // Link before it's stripped must still get the bare canonical URL.
    routeState.query = { openShare: '1', mentionFocus: '1', editorFocus: '1' };
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const wrapper = await mountEditableDoc();

    await wrapper.vm.copyDocumentLink();

    expect(writeText).toHaveBeenCalledWith('http://localhost:3000/docs/doc-1');
    expect(writeText.mock.calls).toHaveLength(1);
    const copied = writeText.mock.calls[0]![0] as string;
    expect(copied).not.toContain('openShare');
    expect(copied).not.toContain('mentionFocus');
    expect(copied).not.toContain('editorFocus');
    expect(copied).not.toContain('?');

    wrapper.unmount();
  });
});
