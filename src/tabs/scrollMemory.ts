/**
 * Scroll positions of a page's own scroll containers, kept across sleep.
 * A browser resets scrollTop when an element leaves the document - which is
 * what <KeepAlive> does to a page in a background tab - and by the time the
 * page is told it is hidden, the element is already out. So positions are
 * recorded as the user scrolls and put back when a page wakes up.
 */
const positions = new Map<Element, { top: number; left: number }>();
const LIMIT = 200;
let installed = false;

const record = (event: Event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  positions.delete(target);
  positions.set(target, { top: target.scrollTop, left: target.scrollLeft });
  if (positions.size > LIMIT) positions.delete(positions.keys().next().value!);
};

/** Starts recording (tab mode only). */
export function installScrollMemory() {
  if (installed) return;
  installed = true;
  document.addEventListener('scroll', record, true);
}

/** Puts back every recorded position of an element that is in the document again. */
export function restoreScrollPositions() {
  for (const [element, position] of positions) {
    if (!element.isConnected) continue;
    if (element.scrollTop !== position.top) element.scrollTop = position.top;
    if (element.scrollLeft !== position.left) element.scrollLeft = position.left;
  }
}
