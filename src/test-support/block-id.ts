/** Ignore generated identity only in tests of a node's rendered markup. */
export function withoutBlockIds(html: string): string {
  return html.replace(/ data-block-id="[^"]*"/g, '');
}
