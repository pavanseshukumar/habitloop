import AsyncStorage from '@react-native-async-storage/async-storage';

import { DATE_KEY_PATTERN } from './dates';

/** One key, one blob. Keep this the only place either constant is written. */
export const STORAGE_KEY = 'habitloop_state';
export const SCHEMA_VERSION = 1;

function report(message, error) {
  if (__DEV__) console.warn(`[storage] ${message}`, error);
}

/**
 * Reads persisted state, or null when there is nothing usable to read.
 *
 * Null is the caller's cue to seed a fresh state -- it covers a first launch,
 * unreadable storage and corrupt JSON alike, because the app's response to all
 * three is the same: carry on in memory rather than fail.
 */
export async function loadState() {
  let raw;

  try {
    raw = await AsyncStorage.getItem(STORAGE_KEY);
  } catch (error) {
    report('could not read saved state; continuing in memory', error);
    return null;
  }

  if (!raw) return null;

  try {
    return normalizeState(JSON.parse(raw));
  } catch (error) {
    report('saved state was not valid JSON; starting fresh', error);
    return null;
  }
}

export async function saveState({ habits, completions }) {
  try {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: SCHEMA_VERSION, habits, completions })
    );
  } catch (error) {
    // Losing a write is survivable: the in-memory state is still correct, and
    // the next successful save will carry it. Never surface this to the user.
    report('could not save state', error);
  }
}

function normalizeState(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;

  // Version 1 is the only shape that has ever shipped, so there is nothing to
  // migrate from yet.
  //
  // When the schema does change, branch here -- do not fall through to null.
  // Null means "nothing usable to read", which opens the app empty, and the
  // store's first save then overwrites the stored blob with that emptiness.
  // For unreadable JSON that is fine; for data from a version we simply do not
  // recognise yet it would destroy a history we could have migrated.
  if (parsed.version !== SCHEMA_VERSION) {
    report(`unrecognised schema version ${parsed.version}; starting fresh`);
    return null;
  }

  const habits = Array.isArray(parsed.habits)
    ? parsed.habits.map(normalizeHabit).filter(Boolean)
    : [];

  return { habits, completions: normalizeCompletions(parsed.completions) };
}

/** Drops records too broken to use; fills safe defaults for the rest. */
function normalizeHabit(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.id !== 'string' || !raw.id) return null;
  if (typeof raw.name !== 'string' || !raw.name.trim()) return null;

  const frequency = raw.frequency === 'selected' ? 'selected' : 'daily';

  return {
    id: raw.id,
    name: raw.name,
    detail: typeof raw.detail === 'string' ? raw.detail : '',
    frequency,
    days:
      frequency === 'selected' && Array.isArray(raw.days)
        ? raw.days.filter((day) => typeof day === 'string')
        : [],
    // Left null rather than stamped with now(): an unknown creation date is
    // honest, a wrong one would quietly corrupt any future history view.
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : null,
    archivedAt: typeof raw.archivedAt === 'string' ? raw.archivedAt : null,
  };
}

function normalizeCompletions(raw) {
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
