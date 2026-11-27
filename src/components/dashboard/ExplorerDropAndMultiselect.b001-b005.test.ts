// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetExplorerGroupDnd, startGroupDrag, useExplorerGroupDnd } from '../../composables/useExplorerGroupDnd';
import { resetExplorerLayoutPrefs } from '../../composables/useExplorerLayoutPrefs';
import { useI18n } from '../../composables/useI18n';
import type { DashboardFolderNavItem } from '../../dashboard/navigation';
import DashboardActiveSubfolders from './DashboardActiveSubfolders.vue';
import DashboardSidebar from './DashboardSidebar.vue';
import ExplorerTableView, { type ExplorerTableRow } from './ExplorerTableView.vue';

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('../../api/client', () => ({
  clearToken: vi.fn(),
  getCurrentUser: vi.fn(() => ({ id: 'user-1', email: 'vlad@example.com', name: 'Vlad' })),
  isAuthenticated: vi.fn(() => true),
}));

vi.mock('../../composables/useYandexDisk', () => ({
  useYandexDisk: () => ({
    status: { value: { enabled: false, connected: false } },
    load: vi.fn().mockResolvedValue(null),
    noteError: vi.fn(),
  }),
}));

vi.mock('../../composables/useSpaces', () => ({
  useSpaces: () => ({
    spaces: { value: [] },
    loaded: { value: true },
    load: vi.fn().mockResolvedValue([]),
  }),
}));

function makeDragTransfer(overrides: Partial<{ types: string[]; files: File[]; dropEffect: string }> = {}) {
  const store: Record<string, string> = {};
  return {
    types: [] as string[],
    files: [] as File[],
    dropEffect: 'none',
    effectAllowed: 'all',
    setData(type: string, value: string) {
      store[type] = value;
      if (!this.types.includes(type)) this.types.push(type);
    },
    getData(type: string) {
      return store[type] ?? '';
    },
    ...overrides,
  };
}

