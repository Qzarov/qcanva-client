/**
 * The incoming list (a full canvas snapshot from a collaborator or a
 * resync), arranged in THIS client's current order.
 *
 * Why: collaborators' node arrays drift apart in order (concurrent adds,
 * an undo re-inserting a node where it used to be...). Stacking comes from
 * each node's zIndex, not array order, so the order itself means nothing -
 * but the canvas renders one element per node in array order, so taking a
 * peer's snapshot verbatim made Vue physically move most of the DOM,
 * repainting and rebuilding the layers of every image on the canvas (the
 * "images blink" bug). Keeping the local order turns that into in-place
 * updates.
 *
 * Items both sides have come first, in local order, as the INCOMING
 * objects (their data wins); items only the snapshot has follow in its
 * order; items it no longer has are dropped. An id seen twice, or a
 * missing id, is kept as a new item rather than lost.
 */
export function keepLocalOrder<T extends { id: string }>(local: readonly T[], incoming: T[]): T[] {
  if (!local.length) return incoming;
  const localIndex = new Map<string, number>();
  local.forEach((item, index) => {
    if (item.id && !localIndex.has(item.id)) localIndex.set(item.id, index);
  });

  const known: { item: T; at: number }[] = [];
  const fresh: T[] = [];
  const claimed = new Set<string>();
  for (const item of incoming) {
    const at = item.id && !claimed.has(item.id) ? localIndex.get(item.id) : undefined;
    if (item.id) claimed.add(item.id);
    if (at === undefined) fresh.push(item);
    else known.push({ item, at });
  }
  known.sort((a, b) => a.at - b.at);
  return [...known.map((k) => k.item), ...fresh];
}
