import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { CreateHabitScreen } from '../screens/CreateHabitScreen';
import { EditHabitScreen } from '../screens/EditHabitScreen';
import { HabitDetailScreen } from '../screens/HabitDetailScreen';
import { TodayScreen } from '../screens/TodayScreen';
import { navigationTheme } from './navigationTheme';

const Stack = createNativeStackNavigator();

/**
 * Root stack: the day, and the three things you can do to a habit -- start
 * one, look at one, change one. Headers are off by default; screens own theirs.
 */
export function RootNavigator() {
  return (
    <NavigationContainer theme={navigationTheme}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Today" component={TodayScreen} />
        <Stack.Screen name="CreateHabit" component={CreateHabitScreen} />
        <Stack.Screen name="HabitDetail" component={HabitDetailScreen} />
        <Stack.Screen name="EditHabit" component={EditHabitScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
