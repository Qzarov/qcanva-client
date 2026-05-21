export function serializeDocumentWithFormState(source: Document): string {
  const clone = source.documentElement.cloneNode(true) as HTMLElement;
  syncInputState(source, clone);
  syncTextareaState(source, clone);
  syncSelectState(source, clone);
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
