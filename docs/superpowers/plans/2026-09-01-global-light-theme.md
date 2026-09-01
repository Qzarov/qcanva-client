# Global Light Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add persisted System/Light/Dark theme selection to every QCanva surface without recoloring user-authored content.

**Architecture:** Pure helpers own storage parsing and effective-theme resolution, an early module applies the root attribute before the Vue application starts, and a singleton composable keeps runtime state synchronized with `matchMedia`. Shared controls expose the preference, while semantic CSS tokens replace colors that describe application chrome.

**Tech Stack:** Vue 3 Composition API, TypeScript 5.9, CSS custom properties, Vitest 4, Vue Test Utils, Vite 7.

**Spec:** `docs/superpowers/specs/2026-09-01-light-theme-dashboard-sidebar-design.md`

## Global Constraints

- Preferences are browser-local only; do not add API or database fields.
- Accepted preference values are exactly `system`, `light`, and `dark`.
- Store the preference under `qcanva:theme:v1`.
- Apply `data-theme="light|dark"` and matching `color-scheme` to `<html>` before the main application mounts.
- The first visit defaults to `system` and reacts live to operating-system changes.
- Preserve authored canvas, node, image, board-label, HTML-body, and text-document colors.
- The light palette is “A — Soft neutral” from the spec.
- Do not add a UI framework, icon package, state-management package, or backend dependency.
- All three choices must be keyboard reachable and visibly focused.

---

### Task 1: Pure theme model and pre-mount bootstrap

**Files:**
- Create: `src/theme/theme.ts`
- Create: `src/theme/bootstrap.ts`
- Create: `src/theme/theme.test.ts`
- Modify: `index.html`

**Interfaces:**
- Produces: `ThemePreference`, `EffectiveTheme`, `THEME_STORAGE_KEY`, `parseThemePreference`, `readThemePreference`, `resolveEffectiveTheme`, `applyEffectiveTheme`, and `bootstrapTheme`.
- Consumes: only DOM `Storage`, `MediaQueryList`, and `HTMLElement`-compatible interfaces so helpers stay unit-testable.

- [ ] **Step 1: Write failing tests for parsing, resolution, storage failure, and root application**

```ts
// src/theme/theme.test.ts
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  THEME_STORAGE_KEY,
  applyEffectiveTheme,
  bootstrapTheme,
  parseThemePreference,
  readThemePreference,
  resolveEffectiveTheme,
} from './theme';

describe('theme model', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.style.colorScheme = '';
  });

  it.each(['system', 'light', 'dark'] as const)('accepts %s', (value) => {
    expect(parseThemePreference(value)).toBe(value);
  });

  it('falls back to system for missing and invalid values', () => {
    expect(parseThemePreference(null)).toBe('system');
    expect(parseThemePreference('sepia')).toBe('system');
  });

  it('survives unavailable storage', () => {
    const storage = { getItem: vi.fn(() => { throw new Error('denied'); }) };
    expect(readThemePreference(storage)).toBe('system');
  });

  it('resolves system through prefers-color-scheme', () => {
    expect(resolveEffectiveTheme('system', true)).toBe('dark');
    expect(resolveEffectiveTheme('system', false)).toBe('light');
    expect(resolveEffectiveTheme('light', true)).toBe('light');
  });

  it('applies both root signals', () => {
    applyEffectiveTheme(document.documentElement, 'light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.style.colorScheme).toBe('light');
  });

  it('bootstraps from storage before Vue starts', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    const media = { matches: false } as MediaQueryList;
    expect(bootstrapTheme(document.documentElement, localStorage, media)).toEqual({ preference: 'dark', effectiveTheme: 'dark' });
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
```

- [ ] **Step 2: Run the focused test and verify the missing module failure**

Run: `npm run test:unit -- src/theme/theme.test.ts`

Expected: FAIL because `src/theme/theme.ts` does not exist.

- [ ] **Step 3: Implement the pure model and bootstrap entrypoint**

