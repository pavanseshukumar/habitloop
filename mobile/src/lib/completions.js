/**
 * Reads over the completion map: { [habitId]: { [dateKey]: true } }.
 *
 * Only completed days are ever stored. A missing entry means "not completed",
 * which is all we need -- there is no such thing as a "missed" record, and the
 * product never needs one.
 *
 * These are plain functions over a plain object so history and recovery views
 * can use them later without going through the store.
 */
export function isCompletedOn(completions, habitId, dateKey) {
  return completions?.[habitId]?.[dateKey] === true;
}

/** Every date a habit was completed, oldest first. For future history views. */
export function completedDatesFor(completions, habitId) {
  return Object.keys(completions?.[habitId] ?? {}).sort();
}

/**
 * Returns the completion map with `dateKey` flipped for `habitId`.
 * Undoing removes the record entirely rather than storing `false`.
 */
export function toggleCompletionOn(completions, habitId, dateKey) {
  const forHabit = { ...(completions[habitId] ?? {}) };

  if (forHabit[dateKey]) delete forHabit[dateKey];
  else forHabit[dateKey] = true;

  const next = { ...completions };
  if (Object.keys(forHabit).length === 0) delete next[habitId];
  else next[habitId] = forHabit;

  return next;
}
