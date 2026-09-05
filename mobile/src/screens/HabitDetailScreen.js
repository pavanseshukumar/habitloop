import { useEffect, useRef } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BackButton } from '../components/BackButton';
import { RhythmGrid } from '../components/RhythmGrid';
import { Screen } from '../components/Screen';
import { completedDatesFor } from '../lib/completions';
import { getRhythmNote } from '../lib/greeting';
import { getHabitInsight } from '../lib/insights';
import { buildRhythm, countCompleted } from '../lib/rhythm';
import { useToday } from '../hooks/useToday';
import { useHabits } from '../store/habits';
import { colors, layout, motion, spacing, typography } from '../theme';

/**
 * One habit, and how it has actually been going.
 *
 * Today asks what you can do; this screen answers what you have built. That is
 * the whole difference in tone -- nothing here is tappable except the way out
 * and the way to change it, and the page is meant to be read rather than used.
 *
 * It answers in a sentence and a grid, and then stops. There is no streak, no
 * percentage and no target, because every one of those turns showing up into a
 * score the user can be behind on. A count of days is a memory; a streak is a
 * debt. For the same reason the count lives inside a sentence at reading size:
 * set as a number on its own it becomes a figure to beat.
 *
 * Reading order is the design: the name, what it amounts to, the record it came
 * from, and one quiet observation about it.
 */
export function HabitDetailScreen({ navigation, route }) {
  const { habitId } = route.params;
  const { habits, completions } = useHabits();

  // Shared with Today so the grid, the insight and the day marker all agree
  // about which day it is, even after the app has been open overnight.
  const now = useToday();

  // One value for the whole screen. Each band below reads a different slice of
  // it, so the title, the record and the reflection arrive in that order from a
  // single animation rather than from three racing ones.
  const entrance = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(entrance, {
      toValue: 1,
      duration: motion.duration.settle,
      easing: motion.easing.out,
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

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        <Band entrance={entrance} band={BANDS.title}>
          <Text style={styles.name}>{habit.name}</Text>
          {habit.detail ? <Text style={styles.detail}>{habit.detail}</Text> : null}

          {/* Said once, plainly, and then the screen carries on exactly as it
              did before -- what the user built is still all here to read. */}
          {isArchived ? <Text style={styles.archived}>Archived. Your history is kept.</Text> : null}

          <View style={styles.recognition}>
            {lifetimeCount === 0 ? (
              // Nothing has happened yet, and the copy is the only thing that
              // says so. The grid below stays quiet rather than filling with
              // zeroes, and this line points forward instead of at the gap.
              <Text style={styles.recognitionLine}>
                <Text style={styles.recognitionStrong}>Your first one</Text> is waiting.
              </Text>
            ) : (
              // A sentence, at reading size, with the count emphasised by
              // weight alone. "18" set large and alone would be a scoreboard.
              <Text style={styles.recognitionLine}>
                You have shown up{' '}
                <Text style={styles.recognitionStrong}>
                  {lifetimeCount} {lifetimeCount === 1 ? 'time' : 'times'}
                </Text>
                .
              </Text>
            )}
          </View>
        </Band>

        <Band entrance={entrance} band={BANDS.record} style={styles.record}>
          <RhythmGrid habit={habit} completions={completions} today={now} />

          {/* Close under the last row of marks, so it reads as the record's own
              closing line rather than as a figure filed underneath it. */}
          {note ? <Text style={styles.note}>{note}</Text> : null}
        </Band>

        {/* The one thing the app noticed. No container, no heading and no icon
            -- it is the same page still talking, a step warmer than the count
            above because that is a fact and this is an observation. */}
        {insight ? (
          <Band entrance={entrance} band={BANDS.reflection}>
            <Text style={styles.insight}>{insight.text}</Text>
          </Band>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

/**
 * Where each part of the screen sits in the single entrance animation.
 *
 * `at` is the slice of the shared 0..1 value the band fades across, and `lift`
 * the distance it travels. Later bands start later and move a little further,
 * which is what makes the page settle downward as one movement instead of three
 * elements appearing at once.
 */
const BANDS = {
  title: { at: [0, 0.55], lift: 10 },
  record: { at: [0.18, 0.85], lift: 14 },
  reflection: { at: [0.4, 1], lift: 16 },
};

function Band({ entrance, band, style, children }) {
  const opacity = entrance.interpolate({
    inputRange: band.at,
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const translateY = entrance.interpolate({
    inputRange: band.at,
    outputRange: [band.lift, 0],
    extrapolate: 'clamp',
  });

  return <Animated.View style={[style, { opacity, transform: [{ translateY }] }]}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
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
    flexGrow: 1,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  // The subject of the page, and the largest thing on it by a clear margin --
  // a habit's name should look different here than it does in Today's list.
  name: {
    ...typography.habitTitle,
    color: colors.brand,
  },
  detail: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  archived: {
    ...typography.bodySmall,
    color: colors.textMuted,
    marginTop: spacing.md,
  },
  // A clear break after the name: the recognition is a second thought, not a
  // subtitle to it.
  recognition: {
    marginTop: spacing.xxxl,
  },
  recognitionLine: {
    ...typography.recognition,
    color: colors.textSecondary,
  },
  recognitionStrong: {
    fontFamily: typography.habitTitle.fontFamily,
    color: colors.brand,
  },
  // Shorter than the break above it. The count and the rhythm it came from are
  // one movement, and the grid should read as the evidence for the sentence.
  record: {
    marginTop: spacing.xxl,
  },
  note: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: spacing.lg,
  },
  // Given real air, and the warmest colour after the name. It is the last thing
  // on the page and the only one that is about the user rather than the record.
  insight: {
    ...typography.body,
    color: colors.brandSoft,
    marginTop: spacing.xxl,
  },
  missing: {
    ...typography.h3,
    color: colors.textSecondary,
    marginTop: spacing.xl,
  },
});
