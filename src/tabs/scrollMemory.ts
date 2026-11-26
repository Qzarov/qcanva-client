/**
 * Scroll positions of a page's own scroll containers, kept across sleep.
 * A browser resets scrollTop when an element leaves the document - which is
 * what <KeepAlive> does to a page in a background tab - and by the time the
 * page is told it is hidden, the element is already out. So positions are
 * recorded as the user scrolls and put back when a page wakes up.
 */
const positions = new Map<Element, { top: number; left: number; missed: number }>();
const LIMIT = 200;
const MAX_MISSED_RESTORES = 8;
let installed = false;

function pruneDisconnected() {
  for (const element of positions.keys()) {
    if (!element.isConnected) positions.delete(element);
  }
}

const record = (event: Event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  positions.delete(target);
  positions.set(target, { top: target.scrollTop, left: target.scrollLeft, missed: 0 });
  if (positions.size > LIMIT) {
    pruneDisconnected();
    while (positions.size > LIMIT) {
      positions.delete(positions.keys().next().value!);
    }
  }
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
    if (!element.isConnected) {
      position.missed += 1;
      if (position.missed >= MAX_MISSED_RESTORES) positions.delete(element);
      continue;
    }
    position.missed = 0;
    if (element.scrollTop !== position.top) element.scrollTop = position.top;
    if (element.scrollLeft !== position.left) element.scrollLeft = position.left;
  }
}
