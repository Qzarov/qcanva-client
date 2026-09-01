# QCanva Light Theme and Dashboard Sidebar Design

**Date:** 2026-09-01

**Status:** Approved

## Summary

Add a complete light theme to QCanva and replace the dashboard's duplicated in-content folder navigation with a persistent application sidebar. Theme and sidebar preferences are stored locally in the browser. The work is frontend-only and must preserve the existing dark appearance and all current resource behavior.

## Goals

- Support `system`, `light`, and `dark` theme preferences across the whole product.
- Use the operating-system preference for a new browser profile.
- Remember an explicit user choice in `localStorage`.
- Apply the effective theme before Vue mounts so the page does not flash in the wrong theme.
- Give the light theme a soft, neutral visual direction with restrained green accents.
- Preserve authored colors in canvases, nodes, boards, images, and document content.
- Add a desktop dashboard sidebar that can collapse to an icon rail.
- Add a mobile dashboard drawer that uses the same navigation model.
- Remember the desktop sidebar state in `localStorage`.
- Make sidebar navigation replace the dashboard's central content instead of scrolling a long page.

## Non-goals

- Synchronizing theme or sidebar preferences through the backend or across devices.
- Redesigning resource cards, board interactions, canvas gestures, or document editing behavior.
- Automatically recoloring user-authored canvas nodes, images, board labels, or document bodies.
- Introducing a new UI framework, icon dependency, or state-management library.
- Adding new dashboard routes for each navigation entry.

## Theme behavior

### Preference and effective theme

The stored preference is one of:

- `system`: resolve through `window.matchMedia('(prefers-color-scheme: dark)')`.
- `light`: always use the light palette.
- `dark`: always use the existing dark palette.

When no valid stored value exists, preference defaults to `system`. While the preference is `system`, QCanva listens for operating-system theme changes and updates immediately. Explicit `light` or `dark` choices ignore later system changes.

The preference is stored under `qcanva:theme:v1`. Storage access must be guarded so privacy modes or unavailable storage do not prevent the application from rendering.

The effective theme is reflected on the root element as `data-theme="light"` or `data-theme="dark"`. The root `color-scheme` property must match, so native form controls and scrollbars render consistently.

### No-flash initialization

Theme resolution runs before the application mount and before the main stylesheet is painted. The same storage validation and system-resolution rules are shared with the Vue composable so initial HTML state and reactive runtime state cannot disagree.

### Theme controls

Authenticated screens expose the three choices inside the menu opened from the user's avatar/icon. The dashboard uses the avatar area at the bottom of its sidebar; a collapsed sidebar still opens the same menu.

The landing, login, and registration screens have no user avatar, so they retain a compact standalone control in the upper-right corner. It offers the same three choices and persists them under the same key.

Each choice displays a text label as well as an icon or indicator. The selected choice exposes `aria-checked="true"`; the menu is keyboard reachable and has a visible focus treatment.

### Visual direction

The approved light direction is “A — Soft neutral”. Initial semantic tokens:

| Role | Light value |
| --- | --- |
| Page background | `#f5f7f4` |
| Primary surface | `#ffffff` |
| Sidebar surface | `#fbfcfa` |
| Canvas chrome/background | `#eef2ee` |
| Input/subtle surface | `#f4f6f3` |
| Primary text | `#172019` |
| Strong green text | `#145b25` |
| Secondary text | `#667269` |
| Muted text | `#98a39a` |
| Border | `#dce3dd` |
| Brand accent | `#20cf45` |
| Text on brand | `#06220c` |
| Soft brand surface | `#ddf7e2` |

The existing dark palette remains the default dark-token implementation. Shared component rules consume semantic roles such as page, surface, elevated surface, input, border, primary text, secondary text, muted text, overlay, danger, focus, and shadow. Legacy `--dark-*` tokens may remain temporarily as aliases during migration, but new component styles must use semantic names.

Hardcoded colors that intentionally describe content, status, syntax, drawings, or resource-type accents remain fixed. Hardcoded colors that describe application chrome must be migrated to theme tokens.

## Dashboard sidebar

### Navigation model

The sidebar provides these destinations:

- Home
- Shared with me
- Interactive templates
- Public
- The user's folder tree, including the system `default` folder

Navigation does not create new routes. A dashboard-local `DashboardSection` state controls the central view:

