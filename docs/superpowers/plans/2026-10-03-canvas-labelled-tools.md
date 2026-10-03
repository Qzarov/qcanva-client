# Canvas labelled tools implementation plan

> Execution: inline, without subagents, as requested by the user.

**Goal:** Label the canvas controls and replace drawing tool/width rows with animated vertical menus on web and mobile.

**Architecture:** Reuse CanvasColorMenu positioning and animations for labelled tool menus and persistent width sliders. Add CanvasStrokeWidth and CanvasDrawingPanel; keep popup state controlled by CanvasView so system Back still closes menus first.

**Tech Stack:** Vue 3, TypeScript, Vitest, Playwright.

**Spec:** Approved conversation: tool/color/width controls; seven drawing tools in one menu; vertical slider with stroke preview; vertical border sections; direct labelled text actions; merge dev and deploy without tag.

## Global constraints

- Preserve permissions, active tools, outside/repeat press dismissal, reduced-motion support and viewport bounds.
- No dependencies, subagents, checklist changes or release tag.

## Review focus

- 320px mobile and landscape menus remain reachable without covering their trigger.
- Owner-only visibility action does not appear for editors; readers cannot edit.
- Width interaction does not dismiss the popup; preview matches width and color.
- Back closes a popup before leaving drawing mode.
- English and Russian captions fit the two-row node toolbar.

### Task 1: Drawing controls

Files: CanvasColorMenu.vue, new CanvasStrokeWidth.vue and CanvasDrawingPanel.vue, CanvasView.vue, component/browser tests.

Interface: panel props tool:string, color:string, width:number, popup:'tools'|'color'|'width'|null; emits tool/color/width/popup updates. Width props width:number, color:string; emits update:width.

- [x] Add tests for vertical slider/live preview, labelled tool selection, mutually exclusive menus and repeat press.
- [x] Verify RED for missing stroke component and direct node actions.
- [x] Implement reusable controls and wire both drawing panels to existing canvas setters and Back handling.
- [x] Run focused tests and browser drawing scenarios.

### Task 2: Node controls

Files: MobileNodeToolbar.vue, MobileNodeToolbar.test.ts, style.css, mobile browser tests.

- [x] Test direct duplicate/delete/hide actions, visible captions and ordered Style/Width/Color border rows.
- [x] Implement two-row labelled node toolbar; keep other selection kinds and permissions intact.
- [x] Replace selected-drawing width popup with shared vertical slider; verify handlers and Back.
- [x] Verify mobile, landscape, desktop and Russian layout in browser.

### Task 3: Ship

- [x] Run full unit suite, typecheck/build and canvas browser regression tests; self-review diff.
- [ ] Commit, fast-forward merge dev and push origin/dev.
- [ ] Run existing production deployment script, verify published assets and isolated production smoke. Do not create a tag.

## Verification record

- Unit suite: 131 files / 1243 tests passing. Existing document undo tests exhibited nondeterministic failures on early runs; repeated full runs passed without any document code/test changes.
- Browser suite: 64 scenarios passing, including 320/390px portrait, 844px landscape, desktop and Russian captions.
- Typecheck and production build passed; existing large-chunk warning only.
- Final review: self-review, respecting the user's no-subagents instruction. No new dependencies, schema changes or checklist mutations.
- Browser checks reproduced and fixed landscape desktop-toolbar overlap and uneven button tops with wrapped Russian captions.
