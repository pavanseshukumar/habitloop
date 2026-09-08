import AsyncStorage from '@react-native-async-storage/async-storage';

import { SCHEMA_VERSION, normalizeState } from './storageSchema';

/** One key, one blob. Keep this the only place the key is written. */
export const STORAGE_KEY = 'habitloop_state';
export { SCHEMA_VERSION };

function report(message, error) {
  if (__DEV__) console.warn(`[storage] ${message}`, error);
}

/**
 * Reads persisted state as { state, writable }.
 *
 * `state` is null when there is nothing usable to read -- a first launch,
 * unreadable storage and corrupt JSON alike, because the app's response to all
 * three is the same: carry on in memory rather than fail.
 *
 * What it no longer covers is an older schema. Reading and upgrading stored
 * shapes is storageSchema.js's job, and every version this app has shipped has
 * a path to the current one, so an existing user's habits and completions
 * survive an update rather than being read as "nothing usable".
 *
 * `writable` is the other half, and it exists for exactly one situation: a
 * file written by a *newer* build than this one. We already decline to guess at
 * it -- but declining to read it and then saving an empty app over it is a
 * slower way of destroying it, and the user who downgrades or reinstalls is
 * precisely the one who can least afford that. So this says "read nothing, and
 * write nothing either", and the store leaves the file alone.
 */
export async function loadState() {
  let raw;

  try {
    raw = await AsyncStorage.getItem(STORAGE_KEY);
  } catch (error) {
    report('could not read saved state; continuing in memory', error);
    return { state: null, writable: true };
  }

  if (!raw) return { state: null, writable: true };

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    report('saved state was not valid JSON; starting fresh', error);
    return { state: null, writable: true };
  }

  const state = normalizeState(parsed);

  if (!state) {
    report(`could not read schema version ${parsed?.version}; leaving it untouched`);
    return { state: null, writable: !isFromTheFuture(parsed) };
  }

  return { state, writable: true };
}

/** Written by a build that knows more than this one does. */
function isFromTheFuture(parsed) {
  return Boolean(parsed) && Number.isInteger(parsed.version) && parsed.version > SCHEMA_VERSION;
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
