# Canvas Project — Redesign Plan (Frox Design System)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the Canvas project visual design with the Frox Dashboard design system — update tokens, typography, layout, and components to match the established brand.

**Architecture:** Adopt Frox's CSS Custom Properties as design tokens without migrating to TailwindCSS. Replace ad-hoc `rgba` color literals in `style.css` with CSS variables, update layout to a sidebar+content grid, and apply Frox card/button/input patterns across all views.

**Tech Stack:** Vue 3, TypeScript, Vite, plain CSS (`style.css` ~2400 lines)

---

## Gap Analysis: Current vs Frox

| Dimension | Current | Frox Target |
|---|---|---|
| Font | `-apple-system, "Segoe UI"` (system stack) | Noto Sans (Google Fonts) |
| Page background | `#1e1e1e` | `#1f2128` (`--dark-neutral-bg`) |
| Card background | `#262626` | `#1f2128` same |
| Card border | `rgba(255,255,255,0.08)` | `#313442` (`--dark-neutral-border`) |
| Card radius | `10px` | `16px` (`rounded-2xl`) |
| Brand color | `#7c8aff` (blue-indigo) | `#7364db` (violet) |
| Layout | Top header only, no sidebar | Sidebar 257px + header + main |
| CSS tokens | None (raw color literals) | Full CSS Custom Properties |
| Transitions | Mix of 0.15s/0.22s | `0.3s` standard |
| Light mode | Not supported | Supported via `html.dark` class |
| Buttons | `border-radius: 6px` | `rounded-xl` (12px) |
| Input wrapper | Bare `border-radius: 6px` | `rounded-xl` with proper bg |
| Sidebar | None | 257px collapsible aside |
| Badge/tag | `border-radius: 4px` | `rounded-full` |

---

## File Map

| File | What Changes |
|---|---|
| `src/style.css` | Add CSS token block at top; update all color literals to vars; update radii, transitions, font |
| `index.html` | Add Google Fonts link for Noto Sans + Chivo |
| `src/views/DashboardView.vue` | Add sidebar layout structure + CSS |
| `src/views/HtmlDocsView.vue` | Match sidebar layout + card patterns |
| `src/views/CanvasView.vue` | Update header/panel colors to tokens |
| `src/views/HtmlDocumentView.vue` | Update header/panel colors to tokens |
| `src/views/LoginView.vue` | Update auth card to Frox modal pattern |
| `src/views/RegisterView.vue` | Same as Login |
| `src/views/AdminView.vue` | Update to token-based colors |

---

## Phase 1 — Design Tokens & Typography

### Task 1.1: Add CSS Custom Properties (design tokens)

**Files:**
- Modify: `src/style.css` (top of file, lines 1-18)
- Modify: `index.html`

- [ ] **Step 1: Add Google Fonts to index.html**

Open `index.html` and add inside `<head>` before any other link:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Chivo:wght@400;700;900&family=Noto+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
```

- [ ] **Step 2: Add CSS token block to top of style.css**

Add this block immediately after `* { ... }` reset, before the `:root { font-family: ... }` block:

```css
/* ===== Frox Design Tokens ===== */
:root {
  /* Brand */
  --color-brands: #7364db;
  --color-brands-light: #B2A7FF;

  /* Dark surfaces */
  --dark-neutral-bg: #1f2128;
  --dark-neutral-border: #313442;
  --dark-card-bg: #262733;
  --dark-input-bg: rgba(255, 255, 255, 0.05);

  /* Dark text scale */
  --dark-text-primary: #f1f1f1;
  --dark-text-secondary: #8b8b93;
  --dark-text-muted: #64646f;

  /* Accents */
  --accent-green: #50d1b2;
  --accent-red: #e23738;
  --accent-yellow: #ece663;

  /* Radii */
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-xl: 20px;
  --radius-full: 9999px;

  /* Transitions */
  --transition-fast: 0.15s ease;
  --transition-std: 0.3s ease;

  /* Shadows */
  --shadow-dropdown: 0 40px 120px 0 rgba(0, 0, 0, 0.24);
  --shadow-card: 0 4px 24px rgba(0, 0, 0, 0.28);
}
```

- [ ] **Step 3: Update `:root` font-family to Noto Sans**

Replace the existing `:root` font-family declaration:

```css
:root {
  font-family: 'Noto Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  /* ... rest unchanged ... */
  background-color: var(--dark-neutral-bg);
}
```

Also update the `background-color: #1e1e1e` literal to `var(--dark-neutral-bg)`.

