// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import DashboardResourceCard from './DashboardResourceCard.vue';
import DashboardFolderResourceGrid from './DashboardFolderResourceGrid.vue';
import DashboardFolderFiles from './DashboardFolderFiles.vue';
import DashboardActiveSubfolders from './DashboardActiveSubfolders.vue';
import DashboardRecentResources from './DashboardRecentResources.vue';
import DashboardFeedResourceGrid from './DashboardFeedResourceGrid.vue';
import DashboardInteractiveFeedGrid from './DashboardInteractiveFeedGrid.vue';
import { resetExplorerGroupDnd, useExplorerGroupDnd } from '../../composables/useExplorerGroupDnd';
import { driveApi } from '../../api/drive';

vi.mock('../../api/drive', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/drive')>();
  return {
    ...actual,
    driveApi: {
      ...actual.driveApi,
      getFolderItems: vi.fn(async () => ({ items: [], nextCursor: null })),
      getThumbLinks: vi.fn(async () => ({ links: {} })),
    },
  };
});

const baseProps = {
  resource: {
    id: 'canvas-1',
    title: 'Roadmap',
    updatedAt: '2026-11-09T12:00:00.000Z',
    pinned: false,
    tags: [{ name: 'work', color: '#50d1b2' }],
  },
  kind: 'canvas',
  titleFallback: 'Untitled',
  iconLabel: 'Canvas',
  selectLabel: 'Select',
  dateLabel: '9 Nov',
  mobileDateLabel: '09.11',
  selectKey: 'canvas:canvas-1',
  selectable: true,
  selected: false,
  showPin: true,
  pinTitle: 'Pin canvas',
  busy: false,
  menuId: 'canvas-1',
  menuOpen: true,
  actions: [{ key: 'delete' as const, label: 'Delete', danger: true }],
};

describe('DashboardResourceCard', () => {
  it('keeps the dashboard selection and resource metadata contract without hover checkboxes', async () => {
    const wrapper = mount(DashboardResourceCard, { props: baseProps });

    expect(wrapper.find('.card-select, [data-select-box]').exists()).toBe(false);
    expect(wrapper.get('[data-select-key]').attributes('data-select-key')).toBe('canvas:canvas-1');
    expect(wrapper.get('[data-select-key]').attributes('data-selected')).toBeUndefined();
    expect(wrapper.get('.card-title-text').text()).toBe('Roadmap');
    expect(wrapper.get('.card-tag').text()).toBe('#work');
    expect(wrapper.get('.card-date').text()).toBe('9 Nov');
    expect(wrapper.get('[data-card-menu]').attributes('data-card-menu')).toBe('canvas-1');

    await wrapper.setProps({ selected: true });
    expect(wrapper.get('[data-select-key]').attributes('data-selected')).toBe('true');

    await wrapper.get('[data-select-key]').trigger('contextmenu');
    expect(wrapper.emitted('contextmenu')).toHaveLength(1);
  });

  it('emits card interactions instead of owning dashboard business logic', async () => {
    const wrapper = mount(DashboardResourceCard, { props: baseProps });

    await wrapper.get('.card-manage').trigger('click');
    await wrapper.get('.card-pin').trigger('click');
    await wrapper.get('[data-action="delete"]').trigger('click');

    expect(wrapper.emitted('toggle-menu')).toHaveLength(1);
    expect(wrapper.emitted('toggle-pin')).toHaveLength(1);
    expect(wrapper.emitted('select-action')).toEqual([['delete']]);
  });

  it('starts single and multi-item Group DnD on DashboardResourceCard and updates/clears drag state', async () => {
    resetExplorerGroupDnd();
    const dnd = useExplorerGroupDnd();

    const wrapper = mount(DashboardResourceCard, {
      props: {
        ...baseProps,
        resource: { ...baseProps.resource, folderId: 'folder-1' },
        selectedKeys: ['canvas:canvas-1', 'text-document:doc-2'],
      },
    });

    const card = wrapper.get('[data-select-key="canvas:canvas-1"]');
    expect(card.attributes('draggable')).toBe('true');

    await card.trigger('dragstart');
    expect(dnd.activeDrag.value?.source).toBe('explorer');
    expect(dnd.activeDrag.value?.count).toBe(2);
    expect(dnd.activeDrag.value?.items).toEqual([
      {
        key: 'canvas:canvas-1',
        id: 'canvas-1',
        kind: 'canvas',
        name: 'Roadmap',
        folderId: 'folder-1',
      },
      {
        key: 'text-document:doc-2',
        id: 'doc-2',
        kind: 'text-document',
      },
    ]);
    await nextTick();
    expect(card.classes()).toContain('is-dragging-group');

    await card.trigger('drag', { clientX: 120, clientY: 240 });
    expect(dnd.dragCursor.value).toEqual({ x: 120, y: 240 });

    await card.trigger('dragend');
    expect(dnd.activeDrag.value).toBeNull();
    await nextTick();
    expect(card.classes()).not.toContain('is-dragging-group');

    // Single card drag when card is not part of multi-selection
    await wrapper.setProps({ selectedKeys: ['text-document:doc-2'] });
    await card.trigger('dragstart');
    expect(dnd.activeDrag.value?.items).toEqual([
      {
        key: 'canvas:canvas-1',
        id: 'canvas-1',
        kind: 'canvas',
        name: 'Roadmap',
        folderId: 'folder-1',
      },
    ]);
    await card.trigger('dragend');

    // Renaming disables draggable
    await wrapper.setProps({ renaming: true });
    expect(card.attributes('draggable')).toBe('false');
  });
});

