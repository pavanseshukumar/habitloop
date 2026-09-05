/**
 * Monday-first, which is how people talk about a week of habits.
 *
 * `short` is what the picker shows -- two letters, because single letters make
 * Tuesday and Thursday indistinguishable. `label` is what a screen reader says.
 */
export const WEEKDAYS = [
  { id: 'mon', short: 'Mo', label: 'Monday' },
  { id: 'tue', short: 'Tu', label: 'Tuesday' },
  { id: 'wed', short: 'We', label: 'Wednesday' },
  { id: 'thu', short: 'Th', label: 'Thursday' },
  { id: 'fri', short: 'Fr', label: 'Friday' },
  { id: 'sat', short: 'Sa', label: 'Saturday' },
  { id: 'sun', short: 'Su', label: 'Sunday' },
];

/** Date.getDay() is Sunday-first; shift it onto the array above. */
export function weekdayIdFor(date = new Date()) {
  return WEEKDAYS[(date.getDay() + 6) % 7].id;
}

export function weekdayLabelFor(date) {
  const id = weekdayIdFor(date);
  return WEEKDAYS.find((weekday) => weekday.id === id).label;
}