describe('DashboardActiveSubfolders B-001 & B-005', () => {
  beforeEach(() => {
    resetExplorerGroupDnd();
    useI18n().setLocale('en');
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  const subfolders = [
    { id: 'f1', name: 'Alpha', count: 2, latest: '2026-11-10T10:00:00Z' },
    { id: 'f2', name: 'Beta', count: 1, latest: '2026-11-11T10:00:00Z' },
  ];

  it('exposes data-select-key/data-selected, suppresses click navigation on modifier keys, and drags all selected entries', async () => {
    const buildGroupDragEntries = vi.fn((keys: readonly string[]) =>
      keys.map((key) => ({ key, id: key.replace(/^[^:]+:/, ''), kind: key.startsWith('folder:') ? 'folder' : 'canvas' })),
    );

    const wrapper = mount(DashboardActiveSubfolders, {
      props: {
        subfolders,
        activeFolderEmpty: false,
        hasActiveFilter: false,
        isOwner: true,
        formatDate: (v: string) => v,
        selectedKeys: ['folder:f1', 'folder:f2', 'canvas:c1'],
        buildGroupDragEntries,
      },
    });

    const card1 = wrapper.get('[data-select-key="folder:f1"]');
    expect(card1.attributes('data-selected')).toBe('true');

    // Modifier clicks must not emit select (navigate)
    await card1.trigger('click', { shiftKey: true });
    await card1.trigger('click', { ctrlKey: true });
    await card1.trigger('click', { metaKey: true });
    expect(wrapper.emitted('select')).toBeUndefined();

    // Plain click selects (does NOT navigate); double-click navigates
    await card1.trigger('click');
    expect(wrapper.emitted('select')).toBeUndefined();
    await card1.trigger('dblclick');
    expect(wrapper.emitted('select')).toEqual([['f1']]);

    // Dragging selected subfolder calls startGroupDrag with all selected entries
    await card1.trigger('dragstart', { dataTransfer: makeDragTransfer() });
    expect(buildGroupDragEntries).toHaveBeenCalledWith(['folder:f1', 'folder:f2', 'canvas:c1']);
    expect(useExplorerGroupDnd().activeDrag.value?.keys).toEqual(['folder:f1', 'folder:f2', 'canvas:c1']);
  });

  it('handles OS file drop and internal group drop onto subfolder cards with stopPropagation and no flicker', async () => {
    const parentDrop = vi.fn();
    const wrapper = mount(
      {
        components: { DashboardActiveSubfolders },
        template: `
          <div @drop="onParentDrop">
            <DashboardActiveSubfolders
              :subfolders="subfolders"
              :active-folder-empty="false"
              :has-active-filter="false"
              :is-owner="true"
              :format-date="(v) => v"
              @drop-external-files="onExternal"
              @drop-on-folder="onFolderDrop"
            />
          </div>
        `,
        data: () => ({ subfolders }),
        methods: {
          onParentDrop: parentDrop,
          onExternal: vi.fn(),
          onFolderDrop: vi.fn(),
        },
      },
    );

    const card1 = wrapper.get('[data-select-key="folder:f1"]');
    const card2 = wrapper.get('[data-select-key="folder:f2"]');
    const childName = card1.get('.subfolder-card-name');

    // OS file drop onto card1
    const dtOver = makeDragTransfer({ types: ['Files'] });
    await card1.trigger('dragover', { dataTransfer: dtOver });
    expect(card1.classes()).toContain('is-drop-target');
    expect(dtOver.dropEffect).toBe('copy');

    await card1.trigger('dragleave', { relatedTarget: childName.element });
    expect(card1.classes()).toContain('is-drop-target');

    const file = new File(['abc'], 'photo.jpg', { type: 'image/jpeg' });
    await card1.trigger('drop', {
      dataTransfer: makeDragTransfer({ types: ['Files'], files: [file] }),
    });
    expect(card1.classes()).not.toContain('is-drop-target');
    expect(parentDrop).not.toHaveBeenCalled();
    expect(wrapper.findComponent(DashboardActiveSubfolders).emitted('drop-external-files')).toEqual([
      [{ folderId: 'f1', files: [file] }],
    ]);

    // Internal group drag: cannot drop onto self, can drop onto card2
    startGroupDrag({
      source: 'explorer',
      items: [{ key: 'folder:f1', id: 'f1', kind: 'folder', name: 'Alpha' }],
    });
    await card1.trigger('dragover', { dataTransfer: makeDragTransfer() });
    expect(card1.classes()).not.toContain('is-drop-target');

    const dtMove = makeDragTransfer();
    await card2.trigger('dragover', { dataTransfer: dtMove });
    expect(card2.classes()).toContain('is-drop-target');
    expect(dtMove.dropEffect).toBe('move');

    await card2.trigger('drop', { dataTransfer: makeDragTransfer() });
    expect(parentDrop).not.toHaveBeenCalled();
    const folderDrops = wrapper.findComponent(DashboardActiveSubfolders).emitted('drop-on-folder');
    expect(folderDrops).toHaveLength(1);
    expect(folderDrops?.[0]?.[0]).toBe('f2');
    expect((folderDrops?.[0]?.[1] as { keys: string[] }).keys).toEqual(['folder:f1']);
  });

  it('does not stopPropagation on empty-files OS drop and ignores external file drags when isOwner is false', async () => {
    const parentDrop = vi.fn();
    const wrapper = mount({
      components: { DashboardActiveSubfolders },
      template: `
        <div @drop="onParentDrop">
          <DashboardActiveSubfolders
            :subfolders="subfolders"
            :active-folder-empty="false"
            :has-active-filter="false"
            :is-owner="isOwner"
            :format-date="(v) => v"
            @drop-external-files="onExternal"
          />
        </div>
      `,
      data: () => ({ subfolders, isOwner: true }),
      methods: {
        onParentDrop: parentDrop,
        onExternal: vi.fn(),
      },
    });

    const card1 = wrapper.get('[data-select-key="folder:f1"]');

    // Empty files list must bubble to parent shell dropzone so overlay isn't trapped
    await card1.trigger('drop', {
      dataTransfer: makeDragTransfer({ types: ['Files'], files: [] }),
    });
    expect(parentDrop).toHaveBeenCalledTimes(1);
    expect(wrapper.findComponent(DashboardActiveSubfolders).emitted('drop-external-files')).toBeUndefined();

    // Non-owner shared folder must neither highlight nor swallow external file drops
    await wrapper.setData({ isOwner: false });
    const dtOver = makeDragTransfer({ types: ['Files'] });
    await card1.trigger('dragover', { dataTransfer: dtOver });
    expect(card1.classes()).not.toContain('is-drop-target');

    const file = new File(['abc'], 'photo.jpg', { type: 'image/jpeg' });
    await card1.trigger('drop', {
      dataTransfer: makeDragTransfer({ types: ['Files'], files: [file] }),
    });
    expect(parentDrop).toHaveBeenCalledTimes(2);
    expect(wrapper.findComponent(DashboardActiveSubfolders).emitted('drop-external-files')).toBeUndefined();
  });
});

describe('ExplorerTableView B-001 & B-005', () => {
  beforeEach(() => {
    resetExplorerGroupDnd();
    useI18n().setLocale('en');
  });

  const rows: ExplorerTableRow[] = [
    { key: 'folder:f1', id: 'f1', kind: 'folder', name: 'Alpha', isFolder: true, raw: {} },
    { key: 'folder:f2', id: 'f2', kind: 'folder', name: 'Beta', isFolder: true, raw: {} },
    { key: 'canvas:c1', id: 'c1', kind: 'canvas', name: 'Board', isFolder: false, raw: {} },
  ];

  it('supports Shift+Click from initial row without prior anchor and multi-folder + item drag', async () => {
    const wrapper = mount(ExplorerTableView, { props: { rows } });

    // Shift+Click directly on second folder without prior click defaults anchor to index 0
    await wrapper.get('[data-row-key="folder:f2"]').trigger('click', { shiftKey: true });
    expect(wrapper.emitted('update:selectedKeys')?.slice(-1)[0]).toEqual([['folder:f1', 'folder:f2']]);

    // Ctrl+Click adds canvas:c1
    await wrapper.get('[data-row-key="canvas:c1"]').trigger('click', { ctrlKey: true });
    expect(wrapper.emitted('update:selectedKeys')?.slice(-1)[0]).toEqual([['folder:f1', 'folder:f2', 'canvas:c1']]);

    // Dragging an already-selected folder drags all 3 items
    await wrapper.get('[data-row-key="folder:f1"]').trigger('dragstart', { dataTransfer: makeDragTransfer() });
    expect(useExplorerGroupDnd().activeDrag.value?.keys).toEqual(['folder:f1', 'folder:f2', 'canvas:c1']);
  });

  it('accepts OS file drops only on folder rows with stopPropagation', async () => {
    const parentDrop = vi.fn();
    const wrapper = mount({
      components: { ExplorerTableView },
      template: `
        <div @drop="onParentDrop">
          <ExplorerTableView :rows="rows" />
        </div>
      `,
      data: () => ({ rows }),
      methods: { onParentDrop: parentDrop },
    });

    const folderRow = wrapper.get('[data-row-key="folder:f1"]');
    const fileRow = wrapper.get('[data-row-key="canvas:c1"]');

    // Non-folder row does not accept OS file drop
    const fileRowOverEvent = new Event('dragover', { bubbles: true, cancelable: true });
    Object.defineProperty(fileRowOverEvent, 'dataTransfer', { value: makeDragTransfer({ types: ['Files'] }) });
    fileRow.element.dispatchEvent(fileRowOverEvent);
    expect(fileRowOverEvent.defaultPrevented).toBe(false);

    // Folder row accepts OS file drop
    const dtOver = makeDragTransfer({ types: ['Files'] });
    await folderRow.trigger('dragover', { dataTransfer: dtOver });
    expect(folderRow.classes()).toContain('drag-over');
    expect(dtOver.dropEffect).toBe('copy');

    const dropped = new File(['hello'], 'doc.txt', { type: 'text/plain' });
    await folderRow.trigger('drop', {
      dataTransfer: makeDragTransfer({ types: ['Files'], files: [dropped] }),
    });
    expect(parentDrop).not.toHaveBeenCalled();
    expect(wrapper.findComponent(ExplorerTableView).emitted('drop-external-files')).toEqual([
      [{ folderId: 'f1', files: [dropped] }],
    ]);

    // Empty files list must bubble to parent shell dropzone
    await folderRow.trigger('drop', {
      dataTransfer: makeDragTransfer({ types: ['Files'], files: [] }),
    });
    expect(parentDrop).toHaveBeenCalledTimes(1);
    expect(wrapper.findComponent(ExplorerTableView).emitted('drop-external-files')).toHaveLength(1);
  });
});

describe('DashboardSidebar B-001 & B-005', () => {
  const treeFolders: DashboardFolderNavItem[] = [
    {
      id: 'f-alpha',
      name: 'Alpha',
      parentId: null,
      depth: 0,
      role: 'owner',
      technical: false,
      expanded: true,
      hasChildren: true,
      draggable: true,
      dropActive: false,
      reorderTarget: false,
    },
    {
      id: 'f-alpha-child',
      name: 'Child',
      parentId: 'f-alpha',
      depth: 1,
      role: 'owner',
      technical: false,
      expanded: false,
      hasChildren: false,
      draggable: true,
      dropActive: false,
      reorderTarget: false,
    },
    {
      id: 'f-beta',
      name: 'Beta',
      parentId: null,
      depth: 0,
      role: 'owner',
      technical: false,
      expanded: false,
      hasChildren: false,
      draggable: true,
      dropActive: false,
      reorderTarget: false,
    },
    {
      id: 'f-target',
      name: 'Target',
      parentId: null,
      depth: 0,
      role: 'owner',
      technical: false,
      expanded: false,
      hasChildren: false,
      draggable: true,
      dropActive: false,
      reorderTarget: false,
    },
  ];

  function mountTree(activeSection: { kind: 'home' } | { kind: 'folder'; folderId: string } = { kind: 'home' }) {
    return mount(DashboardSidebar, {
      props: {
        activeSection,
        mobileOpen: false,
        folders: treeFolders,
        spaces: false,
      },
      global: {
        stubs: {
          AccountMenu: true,
          RouterLink: { props: ['to'], template: '<a><slot /></a>' },
        },
      },
    });
  }

  beforeEach(() => {
    resetExplorerLayoutPrefs(true);
    resetExplorerGroupDnd();
    useI18n().setLocale('en');
  });

  it('supports Shift+Click range select without prior anchor and multi-folder drag without legacy folder-drag-start hijack', async () => {
    const wrapper = mountTree({ kind: 'folder', folderId: 'f-alpha' });

    // Shift+Click on f-beta immediately anchors from active folder f-alpha
    await wrapper.get('[data-dashboard-folder="f-beta"]').trigger('click', { shiftKey: true });
    expect(wrapper.get('[data-dashboard-folder="f-alpha"]').classes()).toContain('tree-selected');
    expect(wrapper.get('[data-dashboard-folder="f-alpha-child"]').classes()).toContain('tree-selected');
    expect(wrapper.get('[data-dashboard-folder="f-beta"]').classes()).toContain('tree-selected');

    // Dragging one selected row starts group drag with all selected folders and does NOT emit legacy folder-drag-start
    await wrapper.get('[data-dashboard-folder="f-alpha"]').trigger('dragstart', { dataTransfer: makeDragTransfer() });
    expect(wrapper.emitted('folder-drag-start')).toBeUndefined();
    expect(useExplorerGroupDnd().activeDrag.value?.keys).toEqual([
      'folder:f-alpha',
      'folder:f-alpha-child',
      'folder:f-beta',
    ]);

    // Cycle guard: cannot drop onto self or descendant f-alpha-child
    await wrapper.get('[data-dashboard-folder="f-alpha-child"]').trigger('drop', { dataTransfer: makeDragTransfer() });
    expect(wrapper.emitted('drop-group-to-folder')).toBeUndefined();

    // Restart drag and drop onto valid sibling f-target
    await wrapper.get('[data-dashboard-folder="f-alpha"]').trigger('dragstart', { dataTransfer: makeDragTransfer() });
    await wrapper.get('[data-dashboard-folder="f-target"]').trigger('drop', { dataTransfer: makeDragTransfer() });
    expect(wrapper.emitted('folder-drop')).toBeUndefined();
    const dropPayload = wrapper.emitted('drop-group-to-folder')?.[0]?.[0] as {
      folderId: string | null;
      drag: { keys: string[] };
    };
    expect(dropPayload.folderId).toBe('f-target');
    expect(dropPayload.drag.keys).toEqual(['folder:f-alpha', 'folder:f-alpha-child', 'folder:f-beta']);

    // Multi-selection is cleared after successful tree drop so a subsequent drag doesn't re-drag old items
    expect(wrapper.get('[data-dashboard-folder="f-alpha"]').classes()).not.toContain('tree-selected');
    expect(wrapper.get('[data-dashboard-folder="f-alpha-child"]').classes()).not.toContain('tree-selected');
    expect(wrapper.get('[data-dashboard-folder="f-beta"]').classes()).not.toContain('tree-selected');

    await wrapper.get('[data-dashboard-folder="f-alpha"]').trigger('dragstart', { dataTransfer: makeDragTransfer() });
    expect(useExplorerGroupDnd().activeDrag.value?.keys).toEqual(['folder:f-alpha']);
    expect(wrapper.emitted('folder-drag-start')?.[0]?.[1]).toBe('f-alpha');
  });

  it('supports dropping multi-folder selection onto Q Space/home (folderId: null)', async () => {
    const wrapper = mountTree();

    await wrapper.get('[data-dashboard-folder="f-alpha-child"]').trigger('click');
    await wrapper.get('[data-dashboard-folder="f-beta"]').trigger('click', { ctrlKey: true });
    await wrapper.get('[data-dashboard-folder="f-beta"]').trigger('dragstart', { dataTransfer: makeDragTransfer() });

    await wrapper.get('[data-home-link]').trigger('dragover', { dataTransfer: makeDragTransfer() });
    expect(wrapper.get('[data-home-link]').classes()).toContain('drag-over');

    await wrapper.get('[data-home-link]').trigger('drop', { dataTransfer: makeDragTransfer() });
    const dropPayload = wrapper.emitted('drop-group-to-folder')?.[0]?.[0] as {
      folderId: string | null;
      drag: { keys: string[] };
    };
    expect(dropPayload.folderId).toBeNull();
    expect(dropPayload.drag.keys).toEqual(['folder:f-alpha-child', 'folder:f-beta']);
    expect(wrapper.get('[data-dashboard-folder="f-alpha-child"]').classes()).not.toContain('tree-selected');
    expect(wrapper.get('[data-dashboard-folder="f-beta"]').classes()).not.toContain('tree-selected');
  });

  it('accepts external OS file drops on folder rows and qspace:home without swallowing non-target rows', async () => {
    const wrapper = mountTree();

    // Shared section row must NOT preventDefault on OS file dragover/drop
    const sharedOver = new Event('dragover', { bubbles: true, cancelable: true });
    Object.defineProperty(sharedOver, 'dataTransfer', { value: makeDragTransfer({ types: ['Files'] }) });
    wrapper.get('[data-dashboard-section="shared"]').element.dispatchEvent(sharedOver);
    expect(sharedOver.defaultPrevented).toBe(false);

    // Folder row accepts OS files
    const f1 = wrapper.get('[data-dashboard-folder="f-beta"]');
    const dtFolder = makeDragTransfer({ types: ['Files'] });
    await f1.trigger('dragover', { dataTransfer: dtFolder });
    expect(f1.classes()).toContain('drag-over');
    expect(dtFolder.dropEffect).toBe('copy');

    const file1 = new File(['a'], 'a.txt', { type: 'text/plain' });
    await f1.trigger('drop', { dataTransfer: makeDragTransfer({ types: ['Files'], files: [file1] }) });
    expect(f1.classes()).not.toContain('drag-over');

    // qspace:home accepts OS files with folderId: null
    const home = wrapper.get('[data-home-link]');
    const dtHome = makeDragTransfer({ types: ['Files'] });
    await home.trigger('dragover', { dataTransfer: dtHome });
    expect(home.classes()).toContain('drag-over');
    expect(dtHome.dropEffect).toBe('copy');

    const file2 = new File(['b'], 'b.txt', { type: 'text/plain' });
    await home.trigger('drop', { dataTransfer: makeDragTransfer({ types: ['Files'], files: [file2] }) });
    expect(home.classes()).not.toContain('drag-over');

    expect(wrapper.emitted('drop-external-files')).toEqual([
      [{ folderId: 'f-beta', files: [file1] }],
      [{ folderId: null, files: [file2] }],
    ]);
  });
});
