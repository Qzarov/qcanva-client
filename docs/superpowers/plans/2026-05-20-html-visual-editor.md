# HTML Visual Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a usable visual HTML editor with structured blocks, selected-block properties, style controls, and safe HTML shell preservation.

**Architecture:** Extract HTML parsing/serialization into `src/html/visualHtml.ts` and keep Vue interactions in a dedicated `src/components/html/HtmlVisualEditor.vue` component. `HtmlDocumentView.vue` remains the document container for loading, access, save, share, and mode switching.

**Tech Stack:** Vue 3 Composition API, TypeScript, Vite, native DOMParser/XMLSerializer, existing API client and toast system.

---

## File Structure

- Create `src/html/visualHtml.ts`: types, parser, serializer, block creation, style mutation helpers.
- Create `src/html/visualHtml.test.ts`: parser/serializer unit tests using Node test runner compatible code compiled by TypeScript.
- Create `src/components/html/HtmlVisualEditor.vue`: visual editor UI, block list, block fields, style controls, preview iframe.
- Modify `src/views/HtmlDocumentView.vue`: delegate Visual mode to `HtmlVisualEditor`, keep Source/Split/Preview/save.
- Modify `src/style.css`: visual editor layout and controls.
- Modify `package.json`: add a focused frontend unit test command if no test command exists.

## Task 1: HTML Parser And Serializer

**Files:**
- Create: `src/html/visualHtml.ts`
- Create: `src/html/visualHtml.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing parser tests**

Create `src/html/visualHtml.test.ts` with tests that import:

```ts
import { describe, expect, it } from 'vitest';
import {
  createBlock,
  parseVisualHtml,
  serializeVisualHtml,
  setBlockStyleProperty,
} from './visualHtml';

