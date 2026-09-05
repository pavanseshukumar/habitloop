import { WEEKDAYS, weekdayIdFor } from '../data/weekdays';
import { completedDatesFor } from './completions';
import { fromDateKey, startOfWeek, toDateKey } from './dates';
import { matchesSchedule } from './schedule';

/**
 * One quiet observation about a habit, or nothing at all.
 *
 * This is not a measure of how well the user is doing. It has no rate, no
 * score and no target, and it never compares them to anyone -- including their
 * own past self. It answers the only question worth deriving from a completion
 * history: what does this habit's rhythm actually look like?
 *
 * Silence is the default and the most common answer. A pattern that exists
 * arithmetically is not the same as a pattern worth naming, so every threshold
 * below is set where a person would plausibly agree with the sentence out
 * loud. When in doubt the functions return null, because saying nothing costs
 * the user nothing and a wrong observation costs them trust in every later one.
 */

// Enough completions that a weekday can be more than coincidence, spread over
// enough different weekdays that there is something to compare.
const WEEKDAY_MIN_COMPLETIONS = 6;
const WEEKDAY_MIN_DISTINCT = 3;
// The winner must be genuinely ahead: three or more of them, and at least two
// clear of the runner-up. Four-versus-three is a coin toss with a good story.
const WEEKDAY_MIN_TOP = 3;
const WEEKDAY_MIN_LEAD = 2;

// "Part of your week" has to have happened across actual weeks -- eight
// completions in a single burst is enthusiasm, not a rhythm.
const RHYTHM_MIN_COMPLETIONS = 8;
const RHYTHM_MIN_WEEKS = 3;

/**
 * The single observation to show for this habit, as { kind, text }, or null.
 *
 * Pure and deterministic: the same history on the same day always produces the
 * same sentence. `today` is a parameter rather than a call to new Date() so
 * this stays testable.
 *
 * Only one insight is ever returned. A stack of observations would be a
 * dashboard, and the strongest thing this screen can say is one true sentence.
 */
export function getHabitInsight(habit, completions, today = new Date()) {
  if (!habit) return null;

  const dates = relevantDates(habit, completions, today);

  // Order is the priority: a weekday pattern says more than a count of weeks,
  // so it is asked first and the other is never consulted if it answers.
  return weekdayInsight(habit, dates) ?? rhythmInsight(habit, dates) ?? null;
}

/**
 * The completion dates that belong to this habit's own life, oldest first.
 *
 * Days before it existed are not history it could have filled, and days after
 * today have not happened -- neither should shape an observation about it.
 * Other habits are invisible: completedDatesFor is already scoped to this one.
 */
function relevantDates(habit, completions, today) {
  const todayKey = toDateKey(today);
  // No createdAt means an unknown start, not a long one. Nothing is assumed
  // about the age of the habit -- the records it has are simply all it has.
  const startedKey = habit.createdAt ? toDateKey(new Date(habit.createdAt)) : null;

  return completedDatesFor(completions, habit.id).filter(
    (key) => key <= todayKey && (startedKey === null || key >= startedKey)
  );
}

/**
 * Which day of the week this habit actually happens on, when one stands out.
 *
 * Only days the habit is due are counted. A Monday/Wednesday/Friday habit has
 * no Tuesdays to show up on, and reading that absence as a preference would be
 * describing the schedule back to the user as if it were a discovery.
 */
function weekdayInsight(habit, dates) {
  const counts = new Map();

  for (const key of dates) {
    const date = fromDateKey(key);
    if (!matchesSchedule(habit, date)) continue;

    const id = weekdayIdFor(date);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  if (counts.size < WEEKDAY_MIN_DISTINCT) return null;

  let total = 0;
  for (const count of counts.values()) total += count;
  if (total < WEEKDAY_MIN_COMPLETIONS) return null;

  // At least three weekdays are present, so a runner-up always exists.
  const ranked = [...counts.values()].sort((a, b) => b - a);
  if (ranked[0] < WEEKDAY_MIN_TOP) return null;
  if (ranked[0] - ranked[1] < WEEKDAY_MIN_LEAD) return null;

  const topId = [...counts.entries()].find(([, count]) => count === ranked[0])[0];
  const label = WEEKDAYS.find((weekday) => weekday.id === topId).label;

  return {
    kind: 'weekday',
    // Past tense once the habit is retired: it is a record of what happened,
    // not a claim about what the user is still doing.
    text: habit.archivedAt
      ? `You showed up most often on ${label}s.`
      : `You've shown up most often on ${label}s.`,
  };
}

/**
 * The habit has simply become something the user does.
 *
 * Said without a number, because the count is already the largest thing on
 * this screen and repeating it here would turn a sentence into a statistic.
 */
function rhythmInsight(habit, dates) {
  if (dates.length < RHYTHM_MIN_COMPLETIONS) return null;

  const weeks = new Set(dates.map((key) => toDateKey(startOfWeek(fromDateKey(key)))));
  if (weeks.size < RHYTHM_MIN_WEEKS) return null;

  return {
    kind: 'rhythm',
    text: habit.archivedAt
      ? 'This was part of your week.'
      : 'This is becoming part of your week.',
  };
}
