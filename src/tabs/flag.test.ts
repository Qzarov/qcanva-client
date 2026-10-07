// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const isNativePlatform = vi.hoisted(() => vi.fn(() => false));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform } }));

import { resetTabsFlagForTests, tabsEnabled } from './flag';

beforeEach(() => {
  localStorage.clear();
  resetTabsFlagForTests();
  isNativePlatform.mockReturnValue(false);
});

describe('tabs flag', () => {
  it('is on in the Android app without any setting', () => {
    isNativePlatform.mockReturnValue(true);
    expect(tabsEnabled()).toBe(true);
  });

  it('can be switched off in the app', () => {
    isNativePlatform.mockReturnValue(true);
    localStorage.setItem('qcanva:tabs', '0');
    expect(tabsEnabled()).toBe(false);
  });

  it('stays off in a browser, even a phone one', () => {
    expect(tabsEnabled()).toBe(false);
    resetTabsFlagForTests();
    localStorage.setItem('qcanva:tabs', '1');
    expect(tabsEnabled()).toBe(false);
  });

  it('runs in a browser only with both development switches', () => {
    localStorage.setItem('qcanva:tabs', '1');
    localStorage.setItem('qcanva:tabs-web', '1');
    expect(tabsEnabled()).toBe(true);
  });

  it('is read once per page load', () => {
    isNativePlatform.mockReturnValue(true);
    expect(tabsEnabled()).toBe(true);
    localStorage.setItem('qcanva:tabs', '0');
    expect(tabsEnabled()).toBe(true);
  });
});
