import { DarkTheme, DefaultTheme } from '@react-navigation/native';

import { fontFamily } from '../theme';

/**
 * Maps the design system onto React Navigation's theme so anything the
 * navigator renders itself -- card backgrounds, and the flash of colour behind
 * a screen mid-transition -- matches the app rather than defaulting to white.
 *
 * Built per theme rather than once at import: the background this returns is
 * what shows through during a push, so a stale one would show as a white blink
 * between two dark screens.
 *
 * The light/dark base matters beyond the colours we set. React Navigation
 * reads `dark` to decide a handful of its own defaults, so starting from the
 * matching base keeps anything we have not named consistent with the rest.
 *
 * fontWeight stays 'normal' throughout -- weight comes from the family.
 */
const navigationFont = (family) => ({ fontFamily: family, fontWeight: 'normal' });

export function navigationThemeFor(colors, scheme) {
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;

  return {
    ...base,
    dark: scheme === 'dark',
    colors: {
      ...base.colors,
      primary: colors.brand,
      background: colors.background,
      card: colors.surface,
      text: colors.text,
      border: colors.border,
      notification: colors.accent,
    },
    fonts: {
      regular: navigationFont(fontFamily.regular),
      medium: navigationFont(fontFamily.medium),
      bold: navigationFont(fontFamily.semibold),
      heavy: navigationFont(fontFamily.bold),
    },
  };
}