```ts
type DashboardSection =
  | { kind: 'home' }
  | { kind: 'shared' }
  | { kind: 'interactive' }
  | { kind: 'public' }
  | { kind: 'folder'; folderId: string };
```

Selecting a top-level entry shows only that section's resource collection in the central area. Selecting a folder shows its subfolders and resources. The existing folder hierarchy, open-folder persistence, drag/drop destinations, card menus, resource filters, and move dialogs continue to work.

The existing `.dashboard-folder-nav` inside the content area is removed to avoid duplicate navigation. Folder rows move into the application sidebar without changing their ownership or nesting semantics.

### Home content

Home remains the creation and overview workspace. It contains the creation/import controls, recents, and access requests. Search, sort, tag, and resource-type filters stay in a shared central toolbar and apply to whichever resource section is open. Shared, interactive, and public collections are not repeated below Home; they are reached through their sidebar entries.

### Desktop behavior

- Expanded width: approximately `248px`.
- Collapsed width: approximately `72px`.
- The sidebar remains visible beside the central dashboard content.
- Collapse state is stored under `qcanva:dashboard-sidebar:v1` as `expanded` or `collapsed`.
- In collapsed mode, text labels are visually hidden and icons retain accessible names/tooltips.
- The active section is clearly indicated without shifting surrounding items.
- The central pane owns scrolling; the full page must not become trapped without a usable scrollbar.

### Mobile behavior

- Below the existing dashboard mobile breakpoint, the sidebar becomes an off-canvas drawer.
- A menu button in the dashboard header opens it.
- A backdrop, close button, Escape, or destination selection closes it.
- Opening the drawer traps focus; closing it restores focus to the opener.
- Body scrolling is locked only while the drawer is open and restored on every close/unmount path.
- The stored desktop collapsed state does not make the mobile drawer narrower.

### Sidebar footer

The footer contains the user avatar and label. Activating it opens a menu containing:

- Theme selector: System / Light / Dark
- Plugins
- Settings
- Sign out

The existing language control remains available in the dashboard interface. The implementation may place it beside the sidebar header/brand or inside the user menu as long as it remains discoverable on desktop and mobile.

## Responsive and accessibility requirements

- All interactive controls are reachable by keyboard.
- Menus and the drawer close on Escape.
- Focus indicators meet visible contrast requirements in both themes.
- Text and interactive controls target WCAG AA contrast.
- Hover is not the only indicator of selection or availability.
- `prefers-reduced-motion` disables nonessential drawer and theme transition animation.
- Content remains usable at widths from `320px` upward.
- The dashboard central pane, board columns, canvas, and document editors retain their existing intentional overflow behavior.

## Failure handling

- Invalid stored theme values are ignored and replaced by `system` behavior.
- Storage read/write errors are swallowed after updating in-memory UI state.
- A missing remembered folder falls back to the current existing folder fallback behavior.
- A remembered sidebar value outside `expanded|collapsed` is treated as `expanded`.
- Theme application must not depend on authentication or an API response.

## Testing and verification

### Automated

- Unit-test valid, invalid, absent, and unavailable theme storage.
- Unit-test system preference resolution and live `matchMedia` changes.
- Unit-test root `data-theme` and `color-scheme` updates.
- Component-test all three theme choices and keyboard-accessible selection.
- Dashboard tests cover navigation between top-level sections and folders.
- Dashboard tests verify no duplicate folder navigation remains.
- Dashboard tests cover collapsed-state persistence and invalid storage fallback.
- Dashboard tests cover mobile drawer opening, closing, Escape, and selection close.
- Existing dashboard folder, resource movement, ownership, and action-menu tests must continue to pass.

### Manual

- Check landing, login, registration, dashboard, canvas, board, HTML document, and text document in both themes.
- Refresh each public and authenticated surface and confirm there is no wrong-theme flash.
- Change the operating-system theme while QCanva is set to System.
- Verify canvas and document authored colors do not change between themes.
- Verify desktop expanded/collapsed dashboard layouts and mobile drawer at `320px`, `768px`, and a normal desktop width.
- Verify keyboard focus, Escape behavior, and scroll access in Yandex Browser on desktop.

## Delivery boundaries

This design is implemented as two independently testable frontend plans:

1. Global theme foundation and migration.
2. Dashboard sidebar and section navigation.

The theme foundation lands first because the sidebar consumes the shared semantic tokens and theme selector. No backend migration or production deployment is part of either implementation plan unless requested separately.
