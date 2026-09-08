import { WEEKDAYS } from '../data/weekdays';
import { dateKeyFrom, withActiveClosed, withActiveOpened } from './history';

/**
 * Reads and writes over the habit list: { id, name, detail, frequency, days,
 * createdAt, archivedAt }[].
 *
 * Plain functions over a plain array, in the same spirit as lib/completions.js,
 * so the store and the management screen agree about what "active" and
 * "archived" mean without either one owning the definition. Nothing here
 * mutates its input: every writer returns a new array, and every reader returns
 * a copy before sorting.
 *
 * The stored order is the user's order -- habits are appended as they are
 * written down, and that sequence is the only history the list itself has. It
 * is never rearranged on disk; anything that wants a different order takes a
 * copy, which is what archivedHabitsFrom does below.
 */

/** What the user is currently building, in the order they wrote it down. */
export function activeHabitsFrom(habits) {
  return habits.filter((habit) => !habit.archivedAt);
}

/**
 * What the user has retired, most recently archived first.
 *
 * Newest first because the reason to look at this list is almost always the
 * thing you just put down. Sorted on a copy, and stably -- two habits archived
 * in the same millisecond keep their stored order rather than swapping around
 * between renders.
 */
export function archivedHabitsFrom(habits) {
  return habits
    .filter((habit) => Boolean(habit.archivedAt))
    .slice()
    .sort((a, b) => b.archivedAt.localeCompare(a.archivedAt));
}

/**
 * Retires a habit. Not a delete: the record stays exactly as it was, gains a
 * date, and closes the stretch it was running for -- because this app is about
 * remembering what someone built, and that does not stop being true when they
 * stop doing it.
 *
 * The closing is what stops the months ahead from filling with days the habit
 * will be scored against while nobody is doing it. `archivedAt` stays as the
 * current-state flag Today and the reminder planner read; the period is the
 * historical record of the same fact, and the two are written together here so
 * they cannot drift apart.
 *
 * Already-archived habits are left alone, so re-archiving cannot rewrite the
 * date the habit was actually put down.
 */
export function archiveHabitIn(habits, habitId, archivedAt) {
  const onKey = dateKeyFrom(archivedAt);

  return habits.map((habit) =>
    habit.id === habitId && !habit.archivedAt
      ? {
          ...habit,
          archivedAt,
          // An unreadable date closes nothing rather than closing at a guess.
          activePeriods: onKey === null ? habit.activePeriods : withActiveClosed(habit, onKey),
        }
      : habit
  );
}

/**
 * Picks a habit back up, opening a new stretch from the day it happens.
 *
 * Spreading the existing habit carries id, name, detail, frequency, days,
 * createdAt and the whole schedule history through untouched, and completions
 * live in a separate map this never reaches. Restoring is the same habit
 * continuing, not a new one starting, so every day already recorded against
 * that id is still there afterwards.
 *
 * What it deliberately does *not* do is heal the gap. The stretch the habit
 * spent put down stays in the record as a stretch it was put down for, forever
 * -- clearing the flag alone would have quietly converted a season the user
 * chose to take off into a season of missed days.
 */
export function restoreHabitIn(habits, habitId, restoredAt = new Date().toISOString()) {
  const onKey = dateKeyFrom(restoredAt);

  return habits.map((habit) =>
    habit.id === habitId && habit.archivedAt
      ? {
          ...habit,
          archivedAt: null,
          activePeriods: onKey === null ? habit.activePeriods : withActiveOpened(habit, onKey),
        }
      : habit
  );
}

/**
 * A habit's schedule in a few words: "Every day", or the days it names.
 *
 * Management shows every habit, including the ones today has no business with,
 * so each row has to be able to say why it is not on Today without the user
 * opening it.
 */
export function scheduleSummary(habit) {
  if (!habit || habit.frequency !== 'selected') return 'Every day';

  const chosen = WEEKDAYS.filter((weekday) => habit.days?.includes(weekday.id));
  if (chosen.length === 0) return 'No days chosen';
  if (chosen.length === WEEKDAYS.length) return 'Every day';

  return chosen.map((weekday) => weekday.short).join(' · ');
}