- [ ] **Step 4: Verify in browser**

Run `npm run dev` in `canvas-server-front/`, open the app. Font should visually change to Noto Sans (rounder, more neutral than system fonts). Background should be `#1f2128` (very slightly different from old `#1e1e1e`).

- [ ] **Step 5: Commit**

```bash
git add src/style.css index.html
git commit -m "design: add Frox CSS tokens, Noto Sans font"
```

---

### Task 1.2: Replace color literals in global CSS classes

**Files:**
- Modify: `src/style.css`

This task replaces hardcoded `#7c8aff` (old brand blue) and raw `rgba(255,255,255,...)` surface colors with CSS variables throughout `style.css`. This is a systematic find-and-replace pass.

- [ ] **Step 1: Replace brand color `#7c8aff` with `var(--color-brands)`**

Search `style.css` for `#7c8aff` and `rgba(124,138,255,...)` and replace all occurrences:

| Old | New |
|---|---|
| `background: #7c8aff` | `background: var(--color-brands)` |
| `color: #7c8aff` | `color: var(--color-brands)` |
| `border-color: rgba(124,138,255,0.5)` | `border-color: color-mix(in srgb, var(--color-brands) 50%, transparent)` |
| `border-color: rgba(124,138,255,0.45)` | `border-color: color-mix(in srgb, var(--color-brands) 45%, transparent)` |
| `background: rgba(124,138,255,0.2)` | `background: color-mix(in srgb, var(--color-brands) 20%, transparent)` |
| `background: rgba(124,138,255,0.15)` | `background: color-mix(in srgb, var(--color-brands) 15%, transparent)` |
| `color: #c9d0ff` | `color: var(--color-brands-light)` |

- [ ] **Step 2: Replace surface colors**

| Old | New |
|---|---|
| `background: #1e1e1e` | `background: var(--dark-neutral-bg)` |
| `background: #262626` | `background: var(--dark-card-bg)` |
| `background: rgba(255,255,255,0.04)` | `background: var(--dark-input-bg)` |
| `background: rgba(255,255,255,0.06)` | `background: rgba(255,255,255,0.06)` (keep — hover states) |
| `border: 1px solid rgba(255,255,255,0.08)` | `border: 1px solid var(--dark-neutral-border)` |
| `border: 1px solid rgba(255,255,255,0.1)` | `border: 1px solid var(--dark-neutral-border)` |
| `border: 1px solid rgba(255,255,255,0.12)` | `border: 1px solid var(--dark-neutral-border)` |

- [ ] **Step 3: Replace border-radius values**

| Old | New |
|---|---|
| `border-radius: 6px` (buttons, inputs) | `border-radius: var(--radius-sm)` |
| `border-radius: 8px` (menu items, small) | `border-radius: var(--radius-sm)` |
| `border-radius: 10px` (canvas cards) | `border-radius: var(--radius-md)` |
| `border-radius: 12px` (auth card, modals) | `border-radius: var(--radius-md)` |
| `border-radius: 4px` (badges) | `border-radius: var(--radius-full)` |

- [ ] **Step 4: Replace text color literals**

| Old | New |
|---|---|
| `color: rgba(255,255,255,0.87)` | `color: var(--dark-text-primary)` |
| `color: rgba(255,255,255,0.5)` | `color: var(--dark-text-secondary)` |
| `color: rgba(255,255,255,0.45)` | `color: var(--dark-text-muted)` |
| `color: rgba(255,255,255,0.4)` | `color: var(--dark-text-muted)` |

