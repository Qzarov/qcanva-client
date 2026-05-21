export function serializeDocumentWithFormState(source: Document): string {
  const clone = source.documentElement.cloneNode(true) as HTMLElement;
  syncInputState(source, clone);
  syncTextareaState(source, clone);
  syncSelectState(source, clone);
  syncStateBackedChecklist(source, clone);
  return `<!DOCTYPE html>\n${clone.outerHTML}`;
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
  seed.textContent = `try{localStorage.setItem(${JSON.stringify(storageKey)},${JSON.stringify(JSON.stringify(state))});}catch(e){}`;
  const firstScript = clone.querySelector('script');
  if (firstScript?.parentNode) firstScript.parentNode.insertBefore(seed, firstScript);
  else (clone.querySelector('head') || clone).appendChild(seed);
}

function findChecklistStorageKey(source: Document): string | null {
  for (const script of Array.from(source.querySelectorAll('script'))) {
    const text = script.textContent || '';
    if (!text.includes('function attachItem') || !text.includes('comment-wrap')) continue;
    const match = text.match(/STORAGE_KEY\s*=\s*['"]([^'"]+)['"]/);
    if (match?.[1]) return match[1];
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
    const raw = source.defaultView?.localStorage?.getItem(storageKey) || globalThis.localStorage?.getItem(storageKey);
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
