import { DATE_KEY_PATTERN, addDays, fromDateKey, toDateKey } from './dates';
import { matchesSchedule } from './schedule';

/**
 * What was true about a habit on a given day.
 *
 * The rest of the app asks two questions about the past -- "was this habit
 * running then?" and "was it due that day?" -- and until now both were answered
 * with the habit's *current* settings. That made the record a description of
 * today's configuration rather than of what happened: changing a Mon/Wed/Fri
 * habit to daily grew missed Tuesdays backwards through months the user never
 * owed a Tuesday, and restoring a habit after a season away turned that season
 * into a season of failures.
 *
 * This module is the one place those questions are answered, from two small
 * records the habit carries:
 *
 *   scheduleHistory  [{ effectiveFrom, frequency, days }]
 *   activePeriods    [{ from, to }]
 *
 * Both are lists of local calendar dates, and both are *closed over* by the
 * helpers here rather than read directly anywhere else.
 *
 * ---------------------------------------------------------------------------
 * THE BOUNDARY RULE, stated once and obeyed everywhere
 *
 * Every interval is half-open on local date keys: [from, to). A boundary date
 * belongs to the period it *begins*, never to the one it ends.
 *
 *   created   the first active day
 *   effectiveFrom   the first day the new schedule applies
 *   archive date    the first INACTIVE day -- the habit ran up to the day before
 *   restore date    the first active day again
 *
 * So a habit created Jan 1, archived Mar 15 and restored Jun 20 was active
 * Jan 1 - Mar 14, inactive Mar 15 - Jun 19, and active again from Jun 20. One
 * convention, used by the rhythm, the insights, recovery and the store alike,
 * because a boundary read two ways is a boundary that eventually disagrees
 * with itself.
 *
 * ---------------------------------------------------------------------------
 * WHY ONLY ACTIVE PERIODS ARE STORED
 *
 * An archived stretch is exactly the gap between two active periods, so
 * storing it as well would be storing the same fact twice -- and two copies of
 * one fact are two things that can disagree after a bad write. The gaps are
 * derived, and `inactiveReasonOn` is the only thing that needs to name them.
 *
 * `null` means unbounded: `to: null` is "still running", and `from: null` /
 * `effectiveFrom: null` is "from the beginning", which is the honest reading
 * for a habit whose creation date was lost. Nothing is invented to fill it.
 *
 * Every function here is pure and order-independent: the lists are kept sorted
 * on write, but nothing below relies on that, so a hand-edited or partially
 * written record still resolves to one deterministic answer.
 */

/** The local calendar day an ISO timestamp fell on, or null if unreadable. */
export function dateKeyFrom(iso) {
  if (typeof iso !== 'string' || !iso) return null;

  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? null : toDateKey(at);
}

export function isDateKey(value) {
  return typeof value === 'string' && DATE_KEY_PATTERN.test(value);
}

// YYYY-MM-DD sorts lexicographically, so these are date comparisons. `null` is
// the open end in both directions -- earlier than every date as a start, later
// than every date as an end.
const startedBy = (key, from) => from === null || key >= from;
const isBeforeEnd = (key, to) => to === null || key < to;

/**
 * The schedule in force on a date, or null if the habit had none yet.
 *
 * The latest version whose `effectiveFrom` has arrived. Scanned rather than
 * indexed: the list holds one entry per time the user changed their mind, so
 * it is a handful of items, and taking the maximum makes the answer the same
 * whatever order the entries happen to be in.
 */
export function scheduleOn(habit, date) {
  const versions = habit?.scheduleHistory;
  if (!Array.isArray(versions) || versions.length === 0) return null;

  const key = toDateKey(date);
  let found = null;

  for (const version of versions) {
    if (!version || !startedBy(key, version.effectiveFrom ?? null)) continue;
    if (found === null || isLater(version.effectiveFrom ?? null, found.effectiveFrom ?? null)) {
      found = version;
    }
  }

  return found;
}

/** Is the habit running right now -- that is, does any period remain open? */
export function hasOpenPeriod(habit) {
  const periods = habit?.activePeriods;
  if (!Array.isArray(periods)) return false;

  return periods.some((period) => period && (period.to ?? null) === null);
}