- [ ] **Step 5: Verify — open app, check cards, buttons, inputs look right, no broken colors**

- [ ] **Step 6: Commit**

```bash
git add src/style.css
git commit -m "design: replace color literals with CSS token variables"
```

---

## Phase 2 — Card & Button Patterns

### Task 2.1: Update card appearance to Frox style

**Files:**
- Modify: `src/style.css` — `.canvas-card`, `.auth-card`, modal cards

Frox card pattern:
```css
border-radius: 16px;
border: 1px solid var(--dark-neutral-border);
background: var(--dark-card-bg);
```

- [ ] **Step 1: Update `.canvas-card`**

Find `.canvas-card` in `style.css` and update:

```css
.canvas-card {
  position: relative;
  background: var(--dark-card-bg);
  border: 1px solid var(--dark-neutral-border);
  border-radius: var(--radius-lg);  /* 16px */
  padding: 20px;
  cursor: pointer;
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
}
.canvas-card:hover {
  border-color: var(--color-brands);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--color-brands) 30%, transparent);
}
```

- [ ] **Step 2: Update `.auth-card`**

```css
.auth-card {
  background: var(--dark-card-bg);
  border: 1px solid var(--dark-neutral-border);
  border-radius: var(--radius-lg);
  padding: 40px;
  width: 360px;
  box-shadow: var(--shadow-card);
}
```

- [ ] **Step 3: Update `.card-menu` (context dropdown)**

```css
.card-menu {
  position: absolute;
  top: 40px;
  right: 8px;
  min-width: 220px;
  padding: 6px;
  border: 1px solid var(--dark-neutral-border);
  border-radius: var(--radius-md);
  background: var(--dark-card-bg);
  box-shadow: var(--shadow-dropdown);
  z-index: 20;
}
.card-menu-item {
  width: 100%;
  padding: 10px 12px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--dark-text-primary);
  text-align: left;
  font-size: 13px;
  cursor: pointer;
  transition: background var(--transition-fast);
}
.card-menu-item:hover { background: rgba(255,255,255,0.06); }
```

- [ ] **Step 4: Verify cards look updated in browser — rounder, consistent borders**

- [ ] **Step 5: Commit**

```bash
git add src/style.css
git commit -m "design: update card shapes to Frox rounded-2xl pattern"
```

---

### Task 2.2: Update buttons to Frox pattern

**Files:**
- Modify: `src/style.css` — `.btn-primary`, `.btn-ghost`, `.btn-sm`

Frox button patterns:
- Primary: `bg-color-brands`, `border-4` outer ring on hover turns `#B2A7FF`
- Ghost: `border border-neutral-border`, text secondary, hover bg subtle

- [ ] **Step 1: Update `.btn-primary`**

```css
.btn-primary {
  padding: 8px 18px;
  border: 2px solid transparent;
  border-radius: var(--radius-sm);
  background: var(--color-brands);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: border-color var(--transition-std), background var(--transition-std);
}
.btn-primary:hover {
  border-color: var(--color-brands-light);
}
```

- [ ] **Step 2: Update `.btn-ghost`**

```css
.btn-ghost {
  padding: 8px 18px;
  border: 1px solid var(--dark-neutral-border);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--dark-text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: background var(--transition-fast), color var(--transition-fast);
}
.btn-ghost:hover {
  background: rgba(255, 255, 255, 0.06);
  color: var(--dark-text-primary);
}
.btn-ghost.danger:hover {
  color: #fff;
  background: rgba(226, 55, 56, 0.18);
  border-color: rgba(226, 55, 56, 0.35);
}
```

- [ ] **Step 3: Update auth submit button in `.auth-card button[type="submit"]`**

```css
.auth-card button[type="submit"] {
  padding: 10px;
  border: 2px solid transparent;
  border-radius: var(--radius-sm);
  background: var(--color-brands);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  margin-top: 4px;
  transition: border-color var(--transition-std);
}
.auth-card button[type="submit"]:hover {
  border-color: var(--color-brands-light);
}
```

