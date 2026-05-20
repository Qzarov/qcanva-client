# HTML Visual Editor Design

## Goal

Turn the current HTML document page into a practical visual editor for common page edits without requiring users to rewrite raw HTML. Source mode remains available for advanced edits, but the main workflow should be visual: select a block, edit its content and styling, preview the result, then save the document.

## Scope

This slice covers a single-user editing experience for one HTML document. It does not add realtime collaboration, HTML operation logs, or revision conflict handling. Those remain a later architecture layer after the visual editor is usable.

## User Experience

The editor keeps the existing modes:

- Visual: primary editing mode.
- Preview: read-only rendered document.
- Split: source and rendered preview side by side.
- Source: raw HTML escape hatch.

Visual mode gets three working areas:

- Block library/sidebar for adding page sections and elements.
- Structure panel listing editable blocks in document order.
- Properties panel for the selected block.

Users can add, select, duplicate, move, and delete blocks. The selected block exposes content fields and style controls. The rendered preview updates from the structured model.

## Editable Blocks

The first supported block types are:

- Heading: text, level, style.
- Paragraph: text, style.
- Section: text/title, style container.
- Card: title, body, style container.
- List: one item per line, ordered/unordered.
- Link/Button: label, href, style.
- Image: src, alt, caption, style.

Unsupported or complex existing markup is preserved as raw HTML blocks where possible, so opening a real document does not immediately destroy unknown content.

## HTML Model

The editor parses the document into:

- Document shell: doctype, `html`, `head`, existing `style`, and body attributes.
- Visual blocks: editable body-level blocks.
- Raw blocks: body-level markup that the editor cannot safely normalize.

When visual blocks change, the editor rebuilds only the body content and keeps the shell/head intact. Source edits can reparse the document back into blocks.

## Styling Model

The first styling slice uses inline styles on the selected block. This is intentionally simple and reversible:

- spacing: padding, margin.
- typography: font size, weight, text color, alignment.
- appearance: background, border color, border radius.
- layout: width preset.

Controls write explicit style properties and preserve unrelated existing style declarations.

## Components

`HtmlDocumentView.vue` should stop carrying all editor logic inline. The implementation should extract focused helpers/components:

- `src/html/visualHtml.ts`: parse and serialize HTML, block helpers.
- `src/components/html/HtmlVisualEditor.vue`: visual editor layout and block/property interactions.

The parent view remains responsible for loading, access control, saving, sharing, and mode selection.

## Error Handling

If parsing fails, visual mode falls back to a single raw block and keeps Source/Split usable. Save errors continue to show toast messages. Destructive block actions remain local until Save.

## Tests

Add focused unit coverage for the parser/serializer:

- preserves head/style while rebuilding body.
- parses known blocks into editable block records.
- preserves unknown markup as raw blocks.
- updates inline style properties without deleting unrelated styles.

Run frontend build after implementation.
