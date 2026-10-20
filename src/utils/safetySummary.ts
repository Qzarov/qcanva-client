import { isDeviceOnline, type DriveDevice, type DriveSafety } from '../api/drive';
import {
  filesPluralKey,
  formatDuration,
  formatFilesAndSize,
  formatRelativeTime,
  pendingSplit,
  plainError,
  syncStateKey,
  type Translate,
} from './deviceStatus';

/** Pending files that have not moved for this long count as stuck. */
export const STALL_AFTER_MS = 10 * 60 * 1000;
/** An upload that would take longer than this is reported as stuck, too. */
export const SLOW_AFTER_MS = 24 * 3600 * 1000;

export type SafetyLevel = 'ok' | 'attention' | 'loss';

/** One statement of the "Are my files safe?" block. */
export interface SafetyNotice {
  id: 'nowhere' | 'stalled' | 'notOnHub' | 'uploading' | 'ok';
  level: SafetyLevel;
  title: string;
  /** Muted lines under the title, one sentence or one device per line. */
  lines: string[];
  /** One plain instruction, or null. */
  hint: string | null;
}

export interface SafetyContext {
  t: Translate;
  locale: string;
  now: number;
  devices: DriveDevice[];
  /**
   * When the pending count of an online device was first seen unchanged (ms), for agents that do
   * not report `lastProgressAt`. Undefined: not tracked.
   */
  pendingSince?: (deviceId: string) => number | undefined;
}

/**
 * Pending files that can move now. A `waiting` device (everything pending sits on offline
 * devices) has none: that is an explained wait, not a stall.
 */
function pendingOf(device: DriveDevice): { files: number; bytes: number } {
  if (syncStateKey(device) === 'waiting') return { files: 0, bytes: 0 };
  const split = pendingSplit(device);
  return { files: split.movingFiles, bytes: split.movingBytes };
}

function hasPending(device: DriveDevice): boolean {
  const p = pendingOf(device);
  return p.files > 0 || p.bytes > 0;
}

/** Moment since which the pending files of a device have not moved (ms), or null when it is moving or unknown. */
export function stalledSince(device: DriveDevice, ctx: Pick<SafetyContext, 'now' | 'pendingSince'>): number | null {
  if (!hasPending(device)) return null;
  const progress = Date.parse(device.syncStatus?.lastProgressAt ?? '');
  let since: number | undefined;
  if (Number.isFinite(progress)) {
    since = progress;
  } else if (!isDeviceOnline(device.lastSeenAt, ctx.now)) {
    // Offline: nothing has changed since its last report.
    const reported = Date.parse(device.syncStatusAt ?? device.lastSeenAt ?? '');
    since = Number.isFinite(reported) ? reported : undefined;
  } else if (!(device.syncStatus?.speedBps && device.syncStatus.speedBps > 0)) {
    since = ctx.pendingSince?.(device.id);
  }
  if (since === undefined || ctx.now - since <= STALL_AFTER_MS) return null;
  return since;
}

/** Remaining time of the upload in ms from the reported speeds, or null without a speed. */
export function etaMs(safety: DriveSafety, devices: DriveDevice[]): number | null {
  let speed = 0;
  let pendingBytes = 0;
  for (const d of devices) {
    if (!hasPending(d)) continue;
    pendingBytes += pendingOf(d).bytes;
    const s = d.syncStatus?.speedBps;
    if (typeof s === 'number' && s > 0) speed += s;
  }
  if (speed <= 0) return null;
  const remaining = safety.uploading.bytes > 0 ? safety.uploading.bytes : pendingBytes;
  return (remaining / speed) * 1000;
}

function etaText(ms: number, ctx: SafetyContext): string {
  if (ms < 60_000) return ctx.t('cupSafetyAboutLess');
  return ctx.t('cupSafetyAbout').replace('{eta}', formatDuration(ms, ctx.locale, ctx.t));
}

function isOne(n: number, locale: string): boolean {
  return filesPluralKey(n, locale) === 'one';
}

function pick(n: number, ctx: SafetyContext, many: Parameters<Translate>[0], one: Parameters<Translate>[0]): string {
  return ctx.t(isOne(n, ctx.locale) ? one : many);
}

function sizeOf(files: number, bytes: number, ctx: SafetyContext): string {
  return formatFilesAndSize(files, bytes, ctx.locale, ctx.t);
}

interface Stall {
  device: DriveDevice;
  /** ms since the files stopped moving; null when it is only the 24 h estimate. */
  waitedMs: number | null;
}

function findStall(safety: DriveSafety, ctx: SafetyContext): Stall | null {
  let worst: { device: DriveDevice; since: number } | null = null;
  for (const d of ctx.devices) {
    const since = stalledSince(d, ctx);
    if (since !== null && (!worst || since < worst.since)) worst = { device: d, since };
  }
  if (worst) return { device: worst.device, waitedMs: ctx.now - worst.since };
  const eta = etaMs(safety, ctx.devices);
  if (eta !== null && eta > SLOW_AFTER_MS) {
    const biggest = ctx.devices
      .filter(hasPending)
      .sort((a, b) => pendingOf(b).bytes - pendingOf(a).bytes)[0];
    if (biggest) return { device: biggest, waitedMs: null };
  }
  return null;
}