- [ ] **Step 4: Update `.badge-owner` to use brand color var**

```css
.badge-owner { background: color-mix(in srgb, var(--color-brands) 15%, transparent); color: var(--color-brands); }
```

- [ ] **Step 5: Verify buttons in dashboard, auth pages look right**

- [ ] **Step 6: Commit**

```bash
git add src/style.css
git commit -m "design: update buttons and badges to Frox brand color"
```

---

### Task 2.3: Update form inputs to Frox pattern

**Files:**
- Modify: `src/style.css` — `.dash-search`, `.canvas-search-input`, `.dash-sort-select`, `.auth-card input`

Frox input wrapper: `bg-gray-dark-100` (`#1a1a20`) with `rounded-xl`, no border on the wrapper — the border is replaced by a subtle bg contrast.

- [ ] **Step 1: Update search inputs**

```css
.dash-search,
.canvas-search-input {
  padding: 10px 14px;
  border: 1px solid var(--dark-neutral-border);
  border-radius: var(--radius-sm);
  background: var(--dark-input-bg);
  color: var(--dark-text-primary);
  font-size: 13px;
  outline: none;
  transition: border-color var(--transition-fast);
}
.dash-search:focus,
.canvas-search-input:focus {
  border-color: color-mix(in srgb, var(--color-brands) 50%, transparent);
}
```

- [ ] **Step 2: Update `.dash-sort-select`**

```css
.dash-sort-select {
  max-width: 180px;
  padding: 9px 10px;
  border: 1px solid var(--dark-neutral-border);
  border-radius: var(--radius-sm);
  background: var(--dark-card-bg);
  color: var(--dark-text-primary);
  font-size: 13px;
}
```

- [ ] **Step 3: Update auth card inputs**

```css
.auth-card input {
  padding: 10px 14px;
  border: 1px solid var(--dark-neutral-border);
  border-radius: var(--radius-sm);
  background: var(--dark-input-bg);
  color: #fff;
  font-size: 14px;
  outline: none;
  transition: border-color var(--transition-fast);
}
.auth-card input:focus {
  border-color: color-mix(in srgb, var(--color-brands) 50%, transparent);
}
```

- [ ] **Step 4: Update `.home-tabs` (dashboard section tabs)**

```css
.home-tabs {
  display: inline-flex;
  gap: 4px;
  margin-top: 14px;
  padding: 4px;
  border: 1px solid var(--dark-neutral-border);
  border-radius: var(--radius-sm);
  background: var(--dark-input-bg);
}
.home-tab.active {
  color: #fff;
  background: color-mix(in srgb, var(--color-brands) 22%, transparent);
}
```

- [ ] **Step 5: Verify all inputs, selects, search boxes look right**

- [ ] **Step 6: Commit**

```bash
git add src/style.css
git commit -m "design: update form inputs and selects to Frox token style"
```

---

## Phase 3 — Sidebar Layout

### Task 3.1: Add sidebar to DashboardView

**Files:**
- Modify: `src/views/DashboardView.vue`
- Modify: `src/style.css` — add sidebar styles

The sidebar replaces the current top-header-only layout on the Dashboard. Canvas view and HTML doc view keep their full-screen header layout (they are editors, not management pages). Only DashboardView and HtmlDocsView get the sidebar.

Sidebar items:
- Canvases (→ `/`)
- HTML Documents (→ `/html-docs`)
- Settings (→ `/html-settings`)
- Admin (→ `/admin`, shown only to admins)

- [ ] **Step 1: Write failing test (check sidebar renders on dashboard)**

Since this is a Vue component without a test suite, verify manually. Skip to Step 2.

- [ ] **Step 2: Add sidebar CSS to style.css**

Add this block after the `.dashboard` styles:

