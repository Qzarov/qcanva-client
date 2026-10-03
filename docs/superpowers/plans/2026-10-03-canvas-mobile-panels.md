# Canvas Mobile Panels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the active tasks in block 1, “Мобильные панели управления”, of the QCanva canvas plan.

**Architecture:** Keep the existing CanvasView state and child toolbars. Centralize mobile menu transitions in CanvasView, preserving the selected Hand/Cursor/Draw mode while the Add menu is open. Reuse the existing floating glass surface and document menu styles through focused CSS and markup. No API or stored canvas data changes.

**Tech Stack:** Vue 3, TypeScript, Vitest, Playwright, CSS.

**Spec:** QCanva document `1fdb3db2-0d26-4803-98bb-58ffac22fbb7`, block 1, revision 1128 read on 2026-10-03.

## Global Constraints

- Keep the already completed “+ closes other panels” and mobile shortcuts tasks intact.
- Defer “move common text/image settings out of ⋯” as the document says “будем фиксить следующим заходом”.
- Repeated taps on an active menu trigger close that menu. Tapping another menu trigger closes the first.
- A tap on any lower mode-bar button briefly shows its translated name just above that button without intercepting further taps. Keep the long-press tooltip behavior.
- The Android Back chain closes nested menu, then panel, then mode before leaving the canvas.
- Check 320px and 390px mobile widths, safe-area inset, virtual keyboard, and desktop visibility; real Android acceptance is separate.
- Do not deploy or tag in this task; report local verification and update only the completed checklist rows with ✅ and “Примечание:”.

## Review Focus

- Add opened while Draw is selected: the tool and mode return after dismissal.
- Add trigger remains tappable while its backdrop exists.
- Plugin controls respect reader/owner access and enabled state.
- Small landscape and keyboard-height viewports do not clip panels.
- Esc/Android Back respects the pre-existing nested menu priority.

---

### Task 1: Mobile menu transitions

**Files:** `src/views/CanvasView.vue`, `src/views/CanvasView.mobilePolish.test.ts`, `src/views/CanvasView.mobileBack.test.ts`.

**Interfaces:** `openMobileAddSheet()`, `closeMobileSheets()`, `toggleDice()` and `closeTopCanvasLayer()` remain CanvasView methods.

- [x] Add failing component tests: “+” from Draw/Cursor retains mode, second “+” closes, backdrop and Back dismiss without switching mode; switching to Dice closes Add and vice versa.
- [x] Run the focused tests and confirm the failures come from the current mode reset and one-way Add opener.
- [x] Implement minimal transitions without changing the canvas data or selected drawing tool.
- [x] Run the focused tests, then related mobile Back tests.

### Task 2: One-row Add menu and matching panel feedback

**Files:** `src/style.css`, `tests/mobile.smoke.spec.ts`, `src/canvas/MobileModebar.vue` for active state and tap hint.

**Interfaces:** Existing `.mobile-add-sheet`, `.mobile-add-sheet-item`, `.mobile-draw-panel`, `.mobile-node-toolbar` selectors remain available.

- [x] Add failing browser checks for one-row resource buttons, no horizontal page overflow at 320px/390px, tappable Add trigger, matching pressed/active feedback, and a nonblocking short-lived hint above every lower button.
- [x] Run the focused Playwright scenario and inspect failure.
- [x] Make Add a horizontally scrollable row with the existing floating panel appearance; use a common short press animation for mode and Add buttons and creation icons. Show the translated button name above the tapped button, dismiss it automatically, and preserve long-press behavior.
- [x] Rerun focused browser checks.

### Task 3: Compact plugin controls below the header

**Files:** `src/views/CanvasView.vue`, `src/style.css`, `tests/mobile.smoke.spec.ts`.

**Interfaces:** Existing ruler and dice handlers/settings are reused; desktop actions stay in the topbar.

- [ ] Add failing browser checks for a compact mobile plugin bar below the topbar, Dice and Ruler controls only when allowed/enabled, and Settings opening/closing on repeat taps.
- [ ] Run the focused Playwright scenario and inspect failure.
- [ ] Move mobile action triggers into the bar; keep the owner settings panel and responsive bounds, and keep actions mutually exclusive.
- [ ] Rerun focused browser checks.

### Task 4: Canvas action menu styling and release checks

**Files:** `src/views/CanvasView.vue`, `src/style.css`, `tests/mobile.smoke.spec.ts`, `src/views/CanvasView.mobileBack.test.ts`.

**Interfaces:** Existing canvas action handlers are unchanged; desktop actions remain inline.

- [ ] Add failing mobile browser checks for document-like glass menu rows, repeat-tap close, backdrop close, safe viewport fit and Back priority.
- [ ] Run focused tests and inspect failure.
- [ ] Adjust the mobile action menu markup/CSS; preserve search, share, history, chat, export and copy link.
- [ ] Run full unit tests, build, mobile Playwright smoke and relevant regressions; check `git diff --check` and status.
- [ ] Update only finished block-1 checklist rows in QCanva with `✅ (мобилка)` and a brief `Примечание:` noting verification and remaining real-Android acceptance.
