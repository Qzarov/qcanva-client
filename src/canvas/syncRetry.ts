export type CanvasOp = { type: string } & Record<string, unknown>;
export type PendingCanvasOp = { op: CanvasOp; retryCount: number };
export type CanvasSyncReject = { reason: string; serverRevision?: number };

const RETRYABLE = new Set(['nodes-move', 'node-resize', 'node-update', 'edge-update']);

export function isRetryableCanvasOp(op: CanvasOp): boolean {
  return RETRYABLE.has(op.type);
}

export function shouldRetryCanvasReject(
  reject: CanvasSyncReject,
  pending: PendingCanvasOp | undefined,
): boolean {
  if (!pending) return false;
  if (reject.reason !== 'revision_mismatch') return false;
  if (reject.serverRevision === undefined) return false;
  if (!isRetryableCanvasOp(pending.op)) return false;
  if (pending.retryCount >= 1) return false;
  return true;
}