/** Was the habit running on this date? */
export function isActiveOn(habit, date) {
  const periods = habit?.activePeriods;
  if (!Array.isArray(periods)) return false;

  const key = toDateKey(date);

  return periods.some(
    (period) =>
      period && startedBy(key, period.from ?? null) && isBeforeEnd(key, period.to ?? null)
  );
}

/**
 * Was the habit both running and due on this date?
 *
 * The only question the history really needs, and the one that decides whether
 * an empty day is a day the user missed or simply a day the habit was not part
 * of their life. A day fails it for either reason, and the two are never
 * conflated: `inactiveReasonOn` below is what tells them apart for display.
 */
export function wasScheduledOn(habit, date) {
  if (!isActiveOn(habit, date)) return false;
  return matchesSchedule(scheduleOn(habit, date), date);
}

/**
 * Why a date is not part of the habit's life, for a record that has to say so
 * out loud to a screen reader.
 *
 *   before    earlier than the habit itself
 *   inactive  a stretch it was put down for and later picked back up
 *   after     it is archived now, and this is past the day it was put down
 *
 * Returns null when the habit *was* active, which is the caller's cue to ask
 * about the schedule instead.
 */
export function inactiveReasonOn(habit, date) {
  if (isActiveOn(habit, date)) return null;

  const key = toDateKey(date);
  const periods = Array.isArray(habit?.activePeriods) ? habit.activePeriods.filter(Boolean) : [];

  const start = earliestStart(periods);
  if (start !== null && key < start) return 'before';

  // Every period closed means the habit is archived right now; anything past
  // the last of them is the record having ended rather than a gap inside it.
  const end = finalEnd(periods);
  if (end !== null && key >= end) return 'after';

  return 'inactive';
}

/**
 * The last day the habit was actually running, or null while it still is.
 *
 * The rhythm window ends here for an archived habit, so that what someone
 * built stays on screen instead of scrolling off the end of the calendar.
 */
export function lastActiveDayKey(habit) {
  const periods = Array.isArray(habit?.activePeriods) ? habit.activePeriods.filter(Boolean) : [];
  if (periods.length === 0) return null;

  const end = finalEnd(periods);
  if (end === null) return null;

  return previousKey(end);
}

// --------------------------------------------------------------------------
// Writers. Every one takes the calendar day the change happens on rather than
// reading a clock, so the store decides "when" exactly once and the same call
// twice is the same result twice.
// --------------------------------------------------------------------------

/**
 * The history a habit starts life with.
 *
 * One schedule, in force from the day it was created, and one active period
 * beginning the same day. An already-archived habit -- which only arrives here
 * through migration -- gets that period closed on the day it was put down.
 *
 * A habit with no creation date gets `null` bounds: unknown, not ancient, and
 * certainly not today. That matches how the rest of the app has always read a
 * missing createdAt, and it is the one case where honesty means declining to
 * write a date at all.
 */
export function initialHistory({ createdAt, frequency, days, archivedAt }) {
  const from = dateKeyFrom(createdAt);
  const to = dateKeyFrom(archivedAt);

  return {
    scheduleHistory: [{ effectiveFrom: from, ...scheduleOf({ frequency, days }) }],
    // A habit created and archived on the same day was never active for a whole
    // day, and an empty [x, x) period is worse than no period: it reads as a
    // record with a start. Only genuinely lived stretches are stored.
    activePeriods: to !== null && from !== null && to <= from ? [] : [{ from, to }],
  };
}

/**
 * The habit's schedule history after an edit landing on `onKey`.
 *
 * Two rules, and between them they make repeated editing harmless:
 *
 * Same-day edits replace rather than stack. Changing your mind three times
 * before dinner leaves one version for that day -- the last one -- so a date
 * can never have two schedules competing to describe it, and the answer does
 * not depend on which entry a scan happens to reach first.
 *
 * An edit that lands back on the schedule already in force writes nothing.
 * Renaming a habit, or switching to daily and straight back again, leaves the
 * history exactly as it was: versions mark the days the rhythm actually
 * changed, and nothing else.
 */
