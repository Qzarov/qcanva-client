// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { defineComponent } from 'vue';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import DashboardSidebar from './DashboardSidebar.vue';

let stylesheet: HTMLStyleElement;

const LayoutHarness = defineComponent({
  components: { DashboardSidebar },
  props: {
    collapsed: { type: Boolean, default: false },
  },
  template: `
    <div class="dashboard-app-shell" :class="{ 'sidebar-collapsed': collapsed }">
      <DashboardSidebar
        :active-section="{ kind: 'home' }"
        :width-state="collapsed ? 'collapsed' : 'expanded'"
        :mobile-open="false"
        :folders="[]"
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

function mountLayout(collapsed = false) {
  return mount(LayoutHarness, {
    attachTo: document.body,
    props: { collapsed },
    global: {
      stubs: {
        LanguageToggle: true,
        AccountMenu: true,
      },
    },
  });
}

describe('dashboard sidebar layout contract', () => {
  beforeAll(() => {
    stylesheet = document.createElement('style');
    stylesheet.textContent = readFileSync(resolve(process.cwd(), 'src/style.css'), 'utf8');
    document.head.append(stylesheet);
  });

  afterAll(() => {
    stylesheet.remove();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('gives the expanded rail a fixed column and the central pane its own scroll owner', () => {
    const wrapper = mountLayout();

    const shellStyle = getComputedStyle(wrapper.get('.dashboard-app-shell').element);
    expect(shellStyle.display).toBe('grid');
    expect(shellStyle.getPropertyValue('--dashboard-sidebar-width')).toBe('248px');
    expect(shellStyle.gridTemplateColumns).toContain('var(--dashboard-sidebar-width)');
    expect(getComputedStyle(wrapper.get('.dashboard-sidebar-scroll').element).overflowY).toBe('auto');
    expect(getComputedStyle(wrapper.get('.dashboard-central-shell .app-main').element).overflowY).toBe('auto');
    expect(getComputedStyle(wrapper.get('[data-dashboard-section="home"]').element).display).toBe('grid');
    expect(getComputedStyle(wrapper.get('.dashboard-mobile-sidebar-open').element).display).toBe('none');
    expect(getComputedStyle(wrapper.get('.dashboard-sidebar-close').element).display).toBe('none');
  });

  it('uses the explicit shell class to render a stable 72px icon rail', () => {
    const wrapper = mountLayout(true);

    expect(wrapper.get('.dashboard-app-shell').classes()).toContain('sidebar-collapsed');
    expect(getComputedStyle(wrapper.get('.dashboard-app-shell').element).getPropertyValue('--dashboard-sidebar-width')).toBe('72px');
  });
});
