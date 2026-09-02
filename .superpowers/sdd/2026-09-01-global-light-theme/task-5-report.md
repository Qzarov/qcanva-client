# Task 5 Report — Canvas and Document Chrome

Date: 2026-09-02

Base commit: `1e107d0` (`style(theme): fix remaining task 4 chrome literals`)

Implementation commit: `style(theme): migrate canvas and document chrome` (repository HEAD)

## Inherited work and audit

The task began with uncommitted changes in `src/components/CanvasLoader.vue`, `src/style.css`, `src/views/CanvasView.vue`, and `src/views/PluginsView.vue`. Every hunk was reviewed before continuation. The inherited work correctly replaces application chrome with semantic tokens while retaining model and authored-content literals, so no partial file was discarded or reverted.

Corrections required: none. The completion work was validation and scope/boundary review; the centralized stylesheet already covered the HTML editor, inline rich-text editor controls, HTML settings, admin table, document access gates, shared workspace chrome, text document shell, and plugin panels without requiring markup changes in every listed component.

## Scope delivered

- Canvas grid, node shell, groups, selection/resize chrome, minimap, edge controls, context/add menus, embeds, loading/error affordances, toolbars, and sync/resource panels now resolve through semantic UI tokens.
- HTML and text document shell, source/history/visual-editor controls, settings and admin controls, access/password gates, shared dialogs/popovers, and plugin panels now resolve through semantic UI tokens.
- Added semantic success/warning/info/danger soft-status tokens for both themes and used them for status and destructive chrome.
- `CanvasView.vue` uses semantic status/error SVG colors; `PluginsView.vue` uses semantic scoped chrome colors.

## Theme boundary audit

The plan's proposed negative source-string test was intentionally not created, per the controller ruling. Existing behavior suites plus a literal-by-literal audit are the boundary guard.

The following remaining literals were intentionally fixed:

- Canvas node/drawing/font/edge palettes, callout/resource-type accents, and D&D character-sheet colors are stored or content-facing palettes.
- The HTML preview/document iframe outer surface stays white to avoid altering authored HTML (including transparent documents); no theme CSS is injected into `srcdoc` or exported HTML.
- TipTap `.ProseMirror` text, image-border, and link colors remain content colors.
- The sample HTML style snippet remains authored/exported content.
- Resource-type icons, user-avatar contrast, and legacy token definitions are not neutral application-chrome literals.

Verified no forbidden theme propagation with:

```bash
rg -n "node\.style\.fill\s*=\s*effectiveTheme|documentHtml\s*=\s*applyTheme|data-theme" \
  src/components/CanvasLoader.vue src/views/HtmlDocumentView.vue src/views/TextDocumentView.vue
```

Result: no matches. Canvas content model values and HTML document/export content are not rewritten for a theme.

Hardcoded-literal audit command:

```bash
rg -n "#[0-9A-Fa-f]{3,8}|rgba?\(" \
  src/style.css src/views/CanvasView.vue src/components/CanvasLoader.vue \
  src/views/HtmlDocumentView.vue src/views/TextDocumentView.vue \
  src/views/HtmlSettingsView.vue src/views/AdminView.vue src/views/PluginsView.vue
```

Result: remaining entries fall only in the intentional categories above or semantic-token definitions. A diff-only audit found newly introduced literals solely in the semantic status-token definitions.

## Files committed

- `src/style.css`
- `src/components/CanvasLoader.vue`
- `src/views/CanvasView.vue`
- `src/views/PluginsView.vue`

No markup change was necessary in `HtmlVisualEditor.vue`, `InlineRichText.vue`, `HtmlDocumentView.vue`, `TextDocumentView.vue`, `HtmlSettingsView.vue`, or `AdminView.vue`: their application chrome is defined in the migrated shared stylesheet. Their behavior and content boundaries remain intact.

## Verification

```bash
npm run test:unit -- src/components/CanvasLoader.addMenu.test.ts src/components/CanvasLoader.board-preview.test.ts src/components/CanvasLoader.document.test.ts src/components/CanvasLoader.touch.test.ts src/views/CanvasView.newDocument.test.ts
```

Result: 5 files, 33 tests passed.

```bash
npm run test:unit -- src/views/TextDocumentView.test.ts src/views/TextDocumentView.integration.test.ts src/components/html/InlineRichText.test.ts src/views/PluginsView.test.ts src/html/htmlDocumentExport.test.ts
```

Result: 5 files, 21 tests passed.

```bash
npm run test:unit -- src/views/HtmlSettingsView.test.ts src/views/AdminView.test.ts
```

Result: 2 files, 2 tests passed.

```bash
npm run test:unit
```

Result: 44 files, 287 tests passed.

```bash
npm run build
```

Result: `vue-tsc -b && vite build` succeeded.

```bash
git diff --check
```

Result: clean before staging and commit.

## Self-review and remaining migration

- Reviewed the committed diff against the brief; all changes are visual/token-level and preserve existing interaction/data behavior.
- Selected outlines consistently use the semantic focus/brand role.
- No reviewer was dispatched because the controller explicitly prohibited subagents/reviewers for this task.
- Task 5 has no remaining migration. Landing and board surfaces remain deliberately assigned to Task 6.

## Concerns