```ts
// src/theme/theme.ts
export type ThemePreference = 'system' | 'light' | 'dark';
export type EffectiveTheme = Exclude<ThemePreference, 'system'>;
export const THEME_STORAGE_KEY = 'qcanva:theme:v1';

type ReadableStorage = Pick<Storage, 'getItem'>;

export function parseThemePreference(value: string | null): ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
}

export function readThemePreference(storage: ReadableStorage | null | undefined): ThemePreference {
  try {
    return parseThemePreference(storage?.getItem(THEME_STORAGE_KEY) ?? null);
  } catch {
    return 'system';
  }
}

export function resolveEffectiveTheme(preference: ThemePreference, prefersDark: boolean): EffectiveTheme {
  return preference === 'system' ? (prefersDark ? 'dark' : 'light') : preference;
}

export function applyEffectiveTheme(root: HTMLElement, theme: EffectiveTheme): void {
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}

export function bootstrapTheme(root: HTMLElement, storage: ReadableStorage | null | undefined, media: Pick<MediaQueryList, 'matches'>) {
  const preference = readThemePreference(storage);
  const effectiveTheme = resolveEffectiveTheme(preference, media.matches);
  applyEffectiveTheme(root, effectiveTheme);
  return { preference, effectiveTheme };
}
```

```ts
// src/theme/bootstrap.ts
import { bootstrapTheme } from './theme';

bootstrapTheme(
  document.documentElement,
  typeof localStorage === 'undefined' ? null : localStorage,
  window.matchMedia('(prefers-color-scheme: dark)'),
);
```

Insert before `/src/main.ts` in `index.html`:

```html
<script type="module" src="/src/theme/bootstrap.ts"></script>
<script type="module" src="/src/main.ts"></script>
```

- [ ] **Step 4: Run the focused test**

Run: `npm run test:unit -- src/theme/theme.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the theme model**

```bash
git add index.html src/theme/theme.ts src/theme/bootstrap.ts src/theme/theme.test.ts
git commit -m "feat(theme): bootstrap persisted color scheme"
```

---

### Task 2: Reactive theme composable and selector

**Files:**
- Create: `src/composables/useTheme.ts`
- Create: `src/composables/useTheme.test.ts`
- Create: `src/components/ThemeSelector.vue`
- Create: `src/components/ThemeSelector.test.ts`
- Modify: `src/composables/useI18n.ts`

**Interfaces:**
- Consumes: Task 1 exports from `src/theme/theme.ts`.
- Produces: `useTheme(): { preference: Readonly<Ref<ThemePreference>>; effectiveTheme: ComputedRef<EffectiveTheme>; setPreference(value: ThemePreference): void }`.
- Produces: `<ThemeSelector compact?: boolean />` rendering a labelled radio group.

- [ ] **Step 1: Write failing composable tests**

```ts
// src/composables/useTheme.test.ts
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { THEME_STORAGE_KEY } from '../theme/theme';

const listeners = new Set<(event: MediaQueryListEvent) => void>();
const media = {
  matches: false,
  addEventListener: vi.fn((_name, listener) => listeners.add(listener)),
  removeEventListener: vi.fn((_name, listener) => listeners.delete(listener)),
};

vi.stubGlobal('matchMedia', vi.fn(() => media));

describe('useTheme', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    media.matches = false;
    listeners.clear();
  });

  it('persists an explicit choice and updates the root', async () => {
    const { useTheme } = await import('./useTheme');
    useTheme().setPreference('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('reacts to OS changes only in system mode', async () => {
    const { useTheme } = await import('./useTheme');
    const theme = useTheme();
    media.matches = true;
    listeners.forEach((listener) => listener({ matches: true } as MediaQueryListEvent));
    expect(theme.effectiveTheme.value).toBe('dark');
    theme.setPreference('light');
    media.matches = true;
    listeners.forEach((listener) => listener({ matches: true } as MediaQueryListEvent));
    expect(theme.effectiveTheme.value).toBe('light');
  });

  it('keeps working when storage writes throw', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    const { useTheme } = await import('./useTheme');
    expect(() => useTheme().setPreference('dark')).not.toThrow();
    expect(document.documentElement.dataset.theme).toBe('dark');
    setItem.mockRestore();
  });
});
```

- [ ] **Step 2: Write the failing selector test**

```ts
// src/components/ThemeSelector.test.ts
// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it } from 'vitest';
import ThemeSelector from './ThemeSelector.vue';

