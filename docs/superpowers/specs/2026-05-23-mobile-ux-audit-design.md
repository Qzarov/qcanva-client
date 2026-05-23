# Mobile UX Audit Design

## Goal

Make the dashboard and document library usable on phones by reducing persistent chrome, moving navigation out of the content flow, and deferring dense action groups to later focused fixes.

## Audit Findings

1. The dashboard shell uses the desktop sidebar as a horizontal strip on mobile. It takes the first visible row, hides sign-out, and pushes the page header and content below the fold.
2. Dashboard and HTML document list headers expose too many actions at once. On narrow screens the primary action competes with secondary create, import, settings, and tag actions.
3. The HTML editor top bar wraps title, save state, mode, preview, and share controls into a dense multi-line toolbar.
4. The Canvas editor mobile toolbar can occupy too much vertical space when node controls wrap.
5. Cards keep multiple absolute action buttons on mobile, which makes taps crowded and content width smaller.
6. Mobile modal sheets work, but they lack a stronger bottom-sheet structure with a sticky action footer.

## Implementation Order

1. Replace the mobile dashboard/sidebar strip with a fixed bottom navigation bar and add content padding for safe-area devices.
2. Collapse secondary dashboard and HTML list header actions behind a mobile overflow action.
3. Split the HTML editor mobile toolbar into a title/save row and an actions row.
4. Reduce the Canvas mobile toolbar footprint and make overflow behavior more deliberate.
5. Simplify card actions on mobile to one menu entry point.
6. Polish modal bottom sheets after the main navigation and toolbar pressure is reduced.

## First Slice

The first slice is CSS-only and changes the shared mobile shell used by `DashboardView.vue` and `HtmlDocsView.vue`.

- At widths up to `720px`, `.app-sidebar` becomes a fixed bottom navigation bar.
- Logo, section labels, and sidebar footer stay hidden on mobile.
- The page grid uses only header and content rows because the sidebar no longer consumes layout height.
- `.app-main.dashboard` gets bottom padding that accounts for the fixed nav and safe-area inset.
- Navigation items become stable touch targets with centered icons and labels.

## Acceptance Criteria

- On mobile, the first visible area starts with the page header instead of the navigation strip.
- Bottom navigation remains reachable while scrolling.
- Dashboard and HTML document list content cannot be hidden behind the bottom navigation.
- Desktop layout remains unchanged.
- Existing unit tests and production build pass.
