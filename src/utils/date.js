/**
 * One way to write a date on screen: dd/mm/yyyy.
 *
 * The shop reads dates day-first, so every date the user sees goes through
 * here. Values the app sends back to the API or puts in an <input type="date">
 * stay in yyyy-mm-dd -- that is a machine format, not a displayed one, and
 * `isoDate` is the helper for it.
 */

const pad = (n) => String(n).padStart(2, '0');

/** Accepts a Date, an ISO timestamp, or a plain yyyy-mm-dd string. */
const toDate = (value) => {
  if (!value && value !== 0) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  const text = String(value).trim();
  if (!text) return null;

  // A date with no time is read as-is. Letting Date parse "2026-09-14" would
  // treat it as UTC midnight, which in Bangladesh is still the day before.
  const plain = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (plain) return new Date(Number(plain[1]), Number(plain[2]) - 1, Number(plain[3]));

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/** dd/mm/yyyy, or `fallback` when there is no usable date. */
export const formatDate = (value, fallback = '') => {
  const d = toDate(value);
  if (!d) return fallback;
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};

/** hh:mm AM/PM. */
export const formatTime = (value, fallback = '') => {
  const d = toDate(value);
  if (!d) return fallback;
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
};

/** dd/mm/yyyy hh:mm AM/PM. */
export const formatDateTime = (value, fallback = '') => {
  const d = toDate(value);
  if (!d) return fallback;
  return `${formatDate(d)} ${formatTime(d)}`;
};

/** The weekday in front of the date: "Monday, 14/09/2026". */
export const formatLongDate = (value, bn = false, fallback = '') => {
  const d = toDate(value);
  if (!d) return fallback;
  const weekday = d.toLocaleDateString(bn ? 'bn-BD' : 'en-GB', { weekday: 'long' });
  return `${weekday}, ${formatDate(d)}`;
};

/** yyyy-mm-dd in local time: for <input type="date"> and API payloads. */
export const isoDate = (value = new Date()) => {
  const d = toDate(value);
  if (!d) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export default formatDate;
