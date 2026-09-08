import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';

import { loadPreferences, savePreferences } from '../lib/preferences';
import { DEFAULT_THEME_MODE, resolveScheme, themeShadows, themes } from './colors';

/**
 * Which theme is running, and the one place that decides it.
 *
 * Screens never ask whether it is dark. They read tokens, and the tokens are
 * whichever palette this provider is handing out -- so adding dark mode
 * changed what components are given, not what they do with it.
 *
 * The mode lives here rather than in the habits store on purpose. The two have
 * nothing to say to each other, and keeping them apart is what guarantees that
 * changing the theme cannot touch a habit, rewrite the habit store, or set off
 * a notification reconcile: nothing in this file writes anything but a single
 * preferences key.
 */
const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  // React Native's own appearance listener. Following the device is a
  // subscription, not a poll, so switching the phone to dark updates the app
  // while it is open with nothing here to arrange.
  const systemScheme = useColorScheme();

  const [themeMode, setStoredMode] = useState(DEFAULT_THEME_MODE);

  // Until the saved preference is read, `system` is the right thing to render:
  // it is both the default and the least surprising first frame, so there is
  // no flash of the wrong theme for a user who has chosen one.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    loadPreferences().then((preferences) => {
      if (cancelled) return;
      setStoredMode(preferences.themeMode);
      setReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // Applied immediately and written behind the change, so the interface turns
  // over on the tap rather than after a disk round-trip.
  const setThemeMode = useCallback((next) => {
    setStoredMode(next);
    savePreferences({ themeMode: next });
  }, []);

  const value = useMemo(() => {
    const scheme = resolveScheme(themeMode, systemScheme);

    return {
      colors: themes[scheme],
      shadows: themeShadows[scheme],
      scheme,
      themeMode,
      setThemeMode,
      ready,
    };
  }, [themeMode, systemScheme, setThemeMode, ready]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used within a ThemeProvider');
  return value;
}

/**
 * A stylesheet that follows the theme.
 *
 * StyleSheet.create at module scope bakes in whichever palette was loaded
 * first, which is exactly wrong for a theme that changes while the app runs.
 * Passing the colours in instead costs each component one line, and the result
 * is memoised per palette -- so the sheets are rebuilt when the theme actually
 * changes and never on an ordinary render.
 *
 * `makeStyles` must be defined at module scope for that memo to hold.
 */
export function useThemedStyles(makeStyles) {
  const { colors, shadows } = useTheme();
  return useMemo(() => makeStyles(colors, shadows), [makeStyles, colors, shadows]);
}
