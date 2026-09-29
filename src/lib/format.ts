/**
 * Shared number formatters.
 *
 * `new Intl.NumberFormat(...)` is constructed once per module rather than per
 * component render. These screens re-render on every tank animation frame, and
 * building an Intl object each time is measurable work on Hermes for no benefit
 * - the output is identical every time.
 */
export const nfWhole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
export const nfOneDp = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
