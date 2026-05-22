import { describe, expect, it } from 'vitest';
import { isRetryableCanvasOp, shouldRetryCanvasReject } from './syncRetry';

describe('syncRetry', () => {
  it('retries safe update operations once on revision mismatch with server revision', () => {
    const safeOps = [
      { type: 'nodes-move', moves: [{ id: 'node-1', x: 10, y: 20 }] },
      { type: 'node-resize', id: 'node-1', x: 0, y: 0, width: 200, height: 120 },
      { type: 'node-update', id: 'node-1', changes: { text: 'Updated' } },
      { type: 'edge-update', id: 'edge-1', changes: { label: 'Next' } },
    ];

    for (const op of safeOps) {
      expect(isRetryableCanvasOp(op)).toBe(true);
      expect(shouldRetryCanvasReject(
        { reason: 'revision_mismatch', serverRevision: 4 },
        { op, retryCount: 0 },
      )).toBe(true);
    }
  });

  it('does not retry add and delete operations', () => {
    expect(isRetryableCanvasOp({ type: 'node-add', node: { id: 'node-1' } })).toBe(false);
    expect(isRetryableCanvasOp({ type: 'node-delete', ids: ['node-1'] })).toBe(false);
    expect(isRetryableCanvasOp({ type: 'edge-add', edge: { id: 'edge-1' } })).toBe(false);
    expect(isRetryableCanvasOp({ type: 'edge-delete', id: 'edge-1' })).toBe(false);
  });

  it('does not retry target_missing rejects', () => {
    expect(shouldRetryCanvasReject(
      { reason: 'target_missing', serverRevision: 4 },
      { op: { type: 'node-update', id: 'node-1', changes: {} }, retryCount: 0 },
    )).toBe(false);
  });

  it('does not retry without metadata or after one retry', () => {
    expect(shouldRetryCanvasReject(
      { reason: 'revision_mismatch', serverRevision: 4 },
      undefined,
    )).toBe(false);
    expect(shouldRetryCanvasReject(
      { reason: 'revision_mismatch', serverRevision: 4 },
      { op: { type: 'node-update', id: 'node-1', changes: {} }, retryCount: 1 },
    )).toBe(false);
    expect(shouldRetryCanvasReject(
      { reason: 'revision_mismatch' },
      { op: { type: 'node-update', id: 'node-1', changes: {} }, retryCount: 0 },
    )).toBe(false);
  });
});
