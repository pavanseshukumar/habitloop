import { completedDatesFor, isCompletedOn } from './completions';
import { addDays, fromDateKey, toDateKey } from './dates';
import { isScheduledOn, matchesSchedule } from './schedule';

/**
 * Returning after a gap -- derived, never stored.
 *
 * Nothing in the data model records an absence, and nothing here adds one. A
 * gap is simply what the completion history does not say, read against the
 * habit's own schedule, so the same history always yields the same answer and
 * no migration is ever needed to ask a new question of it.
 *
 * The one thing this module deliberately does not produce is a number. How
 * long someone was away is not the app's business: a person coming back after
 * one day and a person coming back after three weeks are doing the same thing.
 */

/**
 * Would completing this habit right now be a return?
 *
 * Asked *before* the completion lands, which is what makes it answerable at
 * all -- once the day is marked, the gap is closed and the habit reads as an
 * ordinary one. Today's own emptiness is part of the question, not a gap.
 */
export function isReturningHabit(habit, completions, today = new Date()) {
  // Covers both halves of "still being built and due right now": archived
  // habits and off-schedule days are out before anything else is considered.
  if (!isScheduledOn(habit, today)) return false;

  const todayKey = toDateKey(today);
  if (isCompletedOn(completions, habit.id, todayKey)) return false;

  // A habit with nothing behind it is not returning, it is beginning.
  const previousKey = previousCompletionKey(completions, habit.id, todayKey);
  if (!previousKey) return false;

  return hasScheduledGapBetween(habit, previousKey, todayKey);
}

/**
 * The last day this habit was completed before today, or null.
 *
 * Scoped to the one habit, so other habits' histories are invisible here.
 * YYYY-MM-DD sorts lexicographically, so these are date comparisons.
 */
function previousCompletionKey(completions, habitId, todayKey) {
  const dates = completedDatesFor(completions, habitId);

  for (let index = dates.length - 1; index >= 0; index -= 1) {
    if (dates[index] < todayKey) return dates[index];
  }

  return null;
}

/**
 * Was there at least one day the habit was due, between the last completion
 * and today, that went unfilled?
 *
 * Only one is needed, so this stops at the first -- it is a yes/no question,
 * and counting would turn an absence into a score. Everything in the range is
 * unfilled by construction: `previousKey` is the *latest* completion before
 * today, so no day after it carries a record.
 */
function hasScheduledGapBetween(habit, previousKey, todayKey) {
  const startedKey = habit.createdAt ? toDateKey(new Date(habit.createdAt)) : null;

  // The morning after they last showed up -- or the day the habit was created,
  // if that somehow came later. Days before a habit existed were never the
  // user's to fill, so they can never be part of a gap.
  const fromKey =
    startedKey !== null && startedKey > previousKey
      ? startedKey
      : toDateKey(addDays(fromDateKey(previousKey), 1));

  let cursor = fromDateKey(fromKey);

  // Today is excluded on purpose: it is the day being offered, not a day missed.
  while (toDateKey(cursor) < todayKey) {
    // The plain schedule question, matching how the rhythm grid reads history.
    if (matchesSchedule(habit, cursor)) return true;
    cursor = addDays(cursor, 1);
  }

  return false;
}
