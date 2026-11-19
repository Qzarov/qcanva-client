import { typePasses, type DashboardContentType } from './content-filter';

export type ResourceTag = { name: string };
export type FilterableResource = {
  type: string;
  title?: string | null;
  tags?: ResourceTag[];
  folder?: string | null;
  pinned?: boolean;
  updatedAt?: string | null;
};
export type ResourceSortMode = 'updated-desc' | 'updated-asc' | 'title-asc' | 'title-desc';
export type ResourceFilterOptions = {
  contentTypes: DashboardContentType[];
  searchQuery: string;
  selectedTags: string[];
};

const normalizedQuery = (query: string) => query.trim().toLowerCase();

export const matchesSelectedTags = (tags: ResourceTag[] = [], selectedTags: string[]) =>
  selectedTags.length === 0 || selectedTags.some((selected) => tags.some((tag) => tag.name === selected));

const matchesResource = (item: FilterableResource, searchContext: string, options: ResourceFilterOptions) => {
  if (!typePasses(options.contentTypes, item.type as DashboardContentType)) return false;
  const query = normalizedQuery(options.searchQuery);
  const tags = item.tags || [];
  const matchesQuery = !query || `${item.title || ''} ${searchContext} ${tags.map((tag) => tag.name).join(' ')}`.toLowerCase().includes(query);
  return matchesQuery && matchesSelectedTags(tags, options.selectedTags);
};

export const matchesCanvas = (item: FilterableResource, options: ResourceFilterOptions) =>
  matchesResource(item, item.folder || '', options);

export const matchesFolderItem = (item: FilterableResource, folderName: string, options: ResourceFilterOptions) =>
  matchesResource(item, folderName, options);

export const matchesPublicItem = (item: FilterableResource, options: ResourceFilterOptions) =>
  matchesResource(item, 'Public', options);

export const sortResources = <T extends FilterableResource>(items: T[], sortMode: ResourceSortMode) => [...items].sort((a, b) => {
  if (Boolean(a.pinned) !== Boolean(b.pinned)) {
    return a.pinned ? -1 : 1;
  }
  if (sortMode === 'title-asc' || sortMode === 'title-desc') {
    const result = (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' });
    return sortMode === 'title-asc' ? result : -result;
  }
  const result = new Date(a.updatedAt || 0).getTime() - new Date(b.updatedAt || 0).getTime();
  return sortMode === 'updated-asc' ? result : -result;
});
