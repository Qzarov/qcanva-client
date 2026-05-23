# Mobile UX Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve phone usability by removing the mobile sidebar from the content flow and then reducing dense action groups.

**Architecture:** Apply the first fix as a shared CSS shell change in `src/style.css`, because `DashboardView.vue` and `HtmlDocsView.vue` already share `.app-layout`, `.app-sidebar`, `.app-header`, and `.app-main.dashboard`. Later slices can introduce small Vue action-overflow state only where needed.

**Tech Stack:** Vue 3, Vue Router, Vite, Vitest, CSS custom properties, responsive CSS.

---

### Task 1: Mobile Bottom Navigation Shell

**Files:**
- Modify: `src/style.css`
- Reference: `src/views/DashboardView.vue`
- Reference: `src/views/HtmlDocsView.vue`

- [x] **Step 1: Confirm baseline**

Run: `npm run test:unit`

Expected: all current unit tests pass before the shell change.

- [x] **Step 2: Move mobile sidebar out of layout flow**

In the `@media (max-width: 720px)` block, change `.app-layout` to two rows and make `.app-sidebar` fixed to the bottom viewport edge.

- [x] **Step 3: Stabilize mobile nav targets**

Set `.sidebar-nav` to a horizontal bottom-bar layout and size `.sidebar-item` as centered touch targets with `min-height: 48px`.

- [x] **Step 4: Protect scrollable content**

Increase `.app-main.dashboard` bottom padding to account for the fixed nav and `env(safe-area-inset-bottom)`.

- [x] **Step 5: Verify**

Run: `npm run test:unit`

Expected: unit tests pass.

Run: `npm run build`

Expected: TypeScript and Vite build complete successfully.

- [x] **Step 6: Commit**

Run:

```bash
git add docs/superpowers/specs/2026-05-23-mobile-ux-audit-design.md docs/superpowers/plans/2026-05-23-mobile-ux-audit.md src/style.css
git commit -m "design: improve mobile app shell navigation"
```

### Task 2: Mobile Header Action Overflow

**Files:**
- Modify: `src/views/DashboardView.vue`
- Modify: `src/views/HtmlDocsView.vue`
- Modify: `src/style.css`

- [ ] **Step 1: Add a mobile overflow action for secondary buttons**

Keep the primary creation action visible and move secondary actions into a compact mobile menu.

- [ ] **Step 2: Verify**

Run: `npm run test:unit`

Expected: unit tests pass.

Run: `npm run build`

Expected: production build passes.

### Task 3: Editor Toolbar Pressure

**Files:**
- Modify: `src/views/HtmlDocumentView.vue`
- Modify: `src/views/CanvasView.vue`
- Modify: `src/style.css`

- [ ] **Step 1: Split editor controls into mobile rows**

Keep title/save state separate from mode and share controls on HTML documents; reduce Canvas toolbar wrapping height.

- [ ] **Step 2: Verify**

Run: `npm run test:unit`

Expected: unit tests pass.

Run: `npm run build`

Expected: production build passes.

### Task 4: Mobile Card Actions

**Files:**
- Modify: `src/views/DashboardView.vue`
- Modify: `src/views/HtmlDocsView.vue`
- Modify: `src/style.css`

- [ ] **Step 1: Reduce mobile card action buttons**

Use a single menu entry point for mobile card actions while keeping desktop card controls unchanged.

- [ ] **Step 2: Verify**

Run: `npm run test:unit`

Expected: unit tests pass.

Run: `npm run build`

Expected: production build passes.
