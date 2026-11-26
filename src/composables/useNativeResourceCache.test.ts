// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { clearToken } from '../api/client';
import './useNativeResourceCache';

describe('useNativeResourceCache auth cleanup', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('removes all qcanva:resource:v1:* entries when clearToken runs', () => {
    localStorage.setItem('qcanva:resource:v1:u1:canvas:c1', '{"savedAt":1,"value":{}}');
    localStorage.setItem('qcanva:resource:v1:u1:html:h1', '{"savedAt":1,"value":{}}');
    localStorage.setItem('theme-preference', 'dark');

    clearToken();

    expect(localStorage.getItem('qcanva:resource:v1:u1:canvas:c1')).toBeNull();
    expect(localStorage.getItem('qcanva:resource:v1:u1:html:h1')).toBeNull();
    expect(localStorage.getItem('theme-preference')).toBe('dark');
  });
});
