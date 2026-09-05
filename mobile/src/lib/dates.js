/**
 * Date keys for completion records: YYYY-MM-DD in the user's own calendar.
 *
 * Deliberately built from the local getters rather than toISOString(), which
 * converts to UTC and would file a late-evening completion under tomorrow (or
 * an early-morning one under yesterday) depending on the timezone offset.
 */
export function toDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function todayKey() {
  return toDateKey(new Date());
}

export const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Calendar-safe day arithmetic: setDate rolls months and years for us. */
export function addDays(date, amount) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

/** Monday-first, matching the weekday ids in data/weekdays.js. */
export function startOfWeek(date) {
  return addDays(date, -((date.getDay() + 6) % 7));
}

/**
 * The inverse of toDateKey: local midnight on that calendar day.
 *
 * Built from the numeric constructor rather than `new Date('2026-09-05')`,
 * which the spec parses as UTC and would land on the previous evening for
 * anyone west of Greenwich.
 */
export function fromDateKey(key) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}
