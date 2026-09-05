import { isCompletedOn } from './completions';
import { addDays, startOfWeek, toDateKey } from './dates';
import { matchesSchedule } from './schedule';

export const RHYTHM_WEEKS = 4;

/**
 * The last four calendar weeks as a flat list of days, Monday-first, each one
 * already resolved to a single state the view can render without thinking.
 *
 *   completed    done that day
 *   scheduled    the habit was due and there is no record -- nothing more is
 *                claimed than that, and nothing is stored to say so
 *   unscheduled  not one of this habit's days
 *   upcoming     later this week
 *   before       earlier than the habit itself
 *   after        later than the habit itself -- it was archived before this day
 *
 * The last three all render as empty space. Days outside the habit's own life
 * are deliberately not shown as unfilled: a habit created yesterday should not
 * open onto three weeks of blanks the user was never given a chance to fill,
 * and an archived one should not keep collecting them.
 */
export function buildRhythm(habit, completions, today, weeks = RHYTHM_WEEKS) {
  const firstDay = addDays(startOfWeek(today), -7 * (weeks - 1));
  const todayKey = toDateKey(today);
  const startedKey = habit.createdAt ? toDateKey(new Date(habit.createdAt)) : null;
  // The archive day itself still counts as a day it was due -- it was, right up
  // until the moment it was put away.
  const retiredKey = habit.archivedAt ? toDateKey(new Date(habit.archivedAt)) : null;

  const days = [];

  for (let index = 0; index < weeks * 7; index += 1) {
    const date = addDays(firstDay, index);
    const key = toDateKey(date);

    days.push({
      key,
      date,
      isToday: key === todayKey,
      // YYYY-MM-DD sorts lexicographically, so these are date comparisons.
      state: resolveState({
        completed: isCompletedOn(completions, habit.id, key),
        upcoming: key > todayKey,
        before: startedKey !== null && key < startedKey,
        after: retiredKey !== null && key > retiredKey,
        // TODO: schedule history. A habit stores one schedule -- its current
        // one -- so every past day here is judged by whatever the schedule is
        // now. Edit a Mon/Wed habit to Tue/Thu and last month's Mondays stop
        // reading as scheduled, even though they were at the time.
        //
        // Nothing is lost by this: completions are recorded per date and win
        // outright in resolveState, so a day the user showed up for still
        // renders as completed whatever the schedule has since become. What is
        // wrong is only the "was this due?" answer for uncompleted past days.
        //
        // Doing it properly means versioning the schedule on the habit --
        // { from, frequency, days } entries, resolved against the version in
        // force on each date -- which is a stored-data change and a migration,
        // not a view change. Deliberately out of scope for the first edit pass.
        // Deliberately the schedule alone, not isScheduledOn: an archived habit
        // still has a past in which it was due, and `after` above is what keeps
        // the days since it was put away out of the grid.
        scheduled: matchesSchedule(habit, date),
      }),
    });
  }

  return days;
}

function resolveState({ completed, upcoming, before, after, scheduled }) {
  // A completion always wins: if it was done, it is shown, whatever the
  // schedule has since become and whether or not the habit is still going.
  if (completed) return 'completed';
  if (upcoming) return 'upcoming';
  // Outside the habit's own life. Neither of these is a day the user missed, so
  // neither leaves a mark.
  if (before) return 'before';
  if (after) return 'after';
  return scheduled ? 'scheduled' : 'unscheduled';
}

export function toWeeks(days) {
  const weeks = [];
  for (let index = 0; index < days.length; index += 7) {
    weeks.push(days.slice(index, index + 7));
  }
  return weeks;
}

export function countCompleted(days) {
  return days.filter((day) => day.state === 'completed').length;
}
