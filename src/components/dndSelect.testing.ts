import type { DOMWrapper, VueWrapper } from '@vue/test-utils';

/**
 * Test helpers for DndSelect, the sheet's own dropdown. It is a button plus a
 * list teleported to <body>, so tests drive it the way a person does: open it,
 * pick an option. Works whether Teleport is stubbed (the list is inside the
 * wrapper) or real (the list is in the document).
 */
type Wrapper = VueWrapper<any> | DOMWrapper<Element>;

export const selectSelector = (label: string) => `[role="combobox"][aria-label="${label}"]`;

const trigger = (wrapper: Wrapper, label: string, index = 0) => wrapper.findAll(selectSelector(label))[index]!;

const optionElements = (wrapper: Wrapper, label: string): HTMLButtonElement[] => {
  const selector = `[role="listbox"][aria-label="${label}"] [role="option"]`;
  const inside = Array.from((wrapper.element as Element).querySelectorAll<HTMLButtonElement>(selector));
  return inside.length ? inside : Array.from(document.querySelectorAll<HTMLButtonElement>(selector));
};

const settle = async (wrapper: Wrapper) => {
  const vm = (wrapper as VueWrapper<any>).vm;
  for (let i = 0; i < 3; i += 1) await (vm?.$nextTick?.() ?? Promise.resolve());
};

/** Opens the list (if it is not open) and returns its options. */
async function openList(wrapper: Wrapper, label: string, index = 0) {
  const button = trigger(wrapper, label, index);
  if (button.attributes('aria-expanded') !== 'true') await button.trigger('click');
  await settle(wrapper);
  return optionElements(wrapper, label);
}

/** Picks the option with this value - what `select.setValue(value)` used to do. */
export async function choose(wrapper: Wrapper, label: string, value: string, index = 0) {
  const options = await openList(wrapper, label, index);
  const option = options.find((candidate) => candidate.dataset.value === value);
  if (!option) throw new Error(`No option "${value}" in "${label}": ${options.map((candidate) => candidate.dataset.value).join(', ')}`);
  option.click();
  await settle(wrapper);
}

/** The labels on offer, in order; the list is closed again afterwards. */
export async function optionLabels(wrapper: Wrapper, label: string, index = 0) {
  const labels = (await openList(wrapper, label, index)).map((option) => (option.textContent ?? '').trim());
  await trigger(wrapper, label, index).trigger('click');
  await settle(wrapper);
  return labels;
}

/** What the closed control shows. */
export const selectedLabel = (wrapper: Wrapper, label: string, index = 0) => trigger(wrapper, label, index).text();
