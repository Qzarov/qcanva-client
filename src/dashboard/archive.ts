import { strToU8, zip, type Zippable } from 'fflate';

/**
 * Downloading several dashboard items at once: each becomes a file in one
 * zip - a canvas its .canvas (the JSON the canvas exports), an HTML document
 * its page, a text document its HTML, a template its data as JSON.
 */
export type ArchiveFile = { name: string; content: string };

/** A title fit for a file name: no path separators or characters the systems refuse. */
export function safeFileName(title: string | null | undefined, fallback: string): string {
  const cleaned = (title || '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .slice(0, 100)
    .trim();
  return cleaned || fallback;
}

/** `base.ext`, or `base (2).ext`, `base (3).ext` once the name is taken. */
export function uniqueFileName(base: string, extension: string, taken: Set<string>): string {
  let name = `${base}.${extension}`;
  for (let n = 2; taken.has(name.toLowerCase()); n += 1) name = `${base} (${n}).${extension}`;
  taken.add(name.toLowerCase());
  return name;
}

/** A canvas's stored data, pretty-printed when it is JSON. */
export function canvasFileContent(data: unknown): string {
  if (typeof data !== 'string') return JSON.stringify(data ?? { nodes: [], edges: [] }, null, 2);
  try {
    return JSON.stringify(JSON.parse(data), null, 2);
  } catch {
    return data;
  }
}

const escapeHtml = (text: string) => text
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

/** A text document comes back as an HTML fragment: give it a page of its own. */
export function textDocumentFileContent(title: string, fragment: string): string {
  return `<!doctype html>\n<html>\n<head>\n<meta charset="utf-8">\n<title>${escapeHtml(title)}</title>\n</head>\n<body>\n${fragment}\n</body>\n</html>\n`;
}

export function buildZip(files: readonly ArchiveFile[]): Promise<Blob> {
  const entries: Zippable = {};
  for (const file of files) entries[file.name] = strToU8(file.content);
  return new Promise((resolve, reject) => {
    zip(entries, { level: 6 }, (error, data) => {
      if (error) reject(error);
      else resolve(new Blob([data as Uint8Array<ArrayBuffer>], { type: 'application/zip' }));
    });
  });
}

export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Give the browser the time to start the download before the link goes.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
