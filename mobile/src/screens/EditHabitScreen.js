import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
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
 * The same questions as creating a habit, asked again later.
 *
 * A habit is something a person chose to build, and what they can do is change
 * with them -- so this screen exists to move the thing, not to re-decide it. It
 * opens on the answers already given, with nothing focused, because the usual
 * reason to be here is to change one day of a week rather than to start typing.
 *
 * Retiring the habit lives at the bottom, in plain text, well past the point
 * where anyone could reach it by accident.
 */
export function EditHabitScreen({ navigation, route }) {
  const { habitId } = route.params;
  const { habits, updateHabit, archiveHabit } = useHabits();

  const habit = habits.find((item) => item.id === habitId);
  const form = useHabitForm(habit);

  // Decided once, as the screen opens. Defensive against a route outliving its
  // habit, and against arriving at an already-archived one -- but deliberately
  // not re-checked, because archiving from this screen flips the habit under
  // us and it should slide away still showing it, not swap to an apology
  // halfway through the animation.
  const [unavailable] = useState(() => {
    if (!habit) return 'This habit is no longer here.';
    if (habit.archivedAt) return 'This habit has been archived.';
    return null;
  });

  // Set while saving or archiving so the discard prompt does not fire on our
  // own navigation away.
  const isLeaving = useRef(false);

  // Only a real change is worth interrupting for -- opening this screen and
  // backing straight out must stay silent.
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      if (isLeaving.current || !form.isDirty) return;

      event.preventDefault();
      Alert.alert('Discard changes?', 'This habit will stay as it is.', [
        { text: 'Keep editing', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => navigation.dispatch(event.data.action),
        },
      ]);
    });

    return unsubscribe;
  }, [navigation, form.isDirty]);

  if (unavailable) {
    return (
      <Screen>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.missing}>{unavailable}</Text>
      </Screen>
    );
  }

  const onSave = () => {
    if (!form.canSave) return;
    isLeaving.current = true;
    // The id is never part of what is written back, so history stays attached.
    updateHabit(habitId, form.values);
    navigation.goBack();
  };

  const onArchive = () => {
    Alert.alert('Archive this habit?', 'Your history will stay saved.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Archive habit',
        onPress: () => {
          isLeaving.current = true;
          archiveHabit(habitId);
          // Past HabitDetail, which has nothing left to show, and back to the
          // day itself.
          navigation.popTo('Today');
        },
      },
    ]);
  };

  return (
    <Screen>
      {/* Expo Go does not resize the window for the keyboard, so the save
          button would otherwise sit behind it. Where the window *does* resize,
          the measured keyboard overlap is zero and this becomes a no-op. */}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <BackButton onPress={() => navigation.goBack()} />

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}>
          {/* The same slot Create puts its question in, in the same words this
              screen always used -- but stated rather than asked, and in the
              quieter colour. Nothing is being decided here for the first time. */}
          <Text style={styles.question}>Change this habit</Text>

          <HabitFormFields form={form} />

          <Pressable
            onPress={onArchive}
            hitSlop={8}
            style={({ pressed }) => [styles.archiveAction, pressed && styles.archivePressed]}
            accessibilityRole="button"
            accessibilityLabel="Archive habit">
            <Text style={styles.archiveLabel}>Archive habit</Text>
            <Text style={styles.archiveNote}>
              It leaves Today. Everything you have done stays.
            </Text>
          </Pressable>
        </ScrollView>

        <PrimaryButton label="Save changes" onPress={onSave} disabled={!form.canSave} />
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
  question: {
    ...typography.h2,
    color: colors.textSecondary,
    marginBottom: spacing.xxl,
  },
  // Set well below the last field, and left as words rather than given a shape:
  // retiring a habit should be findable, never the next thing your thumb hits.
  archiveAction: {
    marginTop: spacing.huge,
    paddingVertical: spacing.sm,
    alignSelf: 'flex-start',
  },
  archivePressed: {
    opacity: 0.6,
  },
  archiveLabel: {
    ...typography.body,
    color: colors.textSecondary,
  },
  archiveNote: {
    ...typography.bodySmall,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  missing: {
    ...typography.h3,
    color: colors.textSecondary,
    marginTop: spacing.xl,
  },
});
