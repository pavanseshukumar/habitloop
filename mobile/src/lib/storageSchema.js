import { DATE_KEY_PATTERN } from './dates';
import { initialHistory, isDateKey } from './history';
import { DEFAULT_REMINDER, normalizeReminder } from './reminders';

/**
 * The shape of what gets written to disk, and how older shapes become it.
 *
 * Split out from storage.js so it is reachable without AsyncStorage: this is
 * the part with the rules in it, and losing someone's history to a bad
 * migration is the worst thing this app could do, so it is the part that has
 * to be testable.
 *
 * v1  habits + completions
 * v2  adds `reminder` to every habit
 * v3  adds `scheduleHistory` and `activePeriods` -- what the habit's rhythm
 *     was, and when it was running, rather than only what both are now
 */
export const SCHEMA_VERSION = 3;

/**
 * Each entry takes state at version N and returns it at version N + 1.
 *
 * Deliberately not a framework: a map of small functions, applied in order,
 * with the version number as the only bookkeeping. Adding v3 later means
 * adding one function here and moving one constant above.
 */
const MIGRATIONS = {
  /**
   * Reminders arrive switched off.
   *
   * Nobody asked for notifications by installing an update, so migrating must
   * never be the thing that starts sending them. The default time is only
   * there so the picker has somewhere to open; it is not user-visible while
   * `enabled` is false.
   */
  1: (state) => ({
    ...state,
    version: 2,
    habits: state.habits.map((habit) => ({ ...habit, reminder: { ...DEFAULT_REMINDER } })),
  }),

  /**
   * History, inferred only as far as it honestly can be.
   *
   * All that was ever stored is the habit's current schedule and, if it was put
   * down, the day that happened. So the only truthful reading of an existing
   * record is that its schedule has always been what it is now, in force since
   * the day it was created, and that it ran continuously from then until it was
   * archived.
   *
   * That is exactly what initialHistory writes, and it is deliberately not more.
   * This does not invent schedule changes nobody recorded, and it does not
   * invent archive-and-restore cycles that were never stored. What it
   * guarantees is that from here forward every change *is* recorded: an
   * existing user loses nothing and starts keeping a real history the day they
   * update.
   *
   * Fills only what is missing, so running it twice cannot replace a real
   * history with an inferred one.
   */
  2: (state) => ({
    ...state,
    version: 3,
    habits: state.habits.map(withInferredHistory),
  }),
};

function withInferredHistory(habit) {
  if (!habit || typeof habit !== 'object') return habit;

  const inferred = initialHistory(habit);

  return {
    ...habit,
    scheduleHistory: habit.scheduleHistory ?? inferred.scheduleHistory,
    activePeriods: habit.activePeriods ?? inferred.activePeriods,
  };
}

/**
 * Brings stored state up to the current version, or returns null if it cannot.
 *
 * Null means "there is nothing here we can safely read", which the caller
 * turns into an empty app. Reaching it for data we simply have not taught this
 * function about would destroy a history we might have been able to keep, so
 * every version we have ever shipped has a path forward from it. What is left
 * is state written by a *newer* build than this one, which we genuinely cannot
 * interpret and must not guess at.
 */
export function migrateState(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;
  if (!Number.isInteger(parsed.version)) return null;
  if (parsed.version > SCHEMA_VERSION) return null;

  let state = { ...parsed, habits: Array.isArray(parsed.habits) ? parsed.habits : [] };

  while (state.version < SCHEMA_VERSION) {
    const step = MIGRATIONS[state.version];
    if (!step) return null;
    state = step(state);
  }

  return state;
}

/**
 * Reads persisted state into the shape the store expects.
 *
 * Migration first, so every record below is already at the current version;
 * normalisation second, because a file can be the right version and still hold
 * a record that was damaged some other way.
 */
export function normalizeState(parsed) {
  const migrated = migrateState(parsed);
  if (!migrated) return null;

  const habits = migrated.habits.map(normalizeHabit).filter(Boolean);

  return { habits, completions: normalizeCompletions(migrated.completions) };
}

/**
 * Drops records too broken to use; fills safe defaults for the rest.
 *
 * The record is spread first so a field this build has never heard of survives
 * being read by it. Anything written by a later version and then opened here
 * would otherwise be silently dropped on the next save, which is a slower and
 * more surprising way to lose someone's data than declining to read it.
 */
