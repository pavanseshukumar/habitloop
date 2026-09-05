import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BackButton } from '../components/BackButton';
import { RhythmGrid } from '../components/RhythmGrid';
import { Screen } from '../components/Screen';
import { completedDatesFor } from '../lib/completions';
import { getRhythmNote } from '../lib/greeting';
import { getHabitInsight } from '../lib/insights';
import { buildRhythm, countCompleted } from '../lib/rhythm';
import { useToday } from '../hooks/useToday';
import { useHabits } from '../store/habits';
import { colors, layout, spacing, typography } from '../theme';

/**
 * One habit, and how it has actually been going.
 *
 * The screen answers that in a sentence and a grid, and then stops. There is no
 * streak, no percentage and no target, because every one of those turns showing
 * up into a score the user can be behind on. A count of days is a memory; a
 * streak is a debt.
 */
export function HabitDetailScreen({ navigation, route }) {
  const { habitId } = route.params;
  const { habits, completions } = useHabits();

  // Shared with Today so the grid, the insight and the day marker all agree
  // about which day it is, even after the app has been open overnight.
  const now = useToday();
  const entrance = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(entrance, {
      toValue: 1,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [entrance]);

  // The full list, not the active one: an archived habit still has a past, and
  // this is the screen that shows it.
  const habit = habits.find((item) => item.id === habitId);

  // Defensive only: nothing deletes habits, but the route outliving its habit
  // should read as a sentence rather than crash.
  if (!habit) {
    return (
      <Screen>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.missing}>This habit is no longer here.</Text>
      </Screen>
    );
  }

  const isArchived = Boolean(habit.archivedAt);

  const lifetimeCount = completedDatesFor(completions, habit.id).length;
  const recentCount = countCompleted(buildRhythm(habit, completions, now));
  const note = getRhythmNote(lifetimeCount, recentCount);
  // Usually null. It appears only once the history says something a person
  // would agree with, which for most habits is a long way in.
  const insight = getHabitInsight(habit, completions, now);

  return (
    <Screen>
      {/* Edit sits up here as three quiet letters rather than a button. It is
          reachable in one tap, and still the smallest thing on a screen whose
          job is the rhythm below it. An archived habit has nothing to change,
          so it simply is not offered one. */}
      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} />

        {isArchived ? null : (
          <Pressable
            onPress={() => navigation.navigate('EditHabit', { habitId: habit.id })}
            hitSlop={12}
            style={({ pressed }) => [styles.editAction, pressed && styles.editPressed]}
            accessibilityRole="button"
            accessibilityLabel="Edit habit">
            <Text style={styles.editLabel}>Edit</Text>
          </Pressable>
        )}
      </View>

      <Animated.View
        style={[
          styles.flex,
          {
            opacity: entrance,
            transform: [
              { translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) },
            ],
          },
        ]}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}>
          <Text style={styles.name}>{habit.name}</Text>
          {habit.detail ? <Text style={styles.detail}>{habit.detail}</Text> : null}

          {/* Said once, plainly, and then the screen carries on exactly as it
              did before -- what the user built is still all here to read. */}
          {isArchived ? <Text style={styles.archived}>Archived. Your history is kept.</Text> : null}

          <View style={styles.summary}>
            {lifetimeCount === 0 ? (
              <Text style={styles.firstTime}>Your first one is waiting.</Text>
            ) : (
              <>
                <Text style={styles.lead}>You have shown up</Text>
                <Text style={styles.count}>
                  {lifetimeCount} {lifetimeCount === 1 ? 'time' : 'times'}
                </Text>
              </>
            )}
          </View>

          <RhythmGrid habit={habit} completions={completions} today={now} />

          {/* The reflection, in the order it earns: what the grid amounts to,
              and then the one thing the app noticed in it. No container, no
              heading -- it is the same page still talking. */}
          {note ? <Text style={styles.note}>{note}</Text> : null}
          {insight ? <Text style={styles.insight}>{insight.text}</Text> : null}
        </ScrollView>
      </Animated.View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  // Mirrors BackButton's negative inset on the other side, so the word lands on
  // the screen gutter while keeping a full-height target.
  editAction: {
    height: layout.touchTarget,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    marginRight: -spacing.md,
  },
  editPressed: {
    opacity: 0.6,
  },
  editLabel: {
    ...typography.body,
    color: colors.textSecondary,
  },
  content: {
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
  },
  name: {
    ...typography.h2,
    color: colors.brand,
  },
  detail: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  archived: {
    ...typography.bodySmall,
    color: colors.textMuted,
    marginTop: spacing.md,
  },
  // A clear break after the habit's name, then a shorter one into the grid:
  // the count and the rhythm it came from should read as one movement.
  summary: {
    marginTop: spacing.xxxl,
    marginBottom: spacing.xxl,
  },
  lead: {
    ...typography.body,
    color: colors.textSecondary,
  },
  count: {
    ...typography.number,
    color: colors.brand,
    marginTop: spacing.xs,
  },
  firstTime: {
    ...typography.h2,
    color: colors.brand,
  },
  note: {
    ...typography.bodySmall,
    color: colors.textMuted,
    marginTop: spacing.lg,
  },
  // A step warmer than the note above it -- the count is a fact, this is an
  // observation -- and still well below the grid, which stays the subject.
  insight: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  missing: {
    ...typography.h3,
    color: colors.textSecondary,
    marginTop: spacing.xl,
  },
});