describe('ThemeSelector', () => {
  beforeEach(() => localStorage.clear());

  it('renders three choices and selects Light', async () => {
    const wrapper = mount(ThemeSelector);
    expect(wrapper.findAll('[role="radio"]')).toHaveLength(3);
    await wrapper.get('[data-theme-choice="light"]').trigger('click');
    expect(wrapper.get('[data-theme-choice="light"]').attributes('aria-checked')).toBe('true');
    expect(document.documentElement.dataset.theme).toBe('light');
  });
});
```

- [ ] **Step 3: Run both focused tests and verify failure**

Run: `npm run test:unit -- src/composables/useTheme.test.ts src/components/ThemeSelector.test.ts`

Expected: FAIL because the composable and component do not exist.

- [ ] **Step 4: Implement the singleton composable**

Implement `src/composables/useTheme.ts` with module-level refs, one `matchMedia` listener, guarded `localStorage.setItem`, and these exact public names:

```ts
export function useTheme() {
  return {
    preference: readonly(preference),
    effectiveTheme: computed(() => resolveEffectiveTheme(preference.value, prefersDark.value)),
    setPreference,
  };
}
```

`setPreference` must update the in-memory ref, apply the effective theme immediately, and then attempt persistence. The media listener must always update `prefersDark`; the computed value ensures explicit preferences remain unchanged.

- [ ] **Step 5: Implement the selector and localized labels**

Add these keys to both locale maps in `src/composables/useI18n.ts`: `theme`, `themeSystem`, `themeLight`, and `themeDark`.

Render the component as:

```vue
<div class="theme-selector" role="radiogroup" :aria-label="t('theme')">
  <button
    v-for="option in options"
    :key="option.value"
    type="button"
    role="radio"
    class="theme-selector-option"
    :class="{ active: preference === option.value }"
    :aria-checked="preference === option.value"
    :data-theme-choice="option.value"
    @click="setPreference(option.value)"
  >
    <span aria-hidden="true">{{ option.icon }}</span>
    <span v-if="!compact">{{ option.label }}</span>
  </button>
</div>
```

Use `◐`, `☀`, and `☾` only as decorative fallback icons; the localized text remains the accessible label.

- [ ] **Step 6: Run the focused tests**

Run: `npm run test:unit -- src/composables/useTheme.test.ts src/components/ThemeSelector.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit the reactive controls**

```bash
git add src/composables/useTheme.ts src/composables/useTheme.test.ts src/components/ThemeSelector.vue src/components/ThemeSelector.test.ts src/composables/useI18n.ts
git commit -m "feat(theme): add reactive theme selector"
```

---

### Task 3: Public theme control and authenticated account menu

**Files:**
- Create: `src/components/ThemeMenu.vue`
- Create: `src/components/ThemeMenu.test.ts`
- Create: `src/components/AccountMenu.vue`
- Create: `src/components/AccountMenu.test.ts`
- Modify: `src/views/LandingView.vue`
- Modify: `src/views/LoginView.vue`
- Modify: `src/views/RegisterView.vue`
- Modify: `src/views/DashboardView.vue`
- Modify: `src/views/CanvasView.vue`
- Modify: `src/views/HtmlDocumentView.vue`
- Modify: `src/views/TextDocumentView.vue`
- Modify: `src/views/BoardTemplateView.vue`
- Modify: `src/views/InteractiveTemplateView.vue`

**Interfaces:**
- Consumes: `<ThemeSelector />`, `getCurrentUser`, `clearToken`, `useI18n`, and Vue Router.
- Produces: `<ThemeMenu />` for unauthenticated screens and `<AccountMenu compact?: boolean placement?: 'header'|'sidebar' />` for authenticated screens.

