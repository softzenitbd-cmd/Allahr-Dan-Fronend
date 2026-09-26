/**
 * How much cheaper the sale price is than the MRP, in taka and in percent.
 * Returns null when there is no discount (no MRP, or sale >= MRP).
 */
export function discountInfo(mrp, sale) {
  const m = Number(mrp) || 0;
  const s = Number(sale) || 0;
  if (m <= 0 || s <= 0 || s >= m) return null;
  const amount = Math.round((m - s) * 100) / 100;
  const pct = ((m - s) / m) * 100;
  // 7% not 7.0%, but 6.7% stays 6.7%
  const pctText = `${Number.isInteger(Math.round(pct * 10) / 10) ? Math.round(pct) : (Math.round(pct * 10) / 10).toFixed(1)}%`;
  return { amount, pct, pctText };
}
