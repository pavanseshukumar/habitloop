import { weekdayIdFor } from '../data/weekdays';
import { addDays } from './dates';

/**
 * Whether a habit's schedule covers a given day -- the plain calendar question,
 * with no opinion on whether the habit is still being built.
 *
 * History asks this one. A Tuesday before a habit was archived was genuinely a
 * Tuesday it was due, and it should still read that way afterwards.
 */
export function matchesSchedule(habit, date) {
  if (!habit) return false;

  if (habit.frequency === 'selected') {
    return Array.isArray(habit.days) && habit.days.includes(weekdayIdFor(date));
  }

  // 'daily', and anything unrecognised, is treated as every day.
  return true;
}

/**
 * Whether a habit belongs in a given day's list.
 *
 * Unscheduled habits are not gone, just not today's business -- nothing is ever
 * deleted or hidden permanently by this. An archived habit is not today's
 * business either, whatever day of the week its schedule still names.
 */
export function isScheduledOn(habit, date) {
  if (!habit || habit.archivedAt) return false;
  return matchesSchedule(habit, date);
}

export function scheduledOn(habits, date) {
  return habits.filter((habit) => isScheduledOn(habit, date));
}

/**
 * The next day any of these habits is due, looking forward a week.
 *
 * Used to give an unscheduled day somewhere to point, so "nothing today" reads
 * as a gap in a rhythm rather than as nothing at all.
 */
export function nextScheduledDay(habits, from, withinDays = 7) {
  for (let inDays = 1; inDays <= withinDays; inDays += 1) {
    const date = addDays(from, inDays);
    if (habits.some((habit) => isScheduledOn(habit, date))) return { date, inDays };
  }

  return null;
}
