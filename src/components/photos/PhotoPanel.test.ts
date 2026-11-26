// @vitest-environment jsdom

import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FeedItem, PhotoDetails } from '../../api/photos';
import type { SpaceSummary } from '../../api/spaces';

const detailsMock = vi.fn<(id: string) => Promise<PhotoDetails>>();
const editMock = vi.fn<(id: string, patch: Record<string, unknown>) => Promise<void>>();
const spacesListMock = vi.fn<() => Promise<{ spaces: SpaceSummary[] }>>();
const addMock = vi.fn<(id: string, ids: string[]) => Promise<{ added: number }>>();
const removeMock = vi.fn<(id: string, ids: string[]) => Promise<{ removed: number }>>();
const createMock = vi.fn<(name: string) => Promise<{ id: string }>>();
const renditionMock = vi.fn<(hash: string, size: string) => Promise<string>>();
const downloadMock = vi.fn<(id: string, name?: string) => Promise<string>>();
const promptMock = vi.fn<(o: unknown) => Promise<string | null>>();
const alertMock = vi.fn<(o: unknown) => Promise<void>>();

function mkItem(over: Partial<FeedItem> = {}): FeedItem {
  return {
    fileId: 'f1',
    hash: 'h1',
    name: 'IMG_0001.jpg',
    mime: 'image/jpeg',
    kind: 'photo',
    processed: true,
    takenAt: '2026-08-17T10:30:00.000Z',
    localTakenAt: '2026-08-17T13:30:00.000Z',
    width: 4032,
    height: 3024,
    durationSec: null,
    bytes: 4_200_000,
    folderId: 'fo2',
    favorite: false,
    albumIds: ['a1'],
    thumbhash: null,
    share: null,
    ...over,
  };
}

function mkDetails(over: Partial<PhotoDetails> = {}): PhotoDetails {
  return {
    item: mkItem(),
    meta: {
      cameraMake: 'Apple',
      cameraModel: 'iPhone 15 Pro',
      lens: null,
      gpsLat: 51.4,
      gpsLon: 86.0,
      timeZone: null,
      orientation: 1,
      livePhotoCid: null,
      motionPhoto: false,
    },
    folderPath: [
      { id: 'fo1', name: 'Отпуск' },
      { id: 'fo2', name: 'Алтай' },
    ],
    albums: [{ id: 'a1', name: 'Лето 2026' }],
    edit: { description: 'Озеро утром', rating: null, favorite: false },
    storage: {
      hubCopy: 'present',
      replicas: [
        { nodeId: 'n1', name: 'Домашний ПК', kind: 'pc', state: 'verified', lastSeenAt: null },
        { nodeId: 'n2', name: 'Ноутбук', kind: 'pc', state: 'evicted', lastSeenAt: null },
        { nodeId: 'n3', name: 'Телефон', kind: 'phone', state: 'pending', lastSeenAt: null },
      ],
    },
    ...over,
  };
}

let wrapper: VueWrapper | null = null;

async function setup(fileId = 'f1') {
  const i18n = await import('../../composables/useI18n');
  i18n.useI18n().setLocale('ru');
  const { default: PhotoPanel } = await import('./PhotoPanel.vue');
  wrapper = mount(PhotoPanel, { props: { fileId }, attachTo: document.body });
  await flushPromises();
  return wrapper;
}

