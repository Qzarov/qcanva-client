# Task 4 Report

Date: 2026-09-01
Base commit: `5621814`
Implementation commit: `039f5b4` (`style(theme): add semantic light and dark tokens`)

## Scope completed

- Added semantic theme tokens for dark and light modes in `src/style.css`, including the exact light palette from the brief.
- Re-pointed the legacy `--dark-*` token names at the semantic layer so existing dark selectors continue to resolve through aliases during migration.
- Rethemed shared chrome in `src/style.css` for auth screens, app shell, shared controls, cards, popovers, modals, access gates, topbars, loaders, and focus states.
- Updated `ThemeSelector`, `ThemeMenu`, and `AccountMenu` to consume semantic tokens, keep stable sizing, and disable popover/selector transitions under `prefers-reduced-motion`.
- Updated `ToastContainer`, `ChatPanel`, `MarkdownRenderer`, and `App.vue` to use the shared semantic surface/text tokens.

## Constraints check

- Resource-type accents, status colors, syntax colors, drawing colors, and authored document content were left alone.
- No layout-affecting state change was introduced in the theme selector; all options keep a constant border box and the active state only swaps color tokens.
- Existing tests were not weakened.

## Verification

Focused tests:

```bash
npm run test:unit -- src/components/ThemeSelector.test.ts src/components/ThemeMenu.test.ts src/components/AccountMenu.test.ts src/components/ChatPanel.test.ts
```

Result: `4` files passed, `15` tests passed.

Full unit suite:

```bash
npm run test:unit
```

Result: `44` files passed, `283` tests passed.

Build:

```bash
npm run build
```

Result: success (`vue-tsc -b && vite build`).

Whitespace / patch hygiene:

```bash
git diff --check
```

Result: clean.

Hardcoded-literal audit:

```bash
git diff -- src/style.css src/App.vue src/components/ToastContainer.vue src/components/ChatPanel.vue src/components/MarkdownRenderer.vue src/components/ThemeSelector.vue src/components/ThemeMenu.vue src/components/AccountMenu.vue | rg '^\+.*(#[0-9A-Fa-f]{3,8}|rgba?\()'
```

Result: newly introduced literals are limited to the semantic token definitions required by the brief.

## Self-review

- The light theme now resolves through semantic tokens instead of dark-only literals for the shared application chrome covered by this task.
- The menu components keep their existing structure and test-covered behavior; this patch is visual/token-level rather than behavioral.
- Legacy hardcoded colors still exist elsewhere in `src/style.css`, but they are outside the shared-chrome scope named in Task 4.

## Fix Round 1

Reviewed head: `039f5b4`

### Scope completed

- Replaced the duplicated zero-specificity focus rule with one canonical `button/a/input/select/textarea:focus-visible` rule at the end of `src/style.css`, so it wins over shared controls that still declare `outline: none`.
- Migrated the reviewed shared dashboard/card selectors to semantic tokens: `.card-title-input`, `.card-menu`, `.card-menu-item:hover`, `.dashboard-folder-nav`, `.folder-nav-item`, `.folder-manager-row`, `.folder-manager-trigger`, and adjacent shared text/background states.
- Migrated the reviewed chat drawer chrome to semantic tokens: `.chat-drawer`, `.chat-drawer-head`, mobile drawer surface, `.chat-pick-hint`, `.chat-pick-hint-text`, and `.chat-pick-cancel:hover`.
- Added keyboard semantics for `ThemeSelector`, `ThemeMenu`, and `AccountMenu`: arrow-key radiogroup navigation with wrapping, ArrowDown open-and-focus from both triggers, Escape close with trigger focus restore, and coherent `dialog` popup semantics for the mixed-content popovers.
- Added focused regression tests for selector wrapping/focus, theme menu ArrowDown open/focus, and account menu keyboard open/focus.

### Files changed

- `src/style.css`
- `src/components/ThemeSelector.vue`
- `src/components/ThemeMenu.vue`
- `src/components/AccountMenu.vue`
- `src/components/ThemeSelector.test.ts`
- `src/components/ThemeMenu.test.ts`
- `src/components/AccountMenu.test.ts`

