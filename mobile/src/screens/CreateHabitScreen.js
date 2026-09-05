import { useEffect, useRef } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
} from 'react-native';

import { BackButton } from '../components/BackButton';
import { HabitFormFields } from '../components/HabitFormFields';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { useHabitForm } from '../hooks/useHabitForm';
import { useHabits } from '../store/habits';
import { colors, spacing, typography } from '../theme';

/**
 * One question, asked large: what do you want to do?
 *
 * Everything below the name field is optional or already answered, so the
 * screen can be finished with a single line of typing. Frequency defaults to
 * every day because that is what most habits are, and asking would be friction
 * before the user has even decided they mean it.
 */
export function CreateHabitScreen({ navigation }) {
  const { addHabit } = useHabits();
  const form = useHabitForm(null);

  // Set while saving so the discard prompt below does not fire on our own
  // navigation back to Today.
  const isSaving = useRef(false);

  // Covers the chevron, the hardware back button and the back gesture in one
  // place -- they all funnel through the same navigation event. Typed words are
  // the trigger, not a tapped frequency: nothing is worth warning about until
  // the user has actually written something down.
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      if (isSaving.current || !form.hasText) return;

      event.preventDefault();
      Alert.alert(
        'Discard this habit?',
        'What you have typed will not be saved.',
        [
          { text: 'Keep editing', style: 'cancel' },
          {
            text: 'Discard',
            style: 'destructive',
            onPress: () => navigation.dispatch(event.data.action),
          },
        ]
      );
    });

    return unsubscribe;
  }, [navigation, form.hasText]);

  const onCreate = () => {
    if (!form.canSave) return;
    isSaving.current = true;
    addHabit(form.values);
    navigation.goBack();
  };

  return (
    <Screen>
      {/* Expo Go does not resize the window for the keyboard, so the create
          button would otherwise sit behind it. Where the window *does* resize,
          the measured keyboard overlap is zero and this becomes a no-op. */}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <BackButton onPress={() => navigation.goBack()} />

        <ScrollView
          // flex:1 is load-bearing: without it the ScrollView takes its full
          // content height and pushes the create button off-screen when the
          // keyboard opens.
          style={styles.scroll}
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}>
          <Text style={styles.heading}>BUILD A HABIT</Text>

          <HabitFormFields form={form} autoFocus />
        </ScrollView>

        <PrimaryButton label="Create habit" onPress={onCreate} disabled={!form.canSave} />
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  body: {
    flexGrow: 1,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
  },
  // A quiet marker, not a title: the question in the field below is the
  // warmest thing on the screen, so it gets to be the largest thing too.
  heading: {
    ...typography.label,
    color: colors.textMuted,
    marginBottom: spacing.xl,
  },
});
