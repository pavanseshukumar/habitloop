import { dark, darkShadows } from './dark';
import { light, lightShadows } from './light';

/**
 * The two atmospheres, and how a preference becomes one of them.
 *
 * Everything here is a plain function over plain data -- no Appearance API, no
 * storage, no React. Which theme is in force is a decision with two inputs and
 * a handful of rules, and keeping those rules reachable without a device is
 * what lets them be tested. ThemeProvider supplies the inputs; this decides.
 *
 * Both palettes export exactly the same token names, which is the property the
 * whole feature rests on: no component ever asks which theme is running, it
 * just reads `colors.textSecondary` and gets the right answer.
 */
export const themes = { light, dark };
export const themeShadows = { light: lightShadows, dark: darkShadows };

/**
 * What the user can choose.
 *
 * `system` is a real third option rather than the absence of a choice -- it
 * means "keep following the device", which is different from having picked the
 * value the device happens to be showing right now.
 */
export const THEME_MODES = ['system', 'light', 'dark'];

/** The mode a fresh install starts in: whatever the phone is already doing. */
export const DEFAULT_THEME_MODE = 'system';

export function isThemeMode(value) {
  return THEME_MODES.includes(value);
}

/**
 * Reads a stored preference, falling back rather than failing.
 *
 * A preference read from disk can be anything -- absent on a first launch, or
 * left behind by a build that offered a mode this one does not. Neither is
 * worth an error: the device's own appearance is a safe answer to every
 * question this setting asks.
 */
export function normalizeThemeMode(value) {
  return isThemeMode(value) ? value : DEFAULT_THEME_MODE;
}

/**
 * The mode plus the device's scheme, resolved to the theme actually in force.
 *
 * `systemScheme` is whatever React Native reports, and it is allowed to be
 * null: the OS returns null when it has no preference to give, and the answer
 * then is light, the same way the app looked before it had a choice.
 */
export function resolveScheme(themeMode, systemScheme) {
  const mode = normalizeThemeMode(themeMode);
  if (mode === 'light' || mode === 'dark') return mode;

  return systemScheme === 'dark' ? 'dark' : 'light';
}

/** The palette itself, for anything that wants the end of that chain. */
export function themeFor(themeMode, systemScheme) {
  return themes[resolveScheme(themeMode, systemScheme)];
}
