import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Read the global stylesheet with its ordered local imports expanded. */
export function readGlobalCss(): string {
  const entry = readFileSync(resolve(process.cwd(), 'src/style.css'), 'utf8');
  return entry.replace(/^@import\s+['"]\.\/([^'"]+)['"];\s*$/gm, (_match, path: string) => (
    readFileSync(resolve(process.cwd(), 'src', path), 'utf8')
  ));
}
