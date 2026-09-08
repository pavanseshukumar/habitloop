import { useEffect, useRef } from 'react';
import { Animated, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BackButton } from '../components/BackButton';
import { HabitRow } from '../components/HabitRow';
import { Screen } from '../components/Screen';
import { scheduleSummary } from '../lib/habitCollections';
import { useHabits } from '../store/habits';
import { motion, spacing, typography, useThemedStyles } from '../theme';

/**
 * Everything the user has, in one place.
 *
 * Today answers "what can I do now?", and answers it by leaving things out --
 * habits scheduled for other days, and habits that have been put down. That is
 * the right answer for a day and the wrong one for a collection, so this screen
 * exists to be the place where nothing is left out.
 *
 * It is a collection, not a dashboard: no cards, no counts, no progress, and
 * nothing to complete. The habits carry the weight and the two section labels
 * stay out of their way, which is what keeps a list of everything you have ever
 * started from reading as an admin panel. Detail already knows how to show an
 * archived habit and is where continuing lives, so this screen repeats neither
 * -- it only makes sure every habit can be reached.
 *
 * The order is the order the two states matter in: what you are carrying now,
 * then what you have put down.
 *
 * How the app behaves is not part of that question, and Settings is reached
 * from Today rather than from here: managing habits and configuring the app
 * are two destinations, not one inside the other.
 */
export function HabitManagementScreen({ navigation }) {
  const styles = useThemedStyles(makeStyles);
  // Both halves come from the store, already filtered and ordered, so this
  // screen never defines what "active" means and never re-sorts anything.
  const { activeHabits, archivedHabits } = useHabits();

  // One value for the whole screen, read at two different slices below. The
  // title settles first and the collection follows it in, so the page arrives
  // as a single movement rather than as a list of things appearing. Rows are
  // deliberately not staggered: a collection should already be there when you
  // look at it.
  const entrance = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(entrance, {
      toValue: 1,
      duration: motion.duration.settle,
      easing: motion.easing.out,
      useNativeDriver: true,
    }).start();
  }, [entrance]);

  const openHabit = (habitId) => navigation.navigate('HabitDetail', { habitId });

  const hasNothing = activeHabits.length === 0 && archivedHabits.length === 0;

  return (
    <Screen>
      <BackButton onPress={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Band entrance={entrance} band={BANDS.title}>
          <Text style={styles.title}>Your habits</Text>

          {/* Skipped on an empty app, where it would be describing nothing.
              The empty line below says everything there is to say. */}
          {hasNothing ? null : (
            <Text style={styles.subtitle}>
              What you are building, and what you have put down.
            </Text>
          )}
        </Band>

        <Band entrance={entrance} band={BANDS.collection}>
          {hasNothing ? (
            // Nothing has been written down yet. Today already holds the one
            // action that fixes that, and repeating it here would turn a quiet
            // index into a second front door.
            <Text style={styles.empty}>Nothing here yet.</Text>
          ) : (
            <>
              <Section label="Active">
                {activeHabits.length === 0 ? (
                  // Habits exist, none are active. Said plainly, and pointed at
                  // the section below -- the collection is intentional, not
                  // broken, and everything in it can be picked back up.
                  <View style={styles.emptyBlock}>
                    <Text style={styles.empty}>Nothing active right now.</Text>
                    <Text style={styles.emptyNote}>
                      Open one below to continue it whenever you want.
                    </Text>
                  </View>
                ) : (
                  activeHabits.map((habit) => (
                    <HabitRow
                      key={habit.id}
                      habit={habit}
                      // The schedule, so a habit that is not on Today explains
                      // itself here instead of looking missing.
                      meta={scheduleSummary(habit)}
                      hint="Opens this habit's rhythm"
                      onPress={openHabit}
                    />
                  ))
                )}
              </Section>

              {/* Only drawn when there is something in it. An empty ARCHIVED
                  heading would suggest the user has put habits down when they
                  have not. */}
              {archivedHabits.length > 0 ? (
                <Section label="Archived" style={styles.archivedSection}>
                  {archivedHabits.map((habit) => (
                    <HabitRow
                      key={habit.id}
                      habit={habit}
                      // The rhythm it kept, which is also the rhythm continuing
                      // it would bring back.
                      meta={scheduleSummary(habit)}
                      muted
                      hint="Opens this habit's rhythm, where you can continue it"
                      onPress={openHabit}
                    />
                  ))}
                </Section>
              ) : null}
            </>
          )}
        </Band>
      </ScrollView>
    </Screen>
  );
}

/**
 * Where each part of the screen sits in the single entrance animation, in the
 * same shape Habit Detail uses -- `at` is the slice of the shared 0..1 value
 * the band fades across, `lift` the distance it travels.
 */
const BANDS = {
  title: { at: [0, 0.6], lift: 10 },
  collection: { at: [0.15, 1], lift: 14 },
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

  return (
    <Animated.View style={[style, { opacity, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
}

/**
 * A labelled band of the collection. The label is the smallest type in the app,
 * set in the muted neutral and tracked wide -- the same voice the rhythm grid's
 * weekday letters and Today's progress line use. It names a section and then
 * gets out of the way of the habits inside it.
 */
function Section({ label, style, children }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={[styles.section, style]}>
      <Text style={styles.sectionLabel}>{label}</Text>
      {children}
    </View>
  );
}

const makeStyles = (colors, shadows) =>
  StyleSheet.create({
  content: {
    flexGrow: 1,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  // The subject of the page, in the same type Habit Detail gives a habit's own
  // name -- stated rather than announced, and a clear step under a headline.
  title: {
    ...typography.habitTitle,
    color: colors.brand,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  section: {
    marginTop: spacing.xxl,
  },
  // A wider break than the one between label and rows: archived habits are a
  // different kind of content, and the gap is what says so before the label
  // does.
  archivedSection: {
    marginTop: spacing.xxxl,
  },
  // Uppercased by the style rather than in the string, the way the progress
  // line on Today is: the look belongs to the label, and a screen reader still
  // gets the word as it was written.
  sectionLabel: {
    ...typography.label,
    textTransform: 'uppercase',
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  empty: {
    ...typography.body,
    color: colors.textSecondary,
  },
  emptyBlock: {
    marginTop: spacing.xs,
  },
  emptyNote: {
    ...typography.bodySmall,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
  });
