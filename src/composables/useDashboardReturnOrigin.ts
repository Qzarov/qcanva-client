import type { RouteLocationNormalized } from 'vue-router';
import type { DashboardSection } from '../dashboard/navigation';

export type DashboardReturnMode = 'files' | 'media';

export interface DashboardReturnOrigin {
  mode: DashboardReturnMode;
  section: DashboardSection;
  gallerySection?: string;
  galleryAlbumId?: string | null;
  galleryFolderId?: string | null;
  pending: boolean;
  savedAt: number;
}

export interface SaveDashboardReturnOriginInput {
  mode: DashboardReturnMode;
  section: DashboardSection;
  gallerySection?: string;
  galleryAlbumId?: string | null;
  galleryFolderId?: string | null;
}

export const DASHBOARD_RETURN_ORIGIN_STORAGE_KEY = 'qspace:dashboardReturnOrigin:v1';

const RESOURCE_ROUTE_NAMES = new Set([
  'canvas',
  'text-document',
  'html-document',
  'interactive-template',
  'board-template',
]);

const RESOURCE_PATH_PREFIXES = [
  '/canvas/',
  '/docs/',
  '/edit/html/',
  '/templates/',
];

const SIMPLE_SECTION_KINDS = new Set([
  'home',
  'shared',
  'interactive',
  'public',
  'drive',
  'trash',
  'spaces',
  'gallery',
  'recent',
]);

let cachedOrigin: DashboardReturnOrigin | null = null;

function getSessionStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' && window.sessionStorage ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

function cloneSection(section: DashboardSection): DashboardSection {
  if (section.kind === 'folder') {
    return { kind: 'folder', folderId: section.folderId };
  }
  if (section.kind === 'yandex') {
    return { kind: 'yandex', path: section.path };
  }
  if (section.kind === 'space') {
    return {
      kind: 'space',
      spaceId: section.spaceId,
      ...(section.folderId ? { folderId: section.folderId } : {}),
      ...(section.yandexSourceId
        ? { yandexSourceId: section.yandexSourceId, yandexSubpath: section.yandexSubpath ?? '' }
        : {}),
    };
  }
  return { kind: section.kind };
}

function parseSection(raw: unknown): DashboardSection | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const kind = record.kind;
  if (typeof kind !== 'string') return null;
  if (kind === 'folder') {
    return typeof record.folderId === 'string' && record.folderId
      ? { kind: 'folder', folderId: record.folderId }
      : null;
  }
  if (kind === 'yandex') {
    return typeof record.path === 'string'
      ? { kind: 'yandex', path: record.path }
      : { kind: 'yandex', path: '/' };
  }
  if (kind === 'space') {
    if (typeof record.spaceId !== 'string' || !record.spaceId) return null;
    const folderId = typeof record.folderId === 'string' && record.folderId ? record.folderId : undefined;
    const yandexSourceId = typeof record.yandexSourceId === 'string' && record.yandexSourceId ? record.yandexSourceId : undefined;
    const yandexSubpath = typeof record.yandexSubpath === 'string' ? record.yandexSubpath : undefined;
    return {
      kind: 'space',
      spaceId: record.spaceId,
      ...(folderId ? { folderId } : {}),
      ...(yandexSourceId ? { yandexSourceId, yandexSubpath: yandexSubpath ?? '' } : {}),
    };
  }
  if (SIMPLE_SECTION_KINDS.has(kind)) {
    return { kind } as DashboardSection;
  }
  return null;
}

function parseStoredOrigin(raw: unknown): DashboardReturnOrigin | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const section = parseSection(record.section);
  if (!section) return null;
  const mode: DashboardReturnMode = record.mode === 'media' || section.kind === 'gallery' ? 'media' : 'files';
  return {
    mode,
    section,
    ...(typeof record.gallerySection === 'string' ? { gallerySection: record.gallerySection } : {}),
    galleryAlbumId: typeof record.galleryAlbumId === 'string' ? record.galleryAlbumId : null,
    galleryFolderId: typeof record.galleryFolderId === 'string' ? record.galleryFolderId : null,
    pending: Boolean(record.pending),
    savedAt: typeof record.savedAt === 'number' && Number.isFinite(record.savedAt) ? record.savedAt : Date.now(),
  };
}

function cloneOrigin(origin: DashboardReturnOrigin): DashboardReturnOrigin {
  return {
    mode: origin.mode,
    section: cloneSection(origin.section),
    ...(origin.gallerySection !== undefined ? { gallerySection: origin.gallerySection } : {}),
    galleryAlbumId: origin.galleryAlbumId ?? null,
    galleryFolderId: origin.galleryFolderId ?? null,
    pending: origin.pending,
    savedAt: origin.savedAt,
  };
}

function persistOrigin(origin: DashboardReturnOrigin | null): void {
  const storage = getSessionStorage();
  if (!storage) return;
  try {
    if (!origin) {
      storage.removeItem(DASHBOARD_RETURN_ORIGIN_STORAGE_KEY);
    } else {
      storage.setItem(DASHBOARD_RETURN_ORIGIN_STORAGE_KEY, JSON.stringify(origin));
    }
  } catch {
    // Ignore storage quota or privacy-mode errors; module state still works in-memory.
  }
}

function readOrigin(): DashboardReturnOrigin | null {
  if (cachedOrigin) return cachedOrigin;
  const storage = getSessionStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(DASHBOARD_RETURN_ORIGIN_STORAGE_KEY);
    if (!raw) return null;
    const parsed = parseStoredOrigin(JSON.parse(raw));
    if (!parsed) {
      storage.removeItem(DASHBOARD_RETURN_ORIGIN_STORAGE_KEY);
      return null;
    }
    cachedOrigin = parsed;
    return parsed;
  } catch {
    return null;
  }
}

export function isResourceEditorRoute(
  to: Pick<RouteLocationNormalized, 'name' | 'path'> | null | undefined,
): boolean {
  if (!to) return false;
  if (typeof to.name === 'string' && RESOURCE_ROUTE_NAMES.has(to.name)) return true;
  const path = typeof to.path === 'string' ? to.path : '';
  return RESOURCE_PATH_PREFIXES.some((prefix) => path.startsWith(prefix));
}

export function saveDashboardReturnOrigin(input: SaveDashboardReturnOriginInput): void {
  const origin: DashboardReturnOrigin = {
    mode: input.mode,
    section: cloneSection(input.section),
    ...(input.gallerySection !== undefined ? { gallerySection: input.gallerySection } : {}),
    galleryAlbumId: input.galleryAlbumId ?? null,
    galleryFolderId: input.galleryFolderId ?? null,
    pending: true,
    savedAt: Date.now(),
  };
  cachedOrigin = origin;
  persistOrigin(origin);
}

export function peekDashboardReturnOrigin(): DashboardReturnOrigin | null {
  const origin = readOrigin();
  if (!origin || !origin.pending) return null;
  return cloneOrigin(origin);
}

export function consumeDashboardReturnOrigin(): DashboardReturnOrigin | null {
  const origin = readOrigin();
  if (!origin || !origin.pending) return null;
  const result = cloneOrigin(origin);
  cachedOrigin = { ...origin, pending: false };
  persistOrigin(cachedOrigin);
  return result;
}

export function clearDashboardReturnOrigin(): void {
  cachedOrigin = null;
  persistOrigin(null);
}

export function resetDashboardReturnOriginForTests(): void {
  clearDashboardReturnOrigin();
}
