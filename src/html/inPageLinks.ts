/**
 * Keeps a document's own `#anchor` links inside the document.
 *
 * An HTML document is shown in an iframe through `srcdoc`, whose address is
 * `about:srcdoc`. By the HTML spec such a document resolves relative URLs
 * against its PARENT's address, so `<a href="#section">` points at
 * `https://…/html/<doc>#section`: a click navigated the iframe to that page,
 * and the whole app - header and all - loaded a second time inside the
 * document. Here such a click scrolls to the target in place instead.
 */
export function bindInPageLinks(doc: Document): void {
  doc.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = (event.target as Element | null)?.closest?.('a[href]');
    const href = link?.getAttribute('href');
    if (!href || !href.startsWith('#')) return;
    event.preventDefault();
    const target = findAnchorTarget(doc, href.slice(1));
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    else if (href === '#' || href === '#top') doc.defaultView?.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

function findAnchorTarget(doc: Document, fragment: string): Element | null {
  if (!fragment) return null;
  let id = fragment;
  try {
    id = decodeURIComponent(fragment);
  } catch {
    // A malformed escape: look the fragment up as written.
  }
  return doc.getElementById(id) ?? doc.getElementsByName(id)[0] ?? null;
}
