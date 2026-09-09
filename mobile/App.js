import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useAppFonts } from './src/hooks/useAppFonts';
import { RootNavigator } from './src/navigation/RootNavigator';
import { SplashScreen as BrandSplash } from './src/screens/SplashScreen';
import { HabitsProvider, useHabits } from './src/store/habits';
import { ThemeProvider, useTheme } from './src/theme';

// Hold the native splash until the typeface is ready, so the first frame the
// user sees is already set in Plus Jakarta Sans.
SplashScreen.preventAutoHideAsync();

/**
 * Theme outside habits, and both outside the navigator.
 *
 * The order matters in one direction only: everything below ThemeProvider can
 * read the palette, and nothing above it can. Habits sit inside because
 * screens need both, and the two providers never talk to each other -- which
 * is what keeps a theme change from touching a habit.
 */
export default function App() {
  const [fontsLoaded, fontError] = useAppFonts();

  // If the fonts fail we still render -- a system-font app beats a stuck splash.
  const fontsReady = fontsLoaded || fontError;

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <HabitsProvider>
          <AppContent fontsReady={fontsReady} />
        </HabitsProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

/**
 * The loading gate. Reading storage is fast, so rather than flash a skeleton
 * the app simply stays behind the splash it is already showing until the
 * fonts, the saved habits and the saved appearance are all in hand -- the user
 * sees one transition, into a Today screen that is correct on its first frame
 * and in the right theme.
 */
function AppContent({ fontsReady }) {
  const { ready: habitsReady } = useHabits();
  const { colors, scheme, ready: themeReady } = useTheme();
  const canRender = fontsReady && habitsReady && themeReady;

  // Once per launch, and this is what makes that true: the flag lives on the
  // one component that mounts when the app starts and is never unmounted
  // again. Navigating to a habit, to Settings, to the collection and back is
  // the *navigator* changing, several levels below -- it cannot reach this,
  // so the entrance cannot replay. A cold start is a new AppContent, which is
  // exactly when it should play.
  const [entered, setEntered] = useState(false);
  const onEntered = useCallback(() => setEntered(true), []);

  useEffect(() => {
    if (canRender) SplashScreen.hideAsync().catch(() => {});
  }, [canRender]);

  if (!canRender) return null;

  return (
    // The app's paper, once, behind everything.
    //
    // Every other background in this app is painted *inside* a screen -- the
    // Screen shell, and the stack's contentStyle. That leaves the window itself
    // unpainted, and on Android the window is white: expo-splash-screen sets
    // windowBackground for the splash, and `android.backgroundColor` is a single
    // static value that could never follow light and dark anyway. So the one
    // surface the theme could not reach was the one furthest back.
    //
    // Anything the navigator does not cover for a frame -- the gap a pop can
    // open between the screen leaving and the screen returning -- landed on that
    // white. This is a plain view with the resolved background on it, under the
    // whole stack, so there is nothing left behind the app that the theme does
    // not own. It changes no layout: one full-bleed view, no insets, no padding.
    <View style={[styles.backdrop, { backgroundColor: colors.background }]}>
      {/* Inverted against the background rather than fixed: the clock and the
          battery belong to the platform, and they have to stay legible on
          whichever ground the app is currently painting behind them. */}
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <RootNavigator />

      {/* Above the navigator rather than in front of it: Today is mounted,
          laid out and correct underneath for the whole second the splash is
          on screen, so the hand-off is one layer being removed rather than a
          screen arriving. Nothing is pushed, nothing is popped, and there is
          no second Hero anywhere in the app.

          It is a sibling of the navigator inside the backdrop, so it is
          painting the same `colors.background` the stack is -- the ground the
          animation ends on is literally the ground Today begins on. */}
      {entered ? null : <BrandSplash onDone={onEntered} />}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1 },
});
