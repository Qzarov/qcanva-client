// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { defineComponent } from 'vue';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetExplorerLayoutPrefs } from '../../composables/useExplorerLayoutPrefs';
import type { DashboardFolderNavItem } from '../../dashboard/navigation';
import DashboardSidebar from './DashboardSidebar.vue';
import { readGlobalCss } from '../../../tests/helpers/read-global-css';

const sampleFolders: DashboardFolderNavItem[] = [
  {
    id: 'f-home-sample',
    name: 'Folder',
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

let stylesheet: HTMLStyleElement;

const LayoutHarness = defineComponent({
  components: { DashboardSidebar },
  props: {
    collapsed: { type: Boolean, default: false },
    mobileOpen: { type: Boolean, default: false },
  },
  data() {
    return { sampleFolders };
  },
  template: `
    <div class="dashboard-app-shell" :class="{ 'sidebar-collapsed': collapsed }">
      <DashboardSidebar
        :active-section="{ kind: 'home' }"
        :width-state="collapsed ? 'collapsed' : 'expanded'"
        :collapsed="collapsed"
        :mobile-open="mobileOpen"
        :folders="sampleFolders"
      />
      <div class="dashboard-central-shell">
        <header class="app-header">
          <button class="btn-ghost dashboard-mobile-sidebar-open" type="button">Menu</button>
        </header>
        <main class="app-main">Content</main>
      </div>
    </div>
  `,
});

function mountLayout(collapsed = false, mobileOpen = false) {
  return mount(LayoutHarness, {
    attachTo: document.body,
    props: { collapsed, mobileOpen },
    global: {
      stubs: {
        LanguageToggle: true,
        AccountMenu: true,
        RouterLink: { props: ['to'], template: '<a :href="typeof to === \'string\' ? to : \'\'"><slot /></a>' },
      },
    },
  });
}

describe('dashboard sidebar layout contract', () => {
  beforeAll(() => {
    stylesheet = document.createElement('style');
    stylesheet.textContent = readGlobalCss();
    document.head.append(stylesheet);
  });

  afterAll(() => {
    stylesheet.remove();
  });

  beforeEach(() => {
    resetExplorerLayoutPrefs(true);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('gives the shell an auto Sidebar column without Activity Bar and keeps the central pane as its own scroll owner', () => {
    const wrapper = mountLayout();

    const shellStyle = getComputedStyle(wrapper.get('.dashboard-app-shell').element);
    expect(shellStyle.display).toBe('grid');
    expect(shellStyle.gridTemplateColumns).toBe('auto minmax(0, 1fr)');
    expect(wrapper.find('[data-activity-bar]').exists()).toBe(false);
    expect(wrapper.find('[data-sidebar-mode-switch]').exists()).toBe(true);
    expect(getComputedStyle(wrapper.get('.dashboard-sidebar-scroll').element).overflowY).toBe('auto');
    expect(getComputedStyle(wrapper.get('.dashboard-central-shell .app-main').element).overflowY).toBe('auto');
    expect(getComputedStyle(wrapper.get('[data-home-disclosure]').element).display).toBe('inline-flex');
    expect(getComputedStyle(wrapper.get('.dashboard-mobile-sidebar-open').element).display).toBe('none');
    expect(getComputedStyle(wrapper.get('.dashboard-sidebar-close').element).display).toBe('none');
  });

  it('collapses the sidebar pane to 0px while keeping the edge sash handle', () => {
    const wrapper = mountLayout(true);

    const sidebarEl = wrapper.get('.dashboard-sidebar').element as HTMLElement;
    expect(wrapper.get('[data-sidebar-frame]').classes()).toContain('is-collapsed');
    expect(wrapper.get('.dashboard-sidebar').classes()).toContain('collapsed');
    expect(sidebarEl.style.width).toBe('0px');
    expect(wrapper.get('[data-sidebar-sash]').classes()).toContain('collapsed-edge');
    expect(wrapper.find('[data-activity-bar]').exists()).toBe(false);
  });

  it('shows expanded Home children when a collapsed desktop sidebar opens as a mobile drawer', () => {
    const wrapper = mountLayout(true, true);

    expect(wrapper.get('.dashboard-sidebar').classes()).toContain('mobile-open');
    expect(getComputedStyle(wrapper.get('[data-home-link]').element).display).not.toBe('none');
    expect(getComputedStyle(wrapper.get('[data-home-link] .tree-name').element).opacity).toBe('1');
    expect(getComputedStyle(wrapper.get('[data-home-link] .tree-name').element).animationName).toBe('none');
  });

  it('keeps tree labels visible without fade-in animation and configures mobile drawer frame to zero grid space', () => {
    const wrapper = mountLayout(false, false);
    const labelStyle = getComputedStyle(wrapper.get('[data-home-link] .tree-name').element);
    expect(labelStyle.opacity).toBe('1');
    expect(labelStyle.visibility).toBe('visible');
    expect(labelStyle.animationName).toBe('none');

    const css = readGlobalCss();
    expect(css).toContain('.dashboard-app-shell .dashboard-sidebar-frame');
    expect(css).toContain('padding-bottom: calc(76px + env(safe-area-inset-bottom, 0px))');
    expect(css).toContain('.canvas-card .card-select');
  });
});
