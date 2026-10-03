import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

/**
 * Vitest's own config, layered on the app's vite config so the vue plugin and
 * the build targets stay in one place.
 *
 * The only thing it adds is a dependency-resolution fix. `tippy.js` (the
 * positioner behind TipTap's bubble menu and drag handle) ships no `exports`
 * map, so its package entry points are `main` -> the CJS build and `module` ->
 * the ESM one. The CJS build sets `__esModule` and puts the callable on
 * `exports.default`. A browser build resolves the ESM entry and gets a
 * function; Node's own ESM interop, which is what vitest uses for an
 * externalized dependency, hands the whole exports OBJECT to
 * `import tippy from 'tippy.js'` - so @tiptap's `tippy(...)` call throws
 * "tippy is not a function" in tests while working perfectly in the app.
 *
 * Inlining these three makes vitest transform them instead of externalizing
 * them, and vite's interop reads `__esModule` and picks the function. It
 * changes nothing about the production bundle, which never reads this file.
 */
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      setupFiles: ['./src/test-setup.ts'],
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/.worktrees/**',
        '**/.claude/worktrees/**',
        '**/tests/**',
        '**/*.visual.spec.ts',
        '**/*.smoke.spec.ts',
      ],
      server: {
        deps: {
          inline: [
            'tippy.js',
            // Its importers have to be inlined too: once a module is
            // externalized, Node pulls in its whole dependency graph
            // natively and vite's interop never sees tippy at all.
            '@tiptap/vue-3',
            '@tiptap/extension-bubble-menu',
            '@tiptap/extension-drag-handle',
          ],
        },
      },
    },
  }),
);