- [ ] **Step 1: Write failing menu tests**

```ts
// src/components/ThemeMenu.test.ts
// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ThemeMenu from './ThemeMenu.vue';

describe('ThemeMenu', () => {
  it('opens from a labelled button and closes on Escape', async () => {
    const wrapper = mount(ThemeMenu);
    await wrapper.get('[data-theme-menu-trigger]').trigger('click');
    expect(wrapper.find('[data-theme-menu]').exists()).toBe(true);
    await wrapper.trigger('keydown', { key: 'Escape' });
    expect(wrapper.find('[data-theme-menu]').exists()).toBe(false);
  });
});
```

```ts
// src/components/AccountMenu.test.ts
// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import AccountMenu from './AccountMenu.vue';

const push = vi.fn();
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }));
vi.mock('../api/client', () => ({
  clearToken: vi.fn(),
  getCurrentUser: vi.fn(() => ({ id: 'u1', name: 'Ada', email: 'ada@example.com' })),
}));

describe('AccountMenu', () => {
  it('opens theme choices from the user icon', async () => {
    const wrapper = mount(AccountMenu, { global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } } });
    await wrapper.get('[data-account-menu-trigger]').trigger('click');
    expect(wrapper.findAll('[role="radio"]')).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run the menu tests and verify failure**

Run: `npm run test:unit -- src/components/ThemeMenu.test.ts src/components/AccountMenu.test.ts`

Expected: FAIL because both components are missing.

- [ ] **Step 3: Implement both menu components**

`ThemeMenu.vue` owns only its open state, click-outside/backdrop close, and Escape close. Its trigger has `aria-haspopup="menu"`, `aria-expanded`, `aria-label`, and `data-theme-menu-trigger`.

`AccountMenu.vue` uses the current user's name/email for its avatar label, renders `<ThemeSelector />`, Plugins, Settings, and Sign out. On sign out it must call `clearToken()` and `router.push({ name: 'landing' })`. The root supports `placement` classes without duplicating behavior.

- [ ] **Step 4: Replace page-level theme and avatar controls**

Use `<ThemeMenu class="public-theme-control" />` in the upper-right of Landing, Login, and Register.

Replace existing dashboard, canvas, HTML-document, and text-document avatar links with `<AccountMenu />`. Add `<AccountMenu />` to the board and D&D template headers, which currently have no account menu. Do not remove existing back, access, history, sync, or save controls.

- [ ] **Step 5: Run component and affected view tests**

Run:

```bash
npm run test:unit -- \
  src/components/ThemeMenu.test.ts \
  src/components/AccountMenu.test.ts \
  src/views/LandingView.test.ts \
  src/views/DashboardView.test.ts \
  src/views/BoardTemplateView.test.ts \
  src/views/TextDocumentView.test.ts
```

Expected: PASS. Update existing stubs only where the new child component is intentionally isolated; do not weaken assertions about existing page actions.

- [ ] **Step 6: Commit menu integration**

```bash
git add src/components/ThemeMenu.vue src/components/ThemeMenu.test.ts src/components/AccountMenu.vue src/components/AccountMenu.test.ts src/views/LandingView.vue src/views/LoginView.vue src/views/RegisterView.vue src/views/DashboardView.vue src/views/CanvasView.vue src/views/HtmlDocumentView.vue src/views/TextDocumentView.vue src/views/BoardTemplateView.vue src/views/InteractiveTemplateView.vue
git commit -m "feat(theme): expose theme choice across QCanva"
```

---

### Task 4: Semantic token foundation and shared application chrome

**Files:**
- Modify: `src/style.css`
- Modify: `src/App.vue`
- Modify: `src/components/ToastContainer.vue`
- Modify: `src/components/ChatPanel.vue`
- Modify: `src/components/MarkdownRenderer.vue`
- Modify: `src/components/ThemeSelector.vue`
- Modify: `src/components/ThemeMenu.vue`
- Modify: `src/components/AccountMenu.vue`

**Interfaces:**
- Consumes: `data-theme` from Task 1.
- Produces: semantic CSS custom properties used by all later visual migration tasks.

- [ ] **Step 1: Add dark semantic tokens and light overrides**

At the top of `src/style.css`, define these roles under `:root, :root[data-theme='dark']` and override them under `:root[data-theme='light']`:

```css
:root,
:root[data-theme='dark'] {
  --ui-page: #1f2128;
  --ui-surface: rgba(0, 42, 0, 0.5);
  --ui-surface-solid: #171a19;
  --ui-surface-elevated: rgba(0, 32, 0, 0.94);
  --ui-surface-subtle: rgba(255, 255, 255, 0.05);
  --ui-canvas: #17181f;
  --ui-text: #f8fff8;
  --ui-text-secondary: #d6f2d6;
  --ui-text-muted: #a8c6a8;
  --ui-border: #313442;
  --ui-overlay: rgba(0, 0, 0, 0.64);
  --ui-shadow: 0 18px 50px rgba(0, 0, 0, 0.34);
  --ui-brand: #00ff00;
  --ui-brand-on: #071307;
  --ui-brand-soft: rgba(0, 255, 0, 0.12);
  --ui-danger: #fb464c;
  --ui-focus: #8cff8c;
}