### RED evidence

Command:

```bash
npm run test:unit -- src/components/ThemeSelector.test.ts src/components/ThemeMenu.test.ts src/components/AccountMenu.test.ts
```

Result:

- `3` files failed.
- `5` tests failed.
- Failures matched the review findings: missing ArrowLeft/ArrowRight radiogroup selection, no ArrowDown trigger-open path, and old `menu` popup semantics still present on the account and theme menus.

### Verification

Focused tests:

```bash
npm run test:unit -- src/components/ThemeSelector.test.ts src/components/ThemeMenu.test.ts src/components/AccountMenu.test.ts src/components/ChatPanel.test.ts
```

Result: `4` files passed, `19` tests passed.

Full unit suite:

```bash
npm run test:unit
```

Result: `44` files passed, `287` tests passed.

Build:

```bash
npm run build
```

Result: success (`vue-tsc -b && vite build`).

Whitespace / patch hygiene:

```bash
git diff --check
```

Result: clean.

Canonical focus rule audit:

```bash
rg -n ":where\\(button, a, input, select, textarea\\):focus-visible|button:focus-visible|a:focus-visible|input:focus-visible|select:focus-visible|textarea:focus-visible" src/style.css
```

Result: one canonical focus-visible rule remains, at the end of `src/style.css`.

Newly added literal audit:

```bash
git diff -- src/style.css src/components/ThemeSelector.vue src/components/ThemeMenu.vue src/components/AccountMenu.vue src/components/ThemeSelector.test.ts src/components/ThemeMenu.test.ts src/components/AccountMenu.test.ts | rg '^\+.*(#[0-9A-Fa-f]{3,8}|rgba?\()'
```

Result: no newly added hardcoded literals in this fix round.

### Self-review

- The root cause for the missing visible focus ring was specificity plus source order: a zero-specificity global rule was easy to override. The final canonical rule now has element-selector specificity and appears once at the end of the stylesheet.
- `ThemeMenu` and `AccountMenu` no longer advertise menu semantics for mixed-content popovers; both now expose dialog semantics and keyboard-open/focus behavior that matches their contents.
- The shared CSS cleanup stayed within the reviewed selectors and adjacent chrome only; resource accents, status colors, syntax colors, drawing tools, and authored content colors were left unchanged.
- `vue-tsc` caught one test-only typing issue after the first green keyboard run, and the final verification pass was rerun after fixing that cast.

## Fix Round 2

Reviewed head: `ff9879d`

### Scope completed

- Converted the remaining inactive shared dashboard/card chrome to semantic tokens in `src/style.css` only:
  - `.card-manage` inactive color and hover background/text
  - `.card-pin` inactive color
  - `.card-delete` inactive color and destructive hover text/background
  - `.dash-section h2` section heading text color
- Left state accents intentionally unchanged where they indicate state instead of shared chrome:
  - pinned state yellow on `.card-pin:hover` / `.card-pin.active`
  - other resource/status/content accents outside the reviewed selectors

### Files changed

- `src/style.css`

### Verification

Focused dashboard and theme/menu tests:

```bash
npm run test:unit -- src/views/DashboardView.test.ts src/components/ThemeSelector.test.ts src/components/ThemeMenu.test.ts src/components/AccountMenu.test.ts
```

Result: `4` files passed, `61` tests passed.

Build:

```bash
npm run build
```

Result: success (`vue-tsc -b && vite build`).

Whitespace / patch hygiene:

```bash
git diff --check
```

Result: clean.

Newly added literal audit:

```bash
git diff -- src/style.css | rg '^\+.*(#[0-9A-Fa-f]{3,8}|rgba?\()'
```

Result: no newly added hardcoded literals in this fix round.

### Self-review

- This round stayed limited to the reviewed shared dashboard/card selectors and did not expand into unrelated admin, doc-picker, shortcut, or authored-content literals.
- Destructive hover now resolves from `--ui-danger` through `color-mix(...)`, so the destructive accent remains semantic while inactive control chrome follows the current theme.
- The pinned yellow state remains literal by design because it communicates item state, not neutral application chrome.
