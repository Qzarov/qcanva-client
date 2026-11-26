import { unmapResourceImageUrl } from '../canvas/imageUrls';

export function serializeDocumentWithFormState(source: Document): string {
  const clone = source.documentElement.cloneNode(true) as HTMLElement;
  syncInputState(source, clone);
  syncTextareaState(source, clone);
  syncSelectState(source, clone);
  syncStateBackedChecklist(source, clone);
  syncImageState(clone);
  return `<!DOCTYPE html>\n${clone.outerHTML}`;
}

function syncImageState(clone: HTMLElement) {
  clone.querySelectorAll('img').forEach((img) => {
    const src = img.getAttribute('src');
    if (src) {
      const unmapped = unmapResourceImageUrl(src);
      if (unmapped !== src) {
        img.setAttribute('src', unmapped);
      }
    }
  });
}

function syncInputState(source: Document, clone: HTMLElement) {
  const sourceInputs = Array.from(source.querySelectorAll('input'));
  const cloneInputs = Array.from(clone.querySelectorAll('input'));
  sourceInputs.forEach((input, index) => {
    const target = cloneInputs[index];
    if (!target) return;

    const type = input.type.toLowerCase();
    if (type === 'checkbox' || type === 'radio') {
      input.checked ? target.setAttribute('checked', '') : target.removeAttribute('checked');
      return;
    }

    if (type === 'file') {
      target.removeAttribute('value');
      return;
    }

    target.setAttribute('value', input.value);
  });
}

function syncTextareaState(source: Document, clone: HTMLElement) {
  const sourceTextareas = Array.from(source.querySelectorAll('textarea'));
  const cloneTextareas = Array.from(clone.querySelectorAll('textarea'));
  sourceTextareas.forEach((textarea, index) => {
    const target = cloneTextareas[index];
    if (!target) return;
    target.textContent = textarea.value;
  });
}

function syncSelectState(source: Document, clone: HTMLElement) {
  const sourceSelects = Array.from(source.querySelectorAll('select'));
  const cloneSelects = Array.from(clone.querySelectorAll('select'));
  sourceSelects.forEach((select, index) => {
    const target = cloneSelects[index];
    if (!target) return;

    const selectedValues = new Set(Array.from(select.selectedOptions).map((option) => option.value));
    Array.from(target.options).forEach((option) => {
      selectedValues.has(option.value) ? option.setAttribute('selected', '') : option.removeAttribute('selected');
    });
  });
}

const SAFE_STORAGE_KEY_RE = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{2,63}$/;
const RESERVED_STORAGE_KEY_RE = /^(?:token|currentuser|userrole|accessmode|theme|locale|huburl|qcanva:|qspace:|auth|jwt|session)/i;

export function isSafeChecklistStorageKey(value: string): boolean {
  if (!SAFE_STORAGE_KEY_RE.test(value)) return false;
  if (RESERVED_STORAGE_KEY_RE.test(value)) return false;
  return true;
}

export function escapeJsonForScript(json: string): string {
  return json
    .replace(/&/g, '\\u0026')
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function syncStateBackedChecklist(source: Document, clone: HTMLElement) {
  const storageKey = findChecklistStorageKey(source);
  if (!storageKey) return;

  const state = buildChecklistState(source, storageKey);
  clone.querySelectorAll('[data-qcanva-form-state]').forEach((node) => node.remove());
  clone.querySelectorAll('.comment-status-tag, .comment-wrap').forEach((node) => node.remove());

  const bar = clone.querySelector('#bar');
  if (bar) bar.innerHTML = '';

  if (!Object.keys(state.items).length) return;
  const seed = source.createElement('script');
  seed.setAttribute('data-qcanva-form-state', storageKey);
  const encodedKey = escapeJsonForScript(JSON.stringify(storageKey));
  const encodedState = escapeJsonForScript(JSON.stringify(JSON.stringify(state)));
  seed.textContent = `try{localStorage.setItem(${encodedKey},${encodedState});}catch(e){/* storage unavailable in sandboxed iframe */}`;
  const firstScript = clone.querySelector('script');
  if (firstScript?.parentNode) firstScript.parentNode.insertBefore(seed, firstScript);
  else (clone.querySelector('head') || clone).appendChild(seed);
}

function findChecklistStorageKey(source: Document): string | null {
  for (const script of Array.from(source.querySelectorAll('script'))) {
    const text = script.textContent || '';
    if (!text.includes('function attachItem') || !text.includes('comment-wrap')) continue;
    const match = text.match(/STORAGE_KEY\s*=\s*['"]([^'"]+)['"]/);
    if (match?.[1] && isSafeChecklistStorageKey(match[1])) return match[1];
  }
  return null;
}

type ChecklistItemState = { checked?: boolean; status?: string; comment?: string };
type ChecklistState = { items: Record<string, ChecklistItemState> } & Record<string, unknown>;

function buildChecklistState(source: Document, storageKey: string) {
  const state = readStoredState(source, storageKey);
  const items: Record<string, ChecklistItemState> = {
    ...(state.items || {}),
  };

  source.querySelectorAll('li').forEach((li) => {
    const checkbox = li.querySelector('input.cb') as HTMLInputElement | null;
    const id = checkbox?.dataset.id;
    if (!id) return;
    const current = { ...(items[id] || {}) };
    current.checked = Boolean(checkbox.checked);

    const selectedStatus = Array.from(li.querySelectorAll('input[type="radio"]'))
      .find((radio): radio is HTMLInputElement => radio instanceof HTMLInputElement && radio.checked);
    if (selectedStatus?.value) current.status = selectedStatus.value;

    const comment = li.querySelector('textarea.comment-area') as HTMLTextAreaElement | null;
    if (comment) current.comment = comment.value;
    items[id] = current;
  });

  return { ...state, items };
}

function readStoredState(source: Document, storageKey: string): ChecklistState {
  try {
    // Never fall back to the parent app's globalThis.localStorage — untrusted HTML
    // documents must not read or serialize parent origin storage keys.
    const docWindow = source.defaultView;
    if (!docWindow || docWindow === globalThis) {
      return { items: {} };
    }
    const raw = docWindow.localStorage?.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      ...parsed,
      items: isRecord(parsed.items) ? parsed.items as Record<string, ChecklistItemState> : {},
    };
  } catch {
    return { items: {} };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
