import { describe, expect, it } from 'vitest';
import { fromPlansForm, toPlansForm } from './billingForm';

const plans = {
  prices: { month: 29900, year: 299000 },
  graceDays: 3,
  free: { resources: 20, storageBytes: 100 * 1024 * 1024, collaborators: 3, mcpPerDay: 30 },
  pro: { resources: 0, storageBytes: 1024 * 1024 * 1024, collaborators: 0, mcpPerDay: 1000 },
};

describe('the admin plans form', () => {
  it('shows roubles and megabytes, and saves kopecks and bytes', () => {
    const form = toPlansForm(plans);
    expect(form).toMatchObject({ priceMonth: 299, priceYear: 2990, free: { storageBytes: 100 }, pro: { storageBytes: 1024 } });
    expect(fromPlansForm(form)).toEqual(plans);
  });

  it('cleans what was typed: kopecks rounded, no negatives, whole limits, grace capped', () => {
    const form = toPlansForm(plans);
    form.priceMonth = 199.99;
    form.free.resources = -5;
    form.free.mcpPerDay = 7.8;
    form.graceDays = 99;
    expect(fromPlansForm(form)).toMatchObject({ prices: { month: 19999 }, graceDays: 30, free: { resources: 0, mcpPerDay: 7 } });
  });
});
