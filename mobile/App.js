import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useAppFonts } from './src/hooks/useAppFonts';
import { RootNavigator } from './src/navigation/RootNavigator';
import { HabitsProvider, useHabits } from './src/store/habits';

// Hold the native splash until the typeface is ready, so the first frame the
// user sees is already set in Plus Jakarta Sans.
SplashScreen.preventAutoHideAsync();

export default function App() {
  const [fontsLoaded, fontError] = useAppFonts();

  // If the fonts fail we still render -- a system-font app beats a stuck splash.
  const fontsReady = fontsLoaded || fontError;

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <HabitsProvider>
        <AppContent fontsReady={fontsReady} />
      </HabitsProvider>
    </SafeAreaProvider>
  );
}

/**
 * The loading gate. Reading storage is fast, so rather than flash a skeleton
 * the app simply stays behind the splash it is already showing until both the
 * fonts and the saved habits are in hand -- the user sees one transition, into
 * a Today screen that is correct on its first frame.
 */
function AppContent({ fontsReady }) {
  const { ready } = useHabits();
  const canRender = fontsReady && ready;

  useEffect(() => {
    if (canRender) SplashScreen.hideAsync().catch(() => {});
  }, [canRender]);

  if (!canRender) return null;

  return <RootNavigator />;
}
