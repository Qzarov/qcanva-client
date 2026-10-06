import { Capacitor } from '@capacitor/core';

/**
 * Tabs of open resources (docs/app-tabs-plan.md) are an Android-app feature,
 * still being built: off unless switched on. Turned on with
 * localStorage['qcanva:tabs'] = '1' in the app; `qcanva:tabs-web` = '1' lets
 * it run in a browser too, for tests and development. Read once per page
 * load - the app shell is built around one or the other.
 */
const read = (key: string) => {
  try { return localStorage.getItem(key) === '1'; } catch { return false; }
};

let cached: boolean | null = null;
export function tabsEnabled(): boolean {
  if (cached === null) cached = read('qcanva:tabs') && (Capacitor.isNativePlatform() || read('qcanva:tabs-web'));
  return cached;
}

/** Tests only: forget the cached value. */
export function resetTabsFlagForTests() { cached = null; }
