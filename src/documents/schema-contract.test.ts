import { describe, expect, it } from 'vitest';
import { CAPACITY_WARN_PERCENT, MAX_TOP_LEVEL_BLOCKS } from './document-capacity';
import { EXPECTED_SCHEMA, canonicalSchema } from './schema-contract';

describe('schema contract', () => {
  it('matches the canonical string shared with canvas-server-back', () => {
    // If this fails, this copy of the node inventory and the backend's have
    // drifted. Update both copies, then paste the identical canonical string
    // into EXPECTED_SCHEMA in both repositories.
    expect(canonicalSchema()).toBe(EXPECTED_SCHEMA);
  });

  it('lists one line per node and per mark', () => {
    const lines = canonicalSchema().split('\n');
    // paragraph's textSeparator ("\n", a real newline) is escaped to the two
    // literal characters backslash-n within its field, not a real newline, so
    // this whole record is one line ending in a literal "\n".
    expect(lines).toContain('paragraph|block|p|||\\n');
    expect(lines).toContain('bold=strong');
  });

  it('carries a declared attribute\'s closed value set as its own record', () => {
    // Without this section the two repositories could disagree about which
    // callout variants exist while every test in both stayed green AND the
    // deploy-time byte comparison of the two EXPECTED_SCHEMA literals passed:
    // the node record names the attribute, never its values.
    expect(canonicalSchema().split('\n')).toContain(
      'callout.variant?info,warning,success,danger',
    );
  });

  it('carries the block ceiling and the warning percentage as their own records', () => {
    // The limit is a CONTRACT: this editor refuses to add a block past it
    // while the backend reports the count against it. If the two repositories
    // disagreed, a user would be stopped at a number the other half does not
    // believe in - and no test in either repository could see it, which is
    // exactly what the deploy-time byte comparison of this string is for.
    const lines = canonicalSchema().split('\n');
    expect(lines).toContain(`maxTopLevelBlocks#${MAX_TOP_LEVEL_BLOCKS}`);
    // The WARNING is serialized as a percentage of the limit, never as the
    // block count it works out to: there is no second number for the two
    // sides to derive differently, and none to paste in as a literal.
    expect(lines).toContain(`warnPercent#${CAPACITY_WARN_PERCENT}`);
    expect(canonicalSchema()).not.toMatch(/\b180\b/);
  });

  it('uses a capacity separator that cannot be read as any other record', () => {
    // `#` is the fourth delimiter in this format, after `|` (node fields),
    // `=` (marks) and `?`/`,`/`.` (attribute value sets).
    const capacity = canonicalSchema()
      .split('\n')
      .filter((line) => line.includes('#'));
    expect(capacity).toHaveLength(2);
    for (const line of capacity) expect(line).not.toMatch(/[|=?,.]/);
  });

  it('lists one record per node, per mark, per declared value set and per limit', () => {
    // 16 DOCUMENT_NODES entries + 6 MARK_TAGS entries + 1 attrValues entry
    // + 2 capacity entries.
    expect(canonicalSchema().split('\n')).toHaveLength(25);
  });
});