:root[data-theme='light'] {
  --ui-page: #f5f7f4;
  --ui-surface: #ffffff;
  --ui-surface-solid: #ffffff;
  --ui-surface-elevated: #ffffff;
  --ui-surface-subtle: #f4f6f3;
  --ui-canvas: #eef2ee;
  --ui-text: #172019;
  --ui-text-secondary: #667269;
  --ui-text-muted: #98a39a;
  --ui-border: #dce3dd;
  --ui-overlay: rgba(23, 32, 25, 0.34);
  --ui-shadow: 0 18px 50px rgba(26, 48, 31, 0.12);
  --ui-brand: #20cf45;
  --ui-brand-on: #06220c;
  --ui-brand-soft: #ddf7e2;
  --ui-danger: #c9343d;
  --ui-focus: #145b25;
}
```

Keep `--dark-*` names as aliases pointing to semantic values while old selectors are migrated:

```css
--dark-neutral-bg: var(--ui-page);
--dark-neutral-border: var(--ui-border);
--dark-card-bg: var(--ui-surface);
--dark-menu-bg: var(--ui-surface-elevated);
--dark-input-bg: var(--ui-surface-subtle);
--dark-text-primary: var(--ui-text);
--dark-text-secondary: var(--ui-text-secondary);
--dark-text-muted: var(--ui-text-muted);
```

- [ ] **Step 2: Migrate shared chrome selectors**

Replace application-chrome hardcodes in base elements, buttons, inputs, modal/backdrop, popovers, cards, access gates, headers, auth pages, loaders, toasts, chat, Markdown chrome, and focus states with semantic tokens. Ensure every interactive component has:

```css
:where(button, a, input, select, textarea):focus-visible {
  outline: 2px solid var(--ui-focus);
  outline-offset: 2px;
}
```

Do not replace fixed resource-type accents, status colors, syntax colors, or authored document colors.

- [ ] **Step 3: Add styles for new theme/account controls**

Use stable positioning, no layout shift between selected states, and `prefers-reduced-motion`:

```css
.theme-selector { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px; }
.theme-selector-option { min-height: 36px; border: 1px solid transparent; color: var(--ui-text-secondary); background: transparent; }
.theme-selector-option.active { border-color: var(--ui-border); color: var(--ui-text); background: var(--ui-brand-soft); }
.account-menu-popover,
.theme-menu-popover { color: var(--ui-text); background: var(--ui-surface-elevated); border: 1px solid var(--ui-border); box-shadow: var(--ui-shadow); }
@media (prefers-reduced-motion: reduce) {
  .theme-menu-popover,
  .account-menu-popover { transition: none; }
}
```

- [ ] **Step 4: Run the shared component suite and build**

Run:

```bash
npm run test:unit -- src/components/ThemeSelector.test.ts src/components/ThemeMenu.test.ts src/components/AccountMenu.test.ts src/components/ChatPanel.test.ts
npm run build
```

Expected: both commands PASS.

- [ ] **Step 5: Commit semantic tokens**

```bash
git add src/style.css src/App.vue src/components/ToastContainer.vue src/components/ChatPanel.vue src/components/MarkdownRenderer.vue src/components/ThemeSelector.vue src/components/ThemeMenu.vue src/components/AccountMenu.vue
git commit -m "style(theme): add semantic light and dark tokens"
```

---

### Task 5: Migrate workspaces without changing authored content

**Files:**
- Modify: `src/style.css`
- Modify: `src/components/CanvasLoader.vue`
- Modify: `src/components/html/HtmlVisualEditor.vue`
- Modify: `src/components/html/InlineRichText.vue`
- Modify: `src/views/CanvasView.vue`
- Modify: `src/views/HtmlDocumentView.vue`
- Modify: `src/views/TextDocumentView.vue`
- Modify: `src/views/HtmlSettingsView.vue`
- Modify: `src/views/AdminView.vue`
- Modify: `src/views/PluginsView.vue`

**Interfaces:**
- Consumes: semantic tokens from Task 4.
- Produces: theme-aware canvas/document/admin/plugin application chrome while leaving embedded or authored content unchanged.

- [ ] **Step 1: Add a source-level theme-boundary regression test**

Create `src/theme/themeBoundaries.test.ts` that reads the component sources and asserts that the two explicit authored-content boundaries still exist:

```ts
// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('theme content boundaries', () => {
  it('does not put data-theme on exported HTML or the canvas content model', () => {
    const canvas = readFileSync(new URL('../components/CanvasLoader.vue', import.meta.url), 'utf8');
    const html = readFileSync(new URL('../views/HtmlDocumentView.vue', import.meta.url), 'utf8');
    expect(canvas).not.toContain("node.style.fill = effectiveTheme");
    expect(html).not.toContain('documentHtml = applyTheme');
  });
});
```

- [ ] **Step 2: Run the boundary test**

Run: `npm run test:unit -- src/theme/themeBoundaries.test.ts`

Expected: PASS as a guard before CSS migration.

- [ ] **Step 3: Migrate canvas chrome**

Replace only CanvasView and CanvasLoader chrome colors for topbars, panels, selection chrome, menus, controls, grid background, embeds, and empty/loading states. Keep node fields, image pixels, drawing stroke values, explicit fill palettes, and serialized HTML untouched. Light canvas chrome uses `--ui-canvas`; selected outlines continue using the brand/focus color.

Run: `npm run test:unit -- src/components/CanvasLoader.addMenu.test.ts src/components/CanvasLoader.board-preview.test.ts src/components/CanvasLoader.document.test.ts src/components/CanvasLoader.touch.test.ts src/views/CanvasView.newDocument.test.ts`

Expected: PASS.

- [ ] **Step 4: Migrate document and settings chrome**

Use semantic tokens for text-document toolbar/editor shell, HTML editor toolbar/source panel/history/access gate, HTML visual-editor controls, admin tables, plugin panels, and settings controls. Do not inject theme CSS into the authored HTML preview iframe/document, TipTap document content, or exported HTML.

Run:

```bash
npm run test:unit -- \
  src/views/TextDocumentView.test.ts \
  src/views/TextDocumentView.integration.test.ts \
  src/components/html/InlineRichText.test.ts \
  src/views/PluginsView.test.ts \
  src/html/htmlDocumentExport.test.ts
