import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CAPACITY_WARN_PERCENT,
  MAX_TOP_LEVEL_BLOCKS,
  allowsBlockCountChange,
  capacityLevel,
  capacityWarnThreshold,
  documentCapacityFor,
} from './document-capacity';

const REPO_ROOT = join(__dirname, '..', '..');

/**
 * Every file that could plausibly hold the warning threshold: the module that
 * derives it, the contract it is serialized into, the guard that reads it and
 * the view that draws it.
 */
const CAPACITY_SOURCES = [
  'src/documents/document-capacity.ts',
  'src/documents/schema-contract.ts',
  'src/text-documents/capacity-guard.ts',
  'src/views/TextDocumentView.vue',
];

/**
 * Comments are prose and legitimately name the number this bans from the CODE
 * - the module's own doc comment explains why writing it is the bug.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('document capacity', () => {
  it('keeps the ceiling at 200 top-level blocks', () => {
    expect(MAX_TOP_LEVEL_BLOCKS).toBe(200);
  });

  it('derives the warning threshold from the limit, at any limit', () => {
    // The point of these four is that ONE of them is 180. A threshold
    // hardcoded to 180 satisfies the first line and fails every other, which
    // is the only way a single-value assertion can be made to notice.
    expect(capacityWarnThreshold(200)).toBe(180);
    expect(capacityWarnThreshold(100)).toBe(90);
    expect(capacityWarnThreshold(50)).toBe(45);
    expect(capacityWarnThreshold(11)).toBe(9);
  });

  it('defaults the threshold to the shared limit', () => {
    expect(capacityWarnThreshold()).toBe(
      Math.floor((MAX_TOP_LEVEL_BLOCKS * CAPACITY_WARN_PERCENT) / 100),
    );
  });

  it('never writes the warning threshold as a literal anywhere', () => {
    // The threshold is a percentage OF the limit and must stay derived: a
    // literal keeps working until someone changes the limit, at which point
    // the warning silently lands somewhere arbitrary and no assertion about
    // the current values can see it.
    for (const relative of CAPACITY_SOURCES) {
      const code = stripComments(readFileSync(join(REPO_ROOT, relative), 'utf8'));
      expect({ relative, hit: /\b180\b/.test(code) }).toEqual({ relative, hit: false });
    }
  });

  describe('capacityLevel', () => {
    it('is quiet below the threshold, warns at it, and is full at the limit', () => {
      expect(capacityLevel(0)).toBe('ok');
      expect(capacityLevel(capacityWarnThreshold() - 1)).toBe('ok');
      expect(capacityLevel(capacityWarnThreshold())).toBe('warn');
      expect(capacityLevel(MAX_TOP_LEVEL_BLOCKS - 1)).toBe('warn');
      expect(capacityLevel(MAX_TOP_LEVEL_BLOCKS)).toBe('full');
      expect(capacityLevel(MAX_TOP_LEVEL_BLOCKS + 60)).toBe('full');
    });

    it('follows a different limit rather than the default', () => {
      expect(capacityLevel(45, 50)).toBe('warn');
      expect(capacityLevel(50, 50)).toBe('full');
    });
  });

  describe('documentCapacityFor', () => {
    it('reports the count, the limit and the derived threshold', () => {
      expect(documentCapacityFor(12)).toEqual({
        blocks: 12,
        limit: MAX_TOP_LEVEL_BLOCKS,
        warnAt: capacityWarnThreshold(MAX_TOP_LEVEL_BLOCKS),
        overLimit: false,
      });
    });
  });

  describe('allowsBlockCountChange', () => {
    it('allows growth up to the limit and refuses it past', () => {
      expect(allowsBlockCountChange(198, 199)).toBe(true);
      expect(allowsBlockCountChange(199, 200)).toBe(true);
      expect(allowsBlockCountChange(200, 201)).toBe(false);
    });

    it('refuses a paste whole rather than truncating it', () => {
      expect(allowsBlockCountChange(197, 237)).toBe(false);
      expect(allowsBlockCountChange(160, 200)).toBe(true);
    });

    it('NEVER refuses a change that does not grow the block count', () => {
      // The property that keeps an over-limit document usable. Editing inside
      // a block leaves the count alone; deleting lowers it. Both stay allowed
      // at any size, or the owner of an imported 400-block document would be
      // locked out of the one document they most need to fix.
      expect(allowsBlockCountChange(240, 240)).toBe(true);
      expect(allowsBlockCountChange(240, 239)).toBe(true);
      expect(allowsBlockCountChange(240, 1)).toBe(true);
      expect(allowsBlockCountChange(201, 200)).toBe(true);
    });

    it('still refuses growth on a document that is already over', () => {
      expect(allowsBlockCountChange(240, 241)).toBe(false);
    });
  });
});