No automated-test or build concerns. The final cross-route manual theme matrix is owned by Task 6; it should confirm the intentionally fixed authored-content palettes remain identical in both themes.

## Fix Round 1

Base reviewed commit: `0ba63cb` (`style(theme): migrate canvas and document chrome`)

Implementation commit: `style(theme): restore authored content boundaries` (repository HEAD)

### Root cause and fixes

The original migration correctly themed outer application shells but changed four authored-content boundaries that retain fixed content colors:

- Added named, non-theme `--content-*` tokens for the existing text-document paper, readonly paper, default canvas-node surface, and rendered callout-body text values.
- Restored `.text-doc-paper` and `.text-doc-paper.readonly` to their fixed dark content surfaces, preserving readable existing TipTap text, image-border, and link colors in both application themes.
- Restored the default `.canvas-node` surface to its fixed authored-node value without changing any node model/default value or explicit node palette.
- Restored `.node-content .callout-body` to its fixed rendered-markdown color.
- Changed `.canvas-plugin-row .plugin-toggle.on` from `--ui-brand` to the high-contrast `--ui-text` role on its existing semantic active surface; toggle geometry is unchanged.

No source-string regression test was added: CSS variable resolution is not an honest observable behavior in the current jsdom suites, and the rejected boundary test remains excluded. Existing canvas/document/plugin behavior tests protect the actual user workflows; the targeted source audit verifies the boundary classification.

### Verification

```bash
npm run test:unit -- src/components/CanvasLoader.addMenu.test.ts src/components/CanvasLoader.board-preview.test.ts src/components/CanvasLoader.document.test.ts src/components/CanvasLoader.touch.test.ts
```

Result: 4 files, 27 tests passed.

```bash
npm run test:unit -- src/views/TextDocumentView.test.ts src/views/TextDocumentView.integration.test.ts src/views/PluginsView.test.ts
```

Result: 3 files, 17 tests passed.

```bash
npm run test:unit
```

Result: 44 files, 287 tests passed.

```bash
npm run build
```

Result: `vue-tsc -b && vite build` succeeded.

```bash
git diff --check
rg -n -- "content-document-surface|content-canvas-node-surface|content-canvas-callout-text|canvas-plugin-row \\.plugin-toggle\\.on" src/style.css src/components/CanvasLoader.vue
rg -n -- "node\\.style\\.fill\\s*=\\s*effectiveTheme|documentHtml\\s*=\\s*applyTheme|data-theme" src/components/CanvasLoader.vue src/views/HtmlDocumentView.vue src/views/TextDocumentView.vue
```

Result: patch is whitespace-clean; all four fixed content/contrast rules are present; no forbidden theme propagation matched.

### Self-review

- Outer `.text-doc-page`, topbar, toolbar, panels, controls, canvas selection chrome, and plugin surfaces remain semantic and theme-aware.
- Only the fixed authored-content palette was restored; no serialized/exported HTML, iframe-authored HTML, TipTap content values, node model values, drawing values, or explicit node palette was changed.
- The deferred encoded-chevron Minor was not touched.

## Fix Round 2

Base reviewed commit: `6b12e5f` (`style(theme): restore authored content boundaries`)

Implementation commit: `style(theme): restore default-node selection contrast` (repository HEAD)

### Root cause and fix

The default canvas-node surface is deliberately fixed at `#262626` for authored content, but its selected and dragging borders, resize handles, and connection points used theme-specific `--ui-focus`. In the light theme, `--ui-focus` is `#145b25`, whose WCAG contrast against `#262626` is only `1.84:1`.

Added `--content-canvas-selection: #4dabf7`, the existing bright canvas selection color. Its contrast against the fixed default node surface is `6.11:1`, exceeding the 3:1 non-text selection-indicator requirement. Applied it only to `.canvas-node.is-selected`, `.canvas-node.is-dragging`, `.resize-handle`, and `.conn-point`; node model data, explicit node palettes, groups, drawing selections, and general page focus remain unchanged.

No new automated test was added: the existing jsdom suites cannot honestly compute browser CSS-variable contrast, and a source-string assertion would repeat the rejected test pattern. The targeted audit runs an independent WCAG contrast calculation and verifies the affected selectors.

### Verification

```bash
npm run test:unit -- src/components/CanvasLoader.addMenu.test.ts src/components/CanvasLoader.board-preview.test.ts src/components/CanvasLoader.document.test.ts src/components/CanvasLoader.touch.test.ts
```

Result: 4 files, 27 tests passed.

```bash
npm run build
```

Result: `vue-tsc -b && vite build` succeeded.

```bash
git diff --check
rg -n -C 1 -- "content-canvas-selection|canvas-node\\.is-selected|canvas-node\\.is-dragging|resize-handle \\{|conn-point \\{" src/style.css src/components/CanvasLoader.vue
node -e "...WCAG contrast calculation for #4dabf7 against #262626..."
```

Result: whitespace-clean; the fixed token is used by every affected selected-node affordance; contrast is `6.11:1`.

### Self-review

- The token is intentionally fixed because it overlays a fixed authored-node surface; outer canvas chrome remains theme-aware.
- The deferred encoded-chevron Minor was not touched.
- This change is limited to token/selector scope, so the requested conditional full-suite run was not required.
