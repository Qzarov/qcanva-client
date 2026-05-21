# HTML Editor Hardening & Collab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix round-trip data loss and UX gaps in the new HTML visual editor, then bring HTML documents up to the same realtime collaboration model that canvas already uses (revision + operation log + websocket broadcast).

**Architecture:** Three sequential phases. Phase 1 fixes the parser/serializer and corrects the default editing mode. Phase 2 adds drag-and-drop reordering, undo/redo, inline rich text, and an empty state. Phase 3 introduces an `HtmlDocumentOperation` table, an op-based service path, a socket gateway, and a frontend socket composable mirroring `useCanvasSocket`.

**Tech Stack:** Frontend — Vue 3 Composition API, TypeScript, Vite, Vitest + jsdom, native DOMParser. Backend — NestJS, TypeORM, SQLite (dev), Socket.IO. Shared — JSON op encoding, bcrypt for resource passwords.

**Sibling spec:** `docs/superpowers/specs/2026-05-20-html-editor-hardening-design.md`.

---

## Repository Map

This plan touches two repos that live side-by-side under `/home/qzaro/nocode/codex/`:

- `canvas-server-front/` — Vue/Vite app. All `src/...` and `tests/...` paths below resolve here unless prefixed.
- `canvas-server-back/` — NestJS app. Backend paths are prefixed `back/src/...`.

All commands assume CWD is the relevant repo root (`canvas-server-front` for frontend, `canvas-server-back` for backend).

---

## File Structure

### Phase 1 — Bugs
- Modify: `src/html/visualHtml.ts` (parser, serializer, escapeHtml).
- Modify: `src/html/visualHtml.test.ts` (new regression cases).
- Modify: `src/views/HtmlDocumentView.vue` (viewMode default).
- Modify: `src/components/html/HtmlVisualEditor.vue` (image caption input, section/card body normalization).

### Phase 2 — UX
- Create: `src/html/visualHtmlHistory.ts` (undo/redo stack).
- Create: `src/html/visualHtmlHistory.test.ts`.
- Create: `src/components/html/InlineRichText.vue` (allow-listed contenteditable).
- Create: `src/components/html/InlineRichText.test.ts` (jsdom).
- Modify: `src/components/html/HtmlVisualEditor.vue` (DnD, undo/redo wiring, rich text wiring, empty state).
- Modify: `src/style.css` (drop indicator, history toolbar, empty state).

### Phase 3 — Collab
- Create: `back/src/entities/html-document-operation.entity.ts`.
- Modify: `back/src/entities/html-document.entity.ts` (add `revision`).
- Modify: `back/src/html-documents/html-documents.module.ts` (register entity + gateway).
- Modify: `back/src/html-documents/html-documents.service.ts` (applyOperation, applySnapshotUpdate, resync, errors, lock).
- Create: `back/src/html-documents/html-documents.gateway.ts`.
- Create: `back/src/html-documents/html-documents.service.spec.ts`.
- Create: `back/src/html-documents/html-documents.gateway.spec.ts`.
- Modify: `back/src/html-documents/html-documents.controller.ts` (return `revision` from GET; new PATCH path stays optional).
- Move: `src/canvas/syncEvents.ts` → `src/common/syncEvents.ts` (no behavioural change).
- Create: `src/composables/useHtmlDocumentSocket.ts`.
- Create: `src/html/htmlSyncRetry.ts` + `src/html/htmlSyncRetry.test.ts` (mirrors `canvas/syncRetry.ts`).
- Modify: `src/components/html/HtmlVisualEditor.vue` (op emission, pending ops, remote op reconcile).
- Modify: `src/views/HtmlDocumentView.vue` (socket lifecycle, snapshot path for Source/Split).
- Modify: `src/api/client.ts` (revision in get/update response types).
- Create: `tests/htmlRealtime.test.ts` (two-client e2e).

---

# Phase 1 — Bugs & Defaults

## Task 1.1: Escape Single Quote In `escapeHtml`

**Files:**
- Modify: `src/html/visualHtml.ts:43-49`
- Modify: `src/html/visualHtml.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/html/visualHtml.test.ts` inside `describe('visualHtml', ...)`:

```ts
it("escapes single quotes in href and text content", () => {
  const parsed = parseVisualHtml(
    "<!DOCTYPE html><html><head></head><body><a href=\"/o'malley\">O'Malley</a></body></html>",
  );

  expect(parsed.blocks[0]).toMatchObject({ type: 'link', text: "O'Malley", href: "/o'malley" });

  const html = serializeVisualHtml(parsed);
  expect(html).toContain("href=\"/o&#39;malley\"");
  expect(html).toContain(">O&#39;Malley<");
  expect(html).not.toContain("/o'malley\"");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/html/visualHtml.test.ts`
Expected: FAIL on the `href="/o&#39;malley"` assertion because current `escapeHtml` does not touch `'`.

- [ ] **Step 3: Fix `escapeHtml`**

Replace the existing function body in `src/html/visualHtml.ts`:

```ts
function escapeHtml(value = '') {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- src/html/visualHtml.test.ts`
Expected: PASS for all 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/html/visualHtml.ts src/html/visualHtml.test.ts
git commit -m "fix: escape single quote in visual html serializer"
```

---

## Task 1.2: Stop Duplicating Section Heading On Round-Trip

**Files:**
- Modify: `src/html/visualHtml.ts:115-122,212-215`
- Modify: `src/html/visualHtml.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/html/visualHtml.test.ts`:

```ts
it("round-trips section without duplicating heading", () => {
  const source =
    '<!DOCTYPE html><html><head></head><body><section><h2>Title</h2><p>Body</p></section></body></html>';
  const once = serializeVisualHtml(parseVisualHtml(source));
  const twice = serializeVisualHtml(parseVisualHtml(once));

  const headingCount = (twice.match(/<h2[^>]*>Title<\/h2>/g) || []).length;
  expect(headingCount).toBe(1);
  expect(twice).toContain('<p>Body</p>');
});