```css
/* ===== Sidebar Layout ===== */
.app-layout {
  display: grid;
  grid-template-columns: 257px 1fr;
  grid-template-rows: auto 1fr;
  min-height: 100vh;
  min-height: 100dvh;
  background: #0f0f12;
}
.app-sidebar {
  grid-row: 1 / -1;
  background: var(--dark-neutral-bg);
  border-right: 1px solid var(--dark-neutral-border);
  display: flex;
  flex-direction: column;
  padding: 24px 20px;
  gap: 4px;
  overflow-y: auto;
}
.sidebar-logo {
  font-size: 18px;
  font-weight: 700;
  color: var(--dark-text-primary);
  padding: 0 8px;
  margin-bottom: 24px;
  letter-spacing: -0.02em;
}
.sidebar-logo span {
  color: var(--color-brands);
}
.sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
}
.sidebar-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 14px;
  border-radius: var(--radius-md);
  color: var(--dark-text-secondary);
  font-size: 14px;
  font-weight: 500;
  text-decoration: none;
  cursor: pointer;
  transition: background var(--transition-fast), color var(--transition-fast);
  border: none;
  background: transparent;
  width: 100%;
  text-align: left;
}
.sidebar-item:hover {
  background: rgba(255, 255, 255, 0.05);
  color: var(--dark-text-primary);
}
.sidebar-item.active {
  background: var(--color-brands);
  color: #fff;
}
.sidebar-item svg {
  flex-shrink: 0;
  opacity: 0.7;
}
.sidebar-item.active svg {
  opacity: 1;
}
.app-header {
  background: var(--dark-neutral-bg);
  border-bottom: 1px solid var(--dark-neutral-border);
  padding: 16px 28px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.app-main {
  padding: 32px 28px;
  overflow-y: auto;
}
.sidebar-section-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--dark-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.07em;
  padding: 0 14px;
  margin: 16px 0 6px;
}
```

- [ ] **Step 3: Update DashboardView.vue template**

The current template structure is:
```html
<div class="dashboard">
  <div class="dash-header"> ... </div>
  ...content...
</div>
```

Replace with:
```html
<div class="app-layout">
  <!-- Sidebar -->
  <aside class="app-sidebar">
    <div class="sidebar-logo">Canvas<span>.</span></div>
    <nav class="sidebar-nav">
      <router-link to="/" class="sidebar-item" :class="{ active: $route.path === '/' }">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
          <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
        </svg>
        Canvases
      </router-link>
      <router-link to="/html-docs" class="sidebar-item" :class="{ active: $route.path === '/html-docs' }">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
          <polyline points="14,2 14,8 20,8"/>
          <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
          <polyline points="10,9 9,9 8,9"/>
        </svg>
        HTML Docs
      </router-link>
      <template v-if="isAdminUser">
        <div class="sidebar-section-label">Admin</div>
        <router-link to="/admin" class="sidebar-item" :class="{ active: $route.path === '/admin' }">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.07 4.93a10 10 0 010 14.14M4.93 4.93a10 10 0 000 14.14"/>
          </svg>
          Admin
        </router-link>
      </template>
    </nav>
    <div style="margin-top: auto; padding-top: 16px; border-top: 1px solid var(--dark-neutral-border);">
      <button class="sidebar-item" @click="logout">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
          <polyline points="16,17 21,12 16,7"/>
          <line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
        Sign out
      </button>
    </div>
  </aside>

  <!-- Header -->
  <header class="app-header">
    <h1 style="font-size: 20px; font-weight: 700; color: var(--dark-text-primary);">My Canvases</h1>
    <div class="dash-actions">
      <button class="btn-primary" @click="openCreateModal">+ New Canvas</button>
    </div>
  </header>

  <!-- Main -->
  <main class="app-main">
    <!-- existing dashboard content, without the old .dash-header -->
    ...
  </main>
</div>
```

Keep all existing canvas grid, cards, modals, etc. — only wrap in the new layout and remove old `.dash-header`.

