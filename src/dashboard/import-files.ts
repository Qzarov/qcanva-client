/**
 * What the dashboard's Add dialog can import, and whether a chosen file is
 * that: the user says what they upload, the file is checked against it, and
 * a file that is not what was said is told apart (so another kind can be
 * picked, or the file sent to the Drive as it is).
 */
export type ImportKind = 'file' | 'canvas' | 'html';

export type ImportProblem = 'empty' | 'notJson' | 'notCanvas' | 'notHtml';

export type ImportCheck = { ok: true } | { ok: false; problem: ImportProblem };

/** What the file picker offers for each kind; any file for the Drive. */
export function importAccept(kind: ImportKind): string | undefined {
  if (kind === 'canvas') return '.canvas,.json,application/json';
  if (kind === 'html') return '.html,.htm,text/html';
  return undefined;
}

/** A canvas file is JSON with the canvas's nodes and edges. */
export function isCanvasData(data: unknown): boolean {
  return Boolean(
    data && typeof data === 'object'
    && (Array.isArray((data as { nodes?: unknown }).nodes) || Array.isArray((data as { edges?: unknown }).edges)),
  );
}

const HTML_TAG = /<\s*(!doctype|html|head|body|main|header|footer|section|article|div|p|h[1-6]|span|table|ul|ol|img|a|style|script)\b/i;

export async function checkImportFile(kind: ImportKind, file: File): Promise<ImportCheck> {
  if (kind === 'file') return { ok: true };
  const text = await file.text();
  if (!text.trim()) return { ok: false, problem: 'empty' };
  if (kind === 'canvas') {
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return { ok: false, problem: 'notJson' };
    }
    return isCanvasData(data) ? { ok: true } : { ok: false, problem: 'notCanvas' };
  }
  // A binary file read as text has NUL bytes; a page has tags.
  if (text.includes('\u0000') || !HTML_TAG.test(text)) return { ok: false, problem: 'notHtml' };
  return { ok: true };
}

/** The resource's title: the file's name without its extension. */
export function importTitle(name: string): string {
  return name.replace(/\.(canvas|json|html?)$/i, '').trim() || 'Imported';
}
