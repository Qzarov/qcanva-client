# Drag handle: licence findings

Date: 2026-09-01

## Official TipTap extension
- Package: @tiptap/extension-drag-handle
- Versions compatible with TipTap v2: 2.22.0, 2.22.1, 2.22.2, 2.22.3, 2.23.0,
  2.23.1, 2.24.0, 2.24.1, 2.24.2, 2.25.0, 2.25.1, 2.26.0, 2.26.1, 2.26.2,
  2.26.3, 2.26.4, 2.27.0, 2.27.1, 2.27.2 (19 of the 143 published versions).
  The project pins `@tiptap/starter-kit` and `@tiptap/vue-3` at `^2.27.2`, so
  `@tiptap/extension-drag-handle@2.27.2` lines up exactly.
- Licence: MIT (verified for 2.27.2 specifically, not just for `latest`).
- Requires a paid plan: **no**. Evidence: the package resolves from the public
  npm registry with no authentication, `npm view @tiptap/extension-drag-handle@2.27.2
  license` returns `MIT`, and it ships real code (unpacked 206 KB). The paid
  variant was the separately named `@tiptap-pro/extension-drag-handle` on
  TipTap's private registry; the `@tiptap/`-scoped package is the open one.
- Peer dependencies (2.27.2):
  `@tiptap/pm ^2.7.0`, `@tiptap/core ^2.7.0`, `y-prosemirror ^1.2.5`,
  `@tiptap/extension-node-range ^2.14.0`, `@tiptap/extension-collaboration ^2.7.0`.
  Checked against the installed tree, not assumed: `@tiptap/pm` 2.27.2,
  `@tiptap/core` 2.27.2 and `@tiptap/extension-collaboration` 2.27.2 are already
  present (the last one declared directly in `package.json`), and
  `y-prosemirror` 1.3.7 satisfies `^1.2.5` — it is what the collaborative text
  documents already run on. **`@tiptap/extension-node-range` is NOT installed**
  and has to be added alongside the drag handle; it is the one new package this
  brings in.

## Free alternative
- Package: tiptap-extension-global-drag-handle
- Version: 0.1.18
- Licence: MIT
- Peer dependencies: none declared.
- Compatible with @tiptap/core ^2.27: unverified against a running editor. With
  no declared peers it will install against anything, which means it also gives
  no install-time signal if it drifts from the editor's ProseMirror version.

## Recommendation
**Use the official `@tiptap/extension-drag-handle@2.27.2`.** It removes the
reason the question was asked: there is no licence to buy and no version gap to
bridge. It is MIT, it is published for the exact TipTap minor this project
already uses, and its peer set is the same `@tiptap/pm` / `y-prosemirror` pair
the collaborative documents already depend on — so the drag handle sees the same
ProseMirror instance as the editor rather than a second copy, which is the usual
source of subtle drag-and-drop breakage.

The free third-party alternative stays a fallback only. It is a 0.1.x package
with no declared peer dependencies, so nothing warns us when it drifts from the
editor's ProseMirror version, and adopting it would mean owning that
compatibility risk for no saving.

Two caveats for the editor-UX plan that consumes this finding. First, the
official package requires `@tiptap/extension-collaboration` as a peer. This
project already has it, and already uses Yjs with `y-prosemirror`, but the
extension must be wired against the *existing* collaboration setup rather than
introducing a second one. Second, adopting it means installing
`@tiptap/extension-node-range` too — pin it at `^2.14.0` and keep it on the same
2.x line as the rest of the editor, or the drag handle will pull a mismatched
ProseMirror in behind it.