describe('Explorer Grid & Folder DnD wiring', () => {
  beforeEach(() => {
    resetExplorerGroupDnd();
    vi.clearAllMocks();
  });

  it('DashboardFolderResourceGrid forwards selectedKeys and disables drag while renaming', async () => {
    const dnd = useExplorerGroupDnd();
    const items = [
      { id: 'c1', type: 'canvas', title: 'Canvas One', updatedAt: '2026-11-09T12:00:00.000Z', folderId: 'f1' },
      { id: 't1', type: 'text-document', title: 'Doc One', updatedAt: '2026-11-09T12:00:00.000Z', folderId: 'f1' },
    ];
    const wrapper = mount(DashboardFolderResourceGrid, {
      props: {
        items,
        isLoggedIn: true,
        isBusy: false,
        draggingResourceId: null,
        selectedKeys: ['canvas:c1', 'text-document:t1'],
        openMenuCanvasId: '',
        renamingId: '',
        cardMenuStyle: null,
        selectionKey: (it: any) => `${it.type}:${it.id}`,
        isSelected: (it: any) => ['canvas:c1', 'text-document:t1'].includes(`${it.type}:${it.id}`),
        isOwnedResource: () => true,
        formatDate: () => '9 Nov',
        formatCardDateMobile: () => '09.11',
        interactiveTemplateTypeLabel: () => 'Template',
        resourceActions: () => [],
      },
    });

    const canvasCard = wrapper.get('[data-select-key="canvas:c1"]');
    await canvasCard.trigger('dragstart');
    expect(dnd.activeDrag.value?.keys).toEqual(['canvas:c1', 'text-document:t1']);
    await canvasCard.trigger('dragend');

    await wrapper.setProps({ renamingId: 'c1' });
    expect(wrapper.get('[data-select-key="canvas:c1"]').attributes('draggable')).toBe('false');
    expect(wrapper.get('[data-select-key="text-document:t1"]').attributes('draggable')).toBe('true');
  });

  it('DashboardFolderFiles starts Group DnD for single and multi-selected files', async () => {
    const dnd = useExplorerGroupDnd();
    vi.mocked(driveApi.getFolderItems).mockImplementation(async (_folderId, params) => {
      if (params?.slice === 'files') {
        return {
          items: [
            { id: 'f1', kind: 'file', name: 'notes.txt', sizeBytes: 120, updatedAt: '2026-11-09T12:00:00.000Z', folderId: 'folder-1' } as any,
            { id: 'f2', kind: 'file', name: 'spec.pdf', sizeBytes: 240, updatedAt: '2026-11-09T12:00:00.000Z', folderId: 'folder-1' } as any,
          ],
          nextCursor: null,
        };
      }
      return { items: [], nextCursor: null };
    });

    const wrapper = mount(DashboardFolderFiles, {
      props: {
        folderId: 'folder-1',
        selectable: true,
        selectedKeys: ['drive-file:f1', 'drive-file:f2'],
      },
      global: { stubs: { RouterLink: true } },
    });
    await flushPromises();

    const fileCard = wrapper.get('[data-folder-file="f1"]');
    expect(fileCard.attributes('draggable')).toBe('true');

    await fileCard.trigger('dragstart');
    expect(dnd.activeDrag.value?.source).toBe('explorer');
    expect(dnd.activeDrag.value?.keys).toEqual(['drive-file:f1', 'drive-file:f2']);
    expect(dnd.activeDrag.value?.items[0]).toMatchObject({
      key: 'drive-file:f1',
      id: 'f1',
      kind: 'drive-file',
      name: 'notes.txt',
      folderId: 'folder-1',
    });
    await nextTick();
    expect(fileCard.classes()).toContain('is-dragging-group');

    await fileCard.trigger('drag', { clientX: 55, clientY: 75 });
    expect(dnd.dragCursor.value).toEqual({ x: 55, y: 75 });

    await fileCard.trigger('dragend');
    expect(dnd.activeDrag.value).toBeNull();
  });

  it('DashboardActiveSubfolders enables Group DnD on subfolder tiles only for owners', async () => {
    const dnd = useExplorerGroupDnd();
    const wrapper = mount(DashboardActiveSubfolders, {
      props: {
        subfolders: [{ id: 'sub-1', name: 'Archive', count: 3, latest: '2026-11-09T12:00:00.000Z' }],
        activeFolderEmpty: false,
        hasActiveFilter: false,
        isOwner: true,
        formatDate: () => '9 Nov',
      },
    });

    const tile = wrapper.get('.subfolder-card');
    expect(tile.attributes('draggable')).toBe('true');

    await tile.trigger('dragstart');
    expect(dnd.activeDrag.value?.items).toEqual([
      { key: 'folder:sub-1', id: 'sub-1', kind: 'folder', name: 'Archive', folderId: 'sub-1' },
    ]);
    await nextTick();
    expect(tile.classes()).toContain('is-dragging-group');

    await tile.trigger('drag', { clientX: 10, clientY: 20 });
    expect(dnd.dragCursor.value).toEqual({ x: 10, y: 20 });
    await tile.trigger('dragend');
    expect(dnd.activeDrag.value).toBeNull();

    await wrapper.setProps({ isOwner: false });
    expect(tile.attributes('draggable')).toBeUndefined();
  });

  it('emits contextmenu with (event, item) and removes .card-select across all card/grid components', async () => {
    vi.mocked(driveApi.getFolderItems).mockResolvedValueOnce({
      items: [{ id: 'f1', kind: 'file', name: 'notes.txt', sizeBytes: 120, updatedAt: '2026-11-09T12:00:00.000Z', folderId: 'folder-1' } as any],
      nextCursor: null,
    }).mockResolvedValueOnce({ items: [], nextCursor: null });

    const gridItem = { id: 'c1', type: 'canvas', title: 'Canvas One', updatedAt: '2026-11-09T12:00:00.000Z' };
    const folderGrid = mount(DashboardFolderResourceGrid, {
      props: {
        items: [gridItem],
        isLoggedIn: true,
        isBusy: false,
        draggingResourceId: null,
        selectedKeys: [],
        openMenuCanvasId: '',
        renamingId: '',
        cardMenuStyle: null,
        selectionKey: (it: any) => `${it.type}:${it.id}`,
        isSelected: () => false,
        isOwnedResource: () => true,
        formatDate: () => '9 Nov',
        formatCardDateMobile: () => '09.11',
        interactiveTemplateTypeLabel: () => 'Template',
        resourceActions: () => [],
      },
    });
    expect(folderGrid.find('.card-select, [data-select-box]').exists()).toBe(false);
    await folderGrid.get('[data-select-key="canvas:c1"]').trigger('contextmenu');
    expect(folderGrid.emitted('contextmenu')?.[0]?.[1]).toEqual(gridItem);

    const folderFiles = mount(DashboardFolderFiles, {
      props: { folderId: 'folder-1', selectable: true, selectedKeys: [] },
      global: { stubs: { RouterLink: true } },
    });
    await flushPromises();
    expect(folderFiles.find('.card-select, [data-select-box]').exists()).toBe(false);
    await folderFiles.get('[data-folder-file="f1"]').trigger('contextmenu');
    expect(folderFiles.emitted('contextmenu')?.[0]?.[1]).toMatchObject({ id: 'f1', name: 'notes.txt' });

    const sub = { id: 'sub-1', name: 'Archive', count: 3 };
    const subfolders = mount(DashboardActiveSubfolders, {
      props: {
        subfolders: [sub],
        activeFolderEmpty: false,
        hasActiveFilter: false,
        isOwner: true,
        formatDate: () => '9 Nov',
      },
    });
    await subfolders.get('.subfolder-card').trigger('contextmenu');
    expect(subfolders.emitted('contextmenu')?.[0]?.[1]).toEqual(sub);

    const recentItem = { id: 'r1', type: 'canvas', title: 'Recent Canvas', openedAt: Date.now() };
    const recents = mount(DashboardRecentResources, {
      props: {
        items: [recentItem],
        recentViewMode: 'grid',
        isLoggedIn: true,
        selectionKey: (it: any) => `${it.type}:${it.id}`,
        isSelected: () => false,
        folderPath: () => null,
        formatOpenedAt: () => 'now',
        formatMobileDate: () => '09.11',
      },
    });
    expect(recents.find('.card-select, [data-select-box]').exists()).toBe(false);
    await recents.get('[data-select-key="canvas:r1"]').trigger('contextmenu');
    expect(recents.emitted('contextmenu')?.[0]?.[1]).toEqual(recentItem);

    const feedItem = { id: 's1', type: 'text-document', title: 'Shared Doc', updatedAt: '2026-11-09T12:00:00.000Z' };
    const feedGrid = mount(DashboardFeedResourceGrid, {
      props: {
        items: [feedItem],
        scope: 'shared',
        isLoggedIn: true,
        isBusy: false,
        openMenuCanvasId: '',
        cardMenuStyle: null,
        selectionKey: (it: any) => `${it.type}:${it.id}`,
        isSelected: () => false,
        cardFolderPath: () => '',
        formatDate: () => '9 Nov',
        resourceActions: () => [],
      },
    });
    expect(feedGrid.find('.card-select, [data-select-box]').exists()).toBe(false);
    await feedGrid.get('[data-select-key="text-document:s1"]').trigger('contextmenu');
    expect(feedGrid.emitted('contextmenu')?.[0]?.[1]).toEqual(feedItem);

    const tmplItem = { id: 'tmpl-1', title: 'Board', templateType: 'trello-board', updatedAt: '2026-11-09T12:00:00.000Z' };
    const interactiveGrid = mount(DashboardInteractiveFeedGrid, {
      props: {
        items: [tmplItem],
        isLoggedIn: true,
        isBusy: false,
        openMenuCanvasId: '',
        cardMenuStyle: null,
        selectionKey: (it: any) => `interactive-template:${it.id}`,
        isSelected: () => false,
        cardFolderPath: () => '',
        formatDate: () => '9 Nov',
        interactiveTemplateTypeLabel: () => 'Board',
        resourceActions: () => [],
      },
    });
    expect(interactiveGrid.find('.card-select, [data-select-box]').exists()).toBe(false);
    await interactiveGrid.get('[data-template-resource="tmpl-1"]').trigger('contextmenu');
    expect(interactiveGrid.emitted('contextmenu')?.[0]?.[1]).toEqual(tmplItem);
  });
});
