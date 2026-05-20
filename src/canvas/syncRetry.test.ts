import { describe, expect, it } from 'vitest';
import { isRetryableCanvasOp, shouldRetryCanvasReject } from './syncRetry';

describe('syncRetry', () => {
  it('retries node-update once on revision mismatch with server revision', () => {
    const op = { type: 'node-update', id: 'node-1', changes: { text: 'Updated' } };

    expect(isRetryableCanvasOp(op)).toBe(true);
    expect(shouldRetryCanvasReject(
      { reason: 'revision_mismatch', serverRevision: 4 },
      { op, retryCount: 0 },
    )).toBe(true);
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
