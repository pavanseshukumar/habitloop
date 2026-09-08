import AsyncStorage from '@react-native-async-storage/async-storage';

import { DEFAULT_THEME_MODE, normalizeThemeMode } from '../theme/colors';

/**
 * How the app is set up, as opposed to what the user is building.
 *
 * Deliberately its own key and its own file. Habits and completions are the
 * user's record and carry a schema version and a migration path; an appearance
 * preference is neither of those things, and folding it into that blob would
 * mean a theme change rewrites the habit store and a future theme option needs
 * a habit migration. They are separate concerns and they persist separately.
 *
 * There is no version here on purpose. Every read is normalised and every
 * unreadable value falls back to a working default, which is the whole of what
 * a version number would have bought for a record this small.
 */
const PREFERENCES_KEY = 'habitloop_preferences';

function report(message, error) {
  if (__DEV__) console.warn(`[preferences] ${message}`, error);
}

/** Whatever is on disk, read into a complete set of preferences. */
export async function loadPreferences() {
  let raw;

  try {
    raw = await AsyncStorage.getItem(PREFERENCES_KEY);
  } catch (error) {
    report('could not read preferences; using defaults', error);
    return { themeMode: DEFAULT_THEME_MODE };
  }

  if (!raw) return { themeMode: DEFAULT_THEME_MODE };

  try {
    const parsed = JSON.parse(raw);
    return { themeMode: normalizeThemeMode(parsed?.themeMode) };
  } catch (error) {
    report('preferences were not valid JSON; using defaults', error);
    return { themeMode: DEFAULT_THEME_MODE };
  }
}

/**
 * Writes the preference, and never lets a failed write reach the user.
 *
 * Losing this is survivable in a way losing a habit is not: the app carries on
 * with the choice in memory, and the worst case is that the next launch opens
 * on the device's appearance again.
 */
export async function savePreferences({ themeMode }) {
  try {
    await AsyncStorage.setItem(
      PREFERENCES_KEY,
      JSON.stringify({ themeMode: normalizeThemeMode(themeMode) })
    );
  } catch (error) {
    report('could not save preferences', error);
  }
}
