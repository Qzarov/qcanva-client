// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import type { DriveDevice, DriveSafety } from '../api/drive';
import { useI18n } from '../composables/useI18n';
import { buildSafetyNotices, etaMs, stalledSince, type SafetyContext } from './safetySummary';

const { t, setLocale } = useI18n();

const NOW = Date.parse('2026-10-20T12:00:00.000Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const MIN = 60_000;
const HOUR = 3600_000;

function safety(patch: Partial<DriveSafety> = {}): DriveSafety {
  return {
    files: 120,
    bytes: 3 * 1024 ** 3,
    onHub: { files: 120, bytes: 3 * 1024 ** 3 },
    notOnHub: { files: 0, bytes: 0, devices: [], nowhere: { files: 0, bytes: 0 } },
    uploading: { files: 0, bytes: 0 },
    ...patch,
  };
}

function device(patch: Partial<DriveDevice> & { id: string; name: string }): DriveDevice {
  return {
    kind: 'pc',
    folderId: null,
    endpointId: null,
    relayUrl: null,
    keeper: false,
    lastSeenAt: ago(5_000),
    createdAt: ago(86400_000),
    ...patch,
  };
}

function ctx(devices: DriveDevice[], locale = 'en', extra: Partial<SafetyContext> = {}): SafetyContext {
  setLocale(locale as 'en' | 'ru');
  return { t, locale, now: NOW, devices, ...extra };
}

const MB = 1024 ** 2;

/** An online PC with files still to send. */
const uploader = (extra: Partial<NonNullable<DriveDevice['syncStatus']>> = {}, patch: Partial<DriveDevice> = {}) =>
  device({
    id: 'd1',
    name: 'Work PC',
    syncStatus: { state: 'syncing', pendingFiles: 3, pendingBytes: 300 * MB, ...extra },
    syncStatusAt: ago(5_000),
    ...patch,
  });

afterEach(() => setLocale('en'));

describe('buildSafetyNotices: everything is safe', () => {
  it('says all files are safe, with the size, in ru plurals', () => {
    const forms = [1, 2, 5, 21].map((n) => {
      const [n0] = buildSafetyNotices(safety({ files: n, bytes: 2048 }), ctx([], 'ru'));
      return n0!.lines[0];
    });
    expect(forms).toEqual([
      '1 файл (2 KB) — копия хранится на сервере Q Space.',
      '2 файла (2 KB) — копия каждого хранится на сервере Q Space.',
      '5 файлов (2 KB) — копия каждого хранится на сервере Q Space.',
      '21 файл (2 KB) — копия хранится на сервере Q Space.',
    ]);
    const [n] = buildSafetyNotices(safety(), ctx([], 'ru'));
    expect(n).toMatchObject({ id: 'ok', level: 'ok', title: 'Все файлы в сохранности', hint: null });
  });

  it('says it in English and handles an empty drive', () => {
    const [n] = buildSafetyNotices(safety(), ctx([]));
    expect(n!.title).toBe('All your files are safe');
    expect(n!.lines).toEqual(['120 files (3 GB) — every one has a copy on the Q Space server.']);
    const [empty] = buildSafetyNotices(safety({ files: 0, bytes: 0, onHub: { files: 0, bytes: 0 } }), ctx([]));
    expect(empty!.lines).toEqual(['There are no files on the drive yet.']);
  });
});

describe('buildSafetyNotices: uploading', () => {
  const uploading = safety({ uploading: { files: 3, bytes: 300 * MB } });

  it('says the files are uploading, without an ETA when no speed is known', () => {
    const [n] = buildSafetyNotices(uploading, ctx([uploader()], 'ru'));
    expect(n).toMatchObject({ id: 'uploading', level: 'ok', title: 'Файлы загружаются на сервер' });
    expect(n!.lines).toEqual([
      'Осталось 3 файла (300 MB). Когда загрузка закончится, у каждого файла будет копия на сервере.',
    ]);
  });

  it('says "Остался" for one file', () => {
    const [n] = buildSafetyNotices(safety({ uploading: { files: 1, bytes: MB } }), ctx([uploader()], 'ru'));
    expect(n!.lines[0]).toMatch(/^Остался 1 файл \(1 MB\)\./);
  });

  it('adds "about N minutes" from the reported speed', () => {
    // 300 MB at 1 MB/s = 300 s = 5 minutes.
    const [n] = buildSafetyNotices(uploading, ctx([uploader({ speedBps: MB, lastProgressAt: ago(5_000) })], 'ru'));
    expect(n!.lines[0]).toBe(
      'Осталось 3 файла (300 MB). Когда загрузка закончится, у каждого файла будет копия на сервере. Примерно 5 минут.',
    );
    const [en] = buildSafetyNotices(uploading, ctx([uploader({ speedBps: MB, lastProgressAt: ago(5_000) })]));
    expect(en!.lines[0]).toMatch(/About 5 minutes\.$/);
  });

  it('says "less than a minute" and counts hours', () => {
    const fast = safety({ uploading: { files: 1, bytes: 10 * MB } });
    const [a] = buildSafetyNotices(fast, ctx([uploader({ speedBps: MB, lastProgressAt: ago(1000) })], 'ru'));
    expect(a!.lines[0]).toMatch(/Меньше минуты\.$/);
    const slow = safety({ uploading: { files: 9, bytes: 7200 * MB } });
    const [b] = buildSafetyNotices(slow, ctx([uploader({ speedBps: MB, lastProgressAt: ago(1000) })], 'ru'));
    expect(b!.lines[0]).toMatch(/Примерно 2 часа\.$/);
  });

  it('adds the speeds of all devices', () => {
    const devs = [
      uploader({ speedBps: MB, lastProgressAt: ago(1000) }),
      uploader({ speedBps: MB, lastProgressAt: ago(1000) }, { id: 'd2', name: 'Laptop' }),
    ];
    expect(etaMs(uploading, devs)).toBe(150_000);
  });
});

describe('buildSafetyNotices: the upload is stuck', () => {
  const stuck = safety({ uploading: { files: 3, bytes: 300 * MB } });

  it('is amber and takes priority over "uploading"; terminal hint for an online device without an error', () => {
    const d = uploader({ lastProgressAt: ago(25 * MIN), speedBps: 0 });
    const notices = buildSafetyNotices(stuck, ctx([d], 'ru'));
    expect(notices.map((n) => n.id)).toEqual(['stalled']);
    expect(notices[0]).toMatchObject({ level: 'attention', title: 'Загрузка не продвигается' });
    expect(notices[0]!.lines).toEqual(['Work PC: 3 файла (300 MB) ждут уже 25 минут. Похоже, что-то мешает.']);
    expect(notices[0]!.hint).toBe('Откройте терминал на Work PC и выполните qspace-agent status — там будет причина.');
  });

  it('hint 1: the device is offline', () => {
    const d = uploader({ lastProgressAt: ago(3 * HOUR) }, { lastSeenAt: ago(3 * HOUR), syncStatusAt: ago(3 * HOUR) });
    const [n] = buildSafetyNotices(stuck, ctx([d], 'ru'));
    expect(n!.lines[0]).toBe('Work PC: 3 файла (300 MB) ждут уже 3 часа. Похоже, что-то мешает.');
    expect(n!.hint).toBe('Work PC не на связи — включите его.');
  });

  it('hint 2: the agent reports an error (plain words when obvious, else its text)', () => {
    const base = { lastProgressAt: ago(20 * MIN), state: 'error' };
    const plain = uploader({ ...base, lastError: 'No space left on device' });
    expect(buildSafetyNotices(stuck, ctx([plain]))[0]!.hint).toBe('Work PC reports an error: The disk is full.');
    const raw = uploader({ ...base, lastError: 'weird failure 42' });
    expect(buildSafetyNotices(stuck, ctx([raw], 'ru'))[0]!.hint).toBe('На Work PC ошибка: weird failure 42.');
  });

  it('hint 3: otherwise ask to run qspace-agent status', () => {
    const d = uploader({ lastProgressAt: ago(20 * MIN), state: 'error', lastError: null });
    expect(buildSafetyNotices(stuck, ctx([d]))[0]!.hint).toBe(
      'Open a terminal on Work PC and run qspace-agent status — it shows the reason.',
    );
  });

  it('uses the singular for one file', () => {
    const d = uploader({ pendingFiles: 1, lastProgressAt: ago(15 * MIN) });
    const [n] = buildSafetyNotices(safety({ uploading: { files: 1, bytes: 300 * MB } }), ctx([d], 'ru'));
    expect(n!.lines[0]).toBe('Work PC: 1 файл (300 MB) ждёт уже 15 минут. Похоже, что-то мешает.');
  });

  it('is not stuck when the last progress is recent', () => {
    const d = uploader({ lastProgressAt: ago(5 * MIN), speedBps: 100_000 });
    expect(buildSafetyNotices(stuck, ctx([d]))[0]!.id).toBe('uploading');
  });

  it('without lastProgressAt: an offline device is stuck since its last report', () => {
    const d = uploader({}, { lastSeenAt: ago(2 * HOUR), syncStatusAt: ago(2 * HOUR) });
    expect(stalledSince(d, { now: NOW })).toBe(NOW - 2 * HOUR);
  });

  it('without lastProgressAt: an online device is stuck when the pending count did not change for 10+ minutes and the speed is 0', () => {
    const d = uploader({ speedBps: 0 });
    const since = (ms: number) => ({ now: NOW, pendingSince: () => NOW - ms });
    expect(stalledSince(d, since(11 * MIN))).toBe(NOW - 11 * MIN);
    expect(stalledSince(d, since(5 * MIN))).toBeNull();
    // Moving at some speed: never stuck, whatever the tracker says.
    expect(stalledSince(uploader({ speedBps: 500 }), since(60 * MIN))).toBeNull();
    // Nothing pending: nothing to be stuck.
    expect(stalledSince(uploader({ pendingFiles: 0, pendingBytes: 0 }), since(60 * MIN))).toBeNull();
  });

  it('is stuck when the estimate is over 24 hours', () => {
    // 300 MB at 3 KB/s is more than a day.
    const d = uploader({ speedBps: 3 * 1024, lastProgressAt: ago(MIN) });
    const [n] = buildSafetyNotices(stuck, ctx([d]));
    expect(n).toMatchObject({ id: 'stalled', level: 'attention', title: 'The upload is not moving' });
    expect(n!.lines[0]).toBe(
      '3 files (300 MB) left. At this speed the upload would take more than a day. Something seems to be in the way.',
    );
    expect(n!.hint).toBe('Open a terminal on Work PC and run qspace-agent status — it shows the reason.');
  });
});

describe('buildSafetyNotices: files only on devices', () => {
  const holders = (devices: DriveSafety['notOnHub']['devices']) =>
    safety({
      notOnHub: {
        files: devices.reduce((a, d) => a + d.files, 0),
        bytes: devices.reduce((a, d) => a + d.bytes, 0),
        devices,
        nowhere: { files: 0, bytes: 0 },
      },
    });
  const offlinePc = { nodeId: 'd1', name: 'Work PC', kind: 'pc', lastSeenAt: ago(2 * HOUR), files: 5, bytes: 5 * MB };
  const onlineLaptop = { nodeId: 'd2', name: 'Laptop', kind: 'pc', lastSeenAt: ago(5_000), files: 1, bytes: 2 * MB };

  it('is amber; one line per device; asks to turn on an offline device', () => {
    const [n] = buildSafetyNotices(holders([offlinePc]), ctx([], 'ru'));
    expect(n).toMatchObject({
      id: 'notOnHub',
      level: 'attention',
      title: '5 файлов (5 MB) пока хранятся только на ваших устройствах',
    });
    expect(n!.lines).toEqual(['Work PC: 5 файлов (5 MB) — не на связи, был в сети 2 часа назад']);
    expect(n!.hint).toBe('Включите Work PC и запустите Q Space — файлы загрузятся на сервер сами.');
  });

  it('says an online device is uploading, singular for one file', () => {
    const [n] = buildSafetyNotices(holders([onlineLaptop]), ctx([], 'ru'));
    expect(n!.title).toBe('1 файл (2 MB) пока хранится только на ваших устройствах');
    expect(n!.lines).toEqual(['Laptop: 1 файл (2 MB) — на связи, загружает']);
    expect(n!.hint).toBe('Laptop загружает их сейчас.');
  });

  it('prefers the offline instruction when one device is online and one is not; adds an ETA when uploading', () => {
    const [n] = buildSafetyNotices(holders([offlinePc, onlineLaptop]), ctx([]));
    expect(n!.title).toBe('6 files (7 MB) are so far kept only on your devices');
    expect(n!.lines).toHaveLength(2);
    expect(n!.hint).toBe('Turn on Work PC and start Q Space — the files will upload to the server by themselves.');

    const d = uploader({ speedBps: MB, lastProgressAt: ago(1000), pendingBytes: 120 * MB });
    const [m] = buildSafetyNotices(
      { ...holders([onlineLaptop]), uploading: { files: 1, bytes: 120 * MB } },
      ctx([d]),
    );
    expect(m!.hint).toBe('Laptop is uploading them now. About 2 minutes.');
  });
});

describe('buildSafetyNotices: files found nowhere', () => {
  it('is red and comes first, with the explanation and what to do', () => {
    const s = safety({
      notOnHub: {
        files: 7,
        bytes: 7 * MB,
        devices: [{ nodeId: 'd1', name: 'Work PC', kind: 'pc', lastSeenAt: ago(HOUR), files: 5, bytes: 5 * MB }],
        nowhere: { files: 2, bytes: 2 * MB },
      },
    });
    const notices = buildSafetyNotices(s, ctx([], 'ru'));
    expect(notices.map((n) => [n.id, n.level])).toEqual([
      ['nowhere', 'loss'],
      ['notOnHub', 'attention'],
    ]);
    expect(notices[0]!.title).toBe('2 файла (2 MB) не найдены ни на одном устройстве');
    expect(notices[0]!.lines).toEqual([
      'Их нет на сервере, а устройства, где они были, удалены из Q Space.',
    ]);
    expect(notices[0]!.hint).toBe('Если у вас есть эти файлы, положите их снова в папку Q Space.');
    // Only the files that devices still hold are in the amber statement.
    expect(notices[1]!.title).toBe('5 файлов (5 MB) пока хранятся только на ваших устройствах');
  });

  it('uses the singular form', () => {
    const s = safety({
      notOnHub: { files: 1, bytes: MB, devices: [], nowhere: { files: 1, bytes: MB } },
    });
    expect(buildSafetyNotices(s, ctx([], 'ru'))[0]!.title).toBe('1 файл (1 MB) не найден ни на одном устройстве');
    expect(buildSafetyNotices(s, ctx([]))[0]!.title).toBe('1 file (1 MB) is not found on any device');
  });
});
