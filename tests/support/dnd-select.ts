import type { Page } from '@playwright/test';

/**
 * The sheet's own dropdown (DndSelect): a button with the combobox role and a
 * list of options teleported to <body>. Tests pick an option the way a person
 * does - open the list, click the option by its text.
 */
export const selectControl = (page: Page, label: string, nth = 0) =>
  page.getByRole('combobox', { name: label, exact: true }).nth(nth);

export async function chooseOption(page: Page, label: string, option: string, nth = 0) {
  await selectControl(page, label, nth).click();
  await page.getByRole('listbox', { name: label, exact: true }).getByRole('option', { name: option, exact: true }).click();
}
