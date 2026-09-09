import { WEEKDAYS, weekdayIdFor } from '../data/weekdays';
import { completedDatesFor } from './completions';
import { fromDateKey, startOfWeek, toDateKey } from './dates';
import { currentPeriodStartKey, lastActiveDayKey, wasScheduledOn } from './history';

/**
 * One quiet observation about a habit, or nothing at all -- and, separately,
 * the two ends of the stretch it has been going for.
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

// Thirteen weeks with something in them, which is where "months" stops being a
// flourish and becomes arithmetic: thirteen distinct week-starts cannot fit in
// less than thirteen weeks, so the span is a quarter of a year at minimum. The
// sentence is true by construction rather than by estimate.
const ESTABLISHED_MIN_WEEKS = 13;

// Fifty-four, by the same arithmetic one rung up. Fifty-two is the tempting
// constant and it is quietly wrong: fifty-two distinct week-starts put only
// fifty-one weeks between the first and the last, which is 357 days and short
// of the year it would be claiming. Fifty-four guarantees fifty-three weeks
// between them -- 371 days -- so "a year" is true however the completions fall
// inside it, rather than true for most people most of the time.
const YEAR_MIN_WEEKS = 54;

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
 * How long the habit has been going, as { fromKey, toKey }, or null.
 *
 * Dates only. Nothing here builds a sentence, a month name or a count of
 * weeks -- what this returns is the two ends of a stretch, and the wording of
 * it belongs to whatever displays it.
 *
 * Duration is the one axis the record could never state. It could count days
 * and it could name the weekday they fall on, but "how long has this been part
 * of my life?" had no answer, and it is the question a person actually asks
 * about a habit they have kept.
 *
 * THE STRETCH IS THE CURRENT ONE, NOT THE WHOLE RECORD
 *
 * A habit put down in February and picked up in March has been running since
 * January and is *currently* running since March, and it is the second of those
 * that describes what the user is doing now. So the anchor is the first
 * completion inside the habit's current active period -- which for a habit that
 * was never archived is simply its first completion ever, making the common
 * case identical either way. The gap is not subtracted, not counted and not
 * named anywhere: it is only that a stretch cannot have begun before it began.
 *
 * THE EVIDENCE COMES FROM THE STRETCH IT DESCRIBES
 *
 * The same bar the rhythm observation is held to -- enough completions, across
 * enough separate weeks -- but asked of the days inside this stretch rather
 * than of the whole record. A habit with two years behind it and four days
 * since it was picked back up has not been doing this since August in any sense
 * a person would recognise, and the lifetime count shown above it already tells
 * that whole truth without this agreeing to overstate a fortnight.
 *
 * AND IT HAS TO CROSS A MONTH
 *
 * Duration read at month resolution, so a stretch that begins and ends inside
 * one month has nothing to say that is not already on the screen. This is what
 * keeps a habit restored last Tuesday quiet rather than solemnly announcing a
 * week.
 *
 * The end is left open -- null -- while the habit is still running, exactly as
 * it is in the active periods this reads.
 */
export function getHabitSpan(habit, completions, today = new Date()) {
  if (!habit) return null;

  const todayKey = toDateKey(today);
  const dates = relevantDates(habit, completions, today);

  // Null means the periods cannot say where the current stretch began: a habit
  // carried in from a build that never recorded one, or one that never lived a
  // whole day. There is nothing to clip against, so the record is read whole --
  // the fallback lib/history.js deliberately declined to invent for itself.
  const startedKey = currentPeriodStartKey(habit);
  const inStretch = startedKey === null ? dates : dates.filter((key) => key >= startedKey);

  if (inStretch.length < RHYTHM_MIN_COMPLETIONS) return null;
  if (weekStartsIn(inStretch).size < RHYTHM_MIN_WEEKS) return null;

  const fromKey = inStretch[0];

  // Where the stretch ends: the day the habit was last running, or the last day
  // it was actually done if the periods cannot say -- and never a stored date
  // in the future, which is damaged data rather than a reason to claim a span
  // that has not happened yet. The same reading buildRhythm takes.
  const closedOn = lastActiveDayKey(habit);
  const toKey = habit.archivedAt
    ? closedOn !== null && closedOn <= todayKey
      ? closedOn
      : inStretch[inStretch.length - 1]
    : null;

  // An end before its own beginning describes no stretch at all.
  if (toKey !== null && toKey < fromKey) return null;

  // Month resolution, and the far end is today for a habit still going.
  if (monthOf(fromKey) === monthOf(toKey ?? todayKey)) return null;

  return { fromKey, toKey };
}

/** YYYY-MM. The year is part of it, so last March is not this March. */
const monthOf = (key) => key.slice(0, 7);

/** The distinct weeks these dates fall in, Monday-first. */
function weekStartsIn(dates) {
  return new Set(dates.map((key) => toDateKey(startOfWeek(fromDateKey(key)))));
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
 * Only days the habit was due are counted, judged by the schedule that was in
 * force at the time. A Monday/Wednesday/Friday habit has no Tuesdays to show
 * up on, and reading that absence as a preference would be describing the
 * schedule back to the user as if it were a discovery. Asking today's schedule
 * instead would be worse: switching to daily would silently re-weigh months of
 * completed days that were never in question.
 */
function weekdayInsight(habit, dates) {
  const counts = new Map();

  for (const key of dates) {
    const date = fromDateKey(key);
    if (!wasScheduledOn(habit, date)) continue;

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
 *
 * Three sentences, because each one stops being true. "Becoming" is the right
 * word in the second month and the wrong one in the sixth: a habit someone has
 * kept for a quarter of a year is not on its way to being part of their week,
 * it has been part of their week for months, and a screen that cannot tell
 * those apart says the same beginner's sentence forever. "For months" goes the
 * same way in the second year, where it undersells a habit by a factor of four,
 * so the ladder has a third rung and the argument for it is the argument for
 * the second one.
 *
 * The rungs are read from the top down, so the longest sentence the history can
 * carry is the one that gets said. This is the only place the passage of time
 * changes what the app says, and it is deliberately a change of wording rather
 * than an extra line -- still one observation, still no number in it.
 */
function rhythmInsight(habit, dates) {
  if (dates.length < RHYTHM_MIN_COMPLETIONS) return null;

  const weeks = weekStartsIn(dates);
  if (weeks.size < RHYTHM_MIN_WEEKS) return null;

  if (weeks.size >= YEAR_MIN_WEEKS) {
    return {
      kind: 'year',
      text: habit.archivedAt
        ? 'This was part of your week for a year.'
        : 'This has been part of your week for a year.',
    };
  }

  if (weeks.size >= ESTABLISHED_MIN_WEEKS) {
    return {
      kind: 'established',
      text: habit.archivedAt
        ? 'This was part of your week for months.'
        : 'This has been part of your week for months.',
    };
  }

  return {
    kind: 'rhythm',
    text: habit.archivedAt
      ? 'This was part of your week.'
      : 'This is becoming part of your week.',
  };
}
