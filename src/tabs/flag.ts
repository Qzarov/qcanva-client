import { Capacitor } from '@capacitor/core';

/**
 * Tabs of open resources (docs/app-tabs-plan.md) are an Android-app feature.
 *
 * - In the app they are ON. `localStorage['qcanva:tabs'] = '0'` switches them
 *   off again, should a device misbehave.
 * - In a browser they stay OFF: both `qcanva:tabs` = '1' and
 *   `qcanva:tabs-web` = '1' are needed, which only tests and development set.
 *
 * Read once per page load - the app shell is built around one or the other.
 */
const read = (key: string) => {
  try { return localStorage.getItem(key); } catch { return null; }
};

let cached: boolean | null = null;
export function tabsEnabled(): boolean {
  if (cached === null) {
    cached = Capacitor.isNativePlatform()
      ? read('qcanva:tabs') !== '0'
      : read('qcanva:tabs') === '1' && read('qcanva:tabs-web') === '1';
  }
  return cached;
}

/** Tests only: forget the cached value. */
export function resetTabsFlagForTests() { cached = null; }
