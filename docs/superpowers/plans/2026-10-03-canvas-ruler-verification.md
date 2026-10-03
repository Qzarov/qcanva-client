# Canvas ruler — verification and handoff

03.10.2026. Implemented locally, self-reviewed without subagents as requested.

## Result

Per-canvas opt-in ruler, owner-only meters/feet and physical scale. Hold and drag
with mouse or touch; all authorized participants see independent named/coloured
measurements. Release fixes the endpoint for 3000ms. Cancel clears immediately,
including while permission reads lag. Measurements do not write canvas content,
revision, history or chat. Settings are separate columns and survive legacy saves.

Frontend: `/home/qzarov/Devin/pet/canvas-server-front`, existing dirty dev preserved.
Backend: `/home/qzarov/Devin/pet/canvas-ruler-back`, isolated feat/canvas-ruler from
dev7e13704. Original Obsidian branch f6ec67b remains clean and untouched.

## Fresh verification

- Frontend: `npm run test:unit` —127 files,1216 tests passed.
- Backend: `npm test -- --runInBand` —50 suites,662 tests passed.
- Both: `npm run build` —exit0; `git diff --check` —exit0.
- Ruler: `RULER_TEST_BACKEND_ROOT=/home/qzarov/Devin/pet/canvas-ruler-back npx playwright test --config playwright.ruler.config.ts` —8 passed.
- Regression: `npx playwright test tests/canvas-minimap.spec.ts tests/canvas-block-settings.spec.ts tests/canvas-selection.spec.ts tests/mobile.smoke.spec.ts tests/text-document-outline.spec.ts` —40 passed.
- Initial exact-pixel native-scroll check was intermittent (98 instead of100).
  Waiting for `document.fonts.ready` before sampling layout retained the exact
  assertions:10 repeated passes, then40/40 full regression passes. No production
  scrolling changes; temporary diagnostic listeners removed.
- Timeline Paint instrumentation identifies the actual image paint layer:
  ruler movement produces paints but zero image-layer paints. Image DOM/source
  and HTTP request count remain unchanged. Headless Chromium evidence only.

## Self-review fixes

Regression tests reproduced each issue before its fix:
pending-queue finish loss, cancellation during pending permission reads,
plugin-disable and replacement-membership races, owner-notification ordering,
late settings rollback/re-enable, abandoned join resurrection, stale rejection
affecting a new membership, pre-synchronized migration duplicate columns,
stale ORM content save rolling back scale, invisible selected theme state,
competing context menus, and mode handoff. Full suites/builds pass after fixes.

## Decisions and their costs

- No subagents, including final review: author self-review is weaker than independent review.
- Separate backend worktree from dev: later integration must check the unrelated Obsidian branch.
- No commit/push/deploy or working-DB migration: changes stay local; ledger remains the durable task history until integration.
- Canonical scale bounds1e-9..1e9: extreme scales outside these safe finite limits are rejected.
- Superdesign unavailable without authentication: existing UI components/tokens reused; no external design draft.
- Explicit internal `ruler-exit` separates tool switching from gesture cancellation: one additional component event.
- Existing fresh-production migration chain lacks `Canvas.folderRefId`: not repaired here. Entire chain verified in memory; duplication then uses development schema synchronization. Fresh production bootstrap still needs its own fix.
- One in-flight lookup and one latest pending movement: intermediate remote positions may be superseded; finish is retained. Clear installs its tombstone immediately without waiting for a database read.
- Vue's render batching replaces a second explicit rAF scheduler: high-rate pointer sources depend on browser/Vue batching; movement transport stays20Hz.
- Deferred image flicker remains deferred; no real Android/GPU claim: manual device acceptance still required.
- Keep ignored task ledger while uncommitted: local scratch remains until integration.

## Deferred minor and release limits

Remote client version tombstones survive until room-session reset. Long sessions
with many departed sockets could benefit from membership-based pruning.

Existing >500kB TextDocumentView build warning remains. No dependencies added.
No commits, push, deployment, merge, or production migrations performed.

## Astra review corrections — 03.10.2026

Independent Astra review identified three P2 defects; the user authorized fixes.
Each reproduction failed before the corresponding production change:

1. First join and first update with no full settings cache lost plugin-disable
   notifications. Gateway now tracks plugin enablement independently, advances
   the room epoch even before settings load, applies the latest toggle to join
   snapshots and drops stale updates. Enablement state is removed on room leave
   and gateway shutdown. Both delayed-read regressions pass.
2. Extra properties nested in start/end were spread into room state and broadcast.
   Points are now constructed strictly from x/y. A regression supplies large
   unknown fields and verifies normalized points and a small serialized result.
   The real Socket.IO browser test also sends a500KB nested extra field and
   verifies it is absent from the actual broadcast received by the public guest.
3. Glyph-width estimation clipped the measured distance with long author names.
   CSS transform clamping now uses the actual label box; the name alone can
   shrink/ellipsis while the number/unit remain intact. A real browser regression
   with40 wide W characters verifies actual label and number bounds at both
   1000px and390px viewport widths, including the right/bottom edges.

Fresh corrected verification: frontend127 files1216/1216; backend50 suites665/665;
both builds exit0; ruler browser9/9; other browser regressions40/40; both diff checks exit0.
No second Astra review or claim of real-device acceptance; fixes verified by
the reproducible regressions plus fresh full test suites.
