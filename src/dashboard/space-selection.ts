import type { ResourceType } from '../api/client';
import type { SpaceFeedItem, SpaceRole } from '../api/spaces';

/**
 * Ownership and move/delete eligibility rules for items inside a Shared Space.
 * Items added by other members and Yandex Disk items are read-only in a Space
 * feed; only QCanva items owned by the current user can be moved to own folders
 * or deleted when the user is an owner or editor of the space.
 */

export const spaceItemOwnerId = (item: Pick<SpaceFeedItem, 'owner' | 'addedBy'>): string =>
  item.owner?.id ?? item.addedBy?.id ?? '';

export const canEditSpaceRole = (role: SpaceRole | null | undefined): boolean =>
  role === 'owner' || role === 'editor';

export const isSpaceItemOwnedBy = (item: SpaceFeedItem, meId: string): boolean =>
  Boolean(meId) && item.origin === 'qspace' && Boolean(item.id) && spaceItemOwnerId(item) === meId;

export const isMovableSpaceItem = (
  item: SpaceFeedItem,
  role: SpaceRole | null | undefined,
  meId: string,
): boolean => canEditSpaceRole(role) && isSpaceItemOwnedBy(item, meId);

export function toFolderResourceType(kind: string): ResourceType {
  if (kind === 'html-document') return 'html-document';
  if (kind === 'text-document') return 'text-document';
  if (kind === 'board' || kind === 'sheet' || kind === 'interactive-template') return 'interactive-template';
  return 'canvas';
}

export function partitionMovableSpaceItems(
  items: readonly SpaceFeedItem[],
  role: SpaceRole | null | undefined,
  meId: string,
): { movable: SpaceFeedItem[]; skipped: number } {
  const movable = items.filter((item) => isMovableSpaceItem(item, role, meId));
  return { movable, skipped: items.length - movable.length };
}

export function partitionDeletableSpaceItems(
  items: readonly SpaceFeedItem[],
  role: SpaceRole | null | undefined,
  meId: string,
): { docs: SpaceFeedItem[]; files: SpaceFeedItem[]; skipped: number } {
  const own = canEditSpaceRole(role) ? items.filter((item) => isSpaceItemOwnedBy(item, meId)) : [];
  const docs = own.filter((item) => item.kind !== 'file');
  const files = own.filter((item) => item.kind === 'file');
  return { docs, files, skipped: items.length - own.length };
}