describe('visualHtml', () => {
  it('preserves head styles while rebuilding body blocks', () => {
    const parsed = parseVisualHtml(`<!DOCTYPE html><html><head><style>.x{color:red}</style></head><body class="page"><h1>Hello</h1></body></html>`);
    parsed.blocks = [createBlock('paragraph', { text: 'Updated' })];

    const html = serializeVisualHtml(parsed);

    expect(html).toContain('<style>.x{color:red}</style>');
    expect(html).toContain('<body class="page">');
    expect(html).toContain('<p>Updated</p>');
    expect(html).not.toContain('<h1>Hello</h1>');
  });

  it('parses known body children into editable blocks', () => {
    const parsed = parseVisualHtml(`<main><h2>Title</h2><p>Copy</p><a class="button" href="/go">Go</a><ul><li>A</li><li>B</li></ul></main>`);

    expect(parsed.blocks.map((block) => block.type)).toEqual(['heading', 'paragraph', 'button', 'list']);
    expect(parsed.blocks[0]).toMatchObject({ text: 'Title', level: 2 });
    expect(parsed.blocks[2]).toMatchObject({ text: 'Go', href: '/go' });
    expect(parsed.blocks[3]).toMatchObject({ items: ['A', 'B'], ordered: false });
  });

  it('preserves unsupported markup as raw blocks', () => {
    const parsed = parseVisualHtml(`<main><video src="movie.mp4"></video></main>`);

    expect(parsed.blocks).toHaveLength(1);
    expect(parsed.blocks[0]).toMatchObject({ type: 'raw' });
    expect(serializeVisualHtml(parsed)).toContain('<video src="movie.mp4"></video>');
  });

  it('updates one inline style property without deleting others', () => {
    const block = createBlock('paragraph', { text: 'Copy', style: 'color: red; padding: 8px;' });

    setBlockStyleProperty(block, 'padding', '16px');

    expect(block.style).toContain('color: red');
    expect(block.style).toContain('padding: 16px');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/html/visualHtml.test.ts`

Expected: command fails because `test:unit`, `vitest`, or `src/html/visualHtml.ts` is not present.

- [ ] **Step 3: Add minimal test tooling**

If `vitest` is not installed, add it as a dev dependency and add this script to `package.json`:

```json
"test:unit": "vitest run"
```

- [ ] **Step 4: Implement parser/serializer**

Create `src/html/visualHtml.ts` with exported types and functions:

```ts
export type VisualBlockType = 'heading' | 'paragraph' | 'section' | 'card' | 'list' | 'button' | 'link' | 'image' | 'raw';
export type VisualBlock = {
  id: string;
  type: VisualBlockType;
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
export type ParsedVisualHtml = {
  doctype: string;
  htmlAttrs: string;
  headHtml: string;
  bodyAttrs: string;
  blocks: VisualBlock[];
};
```

Implement:

- `parseVisualHtml(source: string): ParsedVisualHtml`
- `serializeVisualHtml(parsed: ParsedVisualHtml): string`
- `createBlock(type: VisualBlockType, input?: Partial<VisualBlock>): VisualBlock`
- `duplicateBlock(block: VisualBlock): VisualBlock`
- `setBlockStyleProperty(block: VisualBlock, property: string, value: string): void`

- [ ] **Step 5: Run tests to verify green**

Run: `npm run test:unit -- src/html/visualHtml.test.ts`

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/html/visualHtml.ts src/html/visualHtml.test.ts
git commit -m "feat: add visual html model"
```

## Task 2: Visual Editor Component

**Files:**
- Create: `src/components/html/HtmlVisualEditor.vue`
- Modify: `src/style.css`

- [ ] **Step 1: Create component around existing model**

`HtmlVisualEditor.vue` accepts `modelValue: string` and emits `update:modelValue`. It parses `modelValue`, renders block controls, emits serialized HTML after every edit.

- [ ] **Step 2: Implement block operations**

Add controls for add, select, duplicate, move up/down, and delete. Use `createBlock`, `duplicateBlock`, and `serializeVisualHtml`.

- [ ] **Step 3: Implement content fields**

Render fields by block type:

- heading: level and text.
- paragraph/section: text/body.
- card: text and body.
- list: ordered toggle and one item per line textarea.
- link/button: text and href.
- image: src, alt, caption.
- raw: read-only raw HTML textarea for visibility.

- [ ] **Step 4: Implement style fields**

Add property controls for `padding`, `margin`, `font-size`, `font-weight`, `color`, `text-align`, `background`, `border-color`, `border-radius`, and `max-width`. Apply through `setBlockStyleProperty`.

- [ ] **Step 5: Style layout**

Add CSS for a three-column visual editor that collapses on mobile:

- left block library.
- middle structure/properties.
- right preview iframe.

- [ ] **Step 6: Run build**

Run: `npm run build`

Expected: Vue typecheck and Vite build pass.

- [ ] **Step 7: Commit**

```bash
git add src/components/html/HtmlVisualEditor.vue src/style.css
git commit -m "feat: add html visual editor component"
```

## Task 3: Integrate Into HTML Document View

**Files:**
- Modify: `src/views/HtmlDocumentView.vue`

- [ ] **Step 1: Replace inline visual mode**

Remove the current local `visualBlocks`, template buttons, DOM edit mode, and source-rebuild helpers from `HtmlDocumentView.vue`. Render:

```vue
<HtmlVisualEditor v-if="viewMode === 'visual' && role !== 'read'" v-model="html" />
```

- [ ] **Step 2: Keep source, split, preview, and save behavior**

Retain existing save state, `Ctrl+S`, preview iframe, split mode, source textarea, access controls, share panel, checklist bridge, and toasts.

- [ ] **Step 3: Run build**

Run: `npm run build`

Expected: Vue typecheck and Vite build pass.

- [ ] **Step 4: Commit**

```bash
git add src/views/HtmlDocumentView.vue
git commit -m "feat: wire html visual editor"
```

## Task 4: Final Verification

**Files:**
- Modify: `TODO.md`

- [ ] **Step 1: Update TODO status**

Change the HTML editor TODO from unchecked to checked only if Task 1-3 are implemented and verified.

- [ ] **Step 2: Run full frontend checks**

Run:

```bash
npm run test:unit
npm run build
```

Expected: both commands exit 0.

- [ ] **Step 3: Commit TODO update**

```bash
git add TODO.md
git commit -m "docs: mark html visual editor slice"
```

## Self-Review

- Spec coverage: parser/serializer, visual block editing, selected block properties, shell preservation, Source/Split/Preview retention, and tests are covered.
- Scope intentionally excludes realtime collaboration and HTML op log.
- No placeholders remain; each task has concrete file paths and verification commands.
