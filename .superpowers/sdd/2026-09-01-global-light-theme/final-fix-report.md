# Final fix wave report

Plan: `docs/superpowers/plans/2026-09-01-global-light-theme.md`
Spec: `docs/superpowers/specs/2026-09-01-light-theme-dashboard-sidebar-design.md`
Base commit for this wave: `0310c8b`
Branch: `feat/light-theme-sidebar`
Date: 2026-09-02

## Finding mapping

| Review finding | Fix | Evidence |
| --- | --- | --- |
| 1. Startup must survive unavailable browser APIs. | Guarded acquisition/read/write of theme and locale storage; added deterministic light fallback for absent or throwing `matchMedia`; wrapped media listener add/remove so partial browser implementations cannot abort module import or Vue mount. | `src/theme/theme.test.ts`, `src/composables/useTheme.test.ts`, and `src/composables/useI18n.test.ts` cover throwing storage getters/writes, absent/throwing media, add listener throws, remove stale listener throws, and locale storage failures. |
| 2. First paint must run synchronously before render-blocking styles. | Moved first-paint theme application to classic `public/theme-bootstrap.js` in `index.html` head before stylesheet links; removed the deferred body module bootstrap from `index.html`; kept `src/theme/bootstrap.ts` safe for direct imports. | `src/theme/firstPaintBootstrap.test.ts` executes the real public script in jsdom and parses `index.html` to verify head ordering before the first stylesheet. |
| 3. Authored board/canvas content must remain invariant between themes. | Added fixed `--content-*` roles for canvas groups, default edges, arrowheads, edge labels, default node surfaces, node editing surfaces, board labels, and landing content previews. Restored fixed embedded canvas/minimap preview colors. Fixed a newly found regression where inline default group label color would override authored `group-color-*` label classes. | `src/components/CanvasLoader.authored-theme.test.ts`, `src/components/board/BoardEditor.test.ts`, and `src/components/board/BoardPreview.test.ts` assert theme-invariant DOM styles/custom properties and preserve colored group label cascade. Baseline values were checked against `git show a711025:<file>` for the affected CanvasLoader and board selectors. |
| 4. Light-theme contrast issues. | Kept the approved light palette intact and added readable foreground roles: `--ui-accent-strong: #145b25`, status foreground roles, and `--ui-focus-on`. Moved meaningful muted copy to secondary text, fixed danger/warning/info/success foreground usage, landing CTA hover, and `.case-tile small` content preview muted color. | `src/theme/contrast.test.ts` checks light foreground/background pairs at >= 4.5:1 and verifies fixed preview microcopy contrast on `#234636`. |
| 5. Account menu and select chevron minors. | Added an `opened` event and exposed `close()` from `AccountMenu`; Dashboard closes legacy control/card popovers when the account menu opens and closes the account menu before opening legacy popovers. Removed the encoded select chevron and kept native indicators under the active `color-scheme`. Added Escape focus restoration coverage. | `src/views/DashboardView.test.ts` covers mutual exclusion. `src/components/AccountMenu.test.ts` covers ArrowDown focus and Escape focus restoration. `rg -n "data:image" src/style.css` finds no encoded chevron. |
| 6. Browser evidence requested for headless Windows Yandex. | Checked the requested executable path and searched the nearby Yandex local tree without reading browser profile data. The requested Local `Application/browser.exe` path was absent, but a stale Windows Yandex headless run from the prior executor was later found under Program Files and timed out after hanging for about 44 minutes. Terminated the stale Yandex/Vite PIDs with TERM. Used jsdom against a live Vite dev server as maximum reliable automation in this environment. | `/mnt/c/Users/qzaro/AppData/Local/Yandex/YandexBrowser/Application/browser.exe` did not exist; `find /mnt/c/Users/qzaro/AppData/Local/Yandex -path '*/User Data' -prune -o -iname 'browser.exe' -type f -print` returned no executable. `ps -p 823593,823730` showed Vite on `5187` and `/mnt/c/Program Files/Yandex/YandexBrowser/Application/browser.exe --headless=new --dump-dom http://localhost:5187/` hanging for 44+ minutes; `kill -TERM 823730 823593 823592` succeeded and follow-up `ps` returned no rows. Live public-route smoke passed for stored light, stored dark, system dark, and invalid fallback. |

## Commands run

```text
npm run test:unit -- src/theme/theme.test.ts src/theme/firstPaintBootstrap.test.ts src/composables/useTheme.test.ts src/composables/useI18n.test.ts src/components/CanvasLoader.authored-theme.test.ts src/components/CanvasLoader.board-preview.test.ts src/components/CanvasLoader.document.test.ts src/components/board/BoardEditor.test.ts src/components/board/BoardPreview.test.ts src/theme/contrast.test.ts src/views/DashboardView.test.ts src/components/AccountMenu.test.ts
=> 12 passed files, 138 passed tests

npm run test:unit
=> 48 passed files, 317 passed tests

npm run build
=> vue-tsc -b and vite build passed; 327 modules transformed

git diff --check
=> passed with no output
```

## Browser-adjacent smoke

Stale browser timeout cleanup:

```text
ps -p 823593,823730 -o pid,ppid,etime,stat,cmd
=> 823593 node .../vite --host 127.0.0.1 --port 5187, ELAPSED 44:52
=> 823730 /mnt/c/Program Files/Yandex/YandexBrowser/Application/browser.exe --headless=new --dump-dom http://localhost:5187/, ELAPSED 44:20

kill -TERM 823730 823593 823592
=> exit 0

ps -p 823592,823593,823730 -o pid,ppid,etime,stat,cmd
=> no process rows
```

Replacement dev server:

```text
npm run dev -- --host 127.0.0.1 --port 5177
=> VITE v7.1.10 ready at http://127.0.0.1:5177/
```

jsdom public route smoke against the live server:

```text
public route stored light: {"theme":"light","colorScheme":"light","themeColor":"#f5f7f4"}
public route stored dark: {"theme":"dark","colorScheme":"dark","themeColor":"#071307"}
public route system dark: {"theme":"dark","colorScheme":"dark","themeColor":"#071307"}
public route invalid fallback: {"theme":"light","colorScheme":"light","themeColor":"#f5f7f4"}
```

## Residual risks

- A real headless Yandex Browser attempt from the prior executor hung for 44+ minutes and had to be terminated. The requested Local Yandex executable path was absent; the stale process used Program Files Yandex. The replacement evidence executes the real first-paint script and live public route in jsdom, but it is not a completed Yandex rendering pass.
- Authored content invariance is covered for the previously regressed canvas and board surfaces plus baseline source audit. It does not replace a manual visual review of every saved user canvas/document asset.