export function normalizeHabit(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.id !== 'string' || !raw.id) return null;
  if (typeof raw.name !== 'string' || !raw.name.trim()) return null;

  const frequency = raw.frequency === 'selected' ? 'selected' : 'daily';
  const days =
    frequency === 'selected' && Array.isArray(raw.days)
      ? raw.days.filter((day) => typeof day === 'string')
      : [];
  // Left null rather than stamped with now(): an unknown creation date is
  // honest, a wrong one would quietly corrupt the history read from it.
  const createdAt = typeof raw.createdAt === 'string' ? raw.createdAt : null;
  const archivedAt = typeof raw.archivedAt === 'string' ? raw.archivedAt : null;

  // What this habit's history would be if none had ever been recorded: its
  // current schedule, since it was created. Used only where the stored history
  // is missing or unreadable, so a real one is never replaced by a guess.
  const inferred = initialHistory({ createdAt, frequency, days, archivedAt });

  return {
    ...raw,
    id: raw.id,
    name: raw.name,
    detail: typeof raw.detail === 'string' ? raw.detail : '',
    frequency,
    days,
    createdAt,
    archivedAt,
    // Belt and braces alongside the migration above: a habit that reaches here
    // without one still ends up switched off rather than undefined.
    reminder: normalizeReminder(raw.reminder),
    scheduleHistory: readScheduleHistory(raw.scheduleHistory) ?? inferred.scheduleHistory,
    activePeriods: readActivePeriods(raw.activePeriods) ?? inferred.activePeriods,
  };
}

/** A stored date bound: a local date key, or null for an open end. */
const readBound = (value) => (value === null || value === undefined ? null : value);
const isBound = (value) => value === null || isDateKey(value);

/**
 * The stored schedule history, or null if it cannot be trusted.
 *
 * All-or-nothing on purpose. A partly readable history is the one outcome worse
 * than no history at all: it would answer some dates from the record and others
 * from a guess, with nothing to say which was which. Rejecting it whole falls
 * back to the honest inference and stays explicable.
 */
function readScheduleHistory(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return null;

  const versions = [];

  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') return null;

    const effectiveFrom = readBound(entry.effectiveFrom);
    if (!isBound(effectiveFrom)) return null;
    if (entry.frequency !== 'daily' && entry.frequency !== 'selected') return null;
    if (entry.frequency === 'selected' && !Array.isArray(entry.days)) return null;

    versions.push({
      effectiveFrom,
      frequency: entry.frequency,
      days:
        entry.frequency === 'selected'
          ? entry.days.filter((day) => typeof day === 'string')
          : [],
    });
  }

  return versions.sort((a, b) => compareBounds(a.effectiveFrom, b.effectiveFrom));
}

/**
 * The stored active periods, or null if they cannot be trusted.
 *
 * An empty list is a legitimate answer -- a habit created and put down on the
 * same day was never running for a whole day -- so it is kept rather than
 * rebuilt into a period that never happened.
 */
function readActivePeriods(raw) {
  if (!Array.isArray(raw)) return null;

  const periods = [];

  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') return null;

    const from = readBound(entry.from);
    const to = readBound(entry.to);
    if (!isBound(from) || !isBound(to)) return null;
    // A period ending where or before it starts describes no days at all, and
    // a record of no days is a record we cannot read.
    if (from !== null && to !== null && to <= from) return null;

    periods.push({ from, to });
  }

  return periods.sort((a, b) => compareBounds(a.from, b.from));
}

function compareBounds(a, b) {
  if (a === b) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  return a < b ? -1 : 1;
}

export function normalizeCompletions(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};

  const result = {};

  for (const [habitId, dates] of Object.entries(raw)) {
    if (!dates || typeof dates !== 'object' || Array.isArray(dates)) continue;

    const kept = {};
    for (const [dateKey, value] of Object.entries(dates)) {
      if (value === true && DATE_KEY_PATTERN.test(dateKey)) kept[dateKey] = true;
    }

    if (Object.keys(kept).length > 0) result[habitId] = kept;
  }

  return result;
}
