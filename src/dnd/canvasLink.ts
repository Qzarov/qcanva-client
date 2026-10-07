import type { RollTarget } from '../composables/useCharacterSheetSocket';

/**
 * Where a sheet's rolls go, in words: shared by the menu row that shows it
 * and the dialog that changes it.
 */
export type CanvasLinkState = 'none' | 'checking' | RollTarget['status'];

export function canvasLinkState(canvasId: string, target: RollTarget | null): CanvasLinkState {
  if (!canvasId) return 'none';
  // An answer about another canvas is stale: the connection has just changed.
  if (!target || (target.canvasId && target.canvasId !== canvasId)) return 'checking';
  return target.status === 'not_linked' ? 'checking' : target.status;
}

export const canvasLinkWarning = (state: CanvasLinkState) =>
  state === 'forbidden' || state === 'plugin_disabled' || state === 'canvas_missing';

export const canvasLinkTitle = (target: RollTarget | null) => target?.title?.trim() || 'канвас';

/** The short state: the pill's text in the header, the second line of the menu row. */
export function canvasLinkLabel(state: CanvasLinkState, target: RollTarget | null): string {
  if (state === 'none') return 'Подключить канвас';
  if (state === 'ok') return canvasLinkTitle(target);
  if (state === 'checking') return 'Канвас…';
  return 'Броски только у вас';
}

/** One sentence for a tooltip or an accessible name. */
export function canvasLinkHint(state: CanvasLinkState, target: RollTarget | null): string {
  if (state === 'none') return 'Подключить персонажа к канвасу: броски пойдут в его чат';
  if (state === 'ok') return `Броски уходят в чат канваса «${canvasLinkTitle(target)}»`;
  if (state === 'checking') return 'Проверяем подключение к канвасу';
  return 'Броски не попадают в чат канваса — нажмите, чтобы узнать почему';
}