describe('PhotoPanel', () => {
  beforeEach(() => {
    vi.resetModules();
    for (const m of [detailsMock, editMock, spacesListMock, addMock, removeMock, createMock, renditionMock, downloadMock, promptMock, alertMock]) {
      m.mockReset();
    }
    detailsMock.mockResolvedValue(mkDetails());
    editMock.mockResolvedValue(undefined);
    spacesListMock.mockResolvedValue({
      spaces: [
        { id: 'a1', name: 'Лето 2026', role: 'owner', ownerId: 'u1', memberCount: 1, sourceCount: 0, mediaCount: 3, coverFileIds: [], updatedAt: '' },
        { id: 'a2', name: 'Горы', role: 'owner', ownerId: 'u1', memberCount: 1, sourceCount: 0, mediaCount: 1, coverFileIds: [], updatedAt: '' },
      ],
    });
    addMock.mockResolvedValue({ added: 1 });
    removeMock.mockResolvedValue({ removed: 1 });
    createMock.mockResolvedValue({ id: 'a3' });
    renditionMock.mockImplementation(async (hash, size) => `blob:${hash}:${size}`);
    downloadMock.mockResolvedValue('http://x/dl');
    alertMock.mockResolvedValue(undefined);
    vi.doMock('../../api/photos', () => ({
      isPhotosMock: () => false,
      photosApi: {
        details: detailsMock,
        edit: editMock,
      },
      renditionUrl: renditionMock,
    }));
    vi.doMock('../../api/spaces', () => ({
      spacesApi: {
        list: spacesListMock,
        addItems: addMock,
        removeItems: removeMock,
        create: createMock,
      },
    }));
    vi.doMock('../../api/drive', async (importOriginal) => {
      const actual = await importOriginal<typeof import('../../api/drive')>();
      return { ...actual, downloadDriveFile: downloadMock };
    });
    vi.doMock('../../composables/appDialog', () => ({ promptDialog: promptMock, alertDialog: alertMock }));
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    vi.doUnmock('../../api/photos');
    vi.doUnmock('../../api/spaces');
    vi.doUnmock('../../api/drive');
    vi.doUnmock('../../composables/appDialog');
    document.body.innerHTML = '';
  });

  it('is a labelled complementary landmark with the file name as heading', async () => {
    const w = await setup();
    const aside = w.get('aside');
    expect(aside.attributes('role')).toBe('complementary');
    const heading = w.get('h3');
    expect(aside.attributes('aria-labelledby')).toBe(heading.attributes('id'));
    expect(heading.text()).toBe('IMG_0001.jpg');
    expect(w.get('[data-panel-close]').attributes('aria-label')).toBe('Закрыть');
  });

  it('panel shows path, albums, replicas states', async () => {
    const w = await setup();
    const info = w.get('[data-panel-info]').text();
    expect(info).toContain('Снято');
    expect(info).toContain('17 августа 2026');
    expect(info).toContain('13:30');
    expect(info).toContain('Apple iPhone 15 Pro');
    expect(info).toContain('4032 × 3024');
    expect(info).toContain('Место');
    expect(info).toContain('51.4000, 86.0000');

    const crumbs = w.findAll('[data-panel-crumb]');
    expect(crumbs.map((c) => c.text())).toEqual(['Отпуск', 'Алтай']);
    await crumbs[0]!.trigger('click');
    expect(w.emitted('open-folder')![0]).toEqual(['fo1']);

    const chips = w.findAll('[data-panel-chip]');
    expect(chips.map((c) => c.text())).toEqual(['Лето 2026']);
    await chips[0]!.trigger('click');
    expect(w.emitted('open-album')![0]).toEqual(['a1']);

    const devs = w.findAll('[data-panel-dev]').map((d) => [d.get('span:not(.pp-dot)').text(), d.get('small').text()].join(' '));
    expect(devs).toEqual([
      'Домашний ПК есть',
      'Ноутбук по запросу',
      'Телефон загружается',
      'Облако Q Space копия',
    ]);
  });

  it('cloud row says preview only when the hub holds no copy, and omits GPS without it', async () => {
    detailsMock.mockResolvedValue(
      mkDetails({
        meta: null,
        albums: [],
        storage: { hubCopy: 'absent', replicas: [] },
      }),
    );
    const w = await setup();
    expect(w.findAll('[data-panel-dev]').map((d) => [d.get('span:not(.pp-dot)').text(), d.get('small').text()].join(' '))).toEqual([
      'Облако Q Space только превью',
    ]);
    expect(w.get('[data-panel-info]').text()).not.toContain('Место');
    expect(w.get('[data-panel-albums]').text()).toContain('Ни в одном альбоме');
  });

  it('favorite toggles via edit', async () => {
    const w = await setup();
    const fav = w.get('[data-panel-fav]');
    expect(fav.attributes('aria-pressed')).toBe('false');
    expect(fav.text()).toBe('В избранное');
    await fav.trigger('click');
    expect(editMock).toHaveBeenCalledWith('f1', { favorite: true });
    await flushPromises();
    expect(w.get('[data-panel-fav]').attributes('aria-pressed')).toBe('true');
    expect(w.get('[data-panel-fav]').text()).toBe('В избранном');
    expect(w.emitted('changed')![0]).toEqual([{ fileId: 'f1', favorite: true }]);
    await w.get('[data-panel-fav]').trigger('click');
    expect(editMock).toHaveBeenLastCalledWith('f1', { favorite: false });
  });

  it('favorite reverts and reports when edit fails', async () => {
    editMock.mockRejectedValue(new Error('boom'));
    const w = await setup();
    await w.get('[data-panel-fav]').trigger('click');
    await flushPromises();
    expect(w.get('[data-panel-fav]').attributes('aria-pressed')).toBe('false');
    expect(alertMock).toHaveBeenCalled();
  });

  it('description saves on blur', async () => {
    const w = await setup();
    const ta = w.get('[data-panel-desc]');
    expect((ta.element as HTMLTextAreaElement).value).toBe('Озеро утром');
    await ta.trigger('blur');
    expect(editMock).not.toHaveBeenCalled();
    await ta.setValue('Озеро на рассвете');
    expect(editMock).not.toHaveBeenCalled();
    await ta.trigger('blur');
    expect(editMock).toHaveBeenCalledWith('f1', { description: 'Озеро на рассвете' });
    await ta.setValue('   ');
    await ta.trigger('blur');
    expect(editMock).toHaveBeenLastCalledWith('f1', { description: null });
  });

  it('flushes an unblurred description edit when the photo changes', async () => {
    detailsMock.mockResolvedValueOnce(mkDetails());
    detailsMock.mockResolvedValueOnce(mkDetails({ item: mkItem({ fileId: 'f2', name: 'second.jpg' }) }));
    const w = await setup('f1');
    await w.get('[data-panel-desc]').setValue('Новое описание');
    await w.setProps({ fileId: 'f2' });
    await flushPromises();
    expect(editMock).toHaveBeenCalledTimes(1);
    expect(editMock).toHaveBeenCalledWith('f1', { description: 'Новое описание' });
    // A late blur of the removed textarea does not send it twice.
    await w.get('[data-panel-desc]').trigger('blur');
    expect(editMock).toHaveBeenCalledTimes(1);
  });

  it('flushes an unblurred description edit on unmount', async () => {
    const w = await setup();
    await w.get('[data-panel-desc]').setValue('Перед закрытием');
    w.unmount();
    wrapper = null;
    expect(editMock).toHaveBeenCalledWith('f1', { description: 'Перед закрытием' });
  });

  it('Escape in the description saves the edit before closing', async () => {
    const w = await setup();
    const ta = w.get('[data-panel-desc]');
    await ta.setValue('Не потерять');
    await ta.trigger('keydown', { key: 'Escape' });
    expect(editMock).toHaveBeenCalledWith('f1', { description: 'Не потерять' });
    expect(w.emitted('close')).toHaveLength(1);
  });

  it('a failed save for the old photo leaves the new photo baseline intact', async () => {
    let failSave!: (e: Error) => void;
    editMock.mockImplementationOnce(() => new Promise<void>((_, rej) => (failSave = rej)));
    detailsMock.mockResolvedValueOnce(mkDetails());
    detailsMock.mockResolvedValueOnce(
      mkDetails({ item: mkItem({ fileId: 'f2' }), edit: { description: 'B', rating: null, favorite: false } }),
    );
    const w = await setup('f1');
    await w.get('[data-panel-desc]').setValue('A изменено');
    await w.setProps({ fileId: 'f2' });
    await flushPromises();
    failSave(new Error('nope'));
    await flushPromises();
    editMock.mockClear();
    const ta = w.get('[data-panel-desc]');
    expect((ta.element as HTMLTextAreaElement).value).toBe('B');
    // B is unchanged, so blurring must not send anything (baseline still 'B', not 'Озеро утром').
    await ta.trigger('blur');
    expect(editMock).not.toHaveBeenCalled();
  });

  it('album plus toggles membership', async () => {
    const w = await setup();
    await w.get('[data-panel-plus]').trigger('click');
    await flushPromises();
    expect(w.get('[data-panel-plus]').attributes('aria-expanded')).toBe('true');
    const items = w.findAll('[data-panel-menu-item]');
    expect(items.map((i) => i.text())).toEqual(['Лето 2026', 'Горы']);
    expect(items.map((i) => i.attributes('aria-pressed'))).toEqual(['true', 'false']);

    await items[1]!.trigger('click');
    await flushPromises();
    expect(addMock).toHaveBeenCalledWith('a2', ['f1']);
    expect(w.findAll('[data-panel-chip]').map((c) => c.text())).toEqual(['Лето 2026', 'Горы']);

    await w.findAll('[data-panel-menu-item]')[0]!.trigger('click');
    await flushPromises();
    expect(removeMock).toHaveBeenCalledWith('a1', ['f1']);
    expect(w.findAll('[data-panel-chip]').map((c) => c.text())).toEqual(['Горы']);
    expect(w.emitted('changed')!.slice(-1)[0]).toEqual([{ fileId: 'f1', albumIds: ['a2'] }]);
  });

  it('album toggle reverts when the hub refuses', async () => {
    addMock.mockRejectedValue(new Error('no'));
    const w = await setup();
    await w.get('[data-panel-plus]').trigger('click');
    await flushPromises();
    await w.findAll('[data-panel-menu-item]')[1]!.trigger('click');
    await flushPromises();
    expect(w.findAll('[data-panel-chip]').map((c) => c.text())).toEqual(['Лето 2026']);
    expect(alertMock).toHaveBeenCalled();
  });

  it('a failed album add does not undo a different successful album removal', async () => {
    let rejectAdd!: (error: Error) => void;
    addMock.mockImplementation(() => new Promise<{ added: number }>((_, reject) => { rejectAdd = reject; }));
    removeMock.mockResolvedValue({ removed: 1 });
    const w = await setup();
    await w.get('[data-panel-plus]').trigger('click');
    await flushPromises();

    await w.findAll('[data-panel-menu-item]')[1]!.trigger('click');
    await w.findAll('[data-panel-menu-item]')[0]!.trigger('click');
    await flushPromises();
    rejectAdd(new Error('add failed'));
    await flushPromises();

    expect(w.findAll('[data-panel-chip]').map((c) => c.text())).toEqual([]);
    expect(w.emitted('changed')!.slice(-1)[0]).toEqual([{ fileId: 'f1', albumIds: [] }]);
  });

  it('new album creates it and adds the photo', async () => {
    promptMock.mockResolvedValue('  Новый  ');
    const w = await setup();
    await w.get('[data-panel-plus]').trigger('click');
    await flushPromises();
    await w.get('[data-panel-new-album]').trigger('click');
    await flushPromises();
    expect(createMock).toHaveBeenCalledWith('Новый');
    expect(addMock).toHaveBeenCalledWith('a3', ['f1']);
    expect(w.findAll('[data-panel-chip]').map((c) => c.text())).toEqual(['Лето 2026', 'Новый']);
  });

  it('new album does nothing when the prompt is cancelled', async () => {
    promptMock.mockResolvedValue(null);
    const w = await setup();
    await w.get('[data-panel-plus]').trigger('click');
    await flushPromises();
    await w.get('[data-panel-new-album]').trigger('click');
    await flushPromises();
    expect(createMock).not.toHaveBeenCalled();
  });

  it('download and close are wired and open-viewer button is removed', async () => {
    const w = await setup();
    expect(w.find('[data-panel-open]').exists()).toBe(false);
    await w.get('[data-panel-download]').trigger('click');
    expect(downloadMock).toHaveBeenCalledWith('f1', 'IMG_0001.jpg');
    await w.get('[data-panel-close]').trigger('click');
    expect(w.emitted('close')).toHaveLength(1);
  });

  it('renders 2+ group inspector with summary and all 5 group actions without fetching details', async () => {
    const i18n = await import('../../composables/useI18n');
    i18n.useI18n().setLocale('ru');
    const { default: PhotoPanel } = await import('./PhotoPanel.vue');
    const items = [
      mkItem({ fileId: 'f1', bytes: 1_048_576, localTakenAt: '2026-08-10T10:00:00.000Z' }),
      mkItem({ fileId: 'f2', bytes: 2_097_152, localTakenAt: '2026-08-17T10:00:00.000Z' }),
    ];
    wrapper = mount(PhotoPanel, {
      props: { fileId: 'f1', selectedItems: items },
      attachTo: document.body,
    });
    await flushPromises();

    expect(detailsMock).not.toHaveBeenCalled();
    expect(wrapper.get('[data-panel-title]').text()).toBe('Выбрано: 2');
    const groupInfo = wrapper.get('[data-panel-group-info]').text();
    expect(groupInfo).toContain('Общий размер');
    expect(groupInfo).toContain('3');
    expect(groupInfo).toContain('Период');

    await wrapper.get('[data-panel-group-fav]').trigger('click');
    await wrapper.get('[data-panel-group-share]').trigger('click');
    await wrapper.get('[data-panel-group-album]').trigger('click');
    await wrapper.get('[data-panel-group-download]').trigger('click');
    await wrapper.get('[data-panel-group-delete]').trigger('click');

    expect(wrapper.emitted('group-favorite')).toHaveLength(1);
    expect(wrapper.emitted('group-share')).toHaveLength(1);
    expect(wrapper.emitted('group-album')).toHaveLength(1);
    expect(wrapper.emitted('group-download')).toHaveLength(1);
    expect(wrapper.emitted('group-delete')).toHaveLength(1);
  });

  it('preview falls back from the preview rendition to the thumbnail, then to a placeholder', async () => {
    const w = await setup();
    expect(w.get('[data-panel-preview] img').attributes('src')).toBe('blob:h1:preview');
    await w.get('[data-panel-preview] img').trigger('error');
    await flushPromises();
    expect(w.get('[data-panel-preview] img').attributes('src')).toBe('blob:h1:thumbnail');
    await w.get('[data-panel-preview] img').trigger('error');
    await flushPromises();
    expect(w.find('[data-panel-preview] img').exists()).toBe(false);
    expect(w.get('[data-panel-preview]').text()).toBe('Превью недоступно');
  });

  it('follows file-id and drops a stale response', async () => {
    let resolveFirst!: (d: PhotoDetails) => void;
    detailsMock.mockImplementationOnce(() => new Promise((r) => (resolveFirst = r)));
    detailsMock.mockResolvedValueOnce(mkDetails({ item: mkItem({ fileId: 'f2', name: 'second.jpg' }) }));
    const w = await setup('f1');
    await w.setProps({ fileId: 'f2' });
    await flushPromises();
    expect(w.get('h3').text()).toBe('second.jpg');
    resolveFirst(mkDetails());
    await flushPromises();
    expect(w.get('h3').text()).toBe('second.jpg');
  });

  it('shows an error with retry when details cannot be loaded', async () => {
    detailsMock.mockRejectedValueOnce(new Error('offline'));
    const w = await setup();
    expect(w.get('[data-panel-error]').text()).toContain('offline');
    await w.get('[data-panel-error] button').trigger('click');
    await flushPromises();
    expect(w.find('[data-panel-error]').exists()).toBe(false);
    expect(w.get('h3').text()).toBe('IMG_0001.jpg');
  });

  it('Escape in the album menu closes only the menu and focuses +, and textarea caps length at 10000', async () => {
    const w = await setup();
    expect(w.get('[data-panel-desc]').attributes('maxlength')).toBe('10000');
    await w.get('[data-panel-plus]').trigger('click');
    await flushPromises();
    expect(w.find('[data-panel-menu]').exists()).toBe(true);

    await w.get('[data-panel-menu]').trigger('keydown.esc');
    await flushPromises();
    expect(w.find('[data-panel-menu]').exists()).toBe(false);
    expect(w.emitted('close')).toBeUndefined();
    expect(document.activeElement).toBe(w.get('[data-panel-plus]').element);

    // Pressing Escape while focus is still on the trigger (+) also closes only the menu.
    await w.get('[data-panel-plus]').trigger('click');
    await flushPromises();
    expect(w.find('[data-panel-menu]').exists()).toBe(true);
    await w.get('[data-panel-plus]').trigger('keydown.esc');
    await flushPromises();
    expect(w.find('[data-panel-menu]').exists()).toBe(false);
    expect(w.emitted('close')).toBeUndefined();
    w.unmount();
  });
});
