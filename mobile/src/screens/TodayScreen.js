import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { HabitItem } from '../components/HabitItem';
import { ProgressSummary } from '../components/ProgressSummary';
import { Screen } from '../components/Screen';
import { Wordmark } from '../components/Wordmark';
import { weekdayLabelFor } from '../data/weekdays';
import { isCompletedOn } from '../lib/completions';
import { toDateKey } from '../lib/dates';
import { useToday } from '../hooks/useToday';
import { completionFeedback, undoFeedback } from '../lib/haptics';
import { COMPLETED_STATEMENT, RETURN_STATEMENT, formatDate, getDayVoice } from '../lib/greeting';
import { isReturningHabit } from '../lib/recovery';
import { nextScheduledDay, scheduledOn } from '../lib/schedule';
import { useHabits } from '../store/habits';
import { colors, motion, radii, shadows, spacing, typography } from '../theme';

/**
 * The first thing the user sees, and the answer to one question: what can I do
 * today?
 *
 * Reading order is the whole design -- wordmark, greeting, date, a line of
 * context, then the habits, and only then where the day stands. Nothing above
 * the habits is interactive, so the only things on screen that can be tapped
 * are the things worth tapping.
 */
export function TodayScreen({ navigation }) {
  // Archived habits are excluded once, here, rather than filtered at each use.
  const { activeHabits, completions, toggleCompletion } = useHabits();

  // Steady while the user is on the screen, but not frozen at launch: this
  // moves when the calendar day does, so a completion is never filed under
  // yesterday after the phone has been asleep overnight.
  const now = useToday();
  const voice = useMemo(() => getDayVoice(now), [now]);
  const today = useMemo(() => formatDate(now), [now]);
  const todayKey = useMemo(() => toDateKey(now), [now]);

  // Habits not scheduled for today are still here, just not today's business.
  const todaysHabits = useMemo(() => scheduledOn(activeHabits, now), [activeHabits, now]);
  const nextDay = useMemo(
    () => (todaysHabits.length === 0 ? nextScheduledDay(activeHabits, now) : null),
    [activeHabits, todaysHabits.length, now]
  );

  const completedCount = todaysHabits.filter((habit) =>
    isCompletedOn(completions, habit.id, todayKey)
  ).length;
  const allDone = todaysHabits.length > 0 && completedCount === todaysHabits.length;

  // Set when the user completes a habit they had been away from, and then left
  // alone for the rest of the session. Session-only on purpose: coming back is
  // a moment, not a status, so nothing about it is written down and a relaunch
  // simply forgets it. Completing further habits never re-triggers or clears
  // it, which is what keeps the line still instead of blinking per tap.
  const [hasReturned, setHasReturned] = useState(false);

  // A new day is a new context. Returning was yesterday's moment, and it
  // should not still be on screen once the date underneath it has changed.
  useEffect(() => {
    setHasReturned(false);
  }, [todayKey]);

  // Finishing the day still wins -- returning is how the day started, not how
  // it ended.
  const statement = allDone
    ? COMPLETED_STATEMENT
    : hasReturned
      ? RETURN_STATEMENT
      : voice.statement;

  const openCreate = () => navigation.navigate('CreateHabit');
  const openHabit = (id) => navigation.navigate('HabitDetail', { habitId: id });

  const onToggle = (id) => {
    // Fired here rather than inside the state updater, which React may run
    // more than once for a single tap.
    if (isCompletedOn(completions, id, todayKey)) {
      undoFeedback();
    } else {
      completionFeedback();

      // Asked before the completion lands: afterwards the gap is closed and
      // the habit reads as any other. One returning habit is enough -- the
      // others are not consulted, and nothing is counted.
      const habit = todaysHabits.find((item) => item.id === id);
      if (isReturningHabit(habit, completions, now)) setHasReturned(true);
    }

    toggleCompletion(id, todayKey);
  };

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        <Wordmark style={styles.wordmark} />

        {/* The greeting leads: it is the personal line, and the date is the
            quiet fact underneath it rather than a header standing over it. */}
        <View style={styles.intro}>
          <Text style={styles.greeting}>{voice.greeting}</Text>
          <Text style={styles.date}>{today}</Text>
          <ContextStatement text={statement} />
        </View>

        {/* Collapses once there are enough habits to fill the screen, so the
            list sits within thumb reach while the day is still short. */}
        <View style={styles.breathe} />

        {activeHabits.length === 0 ? (
          <EmptyState onCreate={openCreate} />
        ) : (
          <View>
            {todaysHabits.length === 0 ? (
              // Habits exist, none fall on today. This is a rest day, not an
              // empty app, so it says when the rhythm picks up again rather
              // than borrowing the "nothing here yet" language of a new user.
              <View style={styles.restBlock}>
                <Text style={styles.restTitle}>Nothing scheduled today.</Text>
                {nextDay ? (
                  <Text style={styles.restNext}>
                    {nextDay.inDays === 1
                      ? 'Next up tomorrow.'
                      : `Next up on ${weekdayLabelFor(nextDay.date)}.`}
                  </Text>
                ) : null}
              </View>
            ) : (
              <>
                <View style={styles.list}>
                  {todaysHabits.map((habit) => (
                    <HabitItem
                      key={habit.id}
                      habit={habit}
                      completed={isCompletedOn(completions, habit.id, todayKey)}
                      onToggle={onToggle}
                      onOpen={openHabit}
                    />
                  ))}
                </View>

                {/* Below the habits rather than above them: a closing summary
                    of the day, not a target waiting for you on arrival. */}
                <ProgressSummary completed={completedCount} total={todaysHabits.length} />
              </>
            )}

            {/* Sits at the end of the day's content rather than floating over
                it. The gap above is what makes it read as a different kind of
                thing from a habit, and the coral belongs to the plus alone --
                enough to mark it as the additive action, far too little to
                compete with a completion mark. */}
            <Pressable
              onPress={openCreate}
              hitSlop={8}
              style={({ pressed }) => [styles.addRow, pressed && styles.addRowPressed]}
              accessibilityRole="button"
              accessibilityLabel="Add a habit">
              <Text style={styles.addLabel}>
                <Text style={styles.addPlus}>+</Text>  Add a habit
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

/**
 * The one line on Today that answers to what the user has done.
 *
 * It fades the new words in over three pixels when the context changes, and
 * not at all on first render -- enough that the line reads as having changed
 * rather than having been swapped, and far short of anything that would draw
 * the eye away from the habits themselves.
 */
function ContextStatement({ text }) {
  const arrival = useRef(new Animated.Value(1)).current;
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    arrival.setValue(0);
    Animated.timing(arrival, {
      toValue: 1,
      duration: motion.duration.base,
      easing: motion.easing.out,
      useNativeDriver: true,
    }).start();
  }, [text, arrival]);

  return (
    <Animated.Text
      style={[
        styles.statement,
        {
          opacity: arrival,
          transform: [
            { translateY: arrival.interpolate({ inputRange: [0, 1], outputRange: [3, 0] }) },
          ],
        },
      ]}>
      {text}
    </Animated.Text>
  );
}

/**
 * A brand-new install, and the only screen in the app with one thing to do.
 *
 * Built like the rest-day block above it -- a statement, a quieter line, and
 * then whatever action belongs to that state -- so an empty app reads as one
 * of Today's moods rather than as a different screen. The supporting line does
 * the only teaching this product does: a habit here is something you keep
 * doing, and one of them is a complete beginning. Nothing fills the space
 * above it, because there is nothing there and pretending otherwise would be
 * the only unfinished-feeling thing on screen.
 */
function EmptyState({ onCreate }) {
  return (
    <View>
      <Text style={styles.emptyTitle}>Nothing here yet.</Text>
      <Text style={styles.emptyBody}>Start with one thing you want to keep doing.</Text>
      <Pressable
        onPress={onCreate}
        accessibilityRole="button"
        accessibilityLabel="Create your first habit"
        style={({ pressed }) => [styles.createButton, pressed && styles.createButtonPressed]}>
        <Text style={styles.createLabel}>Create your first habit</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    paddingBottom: spacing.xl,
  },
  // Given real air beneath it so the wordmark reads as the app's signature
  // rather than as a heading for the greeting.
  wordmark: {
    marginBottom: spacing.huge,
  },
  intro: {
    marginBottom: spacing.xl,
  },
  greeting: {
    ...typography.greeting,
    color: colors.brand,
  },
  date: {
    ...typography.bodySmall,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  statement: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.lg,
  },
  breathe: {
    flex: 1,
    minHeight: spacing.xxl,
  },
  // The rows carry their own vertical padding, so the list only needs lifting
  // clear of the intro above and the progress bar below.
  list: {
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },
  restBlock: {
    marginBottom: spacing.lg,
  },
  restTitle: {
    ...typography.h2,
    color: colors.text,
  },
  restNext: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  addRow: {
    marginTop: spacing.xxl,
    paddingVertical: spacing.md,
  },
  addRowPressed: {
    opacity: 0.55,
  },
  addLabel: {
    ...typography.body,
    color: colors.textSecondary,
  },
  addPlus: {
    color: colors.accent,
  },
  emptyTitle: {
    ...typography.h1,
    color: colors.text,
  },
  emptyBody: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  // The only lifted thing in the app, and only just: a soft shadow so the one
  // available action sits slightly above the paper instead of printed on it.
  createButton: {
    alignSelf: 'flex-start',
    marginTop: spacing.xxl,
    backgroundColor: colors.brand,
    borderRadius: radii.pill,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    ...shadows.soft,
  },
  createButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.985 }],
  },
  createLabel: {
    ...typography.button,
    color: colors.textOnBrand,
  },
});
