import { clearDocument, IndexeddbPersistence } from 'y-indexeddb';
import * as Y from 'yjs';
import { mergeServerState } from './resync';

export const TEXT_DOC_DB_PREFIX = 'qcanva:textdoc:v1:';
const REGISTRY_STORAGE_KEY = 'qcanva:textdoc:v1:index';
const SYNC_TIMEOUT_MS = 3000;

export function textDocDbName(userKey: string, docId: string): string {
  return `${TEXT_DOC_DB_PREFIX}${userKey}:${docId}`;
}

export interface LocalCopy {
  readonly name: string;
  readonly persistence: IndexeddbPersistence;
  clear(): Promise<void>;
}

export type LocalCopyOutcome = 'empty' | 'restored' | 'diverged' | 'unavailable';

function getRegistry(): string[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(REGISTRY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === 'string');
    }
    return [];
  } catch {
    return [];
  }
}

function addToRegistry(name: string): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const current = getRegistry();
    if (!current.includes(name)) {
      current.push(name);
      localStorage.setItem(REGISTRY_STORAGE_KEY, JSON.stringify(current));
    }
  } catch {
    // Quota or access errors in restricted storage environments should not throw.
  }
}

function removeFromRegistry(name: string): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const current = getRegistry();
    const next = current.filter((item) => item !== name);
    localStorage.setItem(REGISTRY_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage access errors.
  }
}

function clearRegistry(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(REGISTRY_STORAGE_KEY);
  } catch {
    // Ignore storage access errors.
  }
}

function isDocEmpty(doc: Y.Doc): boolean {
  const sv = Y.decodeStateVector(Y.encodeStateVector(doc));
  return sv.size === 0;
}

async function waitForSynced(persistence: IndexeddbPersistence, timeoutMs = SYNC_TIMEOUT_MS): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('IndexedDB sync timeout')), timeoutMs);
  });
  try {
    await Promise.race([persistence.whenSynced, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function openLocalCopy(
  ydoc: Y.Doc,
  opts: { userKey: string; docId: string; serverState: Uint8Array | null }
): Promise<{ copy: LocalCopy | null; outcome: LocalCopyOutcome; hasLocalOnlyChanges: boolean }> {
  const unavailableResult = { copy: null, outcome: 'unavailable' as const, hasLocalOnlyChanges: false };

  try {
    if (typeof indexedDB === 'undefined') {
      return unavailableResult;
    }

    const name = textDocDbName(opts.userKey, opts.docId);

    // 1. Read the stored copy into a scratch Y.Doc to verify compatibility before touching ydoc.
    const scratch = new Y.Doc();
    let scratchPersistence: IndexeddbPersistence | null = null;
    try {
      scratchPersistence = new IndexeddbPersistence(name, scratch);
      await waitForSynced(scratchPersistence);
    } catch {
      if (scratchPersistence) {
        await scratchPersistence.destroy().catch(() => {});
      }
      scratch.destroy();
      return unavailableResult;
    }

    // scratchPersistence is closed so scratch stays purely in-memory and IDB locks are released.
    await scratchPersistence.destroy().catch(() => {});

    let outcome: LocalCopyOutcome;
    let hasLocalOnlyChanges = false;

    // 2. If the scratch doc is empty (empty state vector) -> outcome 'empty'.
    if (isDocEmpty(scratch)) {
      outcome = 'empty';
    } else if (opts.serverState !== null) {
      // 3. Compare with server state. Diverged means no shared history; we discard the stale local copy.
      const r = mergeServerState(scratch, opts.serverState, 'remote');
      if (r.kind === 'diverged') {
        await clearDocument(name).catch(() => {});
        removeFromRegistry(name);
        outcome = 'diverged';
        hasLocalOnlyChanges = false;
      } else {
        hasLocalOnlyChanges = r.missing !== null;
        Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(scratch), 'remote');
        outcome = 'restored';
      }
    } else {
      // Server state is null and scratch is non-empty: restore stored edits and treat them as local-only.
      hasLocalOnlyChanges = true;
      Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(scratch), 'remote');
      outcome = 'restored';
    }

    scratch.destroy();

    // 4. Attach real persistence to ydoc.
    let realPersistence: IndexeddbPersistence | null = null;
    try {
      realPersistence = new IndexeddbPersistence(name, ydoc);
      await waitForSynced(realPersistence);
      addToRegistry(name);
    } catch {
      if (realPersistence) {
        await realPersistence.destroy().catch(() => {});
      }
      return unavailableResult;
    }

    let clearPromise: Promise<void> | null = null;
    const copy: LocalCopy = {
      name,
      persistence: realPersistence,
      clear(): Promise<void> {
        if (!clearPromise) {
          clearPromise = (async () => {
            try {
              await realPersistence.clearData();
            } finally {
              removeFromRegistry(name);
            }
          })();
        }
        return clearPromise;
      },
    };

    return { copy, outcome, hasLocalOnlyChanges };
  } catch {
    return unavailableResult;
  }
}

export async function clearAllTextDocLocalCopies(): Promise<void> {
  try {
    const names = new Set<string>();

    for (const name of getRegistry()) {
      if (name.startsWith(TEXT_DOC_DB_PREFIX)) {
        names.add(name);
      }
    }

    if (typeof indexedDB !== 'undefined' && typeof indexedDB.databases === 'function') {
      try {
        const dbs = await indexedDB.databases();
        for (const db of dbs) {
          if (db.name && db.name.startsWith(TEXT_DOC_DB_PREFIX)) {
            names.add(db.name);
          }
        }
      } catch {
        // databases() is unavailable or restricted in some browsers; ignore.
      }
    }

    await Promise.all(
      Array.from(names).map(async (name) => {
        try {
          await clearDocument(name);
        } catch {
          // Deletion is best-effort and must not throw.
        }
      })
    );
  } catch {
    // Must never throw.
  } finally {
    clearRegistry();
  }
}

export function isLocalCopyOrigin(copy: LocalCopy | null, origin: unknown): boolean {
  return copy !== null && origin === copy.persistence;
}
