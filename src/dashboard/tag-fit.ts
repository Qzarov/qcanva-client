/**
 * How many tag chips fit in one line before a "+N" overflow badge is
 * needed, given actual measured pixel widths - front task: the mobile tag
 * row used to show only SELECTED tags plus a generic "+N" for everything
 * else (or, in an earlier iteration, scrolled horizontally to show every
 * tag) - this computes a single-line, no-scroll fit instead, with no
 * hardcoded chip count. Priority order (selected tags first) is the
 * caller's job via how it orders `chipWidths`; this only decides how many
 * of that ordered list fit.
 *
 * Pure and DOM-free on purpose: the caller measures real chip widths (via
 * a hidden, identically-styled row) and passes plain numbers in, so this
 * function - the actual "how many fit" decision - is testable without a
 * real layout engine, which jsdom doesn't have.
 */
export function computeVisibleTagFitCount(
  containerWidth: number,
  reservedWidth: number,
  chipWidths: number[],
  gap: number,
  moreChipWidth: number,
): number {
  // No real measurement yet (first render, before layout settles) - render
  // everything rather than flash an empty/wrong row; the real measurement
  // corrects this within the same frame once ResizeObserver fires.
  if (containerWidth <= 0) return chipWidths.length;

  const totalIfAllFit = reservedWidth + chipWidths.reduce((sum, w) => sum + w + gap, 0);
  if (totalIfAllFit <= containerWidth) return chipWidths.length;

  const budget = containerWidth - reservedWidth - moreChipWidth - gap;
  let used = 0;
  let count = 0;
  for (const width of chipWidths) {
    used += width + gap;
    if (used > budget) break;
    count++;
  }
  return Math.max(0, count);
}