- [ ] **Step 4: Add `isAdminUser` computed and `logout` to DashboardView script**

In the existing `<script setup>`, add:

```ts
import { isAdmin, clearToken } from '../api/client';
import { useRouter } from 'vue-router';

const router = useRouter();
const isAdminUser = isAdmin();

function logout() {
  clearToken();
  router.push('/login');
}
```

- [ ] **Step 5: Run app and verify sidebar renders, navigation works, canvas grid still shows**

- [ ] **Step 6: Commit**

```bash
git add src/views/DashboardView.vue src/style.css
git commit -m "design: add Frox sidebar layout to Dashboard"
```

---

### Task 3.2: Apply sidebar layout to HtmlDocsView

**Files:**
- Modify: `src/views/HtmlDocsView.vue`

HtmlDocsView currently has its own top header. Apply the same `.app-layout` sidebar as DashboardView.

- [ ] **Step 1: Read current HtmlDocsView.vue template top-level structure**

```bash
head -60 src/views/HtmlDocsView.vue
```

- [ ] **Step 2: Wrap in `.app-layout` with same sidebar as DashboardView**

The sidebar component is duplicated for now (can be extracted to a shared component in a future refactor). Copy the same `<aside class="app-sidebar">` block from DashboardView.vue, then wrap the existing content in `<main class="app-main">`.

- [ ] **Step 3: Import `isAdmin`, `clearToken` in HtmlDocsView and add `logout`**

Same pattern as DashboardView Task 3.1 Step 4.

- [ ] **Step 4: Verify HTML docs page renders with sidebar, links work**

- [ ] **Step 5: Commit**

```bash
git add src/views/HtmlDocsView.vue
git commit -m "design: apply sidebar layout to HtmlDocsView"
```

---

## Phase 4 — View-Specific Polish

### Task 4.1: Update Canvas editor header to Frox tokens

**Files:**
- Modify: `src/style.css` — `.canvas-header`, `.canvas-title`, share panel

The Canvas view has a fixed top header. It should use `--dark-neutral-bg` and `--dark-neutral-border` instead of hardcoded values.

- [ ] **Step 1: Find `.canvas-header` (or `.view-header`, `.header`) in style.css and update**

Search for the canvas header class. Replace hardcoded colors:

```css
.canvas-header {        /* or whatever the class is */
  background: var(--dark-neutral-bg);
  border-bottom: 1px solid var(--dark-neutral-border);
}
```

- [ ] **Step 2: Update share panel background and borders**

Search for `.share-panel`, `.access-panel`, `.access-gate-card` in `style.css`. Replace all hardcoded `#1e1e2e`, `#262636`, etc. with vars:

```css
/* Access gate card */
.access-gate { background: var(--dark-neutral-bg); }
.access-gate-card {
  background: var(--dark-card-bg);
  border: 1px solid var(--dark-neutral-border);
  border-radius: var(--radius-xl);
}
/* Share panel */
.share-panel {
  background: var(--dark-card-bg);
  border: 1px solid var(--dark-neutral-border);
  border-radius: var(--radius-lg);
}
```

- [ ] **Step 3: Update share panel section titles and dividers**

```css
.share-section-title {
  color: var(--dark-text-muted);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/style.css
git commit -m "design: apply token variables to canvas editor header and share panel"
```

---

### Task 4.2: Update HTML document view header

**Files:**
- Modify: `src/style.css` — `.html-doc-header` or equivalent class

Same as Task 4.1 but for HtmlDocumentView.

- [ ] **Step 1: Find HTML doc view header class in style.css and update to token vars**

Same replacements as Task 4.1 Step 1.

- [ ] **Step 2: Update mode tab buttons (Preview / Source) to brand color when active**

Find `.mode-tab`, `.view-tab`, or similar active-tab class:

```css
.mode-tab.active,
.view-tab.active {
  background: color-mix(in srgb, var(--color-brands) 20%, transparent);
  color: var(--color-brands);
  border-color: color-mix(in srgb, var(--color-brands) 35%, transparent);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/style.css
git commit -m "design: apply token variables to HTML document view header and tabs"
```

