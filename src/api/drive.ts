import { request } from './client';

export type DriveSlice = 'all' | 'media' | 'files' | 'docs';
export type DriveSort = 'name' | 'date' | 'size';
export type DriveOrder = 'asc' | 'desc';
export type DriveFolderRole = 'owner' | 'editor' | 'viewer';

export type DriveItemKind =
  | 'folder'
  | 'canvas'
  | 'text-document'
  | 'html-document'
  | 'board'
  | 'sheet'
  | 'file'
  | 'photo'
  | 'video';

export interface DriveFolderNode {
  id: string;
  name: string | null;
  parentId: string | null;
  ownerId: string;
  role: DriveFolderRole;
  createdAt?: string;
  updatedAt?: string;
}

export interface DriveBreadcrumb {
  id: string;
  name: string;
}

export interface DriveFolderCounts {
  media: number;
  files: number;
  docs: number;
  folders: number;
}

export interface DriveFolderResponse {
  folder: DriveFolderNode;
  path: DriveBreadcrumb[];
  counts: DriveFolderCounts;
}

export interface DriveItem {
  kind: DriveItemKind;
  id: string;
  name: string;
  mime: string | null;
  sizeBytes: number | null;
  sortDate: string;
  updatedAt: string;
  ownerId: string;
  folderId: string | null;
  placed?: boolean;
  parentId?: string | null;
  snippet?: string | null;
}

export interface DriveItemsResponse {
  items: DriveItem[];
  nextCursor: string | null;
}

export interface DriveSearchResponse {
  items: DriveItem[];
  nextCursor: string | null;
}

export interface DriveItemsQuery {
  slice?: DriveSlice;
  sort?: DriveSort;
  order?: DriveOrder;
  cursor?: string | null;
  limit?: number;
}

export interface DriveSearchQuery {
  q: string;
  slice?: DriveSlice;
  folderId?: string | null;
  cursor?: string | null;
  limit?: number;
}

function buildQueryString(params: Record<string, string | number | undefined | null>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  }
  const qs = query.toString();
  return qs ? `?${qs}` : '';
}

export const driveApi = {
  getFolder(id: string): Promise<DriveFolderResponse> {
    return request<DriveFolderResponse>(`/drive/folders/${encodeURIComponent(id)}`);
  },

  getFolderItems(id: string, params: DriveItemsQuery = {}): Promise<DriveItemsResponse> {
    const qs = buildQueryString({
      slice: params.slice,
      sort: params.sort,
      order: params.order,
      cursor: params.cursor,
      limit: params.limit,
    });
    return request<DriveItemsResponse>(`/drive/folders/${encodeURIComponent(id)}/items${qs}`);
  },

  search(params: DriveSearchQuery): Promise<DriveSearchResponse> {
    const qs = buildQueryString({
      q: params.q,
      slice: params.slice,
      folderId: params.folderId,
      cursor: params.cursor,
      limit: params.limit,
    });
    return request<DriveSearchResponse>(`/drive/search${qs}`);
  },
};
