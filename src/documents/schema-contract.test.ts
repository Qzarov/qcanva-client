import { describe, expect, it } from 'vitest';
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

  it('lists one record per node, per mark and per declared value set', () => {
    // 16 DOCUMENT_NODES entries + 6 MARK_TAGS entries + 1 attrValues entry.
    expect(canonicalSchema().split('\n')).toHaveLength(23);
  });
});