function stallHint(device: DriveDevice, ctx: SafetyContext): string {
  const { t } = ctx;
  if (!isDeviceOnline(device.lastSeenAt, ctx.now)) return t('cupSafetyHintOffline').replace('{device}', device.name);
  if (device.syncStatus?.state === 'error' && device.syncStatus.lastError) {
    return t('cupSafetyHintError')
      .replace('{device}', device.name)
      .replace('{error}', plainError(device.syncStatus.lastError, t).replace(/[.\s]+$/, ''));
  }
  return t('cupSafetyHintTerminal').replace('{device}', device.name);
}

/**
 * The statements of the safety block, most serious first (never empty):
 * files found nowhere, a stuck upload, files only on devices, an upload in progress, all safe.
 */
export function buildSafetyNotices(safety: DriveSafety, ctx: SafetyContext): SafetyNotice[] {
  const { t } = ctx;
  const notices: SafetyNotice[] = [];

  const nowhere = safety.notOnHub.nowhere;
  if (nowhere.files > 0) {
    notices.push({
      id: 'nowhere',
      level: 'loss',
      title: pick(nowhere.files, ctx, 'cupSafetyNowhere', 'cupSafetyNowhereOne').replace(
        '{files}',
        sizeOf(nowhere.files, nowhere.bytes, ctx),
      ),
      lines: [t('cupSafetyNowhereWhy')],
      hint: t('cupSafetyNowhereHint'),
    });
  }

  const stall = findStall(safety, ctx);
  if (stall) {
    const p = pendingOf(stall.device);
    const files = p.files || safety.uploading.files;
    const left = sizeOf(files, p.bytes || safety.uploading.bytes, ctx);
    const line =
      stall.waitedMs !== null
        ? pick(files, ctx, 'cupSafetyStalledLine', 'cupSafetyStalledLineOne')
            .replace('{device}', stall.device.name)
            .replace('{files}', left)
            .replace('{duration}', formatDuration(stall.waitedMs, ctx.locale, t))
        : `${pick(files, ctx, 'cupSafetyLeft', 'cupSafetyLeftOne').replace('{files}', left)} ${t('cupSafetySlow')}`;
    notices.push({
      id: 'stalled',
      level: 'attention',
      title: t('cupSafetyStalled'),
      lines: [line],
      hint: stallHint(stall.device, ctx),
    });
  }

  const held = {
    files: safety.notOnHub.files - nowhere.files,
    bytes: safety.notOnHub.bytes - nowhere.bytes,
  };
  if (held.files > 0) {
    const holders = safety.notOnHub.devices.filter((d) => d.files > 0);
    const lines = holders.map((d) => {
      const online = isDeviceOnline(d.lastSeenAt, ctx.now);
      const when = formatRelativeTime(d.lastSeenAt, ctx.locale, ctx.now);
      const state = online
        ? t('cupSafetyHolderOnline')
        : when
          ? t('cupSafetyHolderOffline').replace('{when}', when)
          : t('cupSafetyHolderOfflineNever');
      return t('cupSafetyHolderLine')
        .replace('{name}', d.name)
        .replace('{files}', sizeOf(d.files, d.bytes, ctx))
        .replace('{state}', state);
    });
    let hint: string | null = null;
    if (!stall) {
      const offline = holders.filter((d) => !isDeviceOnline(d.lastSeenAt, ctx.now));
      if (offline.length) {
        hint = t('cupSafetyHintTurnOn').replace('{name}', offline.map((d) => d.name).join(', '));
      } else if (holders.length) {
        hint = t('cupSafetyHintUploading').replace('{name}', holders.map((d) => d.name).join(', '));
        const eta = etaMs(safety, ctx.devices);
        if (eta !== null) hint += ` ${etaText(eta, ctx)}`;
      }
    }
    notices.push({
      id: 'notOnHub',
      level: 'attention',
      title: pick(held.files, ctx, 'cupSafetyNotOnHub', 'cupSafetyNotOnHubOne').replace(
        '{files}',
        sizeOf(held.files, held.bytes, ctx),
      ),
      lines,
      hint,
    });
  }

  if (notices.length === 0 && safety.uploading.files > 0) {
    const left = pick(safety.uploading.files, ctx, 'cupSafetyLeft', 'cupSafetyLeftOne').replace(
      '{files}',
      sizeOf(safety.uploading.files, safety.uploading.bytes, ctx),
    );
    const eta = etaMs(safety, ctx.devices);
    const parts = [left, t('cupSafetyUploadingDone')];
    if (eta !== null) parts.push(etaText(eta, ctx));
    notices.push({
      id: 'uploading',
      level: 'ok',
      title: t('cupSafetyUploading'),
      lines: [parts.join(' ')],
      hint: null,
    });
  }

  if (notices.length === 0) {
    notices.push({
      id: 'ok',
      level: 'ok',
      title: t('cupSafetyOk'),
      lines: [
        safety.files > 0
          ? pick(safety.files, ctx, 'cupSafetyOkLine', 'cupSafetyOkLineOne').replace(
              '{files}',
              sizeOf(safety.files, safety.bytes, ctx),
            )
          : t('cupSafetyOkEmpty'),
      ],
      hint: null,
    });
  }

  return notices;
}
