import { isCompletedOn } from './completions';
import { addDays, fromDateKey, startOfWeek, toDateKey } from './dates';
import { hasOpenPeriod, inactiveReasonOn, lastActiveDayKey, wasScheduledOn } from './history';

export const RHYTHM_WEEKS = 4;

/**
 * Four calendar weeks as a flat list of days, Monday-first, each one already
 * resolved to a single state the view can render without thinking.
 *
 * The window ends on the habit's own last living week rather than always on
 * this one. For an active habit those are the same week; for an archived habit
 * they stop being the same the moment it is put away, and a window pinned to
 * today empties itself a row a week until someone opens a habit they showed up
 * for sixty times and finds a blank field under a row of weekday letters. What
 * a person built does not scroll off the end of the calendar, so the window
 * follows the habit rather than the clock.
 *
 *   completed    done that day
 *   scheduled    the habit was due and there is no record -- nothing more is
 *                claimed than that, and nothing is stored to say so
 *   unscheduled  the habit was running, and this was not one of its days
 *   upcoming     later this week
 *   before       earlier than the habit itself
 *   inactive     a stretch it was put down for and later picked back up
 *   after        later than the habit itself -- it was archived before this day
 *
 * The last four all render as empty space. Days outside the habit's own life
 * are deliberately not shown as unfilled: a habit created yesterday should not
 * open onto three weeks of blanks the user was never given a chance to fill,
 * an archived one should not keep collecting them, and a season someone spent
 * away from a habit is not a season of missed days.
 *
 * Every one of those answers comes from lib/history.js, which reads the
 * schedule and the active periods that were in force on each date. Nothing
 * here consults the habit's *current* frequency or days, because a rhythm that
 * did would be a picture of the settings screen rather than of what happened.
 */
export function buildRhythm(habit, completions, today, weeks = RHYTHM_WEEKS) {
  const todayKey = toDateKey(today);
  const running = hasOpenPeriod(habit);

  // The week the record ends in: the last day the habit was actually running,
  // or this week while it still is. Clamped at today, because a stored date in
  // the future is damaged data rather than a reason to draw days that have not
  // happened yet.
  const lastActive = lastActiveDayKey(habit);
  const endsOn = !running && lastActive !== null && lastActive < todayKey ? lastActive : null;
  const anchor = endsOn === null ? today : fromDateKey(endsOn);
  const firstDay = addDays(startOfWeek(anchor), -7 * (weeks - 1));

  const days = [];

  for (let index = 0; index < weeks * 7; index += 1) {
    const date = addDays(firstDay, index);
    const key = toDateKey(date);

    days.push({
      key,
      date,
      // Only a habit still being built has a today. On a closed record the
      // marker would point at a day the habit was already no longer part of.
      isToday: running && key === todayKey,
      // YYYY-MM-DD sorts lexicographically, so this is a date comparison.
      state: resolveState({
        completed: isCompletedOn(completions, habit.id, key),
        upcoming: key > todayKey,
        // Why the habit was not part of this day, or null if it was.
        inactive: inactiveReasonOn(habit, date),
        // The schedule that was in force on this date, not the one in force
        // now. Editing a Mon/Wed habit to Tue/Thu leaves last month's Mondays
        // reading as the days they actually were.
        scheduled: wasScheduledOn(habit, date),
      }),
    });
  }

  return days;
}

function resolveState({ completed, upcoming, inactive, scheduled }) {
  // A completion always wins. If it was done it is shown -- whatever the
  // schedule has since become, and even on a day the habit was later put down
  // on, because the user did in fact show up and that is not ours to withdraw.
  if (completed) return 'completed';
  if (upcoming) return 'upcoming';
  // Outside the habit's own life: before it existed, inside a stretch it was
  // put down for, or after it was retired. None of the three is a day the user
  // missed, so none of them leaves a mark.
  if (inactive) return inactive;
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
