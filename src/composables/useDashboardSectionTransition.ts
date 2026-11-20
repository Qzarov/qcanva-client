import { onBeforeUnmount, ref, watch, type Ref } from 'vue';

type DashboardSection = {
  kind: string;
  folderId?: string;
};

type FolderEntry = {
  id: string;
  parentId?: string | null;
};

type ReadonlyValue<T> = { readonly value: readonly T[] };

export function useDashboardSectionTransition<TSection extends DashboardSection>(options: {
  activeSection: Ref<TSection>;
  folders: ReadonlyValue<FolderEntry>;
}) {
  const navDirection = ref<'none' | 'forward' | 'back'>('none');
  let navDirectionTimer: ReturnType<typeof setTimeout> | null = null;

  const sectionDepth = (section: TSection) => {
    if (section.kind !== 'folder' || !section.folderId) return -1;
    const byId = new Map(options.folders.value.map((folder) => [folder.id, folder]));
    let depth = 0;
    let parentId = byId.get(section.folderId)?.parentId ?? null;
    const seen = new Set<string>();
    while (parentId && !seen.has(parentId)) {
      seen.add(parentId);
      depth += 1;
      parentId = byId.get(parentId)?.parentId ?? null;
    }
    return depth;
  };

  watch(options.activeSection, (next, previous) => {
    if (!previous || (next.kind !== 'folder' && previous.kind !== 'folder')) return;
    if (next.kind === 'folder' && previous.kind === 'folder' && next.folderId === previous.folderId) return;
    navDirection.value = next.kind === 'folder' && sectionDepth(next) >= sectionDepth(previous) ? 'forward' : 'back';
    if (navDirectionTimer) clearTimeout(navDirectionTimer);
    navDirectionTimer = setTimeout(() => { navDirection.value = 'none'; }, 450);
  });

  onBeforeUnmount(() => {
    if (navDirectionTimer) clearTimeout(navDirectionTimer);
  });

  return { navDirection };
}
