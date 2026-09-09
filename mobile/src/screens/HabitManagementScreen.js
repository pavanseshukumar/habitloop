import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BackButton } from '../components/BackButton';
import { ConfirmationModal } from '../components/ConfirmationModal';
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
 * started from reading as an admin panel.
 *
 * What it does now carry is the one act that moves a habit between the two
 * halves it draws. Putting a habit down used to live three screens deep, behind
 * Edit, and picking it back up lived on Detail -- so the screen that shows you
 * both states was the one screen that could not change either. The word sits on
 * the row in the quietest register the row has, and the habit itself is still
 * what a press opens: see HabitRow for how the two targets are kept apart.
 *
 * Detail and Edit keep the actions they already had. Nothing is being taken
 * away here, only made reachable from the place the question is actually asked.
 *
 * The order is the order the two states matter in: what you are carrying now,
 * then what you have put down, and then the one thing you can do to the
 * collection itself: add to it. Somebody who came here to look at their habits
 * should not have to go back to the day to start another one.
 *
 * How the app behaves is not part of that question, and Settings is reached
 * from Today rather than from here: managing habits and configuring the app
 * are two destinations, not one inside the other.
 */
export function HabitManagementScreen({ navigation }) {
  const styles = useThemedStyles(makeStyles);
  // Both halves come from the store, already filtered and ordered, so this
  // screen never defines what "active" means and never re-sorts anything. The
  // two lifecycle actions come from the same place: this screen decides when
  // they are offered and holds no copy of what they do, so archiving here and
  // archiving from Edit are the same single implementation.
  const { activeHabits, archivedHabits, archiveHabit, restoreHabit } = useHabits();

  // The habit the user has been asked about, held as an id until they answer.
  // The only state on this screen, and it is about the question rather than
  // about the collection -- the lists below are read from the store on every
  // render, so a habit moves between them because the record changed, not
  // because this screen was told to move it.
  const [archiving, setArchiving] = useState(null);

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
  // The same route Today opens, reached the same way. Creating finishes with a
  // goBack, so it returns to whichever screen sent it -- here, the collection
  // the new habit has just joined.
  const openCreate = () => navigation.navigate('CreateHabit');

  // Asked first, and answered here rather than somewhere else: archiving from
  // the collection leaves you in the collection, watching the habit change
  // sides. Edit navigates away afterwards because it has to -- it is a form
  // for a habit that is no longer active -- and this screen has no such reason.
  const onArchiveConfirmed = () => {
    const habitId = archiving;
    setArchiving(null);
    archiveHabit(habitId);
  };

  // Not asked at all, which is the answer Habit Detail already gives: picking a
  // habit back up costs nothing and putting it down again is one word away. A
  // confirmation here would be ceremony for a reversible act, and would say
  // that continuing is the dangerous half of the pair.
  const actions = {
    archive: {
      label: 'Archive',
      hint: 'Asks whether to archive this habit. Your history stays.',
      onPress: (habitId) => setArchiving(habitId),
    },
    continue: {
      label: 'Continue',
      hint: 'Makes this habit active again',
      onPress: restoreHabit,
    },
  };

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
            // Nothing has been written down yet. The line is unchanged -- the
            // add row below is what answers it now, and it is the same row that
            // sits under a full collection, so an empty index is this screen
            // with nothing in it rather than a different screen.
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
                      action={actions.archive}
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
                      // Continuing is on the row now, so the hint no longer
                      // sends the user through Detail to reach it.
                      hint="Opens this habit's rhythm"
                      action={actions.continue}
                      onPress={openHabit}
                    />
                  ))}
                </Section>
              ) : null}
            </>
          )}

          {/* One action, drawn once, under every state this screen has: an
              empty app, an active collection, an archived-only one, and both
              together. Adding to the collection is the same act in all four, so
              it is one row in all four rather than four affordances that have
              to be kept in agreement.

              It is Today's add row, to the token: the quietest body type on the
              screen with the coral on the plus alone, sat at the end of the
              content rather than floating over it. Deliberately not a primary
              action -- this screen is for finding what you already have, and
              the one thing you can do to it should be within reach without
              becoming the reason to be here. */}
          <Pressable
            onPress={openCreate}
            hitSlop={8}
            style={({ pressed }) => [styles.addRow, pressed && styles.addRowPressed]}
            accessibilityRole="button"
            accessibilityLabel="Add a habit"
            accessibilityHint="Opens the screen for starting a new habit">
            <Text style={styles.addLabel}>
              <Text style={styles.addPlus}>+</Text>  Add a habit
            </Text>
          </Pressable>
        </Band>
      </ScrollView>

      {/* Word for word the question Edit asks, because it is the same question
          about the same act -- a habit put down from here and a habit put down
          from there are not two different things and must not sound like it. */}
      <ConfirmationModal
        visible={archiving !== null}
        title="Archive this habit?"
        message="Your history will stay saved."
        confirmLabel="Archive habit"
        destructive
        onCancel={() => setArchiving(null)}
        onConfirm={onArchiveConfirmed}
      />
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
  // The break above is the one the sections already take from each other, so
  // the row reads as a different kind of thing from a habit without a rule or
  // a container being drawn to say so.
  addRow: {
    marginTop: spacing.xxl,
    paddingVertical: spacing.md,
  },
  addRowPressed: {
    opacity: motion.pressed.fade,
  },
  addLabel: {
    ...typography.body,
    color: colors.textSecondary,
  },
  addPlus: {
    color: colors.accent,
  },
  });
