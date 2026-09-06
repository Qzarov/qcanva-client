import { describe, expect, it } from 'vitest';
import {
  CALLOUT_VARIANTS,
  DOCUMENT_NODES,
  clampCalloutVariant,
  nodeSpec,
} from './document-nodes';

/**
 * This file guards the half of the shared inventory that `canonicalSchema()`
 * pins as DATA but that no consumer here was obliged to honour: the callout's
 * variant bound. `schema-contract.test.ts` proves this copy of the table
 * matches the backend's byte for byte; it never proves a reader of the table
 * behaves.
 */
describe('the shared node inventory: callout', () => {
  it('describes a callout as an aside carrying a variant', () => {
    const spec = nodeSpec('callout');
    expect(spec?.group).toBe('block');
    expect(spec?.tag).toBe('aside');
    expect(spec?.attrs).toEqual(['variant']);
    expect(spec?.selfClosing).toBeUndefined();
  });

  it('separates a callout from its neighbours in plain text', () => {
    // The backend's renderPlainText both PREPENDS and appends this, so a
    // callout's text cannot be glued onto the block before it. Dropping it
    // would give the unsearchable "SchemaNote".
    expect(nodeSpec('callout')?.textSeparator).toBe('\n');
  });

  it('declares the closed set a variant may take, in fallback order', () => {
    // The first entry is the fallback clampCalloutVariant coerces to, so the
    // order is part of the contract. The same literal is committed in
    // canvas-server-back, and the canonical schema string carries it across.
    expect(CALLOUT_VARIANTS).toEqual(['info', 'warning', 'success', 'danger']);
    expect(nodeSpec('callout')?.attrValues?.variant).toBe(CALLOUT_VARIANTS);
  });
});

describe('the shared node inventory: mention', () => {
  it('describes a mention as an inline atom carrying an id and a label', () => {
    const spec = nodeSpec('mention');
    expect(spec?.group).toBe('inline');
    expect(spec?.tag).toBe('span');
    expect(spec?.attrs).toEqual(['id', 'label']);
    expect(spec?.selfClosing).toBe(true);
    // Inline: unlike callout or image, it must not force a break in plain
    // text around itself - it sits in the middle of a sentence.
    expect(spec?.textSeparator).toBeUndefined();
  });
});

describe('clampCalloutVariant', () => {
  it('keeps each declared variant', () => {
    for (const variant of CALLOUT_VARIANTS) {
      expect(clampCalloutVariant(variant)).toBe(variant);
    }
  });

  it('falls back to info for anything outside the declared set', () => {
    // A collaborator's Yjs update reaches this editor without passing the
    // backend's renderer, so an arbitrary value is genuinely reachable here.
    for (const hostile of [
      'purple',
      'INFO',
      '',
      'info" onmouseover="alert(1)',
      undefined,
      null,
      7,
      {},
      ['danger'],
      { toString: () => 'danger' },
    ]) {
      expect(clampCalloutVariant(hostile)).toBe('info');
    }
  });

  it('reads the allowed set from the inventory rather than a private copy', () => {
    // If the declaration were decoration, this bound would still accept a
    // variant the inventory no longer names - which is how orderedList.start
    // came to be declared, stored, pinned and silently dropped.
    const spec = DOCUMENT_NODES.find((entry) => entry.name === 'callout');
    const declared = spec?.attrValues?.variant;
    expect(declared).toBeDefined();
    const original = [...(declared as string[])];
    try {
      (declared as string[]).splice(0, original.length, 'warning', 'info');
      expect(clampCalloutVariant('success')).toBe('warning');
    } finally {
      (declared as string[]).splice(0, (declared as string[]).length, ...original);
    }
    expect(clampCalloutVariant('success')).toBe('success');
  });
});
