import { useMemo, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { useNotificationRouting } from '../hooks/useNotificationRouting';
import { motion, useTheme } from '../theme';

import { CreateHabitScreen } from '../screens/CreateHabitScreen';
import { EditHabitScreen } from '../screens/EditHabitScreen';
import { HabitDetailScreen } from '../screens/HabitDetailScreen';
import { HabitManagementScreen } from '../screens/HabitManagementScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { TodayScreen } from '../screens/TodayScreen';
import { navigationThemeFor } from './navigationTheme';

const Stack = createNativeStackNavigator();

/**
 * Root stack: the day, the three things you can do to a habit -- start one,
 * look at one, change one -- and the collection they all belong to. Headers are
 * off by default; screens own theirs.
 *
 * HabitManagement sits alongside Today rather than above it: it is somewhere
 * you go and come back from, not a shell the day lives inside. Settings sits
 * alongside it in turn -- pushed and popped from the collection, and last in
 * the list because it is the least of what this app is for.
 *
 * Every screen here pushes except the one that composes: see motion.screen for
 * why there are two categories and not six. The animations themselves are the
 * platform's, driven natively rather than on the JS thread, so a transition
 * cannot be made to stutter by whatever a screen is doing as it mounts.
 */
export function RootNavigator() {
  // Held rather than passed: a tapped reminder arrives from outside React and
  // needs a way in, and this is the only thing in the app that has one.
  const navigationRef = useRef(null);

  useNotificationRouting(navigationRef);

  // Rebuilt only when the palette actually changes. NavigationContainer treats
  // a new theme object as a reason to re-render, so handing it a fresh one
  // every render would be churn for nothing -- and the container must not be
  // remounted here, or switching theme would reset the stack.
  const { colors, scheme } = useTheme();
  const navigationTheme = useMemo(() => navigationThemeFor(colors, scheme), [colors, scheme]);

  // The ground every screen is dealt onto, named here as well as in the
  // navigation theme. During a push there is a moment when the stack is drawing
  // the gap between two screens rather than either of them, and this is what is
  // behind it -- so the transition happens on the app's own paper instead of
  // briefly showing whatever the platform would default to. Taken from the
  // palette, never written down, so it is right in both themes and stays right
  // if either changes.
  const screenOptions = useMemo(
    () => ({ headerShown: false, contentStyle: { backgroundColor: colors.background }, ...motion.screen.push }),
    [colors.background]
  );

  return (
    <NavigationContainer ref={navigationRef} theme={navigationTheme}>
      <Stack.Navigator screenOptions={screenOptions}>
        <Stack.Screen name="Today" component={TodayScreen} />
        <Stack.Screen name="CreateHabit" component={CreateHabitScreen} options={COMPOSE} />
        <Stack.Screen name="HabitDetail" component={HabitDetailScreen} />
        <Stack.Screen name="EditHabit" component={EditHabitScreen} />
        <Stack.Screen name="HabitManagement" component={HabitManagementScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

// Module scope so the object is the same one on every render: a fresh options
// object each time would have the navigator reconfiguring a screen that has not
// changed.
const COMPOSE = motion.screen.compose;