---

### Task 4.3: Update auth pages (Login, Register)

**Files:**
- Modify: `src/style.css` — `.auth-page`, `.auth-card`
- Modify: `src/views/LoginView.vue`, `src/views/RegisterView.vue`

Frox auth page: centered card, no sidebar. Same layout as current but with updated tokens (already done in Task 2.1/2.2/2.3). Only visual accent: add the brand color to the heading.

- [ ] **Step 1: Add brand accent to auth card heading**

In `style.css`:

```css
.auth-card h1 {
  margin-bottom: 24px;
  font-size: 24px;
  font-weight: 700;
  text-align: center;
  color: var(--dark-text-primary);
}
.auth-card h1 span.brand {
  color: var(--color-brands);
}
```

- [ ] **Step 2: Update LoginView.vue heading**

Find `<h1>` in LoginView.vue template and wrap app name in brand span:

```html
<h1>Canvas<span class="brand">.</span></h1>
```

- [ ] **Step 3: Same for RegisterView.vue**

- [ ] **Step 4: Update `.auth-page` background**

```css
.auth-page {
  background: #0f0f12;  /* slightly darker than cards, like Frox dark page bg */
}
```

- [ ] **Step 5: Verify login and register pages look polished**

- [ ] **Step 6: Commit**

```bash
git add src/style.css src/views/LoginView.vue src/views/RegisterView.vue
git commit -m "design: polish auth pages with Frox token colors and brand accent"
```

---

## Phase 5 — Dashboard Cards & Tags

### Task 5.1: Add visual section dividers and folder labels

**Files:**
- Modify: `src/style.css` — `.folder-title`, `.dash-section-head`

Frox uses `h-[1px] bg-dark-neutral-border` horizontal dividers and `text-desc text-gray-500` uppercase labels.

- [ ] **Step 1: Update folder section title to Frox style**

```css
.folder-title {
  margin-bottom: 12px;
  color: var(--dark-text-muted);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.07em;
}
```

- [ ] **Step 2: Add a divider utility class**

Add to `style.css`:

```css
.frox-divider {
  width: 100%;
  height: 1px;
  background: var(--dark-neutral-border);
  margin: 12px 0;
}
```

- [ ] **Step 3: Update tag filter pills**

```css
.tag-filter,
.card-tag {
  border: 1px solid var(--dark-neutral-border);
  background: rgba(255, 255, 255, 0.04);
  color: var(--dark-text-secondary);
  border-radius: var(--radius-full);
  padding: 4px 12px;
  font-size: 12px;
}
.tag-filter.active {
  border-color: color-mix(in srgb, var(--color-brands) 45%, transparent);
  color: var(--color-brands-light);
  background: color-mix(in srgb, var(--color-brands) 10%, transparent);
}
```

- [ ] **Step 4: Commit**

```bash
git add src/style.css
git commit -m "design: update section labels, dividers, and tag pills to Frox style"
```

---

## Summary: What This Plan Does NOT Change

- **TailwindCSS migration** — not in scope. The project stays with plain CSS + CSS variables.
- **DaisyUI components** — not added. Too invasive without Tailwind.
- **Light mode** — the project is dark-only. Adding light mode support is a separate future initiative.
- **Editor UX** — Canvas editor (Excalidraw) and HTML source editor (CodeMirror) internals are not touched.
- **Component extraction** — sidebar is duplicated in Dashboard and HtmlDocs views. Extraction to a shared `<AppSidebar>` component is a natural next step after this plan completes.
- **Responsive / mobile** — out of scope for this redesign pass.

---

## Execution Order

```
Phase 1 (tokens) → Phase 2 (cards/buttons/inputs) → Phase 3 (sidebar) → Phase 4 (view polish) → Phase 5 (details)
```

Each phase is independently deployable — the app will look progressively more aligned with Frox after each phase.
