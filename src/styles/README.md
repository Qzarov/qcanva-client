# Global stylesheet modules

Правила выбора модуля и токенов закреплены в
[`docs/code-conventions.md`](../../docs/code-conventions.md).

`../style.css` is the single global entrypoint. Its imports are intentionally
numbered and preserve the former monolith's cascade order.

The modules are split by the main UI domains and override layers:

- `01-global.css` — reset and design tokens
- `02-auth.css` — login and registration
- `03-dashboard-shell.css` — app shell and dashboard base layout
- `04-admin.css` — admin screens
- `05-canvas-core.css` — canvas shell, nodes, sharing, history and chat
- `06-documents.css` — text and HTML documents
- `07-folder-navigation.css` — folder pickers and navigation
- `08-canvas-mobile.css` — mobile canvas controls
- `09-glass.css` — shared liquid-glass surfaces
- `10-settings.css` — settings controls
- `11-dashboard-overrides.css` — dashboard filters, files and sidebar
- `12-canvas-toolbar.css` — desktop canvas toolbar
- `13-dashboard-actions.css` — selection and download actions
- `14-dashboard-dialogs.css` — add and upload dialogs
- `18-dashboard-spaces.css` — shared spaces feed and member dialogs

New global rules belong in the narrowest matching module. If a rule is a
component-only style, prefer the component's scoped stylesheet instead.
Keep `src/style.css` as imports only, preserve module order, and use the tokens
from `01-global.css` instead of adding local color or spacing literals.