```

Expected: PASS.

- [ ] **Step 5: Audit remaining chrome literals**

Run:

```bash
rg -n "#[0-9A-Fa-f]{3,8}|rgba?\(" src/style.css src/views/CanvasView.vue src/components/CanvasLoader.vue src/views/HtmlDocumentView.vue src/views/TextDocumentView.vue src/views/HtmlSettingsView.vue src/views/AdminView.vue src/views/PluginsView.vue
```

For each remaining literal, verify it is one of: a content palette, resource-type accent, semantic status, overlay transparency derived from a token, or authored/exported content. Convert every application background/text/border literal to a semantic token before continuing.

- [ ] **Step 6: Run the full unit suite and commit workspace migration**

Run: `npm run test:unit`

Expected: all tests PASS.

```bash
git add src/style.css src/theme/themeBoundaries.test.ts src/components/CanvasLoader.vue src/components/html/HtmlVisualEditor.vue src/components/html/InlineRichText.vue src/views/CanvasView.vue src/views/HtmlDocumentView.vue src/views/TextDocumentView.vue src/views/HtmlSettingsView.vue src/views/AdminView.vue src/views/PluginsView.vue
git commit -m "style(theme): migrate canvas and document chrome"
```

---

### Task 6: Migrate landing and interactive-board surfaces, then verify

**Files:**
- Modify: `src/views/LandingView.vue`
- Modify: `src/views/BoardTemplateView.vue`
- Modify: `src/views/InteractiveTemplateView.vue`
- Modify: `src/components/board/BoardEditor.vue`
- Modify: `src/components/board/BoardColumn.vue`
- Modify: `src/components/board/BoardCard.vue`
- Modify: `src/components/board/BoardCardDialog.vue`
- Modify: `src/components/board/BoardPreview.vue`
- Modify: `src/components/board/BoardShareDialog.vue`
- Modify: `index.html`

**Interfaces:**
- Consumes: semantic tokens and account/theme controls from Tasks 2–4.
- Produces: complete light/dark coverage for remaining public and board surfaces.

- [ ] **Step 1: Convert the landing page's scoped chrome colors**

Replace landing page/background/card/header/formula/section colors with semantic tokens or landing-specific aliases defined from semantic tokens. Preserve intentional template-preview content colors. Ensure the compact theme control stays in the upper-right at desktop and mobile widths.

Run: `npm run test:unit -- src/views/LandingView.test.ts`

Expected: PASS.

- [ ] **Step 2: Convert board application chrome**

Migrate board page, toolbar, columns, dialogs, cards, previews, share dialog, drag target, and loading/error states to semantic tokens. Preserve explicit card labels and user-selected board content colors. Dragging and reorder geometry must not change.

Run:

```bash
npm run test:unit -- \
  src/views/BoardTemplateView.test.ts \
  src/components/board/BoardEditor.test.ts \
  src/components/board/BoardPreview.test.ts