export function withScheduleVersion(habit, next, onKey) {
  const versions = Array.isArray(habit.scheduleHistory) ? habit.scheduleHistory : [];
  const kept = versions.filter((version) => version && (version.effectiveFrom ?? null) !== onKey);

  const inForce = scheduleOn({ scheduleHistory: kept }, fromDateKey(onKey));
  const wanted = scheduleOf(next);

  if (inForce && sameSchedule(inForce, wanted)) return kept;

  return sortVersions([...kept, { effectiveFrom: onKey, ...wanted }]);
}

/**
 * The habit's active periods after it is put down on `onKey`.
 *
 * `onKey` is the first inactive day, per the boundary rule at the top of this
 * file, so the open period is closed *at* it and the habit's last living day
 * is the one before. A period that would be left empty by this -- archived the
 * same day it began -- is dropped rather than stored as a stretch of no days.
 */
export function withActiveClosed(habit, onKey) {
  const periods = Array.isArray(habit.activePeriods) ? habit.activePeriods : [];

  return periods
    .filter(Boolean)
    .map((period) => ((period.to ?? null) === null ? { ...period, to: onKey } : period))
    .filter((period) => period.from === null || period.to === null || period.from < period.to);
}

/**
 * The habit's active periods after it is picked back up on `onKey`.
 *
 * Restoring on the same day it was archived reopens the period it just closed
 * rather than starting a second one beside it: nothing happened in between, so
 * there is no gap to record and the history should look as though the archive
 * never occurred. Any later restore opens a new period and leaves the gap
 * standing -- permanently, because those days genuinely were not this habit's.
 */
export function withActiveOpened(habit, onKey) {
  const periods = Array.isArray(habit.activePeriods) ? habit.activePeriods.filter(Boolean) : [];

  if (periods.some((period) => (period.to ?? null) === onKey)) {
    return periods.map((period) =>
      (period.to ?? null) === onKey ? { ...period, to: null } : period
    );
  }

  return sortPeriods([...periods, { from: onKey, to: null }]);
}

// --------------------------------------------------------------------------
// Internals
// --------------------------------------------------------------------------

/** Just the scheduling half of a habit, normalised the way the store stores it. */
function scheduleOf({ frequency, days }) {
  const kind = frequency === 'selected' ? 'selected' : 'daily';
  return { frequency: kind, days: kind === 'selected' && Array.isArray(days) ? [...days] : [] };
}

/** Same rhythm, whatever order the days were chosen in. */
export function sameSchedule(a, b) {
  if (!a || !b || a.frequency !== b.frequency) return false;
  if (a.frequency !== 'selected') return true;

  const left = [...(a.days ?? [])].sort();
  const right = [...(b.days ?? [])].sort();

  return left.length === right.length && left.every((day, index) => day === right[index]);
}

/** `null` is the beginning of time, so nothing is later than a date except a later date. */
function isLater(a, b) {
  if (a === null) return false;
  if (b === null) return true;
  return a > b;
}

function earliestStart(periods) {
  if (periods.length === 0) return null;

  let earliest = periods[0].from ?? null;
  for (const period of periods) {
    const from = period.from ?? null;
    if (from === null) return null;
    if (earliest === null || from < earliest) earliest = from;
  }

  return earliest;
}

/** The end of the period that started last, or null if any period is still open. */
function finalEnd(periods) {
  let latestStart = null;
  let end = null;

  for (const period of periods) {
    if ((period.to ?? null) === null) return null;
    const from = period.from ?? null;
    if (end === null || isLater(from, latestStart)) {
      latestStart = from;
      end = period.to;
    }
  }

  return end;
}

const sortVersions = (versions) =>
  [...versions].sort((a, b) => compareKeys(a.effectiveFrom ?? null, b.effectiveFrom ?? null));

const sortPeriods = (periods) =>
  [...periods].sort((a, b) => compareKeys(a.from ?? null, b.from ?? null));

function compareKeys(a, b) {
  if (a === b) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  return a < b ? -1 : 1;
}

const previousKey = (key) => toDateKey(addDays(fromDateKey(key), -1));