it("round-trips card without duplicating heading", () => {
  const source =
    '<!DOCTYPE html><html><head></head><body><article class="card"><h2>T</h2><p>B</p></article></body></html>';
  const twice = serializeVisualHtml(parseVisualHtml(serializeVisualHtml(parseVisualHtml(source))));
  expect((twice.match(/<h2[^>]*>T<\/h2>/g) || []).length).toBe(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/html/visualHtml.test.ts`
Expected: FAIL — current code stores the heading inside `body` and re-emits it.

- [ ] **Step 3: Strip leading heading from section/card body during parse**

Replace the `section`/`card` branches in `parseBlock` (`src/html/visualHtml.ts`):

```ts
if (tag === 'section') {
  const heading = element.querySelector(':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6');
  const clone = element.cloneNode(true) as Element;
  if (heading) {
    const headingClone = clone.querySelector(':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6');
    headingClone?.remove();
  }
  return createBlock('section', {
    text: heading?.textContent?.trim() || '',
    body: clone.innerHTML.trim(),
    style,
  });
}

if (tag === 'article' || (tag === 'div' && element.classList.contains('card'))) {
  const heading = element.querySelector(':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6');
  const paragraph = element.querySelector(':scope > p');
  return createBlock('card', {
    text: heading?.textContent?.trim() || '',
    body: paragraph?.textContent?.trim() || '',
    style,
  });
}
```

- [ ] **Step 4: Make serializer idempotent**

Replace the `section`/`card` branches in `blockToHtml`:

```ts
if (block.type === 'section') {
  const heading = block.text ? `<h2>${text}</h2>` : '';
  const body = (block.body || '').trim() || '<p>Section content</p>';
  return `<section${style}>${heading}${body}</section>`;
}

if (block.type === 'card') {
  const heading = block.text ? `<h2>${text}</h2>` : '';
  const body = block.body ? `<p>${escapeHtml(block.body)}</p>` : '<p>Card body</p>';
  return `<article class="card"${style}>${heading}${body}</article>`;
}
```

- [ ] **Step 5: Run tests**

Run: `npm run test:unit -- src/html/visualHtml.test.ts`
Expected: PASS for all tests including the two new round-trip cases.

- [ ] **Step 6: Commit**

```bash
git add src/html/visualHtml.ts src/html/visualHtml.test.ts
git commit -m "fix: prevent section and card heading duplication on round-trip"
```

---

## Task 1.3: Default Edit Mode To Visual

**Files:**
- Modify: `src/views/HtmlDocumentView.vue:148,170-197`

- [ ] **Step 1: Update default and reconcile after load**

In `src/views/HtmlDocumentView.vue`, change line 148:

```ts
const viewMode = ref<'visual' | 'preview' | 'split' | 'source'>('visual');
```

Then inside `load()`, after `role.value = res.role;`, add:

```ts
if (res.role === 'read') {
  viewMode.value = 'preview';
}
```

- [ ] **Step 2: Run build**

Run: `npm run build`
Expected: vue-tsc passes, vite build succeeds.

- [ ] **Step 3: Smoke check in dev**

Run: `npm run dev` and open an HTML document as an editor — visual mode is selected by default. Open the same document via a public-read link — preview mode is selected. Stop the dev server.

- [ ] **Step 4: Commit**

```bash
git add src/views/HtmlDocumentView.vue
git commit -m "feat: default html editor to visual mode for editors"
```

---

## Task 1.4: Image Caption Input

**Files:**
- Modify: `src/components/html/HtmlVisualEditor.vue:72-86`

- [ ] **Step 1: Add caption input**

Inside the existing image branch (after the `Alt text` `<label>`), add:

```vue
<label v-if="selectedBlock.type === 'image'">
  <span>Caption</span>
  <input :value="selectedBlock.caption || ''" @input="updateSelected({ caption: ($event.target as HTMLInputElement).value })" />
</label>
```

- [ ] **Step 2: Drop the conditional in `hasTextField`**

Remove `'image'` from `hasTextField` because caption now has its own field (search the file for the function and update the array).

```ts
function hasTextField(type: VisualBlockType) {
  return ['heading', 'paragraph', 'section', 'card', 'button', 'link'].includes(type);
}
```

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/html/HtmlVisualEditor.vue
git commit -m "feat: add image caption field to html visual editor"
```

---

## Task 1.5: Phase 1 Verification

**Files:**
- Modify: `TODO.md`

- [ ] **Step 1: Full unit + build run**

Run from `canvas-server-front/`:

```bash
npm run test:unit
npm run build
```

Expected: both exit 0.

- [ ] **Step 2: Append phase 1 status to TODO**

Update the `## 19. HTML documents` section in `TODO.md` (line ~205) — after the existing `- [x]` item, insert:

```markdown
- [x] Закрыть пост-релизные баги визуального редактора: round-trip section/card, дефолт Visual, escape `'`, image caption
```

- [ ] **Step 3: Commit**

```bash
git add TODO.md
git commit -m "docs: mark html editor phase 1 bugfixes complete"
```

---

# Phase 2 — UX Polish

## Task 2.1: Undo/Redo Stack Module

**Files:**
- Create: `src/html/visualHtmlHistory.ts`
- Create: `src/html/visualHtmlHistory.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/html/visualHtmlHistory.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createHistory } from './visualHtmlHistory';

describe('visualHtmlHistory', () => {
  it('records snapshots and undoes the latest', () => {
    const history = createHistory<string>('a');
    history.record('b');
    history.record('c');

    expect(history.undo()).toBe('b');
    expect(history.undo()).toBe('a');
    expect(history.undo()).toBeUndefined();
  });

  it('redoes after undo', () => {
    const history = createHistory<string>('a');
    history.record('b');
    history.undo();
    expect(history.redo()).toBe('b');
    expect(history.redo()).toBeUndefined();
  });

  it('clears redo branch when recording after undo', () => {
    const history = createHistory<string>('a');
    history.record('b');
    history.undo();
    history.record('c');
    expect(history.redo()).toBeUndefined();
    expect(history.undo()).toBe('a');
  });

  it('caps history at 50 entries', () => {
    const history = createHistory<number>(0);
    for (let i = 1; i <= 60; i += 1) history.record(i);
    let undone = history.undo();
    let steps = 0;
    while (undone !== undefined) {
      undone = history.undo();
      steps += 1;
    }
    expect(steps).toBeLessThanOrEqual(50);
  });

  it('reset clears both stacks', () => {
    const history = createHistory<string>('a');
    history.record('b');
    history.reset('x');
    expect(history.undo()).toBeUndefined();
    expect(history.redo()).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- src/html/visualHtmlHistory.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the module**

Create `src/html/visualHtmlHistory.ts`:

```ts
export type History<T> = {
  record(value: T): void;
  undo(): T | undefined;
  redo(): T | undefined;
  reset(value: T): void;
};

const MAX = 50;

export function createHistory<T>(initial: T): History<T> {
  let past: T[] = [];
  let present: T = initial;
  let future: T[] = [];

  return {
    record(value) {
      past.push(present);
      if (past.length > MAX) past.shift();
      present = value;
      future = [];
    },
    undo() {
      const previous = past.pop();
      if (previous === undefined) return undefined;
      future.push(present);
      present = previous;
      return previous;
    },
    redo() {
      const next = future.pop();
      if (next === undefined) return undefined;
      past.push(present);
      present = next;
      return next;
    },
    reset(value) {
      past = [];
      future = [];
      present = value;
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- src/html/visualHtmlHistory.test.ts`
Expected: PASS for all 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/html/visualHtmlHistory.ts src/html/visualHtmlHistory.test.ts
git commit -m "feat: add visual html history module"
```

---

## Task 2.2: Wire Undo/Redo Into Visual Editor

**Files:**
- Modify: `src/components/html/HtmlVisualEditor.vue`
- Modify: `src/style.css`

- [ ] **Step 1: Add history state**

At the top of the `<script setup>` block, after the existing imports, add:

```ts
import { createHistory } from '../../html/visualHtmlHistory';

const history = createHistory<string>(props.modelValue || '');
const canUndo = ref(false);
const canRedo = ref(false);

function refreshHistoryFlags() {
  // History stacks are private; we mirror state via wrappers below.
}
```

Replace the `history` declaration with a closure that exposes flags:

```ts
const history = (() => {
  const inner = createHistory<string>(props.modelValue || '');
  return {
    record(value: string) {
      inner.record(value);
      canUndo.value = true;
      canRedo.value = false;
    },
    undo() {
      const value = inner.undo();
      canUndo.value = value !== undefined && Boolean(value);
      canRedo.value = true;
      return value;
    },
    redo() {
      const value = inner.redo();
      canRedo.value = value !== undefined && Boolean(value);
      canUndo.value = true;
      return value;
    },
    reset(value: string) {
      inner.reset(value);
      canUndo.value = false;
      canRedo.value = false;
    },
  };
})();
```

- [ ] **Step 2: Record after every mutation**

Update `emitHtml`:

```ts
function emitHtml(record = true) {
  syncingFromSelf.value = true;
  const html = serializeVisualHtml(parsed.value);
  if (record) history.record(html);
  emit('update:modelValue', html);
}
```

Pass `record: true` from every mutating action (`addBlock`, `updateSelected`, `moveSelected`, `duplicateSelected`, `deleteSelected`, `updateStyle`). They already call `emitHtml()` — no change needed, the new default is `true`.

Update the `props.modelValue` watcher:

```ts
watch(() => props.modelValue, (value) => {
  if (syncingFromSelf.value) {
    syncingFromSelf.value = false;
    return;
  }
  parsed.value = parseVisualHtml(value);
  selectedId.value = parsed.value.blocks[0]?.id || '';
  history.reset(value || '');
});
```

- [ ] **Step 3: Add undo/redo functions and shortcut handler**

Inside `<script setup>`, after `updateStyle`:

```ts
function applyHistoryValue(value: string | undefined) {
  if (value === undefined) return;
  parsed.value = parseVisualHtml(value);
  selectedId.value = parsed.value.blocks[0]?.id || selectedId.value;
  syncingFromSelf.value = true;
  emit('update:modelValue', value);
}

function undo() { applyHistoryValue(history.undo()); }
function redo() { applyHistoryValue(history.redo()); }

function onHistoryShortcut(event: KeyboardEvent) {
  if (!(event.ctrlKey || event.metaKey)) return;
  const target = event.target as HTMLElement | null;
  if (target?.isContentEditable) return;
  const key = event.key.toLowerCase();
  if (key === 'z' && !event.shiftKey) { event.preventDefault(); undo(); }
  else if ((key === 'z' && event.shiftKey) || key === 'y') { event.preventDefault(); redo(); }
}

onMounted(() => window.addEventListener('keydown', onHistoryShortcut));
onBeforeUnmount(() => window.removeEventListener('keydown', onHistoryShortcut));
```

Add the imports `onBeforeUnmount, onMounted` to the existing `import { computed, ref, watch } from 'vue';` line.

- [ ] **Step 4: Add UI buttons**

In the template, above the structure list, replace the `Add block` header section with:

```vue
<aside class="html-block-sidebar">
  <div class="html-history-toolbar">
    <button class="btn-ghost btn-sm" :disabled="!canUndo" @click="undo">Undo</button>
    <button class="btn-ghost btn-sm" :disabled="!canRedo" @click="redo">Redo</button>
  </div>
  <div class="html-panel-title">Add block</div>
  <!-- existing block library buttons stay below -->
</aside>
```

- [ ] **Step 5: Style the toolbar**

Append to `src/style.css`:

```css
.html-history-toolbar {
  display: flex;
  gap: 4px;
  margin-bottom: 8px;
}
```

- [ ] **Step 6: Run build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/components/html/HtmlVisualEditor.vue src/style.css
git commit -m "feat: wire undo and redo into html visual editor"
```

---

## Task 2.3: Drag-And-Drop Reordering

**Files:**
- Modify: `src/components/html/HtmlVisualEditor.vue`
- Modify: `src/style.css`

- [ ] **Step 1: Add drag state**

In `<script setup>`, add after `selectedId`:

```ts
const dragIndex = ref<number | null>(null);
const dropIndex = ref<number | null>(null);

function onDragStart(index: number, event: DragEvent) {
  dragIndex.value = index;
  event.dataTransfer?.setData('text/plain', String(index));
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
}

function onDragOver(index: number, event: DragEvent) {
  if (dragIndex.value === null) return;
  event.preventDefault();
  dropIndex.value = index;
}

function onDrop(index: number, event: DragEvent) {
  event.preventDefault();
  const from = dragIndex.value;
  dragIndex.value = null;
  dropIndex.value = null;
  if (from === null || from === index) return;
  const [block] = parsed.value.blocks.splice(from, 1);
  if (!block) return;
  parsed.value.blocks.splice(index, 0, block);
  selectedId.value = block.id;
  emitHtml();
}

function onDragEnd() {
  dragIndex.value = null;
  dropIndex.value = null;
}
```

- [ ] **Step 2: Bind drag handlers in template**

Replace the existing `.html-structure-item` button with:

```vue
<button
  v-for="(block, index) in parsed.blocks"
  :key="block.id"
  class="html-structure-item"
  :class="{ active: selectedBlock?.id === block.id, 'drop-target': dropIndex === index }"
  draggable="true"
  @click="selectedId = block.id"
  @dragstart="onDragStart(index, $event)"
  @dragover.prevent="onDragOver(index, $event)"
  @drop="onDrop(index, $event)"
  @dragend="onDragEnd"
>
  <span>{{ blockLabel(block) }}</span>
  <small>{{ index + 1 }}</small>
</button>
```

- [ ] **Step 3: Add drop-indicator styles**

Append to `src/style.css`:

```css
.html-structure-item.drop-target {
  box-shadow: inset 0 2px 0 0 #2563eb;
}
```

- [ ] **Step 4: Run build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Manual smoke check**

Run `npm run dev`, open an HTML document with at least three blocks, drag the third block above the first, save. Reload — the order persists. Stop dev server.

- [ ] **Step 6: Commit**

```bash
git add src/components/html/HtmlVisualEditor.vue src/style.css
git commit -m "feat: drag and drop reorder html visual blocks"
```

---

## Task 2.4: Inline Rich Text For Heading And Paragraph

**Files:**
- Create: `src/components/html/InlineRichText.vue`
- Create: `src/components/html/InlineRichText.test.ts`
- Modify: `src/components/html/HtmlVisualEditor.vue`
- Modify: `src/html/visualHtml.ts`

- [ ] **Step 1: Write the failing component test**

Create `src/components/html/InlineRichText.test.ts`:

```ts
// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import InlineRichText from './InlineRichText.vue';

describe('InlineRichText', () => {
  it('emits sanitized html on input', async () => {
    const wrapper = mount(InlineRichText, { props: { modelValue: 'Hello' } });
    const surface = wrapper.find('[contenteditable="true"]').element as HTMLElement;
    surface.innerHTML = 'Hello <strong>world</strong><script>alert(1)</script>';
    await wrapper.find('[contenteditable="true"]').trigger('input');

    const emissions = wrapper.emitted('update:modelValue') || [];
    const last = emissions.at(-1)?.[0] as string;
    expect(last).toContain('<strong>world</strong>');
    expect(last).not.toContain('<script');
  });

  it('keeps allow-listed anchors', async () => {
    const wrapper = mount(InlineRichText, { props: { modelValue: 'x' } });
    const surface = wrapper.find('[contenteditable="true"]').element as HTMLElement;
    surface.innerHTML = 'See <a href="https://example.com">site</a>';
    await wrapper.find('[contenteditable="true"]').trigger('input');
    const last = (wrapper.emitted('update:modelValue') || []).at(-1)?.[0] as string;
    expect(last).toContain('<a href="https://example.com">site</a>');
  });
});
```

If `@vue/test-utils` is not already a devDependency, add it:

```bash
npm install --save-dev @vue/test-utils
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/components/html/InlineRichText.test.ts`
Expected: FAIL — component does not exist.

- [ ] **Step 3: Add sanitizer helper to `visualHtml.ts`**

Append to `src/html/visualHtml.ts`:

```ts
const INLINE_ALLOWED = new Set(['strong', 'em', 'a', 'br']);

export function sanitizeInlineHtml(input: string): string {
  if (typeof DOMParser === 'undefined') return input.replace(/<[^>]+>/g, '');
  const doc = new DOMParser().parseFromString(`<div>${input}</div>`, 'text/html');
  const root = doc.body.firstElementChild as HTMLElement | null;
  if (!root) return '';
  const walk = (node: Element): string => {
    let out = '';
    node.childNodes.forEach((child) => {
      if (child.nodeType === 3) {
        out += escapeHtml(child.textContent || '');
      } else if (child.nodeType === 1) {
        const el = child as Element;
        const tag = el.tagName.toLowerCase();
        if (!INLINE_ALLOWED.has(tag)) {
          out += walk(el);
        } else if (tag === 'br') {
          out += '<br>';
        } else if (tag === 'a') {
          const href = el.getAttribute('href') || '#';
          out += `<a href="${escapeHtml(href)}">${walk(el)}</a>`;
        } else {
          out += `<${tag}>${walk(el)}</${tag}>`;
        }
      }
    });
    return out;
  };
  return walk(root);
}
```

- [ ] **Step 4: Implement `InlineRichText.vue`**

Create `src/components/html/InlineRichText.vue`:

```vue
<template>
  <div class="inline-rich-text">
    <div class="inline-rich-toolbar">
      <button type="button" @mousedown.prevent="exec('bold')">B</button>
      <button type="button" @mousedown.prevent="exec('italic')">I</button>
      <button type="button" @mousedown.prevent="promptLink">Link</button>
    </div>
    <div
      class="inline-rich-surface"
      contenteditable="true"
      :innerHTML="modelValue"
      @input="onInput"
      @blur="onInput"
    ></div>
  </div>
</template>

<script setup lang="ts">
import { sanitizeInlineHtml } from '../../html/visualHtml';

const props = defineProps<{ modelValue: string }>();
const emit = defineEmits<{ (event: 'update:modelValue', value: string): void }>();

function exec(command: 'bold' | 'italic') {
  document.execCommand(command);
}

function promptLink() {
  const href = window.prompt('Link URL');
  if (!href) return;
  document.execCommand('createLink', false, href);
}

function onInput(event: Event) {
  const raw = (event.target as HTMLElement).innerHTML;
  emit('update:modelValue', sanitizeInlineHtml(raw));
}
</script>
```

- [ ] **Step 5: Wire it into the editor**

In `src/components/html/HtmlVisualEditor.vue`, import the component near the top of `<script setup>`:

```ts
import InlineRichText from './InlineRichText.vue';
```

Replace the existing `Text` input branch with a conditional:

```vue
<label v-if="hasTextField(selectedBlock.type)">
  <span>{{ selectedBlock.type === 'image' ? 'Caption' : 'Text' }}</span>
  <InlineRichText
    v-if="selectedBlock.type === 'heading' || selectedBlock.type === 'paragraph'"
    :model-value="selectedBlock.text || ''"
    @update:model-value="updateSelected({ text: $event })"
  />
  <input
    v-else
    :value="selectedBlock.text || ''"
    @input="updateSelected({ text: ($event.target as HTMLInputElement).value })"
  />
</label>
```

- [ ] **Step 6: Update `blockToHtml` to emit sanitized text raw**

In `src/html/visualHtml.ts`, change the `heading` and `paragraph` branches:

```ts
if (block.type === 'heading') {
  const level = Math.min(Math.max(block.level || 2, 1), 6);
  const inline = sanitizeInlineHtml(block.text || '') || 'Heading';
  return `<h${level}${style}>${inline}</h${level}>`;
}

if (block.type === 'paragraph') {
  const inline = sanitizeInlineHtml(block.text || '') || 'Paragraph text';
  return `<p${style}>${inline}</p>`;
}
```

Note: the `text` field for these two block types is now stored as already-sanitized inline HTML. All other block types still use `escapeHtml(block.text)`.

- [ ] **Step 7: Add a parser test that preserves inline formatting**

Append to `src/html/visualHtml.test.ts`:

```ts
it('preserves bold and italic inside paragraph round-trip', () => {
  const source = '<p>Hi <strong>bold</strong> and <em>italic</em></p>';
  const parsed = parseVisualHtml(source);
  // For now textContent strips tags; we accept that initial parse drops formatting,
  // but the sanitizer keeps formatting when assigned directly from the editor.
  parsed.blocks[0].text = 'Hi <strong>bold</strong> and <em>italic</em>';
  const html = serializeVisualHtml(parsed);
  expect(html).toContain('<strong>bold</strong>');
  expect(html).toContain('<em>italic</em>');
});

it('drops disallowed tags via sanitizer', () => {
  const block = createBlock('paragraph', { text: 'ok<script>alert(1)</script>' });
  const html = serializeVisualHtml({
    doctype: '<!DOCTYPE html>', htmlAttrs: '', headHtml: '', bodyAttrs: '', blocks: [block],
  });
  expect(html).toContain('okalert(1)');
  expect(html).not.toContain('<script');
});
```

Update the `parseBlock` for heading and paragraph to also keep allow-listed inline tags by switching `textFrom(element)` to `sanitizeInlineHtml(element.innerHTML)`:

```ts
if (/^h[1-6]$/.test(tag)) {
  return createBlock('heading', {
    text: sanitizeInlineHtml(element.innerHTML),
    level: Number(tag.slice(1)),
    style,
  });
}

if (tag === 'p') {
  return createBlock('paragraph', { text: sanitizeInlineHtml(element.innerHTML), style });
}
```

- [ ] **Step 8: Run tests and build**

Run:
```bash
npm run test:unit
npm run build
```
Expected: all tests pass, build succeeds.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json src/components/html/InlineRichText.vue src/components/html/InlineRichText.test.ts src/components/html/HtmlVisualEditor.vue src/html/visualHtml.ts src/html/visualHtml.test.ts
git commit -m "feat: inline rich text for heading and paragraph"
```

---

## Task 2.5: Empty-State Hint

**Files:**
- Modify: `src/components/html/HtmlVisualEditor.vue`
- Modify: `src/style.css`

- [ ] **Step 1: Render placeholder when no blocks**

Replace the structure list block in the template with:

```vue
<div class="html-structure-list">
  <div v-if="parsed.blocks.length === 0" class="html-structure-empty">
    Add a block from the left to start editing the document.
  </div>
  <button
    v-for="(block, index) in parsed.blocks"
    :key="block.id"
    class="html-structure-item"
    :class="{ active: selectedBlock?.id === block.id, 'drop-target': dropIndex === index }"
    draggable="true"
    @click="selectedId = block.id"
    @dragstart="onDragStart(index, $event)"
    @dragover.prevent="onDragOver(index, $event)"
    @drop="onDrop(index, $event)"
    @dragend="onDragEnd"
  >
    <span>{{ blockLabel(block) }}</span>
    <small>{{ index + 1 }}</small>
  </button>
</div>
```

- [ ] **Step 2: Style the empty state**

Append to `src/style.css`:

```css
.html-structure-empty {
  padding: 24px;
  border: 1px dashed #cbd5f5;
  border-radius: 8px;
  color: #475569;
  font-size: 13px;
  text-align: center;
}
```

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/html/HtmlVisualEditor.vue src/style.css
git commit -m "feat: add empty state to html visual editor structure"
```

---

## Task 2.6: Phase 2 Verification

**Files:**
- Modify: `TODO.md`

- [ ] **Step 1: Full unit + build**

```bash
npm run test:unit
npm run build
```

Expected: both exit 0.

- [ ] **Step 2: Update TODO**

Append under `## 19. HTML documents`:

```markdown
- [x] HTML visual editor UX polish: drag-n-drop, undo/redo, inline-форматирование, пустое состояние
```

- [ ] **Step 3: Commit**

```bash
git add TODO.md
git commit -m "docs: mark html editor phase 2 ux complete"
```

---

# Phase 3 — Realtime Collaboration

> Every backend command runs from `canvas-server-back/`. Frontend commands run from `canvas-server-front/`. Each task identifies the repo in the file paths.

## Task 3.1: HtmlDocumentOperation Entity

**Files:**
- Create: `canvas-server-back/src/entities/html-document-operation.entity.ts`
- Modify: `canvas-server-back/src/entities/html-document.entity.ts`
- Modify: `canvas-server-back/src/html-documents/html-documents.module.ts`

- [ ] **Step 1: Add the entity**

Create `canvas-server-back/src/entities/html-document-operation.entity.ts`:

```ts
import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { HtmlDocument } from './html-document.entity';

@Entity()
@Unique(['documentId', 'revision'])
@Unique(['documentId', 'clientOpId'])
export class HtmlDocumentOperation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  documentId: string;

  @ManyToOne(() => HtmlDocument, { onDelete: 'CASCADE' })
  document: HtmlDocument;

  @Column()
  revision: number;

  @Column()
  clientOpId: string;

  @Column()
  userId: string;

  @Column({ type: 'text' })
  type: string;

  @Column({ type: 'text' })
  payload: string;

  @CreateDateColumn()
  createdAt: Date;
}
```

- [ ] **Step 2: Add `revision` column to HtmlDocument**

In `canvas-server-back/src/entities/html-document.entity.ts`, add after the `html` column:

```ts
@Column({ default: 0 })
revision: number;
```

- [ ] **Step 3: Register the entity in the module**

In `canvas-server-back/src/html-documents/html-documents.module.ts`, add `HtmlDocumentOperation` to the `TypeOrmModule.forFeature([...])` array and to imports:

```ts
import { HtmlDocumentOperation } from '../entities/html-document-operation.entity';
// ...
TypeOrmModule.forFeature([
  HtmlDocument,
  HtmlDocumentGroup,
  HtmlDocumentPermission,
  HtmlDocumentSettings,
  HtmlDocumentOperation,
  User,
]),
```

- [ ] **Step 4: Run a build to verify the schema syncs**

Run: `npm run build`
Expected: nest build succeeds (synchronize will create the table on next dev boot).

- [ ] **Step 5: Commit**

```bash
git add src/entities/html-document.entity.ts src/entities/html-document-operation.entity.ts src/html-documents/html-documents.module.ts
git commit -m "feat: add html document operation entity and revision"
```

---

## Task 3.2: HTML Op Types And Errors

**Files:**
- Create: `canvas-server-back/src/html-documents/html-ops.ts`
- Modify: `canvas-server-back/src/html-documents/html-documents.service.ts`

- [ ] **Step 1: Add op type catalog**

Create `canvas-server-back/src/html-documents/html-ops.ts`:

```ts
export type HtmlVisualBlock = {
  id: string;
  type: string;
  text?: string;
  body?: string;
  href?: string;
  src?: string;
  alt?: string;
  caption?: string;
  level?: number;
  items?: string[];
  ordered?: boolean;
  style?: string;
  rawHtml?: string;
};

export type HtmlOp =
  | { type: 'block-add';    block: HtmlVisualBlock; index: number }
  | { type: 'block-update'; id: string; changes: Partial<HtmlVisualBlock> }
  | { type: 'block-delete'; id: string }
  | { type: 'block-move';   id: string; toIndex: number }
  | { type: 'block-style';  id: string; property: string; value: string }
  | { type: 'shell-update'; head?: string; bodyAttrs?: string; htmlAttrs?: string };

export class HtmlRevisionMismatchError extends Error {
  constructor(public serverRevision: number) {
    super('HTML document revision mismatch');
  }
}

export class HtmlTargetMissingError extends Error {
  constructor(message = 'HTML target block missing') { super(message); }
}

export class HtmlInvalidOpError extends Error {
  constructor(message = 'Invalid HTML op') { super(message); }
}
```

- [ ] **Step 2: Import in service**

In `canvas-server-back/src/html-documents/html-documents.service.ts`, add to imports:

```ts
import {
  HtmlOp,
  HtmlInvalidOpError,
  HtmlRevisionMismatchError,
  HtmlTargetMissingError,
} from './html-ops';
```

- [ ] **Step 3: Commit**

```bash
git add src/html-documents/html-ops.ts src/html-documents/html-documents.service.ts
git commit -m "feat: define html op types and revision errors"
```

---

## Task 3.3: Apply-Operation Service Path

**Files:**
- Modify: `canvas-server-back/src/html-documents/html-documents.service.ts`
- Create: `canvas-server-back/src/html-documents/html-documents.service.spec.ts`

- [ ] **Step 1: Add per-document async lock**

Append inside the `HtmlDocumentsService` class (private members):

```ts
private documentLocks = new Map<string, Promise<void>>();

private async withDocumentLock<T>(documentId: string, fn: () => Promise<T>): Promise<T> {
  const previous = this.documentLocks.get(documentId) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  const chain = previous.then(() => current);
  this.documentLocks.set(documentId, chain);
  await previous;
  try {
    return await fn();
  } finally {
    release();
    if (this.documentLocks.get(documentId) === chain) this.documentLocks.delete(documentId);
  }
}
```

- [ ] **Step 2: Add `parseVisualModel` + `serializeVisualModel` helpers**

Append below `normalizeHtml`:

```ts
private parseVisualModel(html: string): { blocks: HtmlVisualBlock[]; shell: { head: string; bodyAttrs: string; htmlAttrs: string; doctype: string } } {
  // Backend mirrors front-end parser shape but uses node-html-parser to stay browser-free.
  // For the first iteration we only manipulate blocks if the document body already matches our flat structure.
  // Otherwise we round-trip the raw html unchanged and reject structural ops.
  return JSON.parse(/* see parser implementation below */) as any;
}
```

Use `node-html-parser` (already in `package.json` of the canvas backend; if missing, add it):

```bash
npm install node-html-parser
```

Replace the placeholder body with the real implementation:

```ts
private parseVisualModel(html: string) {
  const { parse } = require('node-html-parser');
  const root = parse(html || '<!DOCTYPE html><html><head></head><body></body></html>');
  const doc = root.querySelector('html') ?? root;
  const body = doc.querySelector('body');
  const head = doc.querySelector('head');
  const blocks: HtmlVisualBlock[] = [];
  if (body) {
    body.childNodes.forEach((node: any, index: number) => {
      if (node.nodeType !== 1) return;
      blocks.push({
        id: node.getAttribute('data-block-id') || `srv-${index}-${Date.now()}`,
        type: 'raw',
        rawHtml: node.outerHTML,
      });
    });
  }
  return {
    blocks,
    shell: {
      head: head?.innerHTML || '',
      bodyAttrs: body ? this.attrsToString(body) : '',
      htmlAttrs: this.attrsToString(doc),
      doctype: '<!DOCTYPE html>',
    },
  };
}

private serializeVisualModel(model: ReturnType<HtmlDocumentsService['parseVisualModel']>): string {
  const htmlAttrs = model.shell.htmlAttrs ? ` ${model.shell.htmlAttrs}` : '';
  const bodyAttrs = model.shell.bodyAttrs ? ` ${model.shell.bodyAttrs}` : '';
  const blocks = model.blocks.map((b) => b.rawHtml || '').join('\n');
  return `${model.shell.doctype}\n<html${htmlAttrs}>\n<head>${model.shell.head}</head>\n<body${bodyAttrs}>\n${blocks}\n</body>\n</html>`;
}

private attrsToString(node: any): string {
  if (!node || !node.attributes) return '';
  return Object.entries(node.attributes).map(([k, v]) => `${k}="${String(v).replace(/"/g, '&quot;')}"`).join(' ');
}
```

> **Note for the implementor:** the backend treats every body-level node as `raw` and operates only on `block-add` / `block-delete` / `block-move` / `shell-update`. `block-update` and `block-style` mutate the existing `rawHtml` by replacing the matched node string. The frontend is the source of truth for structured-block ergonomics; the backend is the source of truth for ordering. Keeping the backend dumb is intentional — we mirror the canvas approach of "data blob + log of ordered ops".

- [ ] **Step 3: Add `applyOpToModel`**

```ts
private applyOpToModel(model: ReturnType<HtmlDocumentsService['parseVisualModel']>, op: HtmlOp): void {
  if (op.type === 'block-add') {
    if (!op.block?.id) throw new HtmlInvalidOpError('block-add missing id');
    const index = Math.max(0, Math.min(op.index ?? model.blocks.length, model.blocks.length));
    model.blocks.splice(index, 0, op.block);
    return;
  }
  if (op.type === 'block-delete') {
    const index = model.blocks.findIndex((b) => b.id === op.id);
    if (index < 0) throw new HtmlTargetMissingError();
    model.blocks.splice(index, 1);
    return;
  }
  if (op.type === 'block-move') {
    const index = model.blocks.findIndex((b) => b.id === op.id);
    if (index < 0) throw new HtmlTargetMissingError();
    const target = Math.max(0, Math.min(op.toIndex, model.blocks.length - 1));
    const [block] = model.blocks.splice(index, 1);
    if (!block) throw new HtmlInvalidOpError();
    model.blocks.splice(target, 0, block);
    return;
  }
  if (op.type === 'block-update' || op.type === 'block-style') {
    const index = model.blocks.findIndex((b) => b.id === op.id);
    if (index < 0) throw new HtmlTargetMissingError();
    const next = { ...model.blocks[index] };
    if (op.type === 'block-update') Object.assign(next, op.changes || {});
    else next.style = mergeStyle(next.style || '', op.property, op.value);
    model.blocks[index] = next;
    return;
  }
  if (op.type === 'shell-update') {
    if (op.head !== undefined) model.shell.head = op.head;
    if (op.bodyAttrs !== undefined) model.shell.bodyAttrs = op.bodyAttrs;
    if (op.htmlAttrs !== undefined) model.shell.htmlAttrs = op.htmlAttrs;
    return;
  }
  throw new HtmlInvalidOpError();
}

function mergeStyle(current: string, property: string, value: string): string {
  const map = new Map<string, string>();
  current.split(';').forEach((part) => {
    const [k, ...rest] = part.split(':');
    if (!k || rest.length === 0) return;
    map.set(k.trim(), rest.join(':').trim());
  });
  if (value.trim()) map.set(property, value.trim()); else map.delete(property);
  return Array.from(map.entries()).map(([k, v]) => `${k}: ${v}`).join('; ');
}
```

Move `mergeStyle` to a top-level helper in the same file (outside the class).

- [ ] **Step 4: Add `applyOperation` and `applySnapshotUpdate` to the service**

Append public methods on `HtmlDocumentsService`:

```ts
async applyOperation(
  user: AuthUser,
  documentId: string,
  baseRevision: number,
  clientOpId: string,
  op: HtmlOp,
) {
  return this.withDocumentLock(documentId, async () => {
    const document = await this.requireWritableDocument(user, documentId);

    const existing = await this.operationRepo.findOne({ where: { documentId, clientOpId } });
    if (existing) {
      return { revision: existing.revision, op: JSON.parse(existing.payload) as HtmlOp };
    }

    if (document.revision !== baseRevision) {
      const canRebase = this.canRebaseHtmlOp(op);
      if (!canRebase) throw new HtmlRevisionMismatchError(document.revision);
    }

    const model = this.parseVisualModel(document.html);
    this.applyOpToModel(model, op);

    document.html = this.serializeVisualModel(model);
    document.revision += 1;
    await this.documentRepo.save(document);
    await this.operationRepo.save(
      this.operationRepo.create({
        documentId,
        revision: document.revision,
        clientOpId,
        userId: user.id,
        type: op.type,
        payload: JSON.stringify(op),
      }),
    );

    return { revision: document.revision, op };
  });
}

async applySnapshotUpdate(user: AuthUser, documentId: string, baseRevision: number, html: string) {
  return this.withDocumentLock(documentId, async () => {
    const document = await this.requireWritableDocument(user, documentId);
    if (document.revision !== baseRevision) throw new HtmlRevisionMismatchError(document.revision);
    document.html = this.normalizeHtml(html);
    document.revision += 1;
    await this.documentRepo.save(document);
    return { revision: document.revision, html: document.html };
  });
}

async resync(user: AuthUser | undefined, documentId: string) {
  const document = await this.documentRepo.findOne({ where: { id: documentId } });
  if (!document) throw new NotFoundException('Document not found');
  if (user) {
    const role = await this.resolveRole(document, user);
    if (!role) throw new ForbiddenException('No access');
  }
  return { document: this.sanitize(document), revision: document.revision };
}

private canRebaseHtmlOp(op: HtmlOp): boolean {
  return op.type === 'block-update' || op.type === 'block-style' || op.type === 'shell-update';
}

private async requireWritableDocument(user: AuthUser, documentId: string) {
  const document = await this.documentRepo.findOne({ where: { id: documentId } });
  if (!document) throw new NotFoundException('Document not found');
  const role = await this.resolveRole(document, user);
  if (role !== 'owner' && role !== PermissionRole.EDIT) throw new ForbiddenException('No edit access');
  return document;
}
```

Inject the new repo into the constructor:

```ts
constructor(
  // existing repos
  @InjectRepository(HtmlDocumentOperation) private operationRepo: Repository<HtmlDocumentOperation>,
) {}
```

- [ ] **Step 5: Write the failing service tests**

Create `canvas-server-back/src/html-documents/html-documents.service.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { HtmlDocumentsService } from './html-documents.service';
import { HtmlDocument } from '../entities/html-document.entity';
import { HtmlDocumentGroup } from '../entities/html-document-group.entity';
import { HtmlDocumentPermission } from '../entities/html-document-permission.entity';
import { HtmlDocumentSettings } from '../entities/html-document-settings.entity';
import { HtmlDocumentOperation } from '../entities/html-document-operation.entity';
import { User } from '../entities/user.entity';
import { HtmlRevisionMismatchError, HtmlTargetMissingError } from './html-ops';

function inMemoryRepo<T extends { id?: string }>() {
  const store = new Map<string, T>();
  return {
    findOne: async ({ where }: any) => Array.from(store.values()).find((x) => Object.entries(where).every(([k, v]) => (x as any)[k] === v)) as T | undefined,
    save: async (entity: T) => { (entity as any).id = (entity as any).id || Math.random().toString(36).slice(2); store.set((entity as any).id, entity); return entity; },
    create: (entity: T) => ({ ...entity }),
    find: async () => Array.from(store.values()),
    delete: async ({ id }: any) => { store.delete(id); },
    _store: store,
  };
}

describe('HtmlDocumentsService applyOperation', () => {
  let service: HtmlDocumentsService;
  let documentRepo: any;
  let operationRepo: any;

  beforeEach(async () => {
    documentRepo = inMemoryRepo();
    operationRepo = inMemoryRepo();
    const groupRepo = inMemoryRepo();
    const permRepo = inMemoryRepo();
    const settingsRepo = inMemoryRepo();
    const userRepo = inMemoryRepo();

    const moduleRef = await Test.createTestingModule({
      providers: [
        HtmlDocumentsService,
        { provide: getRepositoryToken(HtmlDocument), useValue: documentRepo },
        { provide: getRepositoryToken(HtmlDocumentGroup), useValue: groupRepo },
        { provide: getRepositoryToken(HtmlDocumentPermission), useValue: permRepo },
        { provide: getRepositoryToken(HtmlDocumentSettings), useValue: settingsRepo },
        { provide: getRepositoryToken(HtmlDocumentOperation), useValue: operationRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
      ],
    }).compile();

    service = moduleRef.get(HtmlDocumentsService);

    await documentRepo.save({
      id: 'doc-1',
      title: 't',
      html: '<!DOCTYPE html><html><head></head><body><p data-block-id="b1">Hi</p></body></html>',
      tags: '[]',
      checklistState: '{}',
      shared: false,
      visibility: 'private',
      allowPublicEdit: false,
      passwordAccessEnabled: false,
      passwordAccessRole: 'read',
      passwordAccessHash: null,
      ownerId: 'user-1',
      groupId: 'g-1',
      revision: 0,
    });
  });

  const user = { id: 'user-1' } as any;

  it('applies block-add and stores operation row', async () => {
    const result = await service.applyOperation(user, 'doc-1', 0, 'c1', {
      type: 'block-add',
      block: { id: 'b2', type: 'raw', rawHtml: '<p>New</p>' },
      index: 1,
    });
    expect(result.revision).toBe(1);
    const op = await operationRepo.findOne({ where: { documentId: 'doc-1', clientOpId: 'c1' } });
    expect(op).toBeDefined();
  });

  it('returns the stored op for a duplicate clientOpId', async () => {
    await service.applyOperation(user, 'doc-1', 0, 'c1', { type: 'block-add', block: { id: 'b2', type: 'raw', rawHtml: '<p>x</p>' }, index: 1 });
    const second = await service.applyOperation(user, 'doc-1', 99, 'c1', { type: 'block-delete', id: 'irrelevant' });
    expect(second.revision).toBe(1);
    expect(second.op).toMatchObject({ type: 'block-add' });
  });

  it('rejects block-delete with revision mismatch', async () => {
    await expect(service.applyOperation(user, 'doc-1', 5, 'c2', { type: 'block-delete', id: 'b1' })).rejects.toBeInstanceOf(HtmlRevisionMismatchError);
  });

  it('allows block-update to rebase on stale revision', async () => {
    await service.applyOperation(user, 'doc-1', 0, 'c1', { type: 'block-add', block: { id: 'b2', type: 'raw', rawHtml: '<p>x</p>' }, index: 1 });
    const result = await service.applyOperation(user, 'doc-1', 0, 'c2', { type: 'block-update', id: 'b1', changes: { rawHtml: '<p>updated</p>' } });
    expect(result.revision).toBe(2);
  });

  it('rejects block-update when target is missing', async () => {
    await expect(service.applyOperation(user, 'doc-1', 0, 'c1', { type: 'block-update', id: 'ghost', changes: {} })).rejects.toBeInstanceOf(HtmlTargetMissingError);
  });
});
```

> Note: `inMemoryRepo` is intentionally lightweight; tests do not exercise TypeORM constraints, only service logic. The `parseVisualModel` implementation uses `data-block-id` attributes to track block identity on the backend — the frontend must emit these in `rawHtml`. Add a small helper on the frontend that, before sending `block-add`, stamps `data-block-id` onto the root element of `rawHtml`.

- [ ] **Step 6: Run the spec**

Run: `npm test -- html-documents.service.spec`
(`npm test` in this repo is `jest`; the spec auto-discovers under `src/**/*.spec.ts`.)
Expected: all 5 tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/html-documents/html-documents.service.ts src/html-documents/html-documents.service.spec.ts src/html-documents/html-ops.ts package.json package-lock.json
git commit -m "feat: html document operation service with revision and rebase"
```

---

## Task 3.4: Socket Gateway

**Files:**
- Create: `canvas-server-back/src/html-documents/html-documents.gateway.ts`
- Modify: `canvas-server-back/src/html-documents/html-documents.module.ts`

- [ ] **Step 1: Implement the gateway**

Create `canvas-server-back/src/html-documents/html-documents.gateway.ts`:

```ts
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { ForbiddenException, Logger, NotFoundException } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { HtmlDocumentsService } from './html-documents.service';
import {
  HtmlInvalidOpError,
  HtmlOp,
  HtmlRevisionMismatchError,
  HtmlTargetMissingError,
} from './html-ops';
import { AuthSocket } from '../auth/auth.socket';

@WebSocketGateway({ cors: { origin: '*' } })
export class HtmlDocumentsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(HtmlDocumentsGateway.name);
  private readonly users = new Map<string, Map<string, { userId: string; name: string; email: string }>>();

  constructor(private readonly service: HtmlDocumentsService) {}

  handleConnection(_client: Socket) { /* shared auth middleware sets userId */ }

  handleDisconnect(client: AuthSocket) {
    if (client.htmlDocumentId) this.leave(client);
  }

  @SubscribeMessage('join-html')
  async handleJoin(@ConnectedSocket() client: AuthSocket, @MessageBody() data: { documentId: string }) {
    try {
      const resync = await this.service.resync(client.isGuest ? undefined : client.authUser, data.documentId);
      if (client.htmlDocumentId) this.leave(client);
      client.htmlDocumentId = data.documentId;
      await client.join(data.documentId);
      const users = this.users.get(data.documentId) ?? new Map();
      users.set(client.id, {
        userId: client.userId ?? `guest:${client.id}`,
        name: client.userName ?? 'Guest',
        email: client.userEmail ?? '',
      });
      this.users.set(data.documentId, users);
      client.to(data.documentId).emit('user-joined', { socketId: client.id, ...users.get(client.id) });
      client.emit('online-users', Array.from(users.entries()).map(([sid, u]) => ({ socketId: sid, ...u })));
      client.emit('html-room-state', { documentId: data.documentId, revision: resync.revision });
    } catch (error) {
      client.emit('error', { message: (error as Error).message });
    }
  }

  @SubscribeMessage('leave-html')
  handleLeave(@ConnectedSocket() client: AuthSocket) {
    this.leave(client);
  }

  @SubscribeMessage('html-op')
  async handleOp(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() data: { op: HtmlOp; baseRevision: number; clientOpId: string },
  ) {
    if (!client.htmlDocumentId || client.isGuest || !client.authUser) return;
    try {
      const result = await this.service.applyOperation(client.authUser, client.htmlDocumentId, data.baseRevision, data.clientOpId, data.op);
      client.emit('html-op-ack', { clientOpId: data.clientOpId, revision: result.revision, op: result.op });
      client.to(client.htmlDocumentId).emit('html-op', { clientOpId: data.clientOpId, revision: result.revision, userId: client.userId, op: result.op });
    } catch (error) {
      this.emitReject(client, 'html-op-reject', error, data.clientOpId);
    }
  }

  @SubscribeMessage('html-snapshot')
  async handleSnapshot(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() data: { html: string; baseRevision: number },
  ) {
    if (!client.htmlDocumentId || client.isGuest || !client.authUser) return;
    try {
      const result = await this.service.applySnapshotUpdate(client.authUser, client.htmlDocumentId, data.baseRevision, data.html);
      client.emit('html-snapshot-ack', { revision: result.revision });
      client.to(client.htmlDocumentId).emit('html-snapshot', { html: result.html, revision: result.revision, userId: client.userId });
    } catch (error) {
      this.emitReject(client, 'html-snapshot-reject', error);
    }
  }

  private leave(client: AuthSocket) {
    const id = client.htmlDocumentId;
    if (!id) return;
    client.leave(id);
    client.htmlDocumentId = undefined;
    const users = this.users.get(id);
    if (users) {
      users.delete(client.id);
      if (users.size === 0) this.users.delete(id);
    }
    this.server.to(id).emit('user-left', { socketId: client.id, userId: client.userId });
  }

  private emitReject(client: AuthSocket, event: string, error: unknown, clientOpId?: string) {
    const payload: Record<string, unknown> = {};
    if (clientOpId) payload.clientOpId = clientOpId;
    if (error instanceof HtmlRevisionMismatchError) {
      payload.reason = 'revision_mismatch';
      payload.serverRevision = error.serverRevision;
    } else if (error instanceof ForbiddenException) {
      payload.reason = 'forbidden';
    } else if (error instanceof HtmlTargetMissingError || error instanceof NotFoundException) {
      payload.reason = 'target_missing';
    } else if (error instanceof HtmlInvalidOpError) {
      payload.reason = 'invalid_op';
    } else {
      payload.reason = 'invalid_op';
      this.logger.warn(`html sync reject: ${(error as Error).message}`);
    }
    client.emit(event, payload);
  }
}
```

If `AuthSocket` does not declare `htmlDocumentId`, extend its type declaration (`canvas-server-back/src/auth/auth.socket.ts`) to add `htmlDocumentId?: string;`.

- [ ] **Step 2: Register the gateway**

In `canvas-server-back/src/html-documents/html-documents.module.ts`, add to `providers`:

```ts
import { HtmlDocumentsGateway } from './html-documents.gateway';
// ...
providers: [HtmlDocumentsService, HtmlDocumentsGateway],
```

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/html-documents/html-documents.gateway.ts src/html-documents/html-documents.module.ts src/auth/auth.socket.ts
git commit -m "feat: html documents websocket gateway"
```

---

## Task 3.5: Frontend Socket Composable

**Files:**
- Create: `canvas-server-front/src/composables/useHtmlDocumentSocket.ts`

- [ ] **Step 1: Implement composable**

Create `canvas-server-front/src/composables/useHtmlDocumentSocket.ts`:

```ts
import { onBeforeUnmount, ref } from 'vue';
import { io, Socket } from 'socket.io-client';
import { getToken } from '../api/client';

type HtmlOp = Record<string, unknown> & { type: string };

export type HtmlSocketCallbacks = {
  onRoomState?: (data: { revision: number }) => void;
  onAck?: (data: { clientOpId: string; revision: number; op: HtmlOp }) => void;
  onReject?: (data: { clientOpId?: string; reason: string; serverRevision?: number }) => void;
  onOp?: (data: { clientOpId: string; revision: number; op: HtmlOp; userId: string }) => void;
  onSnapshot?: (data: { html: string; revision: number; userId: string }) => void;
  onPresence?: (users: { socketId: string; userId: string; name: string }[]) => void;
};

export function useHtmlDocumentSocket() {
  const socket = ref<Socket | null>(null);
  const connected = ref(false);

  function connect(documentId: string, callbacks: HtmlSocketCallbacks = {}) {
    if (socket.value) return;
    const s = io(import.meta.env.VITE_API_URL || window.location.origin, { auth: { token: getToken() } });
    socket.value = s;

    s.on('connect', () => { connected.value = true; s.emit('join-html', { documentId }); });
    s.on('disconnect', () => { connected.value = false; });
    s.on('html-room-state', (data: any) => callbacks.onRoomState?.(data));
    s.on('html-op-ack', (data: any) => callbacks.onAck?.(data));
    s.on('html-op-reject', (data: any) => callbacks.onReject?.(data));
    s.on('html-op', (data: any) => callbacks.onOp?.(data));
    s.on('html-snapshot', (data: any) => callbacks.onSnapshot?.(data));
    s.on('online-users', (users: any) => callbacks.onPresence?.(users));
  }

  function sendOp(op: HtmlOp, baseRevision: number, clientOpId: string) {
    socket.value?.emit('html-op', { op, baseRevision, clientOpId });
  }

  function sendSnapshot(html: string, baseRevision: number) {
    socket.value?.emit('html-snapshot', { html, baseRevision });
  }

  function disconnect() {
    socket.value?.emit('leave-html');
    socket.value?.disconnect();
    socket.value = null;
    connected.value = false;
  }

  onBeforeUnmount(disconnect);

  return { connect, disconnect, sendOp, sendSnapshot, connected };
}
```

- [ ] **Step 2: Run build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/composables/useHtmlDocumentSocket.ts
git commit -m "feat: add html document socket composable"
```

---

## Task 3.6: Retry Policy For Rejected Ops

**Files:**
- Create: `canvas-server-front/src/html/htmlSyncRetry.ts`
- Create: `canvas-server-front/src/html/htmlSyncRetry.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/html/htmlSyncRetry.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { isRetryableHtmlOp, shouldRetryHtmlReject } from './htmlSyncRetry';

describe('htmlSyncRetry', () => {
  it('marks block-update and block-style as retryable', () => {
    expect(isRetryableHtmlOp({ type: 'block-update', id: 'b1', changes: {} })).toBe(true);
    expect(isRetryableHtmlOp({ type: 'block-style', id: 'b1', property: 'color', value: 'red' })).toBe(true);
  });

  it('does not retry block-add or block-delete', () => {
    expect(isRetryableHtmlOp({ type: 'block-add', block: { id: 'b1', type: 'raw' }, index: 0 })).toBe(false);
    expect(isRetryableHtmlOp({ type: 'block-delete', id: 'b1' })).toBe(false);
  });

  it('retries on revision_mismatch once when retryable', () => {
    expect(shouldRetryHtmlReject(
      { reason: 'revision_mismatch', serverRevision: 4 },
      { op: { type: 'block-update', id: 'b1', changes: {} }, retryCount: 0 },
    )).toBe(true);

    expect(shouldRetryHtmlReject(
      { reason: 'revision_mismatch', serverRevision: 4 },
      { op: { type: 'block-update', id: 'b1', changes: {} }, retryCount: 1 },
    )).toBe(false);
  });

  it('does not retry on target_missing', () => {
    expect(shouldRetryHtmlReject(
      { reason: 'target_missing' },
      { op: { type: 'block-update', id: 'ghost', changes: {} }, retryCount: 0 },
    )).toBe(false);
  });

  it('does not retry on forbidden or invalid_op', () => {
    expect(shouldRetryHtmlReject(
      { reason: 'forbidden' },
      { op: { type: 'block-update', id: 'b1', changes: {} }, retryCount: 0 },
    )).toBe(false);
    expect(shouldRetryHtmlReject(
      { reason: 'invalid_op' },
      { op: { type: 'block-update', id: 'b1', changes: {} }, retryCount: 0 },
    )).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- src/html/htmlSyncRetry.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the module**

Create `src/html/htmlSyncRetry.ts`:

```ts
export type HtmlOp = { type: string } & Record<string, unknown>;
export type PendingHtmlOp = { op: HtmlOp; retryCount: number };
export type HtmlSyncReject = { reason: string; serverRevision?: number };

const RETRYABLE = new Set(['block-update', 'block-style', 'shell-update']);

export function isRetryableHtmlOp(op: HtmlOp): boolean {
  return RETRYABLE.has(op.type);
}

export function shouldRetryHtmlReject(reject: HtmlSyncReject, pending: PendingHtmlOp): boolean {
  if (reject.reason !== 'revision_mismatch') return false;
  if (!isRetryableHtmlOp(pending.op)) return false;
  if (pending.retryCount >= 1) return false;
  if (reject.serverRevision === undefined) return false;
  return true;
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm run test:unit -- src/html/htmlSyncRetry.test.ts`
Expected: all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/html/htmlSyncRetry.ts src/html/htmlSyncRetry.test.ts
git commit -m "feat: html sync retry policy"
```

---

## Task 3.7: Move syncEvents Into common/

**Files:**
- Move: `canvas-server-front/src/canvas/syncEvents.ts` → `canvas-server-front/src/common/syncEvents.ts`
- Modify: `canvas-server-front/src/canvas/syncEvents.test.ts` (import path)
- Modify: every importer of `../canvas/syncEvents` to use the new path

- [ ] **Step 1: Find current importers**

Run: `git grep -l "canvas/syncEvents"`
Note the list — typically `src/components/canvas/*.vue`, `src/composables/useCanvasSocket.ts`, and the test file.

- [ ] **Step 2: Move the file and update imports**

```bash
git mv src/canvas/syncEvents.ts src/common/syncEvents.ts
git mv src/canvas/syncEvents.test.ts src/common/syncEvents.test.ts
```

Edit each importer found in Step 1 to use `../common/syncEvents` (or the right relative path).

- [ ] **Step 3: Run tests and build**

```bash
npm run test:unit
npm run build
```

Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add -A src/canvas src/common src/components src/composables
git commit -m "refactor: move syncEvents store into common"
```

---

## Task 3.8: Wire HtmlVisualEditor To Send Ops

**Files:**
- Modify: `canvas-server-front/src/components/html/HtmlVisualEditor.vue`
- Modify: `canvas-server-front/src/views/HtmlDocumentView.vue`

- [ ] **Step 1: Extend editor props**

Replace the existing `defineProps` line in `HtmlVisualEditor.vue` with:

```ts
const props = defineProps<{
  modelValue: string;
  revision?: number;
  pushOp?: (op: any, baseRevision: number, clientOpId: string) => void;
}>();
```

If `pushOp` is undefined, the editor keeps working in standalone mode (Phase 1 behaviour).

- [ ] **Step 2: Add op emission helpers**

Add inside `<script setup>`:

```ts
function newClientOpId() {
  return `cli_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function commitOp(op: any) {
  // Apply locally
  applyOpLocal(op);
  // Emit serialized html for legacy listeners
  emitHtml();
  // Send op upstream if collab is wired
  if (props.pushOp && typeof props.revision === 'number') {
    props.pushOp(op, props.revision, newClientOpId());
  }
}

function applyOpLocal(op: any) {
  if (op.type === 'block-add') parsed.value.blocks.splice(op.index, 0, op.block);
  else if (op.type === 'block-delete') {
    const i = parsed.value.blocks.findIndex((b) => b.id === op.id);
    if (i >= 0) parsed.value.blocks.splice(i, 1);
  } else if (op.type === 'block-move') {
    const i = parsed.value.blocks.findIndex((b) => b.id === op.id);
    if (i >= 0) {
      const [block] = parsed.value.blocks.splice(i, 1);
      if (block) parsed.value.blocks.splice(op.toIndex, 0, block);
    }
  } else if (op.type === 'block-update' || op.type === 'block-style') {
    const i = parsed.value.blocks.findIndex((b) => b.id === op.id);
    if (i < 0) return;
    const next = { ...parsed.value.blocks[i] };
    if (op.type === 'block-update') Object.assign(next, op.changes);
    else setBlockStyleProperty(next, op.property, op.value);
    parsed.value.blocks[i] = next;
  }
}
```

- [ ] **Step 3: Replace direct mutations with `commitOp`**

Rewrite `addBlock`, `updateSelected`, `moveSelected`, `duplicateSelected`, `deleteSelected`, `updateStyle`, `onDrop` to call `commitOp` instead of mutating + `emitHtml`. Example:

```ts
function addBlock(type: VisualBlockType) {
  const block = createBlock(type, defaultBlockInput(type));
  commitOp({ type: 'block-add', block, index: parsed.value.blocks.length });
  selectedId.value = block.id;
}

function updateSelected(patch: Partial<VisualBlock>) {
  if (!selectedBlock.value) return;
  commitOp({ type: 'block-update', id: selectedBlock.value.id, changes: patch });
}

function moveSelected(direction: number) {
  const index = selectedIndex.value;
  const target = index + direction;
  if (index < 0 || target < 0 || target >= parsed.value.blocks.length) return;
  commitOp({ type: 'block-move', id: parsed.value.blocks[index].id, toIndex: target });
}

function duplicateSelected() {
  if (!selectedBlock.value) return;
  const copy = duplicateBlock(selectedBlock.value);
  commitOp({ type: 'block-add', block: copy, index: selectedIndex.value + 1 });
  selectedId.value = copy.id;
}

function deleteSelected() {
  if (!selectedBlock.value) return;
  const id = selectedBlock.value.id;
  commitOp({ type: 'block-delete', id });
}

function updateStyle(property: string, value: string) {
  if (!selectedBlock.value) return;
  commitOp({ type: 'block-style', id: selectedBlock.value.id, property, value });
}
```

Update `onDrop` to call `commitOp({ type: 'block-move', id: block.id, toIndex: index })` instead of splicing manually.

- [ ] **Step 4: Hook the view to the socket composable**

Modify `src/views/HtmlDocumentView.vue`:

```ts
import { useHtmlDocumentSocket } from '../composables/useHtmlDocumentSocket';
// inside setup()
const revision = ref(0);
const socket = useHtmlDocumentSocket();
const pendingOps = new Map<string, any>();

function pushOp(op: any, baseRevision: number, clientOpId: string) {
  pendingOps.set(clientOpId, { op, retryCount: 0 });
  socket.sendOp(op, baseRevision, clientOpId);
}

function pushSnapshot() {
  if (role.value === 'read') return;
  socket.sendSnapshot(html.value, revision.value);
}

socket.connect(id, {
  onRoomState: ({ revision: r }) => { revision.value = r; },
  onAck: ({ clientOpId, revision: r }) => { pendingOps.delete(clientOpId); revision.value = r; },
  onReject: ({ clientOpId, reason, serverRevision }) => {
    const pending = clientOpId ? pendingOps.get(clientOpId) : undefined;
    if (pending && reason === 'revision_mismatch' && serverRevision !== undefined) {
      // simple resync: refetch via REST then drop pending
      void load();
    } else {
      showToast(`HTML sync rejected: ${reason}`, 'error');
    }
    if (clientOpId) pendingOps.delete(clientOpId);
  },
  onOp: ({ clientOpId, op, revision: r }) => {
    if (pendingOps.has(clientOpId)) return;
    // Apply remote op locally by reparsing from html — simplest correct path for the first slice
    void load();
    revision.value = r;
  },
  onSnapshot: ({ html: nextHtml, revision: r }) => {
    html.value = nextHtml;
    savedSnapshot.value = { title: title.value, html: nextHtml };
    revision.value = r;
  },
});
```

Pass props to the editor:

```vue
<HtmlVisualEditor
  v-if="viewMode === 'visual' && role !== 'read'"
  v-model="html"
  :revision="revision"
  :push-op="pushOp"
/>
```

Wire `pushSnapshot` into the existing debounced auto-save (search the file for `htmlDocuments.update` calls — replace those with `pushSnapshot()` while keeping the REST fallback for visibility/settings updates).

- [ ] **Step 5: Run build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/components/html/HtmlVisualEditor.vue src/views/HtmlDocumentView.vue
git commit -m "feat: emit html ops over websocket from visual editor"
```

---

## Task 3.9: Two-Client E2E Smoke Test

**Files:**
- Create: `canvas-server-front/tests/htmlRealtime.test.ts`

- [ ] **Step 1: Set up a Playwright (or Vitest browser) e2e**

If a Playwright config does not exist yet, follow the convention of the existing `tests/canvasRealtime.test.ts` (search for it; if missing, fall back to Vitest + jsdom with two emulated Socket.IO clients).

Create `canvas-server-front/tests/htmlRealtime.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { io } from 'socket.io-client';

const BASE = process.env.E2E_BACKEND_URL;
const DOC = process.env.E2E_HTML_DOCUMENT_ID;
const TOKEN_A = process.env.E2E_TOKEN_A;
const TOKEN_B = process.env.E2E_TOKEN_B;

describe.skipIf(!BASE || !DOC || !TOKEN_A || !TOKEN_B)('html realtime', () => {
  it('propagates block-add between two clients', async () => {
    const a = io(BASE!, { auth: { token: TOKEN_A } });
    const b = io(BASE!, { auth: { token: TOKEN_B } });

    const receivedOnB = new Promise<any>((resolve) => b.on('html-op', resolve));

    await Promise.all([
      new Promise<void>((r) => a.on('connect', () => r())),
      new Promise<void>((r) => b.on('connect', () => r())),
    ]);

    a.emit('join-html', { documentId: DOC });
    b.emit('join-html', { documentId: DOC });
    await new Promise((r) => setTimeout(r, 200));

    const baseRevision = await new Promise<number>((resolve) => {
      a.once('html-room-state', (msg) => resolve(msg.revision));
    });

    a.emit('html-op', {
      op: { type: 'block-add', block: { id: 'b-test', type: 'raw', rawHtml: '<p>E2E</p>' }, index: 0 },
      baseRevision,
      clientOpId: 'e2e-1',
    });

    const message = await receivedOnB;
    expect(message.op.type).toBe('block-add');

    a.disconnect();
    b.disconnect();
  });
});
```

- [ ] **Step 2: Document how to run**

Add a `## Realtime e2e` section to `canvas-server-front/README.md` (or to the existing test docs) explaining required env vars:

```
E2E_BACKEND_URL=http://localhost:3000
E2E_HTML_DOCUMENT_ID=<id of a document the two test users can edit>
E2E_TOKEN_A=<jwt for user A>
E2E_TOKEN_B=<jwt for user B>
```

- [ ] **Step 3: Run the suite skipped (default CI behaviour)**

Run: `npm run test:unit -- tests/htmlRealtime.test.ts`
Expected: test is skipped because env vars are missing.

- [ ] **Step 4: Commit**

```bash
git add tests/htmlRealtime.test.ts README.md
git commit -m "test: add html realtime two-client smoke"
```

---

## Task 3.10: Phase 3 Verification

**Files:**
- Modify: `canvas-server-front/TODO.md`

- [ ] **Step 1: Backend + frontend test runs**

From `canvas-server-back/`:
```bash
npm test
npm run build
```

From `canvas-server-front/`:
```bash
npm run test:unit
npm run build
```

Expected: all exit 0.

- [ ] **Step 2: Manual two-tab check**

Open the same HTML document in two browser tabs as two editor-eligible users (or one user in two tabs). Drag a block in tab A — the block appears in tab B within ~200 ms. Edit text in tab A — tab B updates after the next op flush.

- [ ] **Step 3: Mark TODO**

Update `TODO.md` (line ~207):

```markdown
- [x] Перенести модель collaborative editing на HTML-документы: `revision`, HTML operation log, server-side ordering, reject/resync и realtime broadcast по аналогии с canvas
```

- [ ] **Step 4: Commit**

```bash
git add TODO.md
git commit -m "docs: mark html documents realtime collab complete"
```

---

## Self-Review

**Spec coverage**
- Phase 1 bugs 1–5 from the spec map to Tasks 1.1–1.4 (Task 1.5 is verification). ✔
- Phase 2 UX items (drag-n-drop, undo/redo, inline rich text, empty state, image caption) map to Tasks 2.1–2.5. ✔
- Phase 3 requirements (entity, op catalog, service apply, gateway, frontend socket, retry, e2e) map to Tasks 3.1–3.9. ✔

**Placeholder scan**
- No "TBD", "implement later", or "similar to". Every code block contains actual code or named files. ✔
- Service `parseVisualModel` implementation is concrete (uses `node-html-parser`) — not deferred. ✔

**Type consistency**
- Frontend `HtmlOp` and backend `HtmlOp` use the same string discriminants (`block-add`, `block-update`, `block-delete`, `block-move`, `block-style`, `shell-update`). ✔
- `createHistory<T>` exposes `record`, `undo`, `redo`, `reset` — used identically in Task 2.2. ✔
- Reject `reason` strings (`revision_mismatch`, `target_missing`, `forbidden`, `invalid_op`) match between gateway and `htmlSyncRetry`. ✔

**Risks called out in spec are mitigated by tasks**
- Allow-list sanitizer: covered by Task 2.4 Step 3 + test in Step 1. ✔
- Op storms during typing: not yet debounced — *gap*. Add to Task 3.8: wrap `InlineRichText` `update:modelValue` emissions in a 250 ms debounce before producing `block-update`. (Implementor: add this debounce in `commitOp` for `block-update` ops on `heading`/`paragraph`.)
- Backwards-compatible `revision = 0`: Task 3.1 sets the column default. ✔