```

Expected: PASS.

- [ ] **Step 3: Update browser chrome color**

Change the existing `meta[name="theme-color"]` integration so `useTheme` updates its `content` to `#f5f7f4` for light and `#071307` for dark. Keep the dark fallback value in `index.html` for browsers that execute no JavaScript.

- [ ] **Step 4: Run final automated verification**

Run:

```bash
npm run test:unit
npm run build
```

Expected: all unit tests PASS and Vite produces `dist` without TypeScript or build errors.

- [ ] **Step 5: Perform the manual theme matrix**

Run: `npm run dev -- --host 0.0.0.0`

Verify in Yandex Browser desktop:

1. Clear `qcanva:theme:v1`; OS light opens light and OS dark opens dark.
2. Set each of System, Light, Dark; refresh landing, login, dashboard, canvas, board, HTML document, and text document.
3. Confirm no wrong-theme flash on each hard refresh.
4. Change OS theme while System is selected and confirm immediate update.
5. Confirm canvas node fills, uploaded images, board label colors, and authored document content are identical in both themes.
6. Navigate only by keyboard through public control and account menu; confirm visible focus and Escape close.

- [ ] **Step 6: Commit final surface coverage**

```bash
git add index.html src/views/LandingView.vue src/views/BoardTemplateView.vue src/views/InteractiveTemplateView.vue src/components/board/BoardEditor.vue src/components/board/BoardColumn.vue src/components/board/BoardCard.vue src/components/board/BoardCardDialog.vue src/components/board/BoardPreview.vue src/components/board/BoardShareDialog.vue
git commit -m "style(theme): complete light theme coverage"
```
