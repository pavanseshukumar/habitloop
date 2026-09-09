import { useEffect, useMemo, useRef } from 'react';
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
import { formatDate, getDayStatement, getDayVoice } from '../lib/greeting';
import { hasReturnedToday } from '../lib/recovery';
import { nextScheduledDay, scheduledOn } from '../lib/schedule';
import { useHabits } from '../store/habits';
import { layout, motion, radii, spacing, typography, useThemedStyles } from '../theme';

/**
 * The first thing the user sees, and the answer to one question: what can I do
 * today?
 *
 * Reading order is the whole design -- wordmark, greeting, date, a line of
 * context, then the habits, and only then where the day stands. Nothing in the
 * day above the habits is interactive, so the only things in it that can be
 * tapped are the things worth tapping.
 *
 * The wordmark and the two ways out of the screen are held still above all of
 * that, and everything else scrolls under them: a long list of habits is the
 * app working, and it should not be able to scroll the app's own name away.
 */
export function TodayScreen({ navigation }) {
  const styles = useThemedStyles(makeStyles);
  // Archived habits are excluded once, here, rather than filtered at each use.
  // `archivedHabits` is read for one question only -- whether an empty Today is
  // a new app or a put-down one -- and never rendered here.
  const { activeHabits, archivedHabits, completions, toggleCompletion } = useHabits();

  // Steady while the user is on the screen, but not frozen at launch: this
  // moves when the calendar day does, so a completion is never filed under
  // yesterday after the phone has been asleep overnight.
  const now = useToday();
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

  // Read after the day has been counted rather than before it: the evening
  // greeting is the one line up here that answers to the list below, so it
  // cannot be chosen until the list has been asked.
  const voice = useMemo(
    () => getDayVoice(now, { markedToday: completedCount > 0 }),
    [now, completedCount]
  );

  // Read back out of the day, like everything else on this screen, rather than
  // remembered from the tap that caused it. A latched flag could outlive the
  // completion underneath it: undoing the mark took the return away and left
  // the line still saying otherwise. Derived, an undo needs no handling at all
  // -- the evidence goes back and the line goes with it.
  //
  // It still does not blink per tap. Completing a second habit does not disturb
  // the first habit's completion, so the answer does not move, and a new day
  // moves it without being told, because `now` is what the question is asked
  // about.
  const hasReturned = useMemo(
    () => hasReturnedToday(todaysHabits, completions, now),
    [todaysHabits, completions, now]
  );

  // Null on an empty app, which is the only state that wants no line at all.
  const statement = getDayStatement(voice, {
    hasHabits: activeHabits.length > 0,
    allDone,
    hasReturned,
  });

  const openCreate = () => navigation.navigate('CreateHabit');
  const openHabit = (id) => navigation.navigate('HabitDetail', { habitId: id });
  const openManagement = () => navigation.navigate('HabitManagement');
  const openSettings = () => navigation.navigate('Settings');

  const onToggle = (id) => {
    // Fired here rather than inside the state updater, which React may run
    // more than once for a single tap.
    if (isCompletedOn(completions, id, todayKey)) {
      undoFeedback();
    } else {
      completionFeedback();
    }

    toggleCompletion(id, todayKey);
  };

  return (
    <Screen>
      {/* Outside the ScrollView, and the only thing on this screen that is.
          The wordmark is not part of the day -- it is what the day belongs to
          -- so a long list of habits should scroll underneath it rather than
          carry it off the top of the screen. It keeps the line, the spacing
          and the two-word action it always had; the only structural change is
          which parent it sits in. */}
      <View style={styles.header}>
        <Wordmark />

        {/* The two ways off Today, in the order they matter: the collection
            first, in the quietest type on the screen, and the app's own
            settings after it as a mark rather than a third word. */}
        <View style={styles.headerActions}>
          <Pressable
            onPress={openManagement}
            hitSlop={12}
            style={({ pressed }) => [styles.manageAction, pressed && styles.managePressed]}
            accessibilityRole="button"
            accessibilityLabel="All habits"
            accessibilityHint="Opens your active and archived habits">
            <Text style={styles.manageLabel}>All habits</Text>
          </Pressable>

          <Pressable
            onPress={openSettings}
            hitSlop={12}
            style={({ pressed }) => [styles.settingsAction, pressed && styles.settingsPressed]}
            accessibilityRole="button"
            accessibilityLabel="Settings"
            accessibilityHint="Opens appearance and notification settings">
            <SettingsMark />
          </Pressable>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        {/* The greeting leads: it is the personal line, and the date is the
            quiet fact underneath it rather than a header standing over it. */}
        <View style={styles.intro}>
          <Text style={styles.greeting}>{voice.greeting}</Text>
          <Text style={styles.date}>{today}</Text>
          {statement ? <ContextStatement text={statement} /> : null}
        </View>

        {/* Collapses once there are enough habits to fill the screen, so the
            list sits within thumb reach while the day is still short. */}
        <View style={styles.breathe} />

        {activeHabits.length === 0 ? (
          <EmptyState onCreate={openCreate} hasHistory={archivedHabits.length > 0} />
        ) : (
          <View style={styles.day}>
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
 * Settings, drawn rather than written.
 *
 * Three rules with a ring sitting on each, at three different settings -- the
 * app's existing vocabulary reused rather than an icon set added for one
 * glyph: the rules are the progress bar's hairline and the rings are the same
 * open circle a habit waits in and a theme choice is picked with. No gear, no
 * container, no fill.
 *
 * It is set in the same muted neutral as the words beside it, so it reads as
 * the quietest thing in the header while staying a shape rather than a colour
 * -- legible in either theme, and still legible with colour taken away.
 */
function SettingsMark() {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.settingsMark} accessible={false}>
      {SETTINGS_KNOBS.map((position, index) => (
        <View key={index} style={styles.settingsRow}>
          <View style={styles.settingsRule} />
          <View style={[styles.settingsKnob, { left: position }]} />
        </View>
      ))}
    </View>
  );
}

/** Where each ring sits on its rule. Uneven on purpose: settings, not a menu. */
const SETTINGS_KNOBS = [3, 11, 6];

/**
 * The one line on Today that answers to what the user has done.
 *
 * It fades the new words in over three pixels when the context changes, and
 * not at all on first render -- enough that the line reads as having changed
 * rather than having been swapped, and far short of anything that would draw
 * the eye away from the habits themselves.
 */
function ContextStatement({ text }) {
  const styles = useThemedStyles(makeStyles);
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
 * An empty Today, in the two ways a Today can be empty.
 *
 * Built like the rest-day block above it -- a statement, a quieter line, and
 * then whatever action belongs to that state -- so an empty app reads as one
 * of Today's moods rather than as a different screen. Nothing fills the space
 * above it, because there is nothing there and pretending otherwise would be
 * the only unfinished-feeling thing on screen.
 *
 * A brand-new install gets the only teaching this product does: a habit here
 * is something you keep doing, and one of them is a complete beginning.
 *
 * Someone who has archived everything gets something else, because "Nothing
 * here yet" would be false -- there is a great deal here, and it is the whole
 * point of the app that it was kept. Telling a person with forty completions
 * behind them that they have not started is the one sentence that could make
 * archiving feel like deleting. So the same three slots say the true thing
 * instead, and the middle one points at where the record actually is.
 */
function EmptyState({ onCreate, hasHistory }) {
  const styles = useThemedStyles(makeStyles);
  const createLabel = hasHistory ? 'Create a habit' : 'Create your first habit';

  return (
    <View>
      <Text style={styles.emptyTitle}>
        {hasHistory ? 'Nothing active right now.' : 'Nothing here yet.'}
      </Text>
      <Text style={styles.emptyBody}>
        {hasHistory
          ? 'Your history is kept in All habits.'
          : 'Start with one thing you want to keep doing.'}
      </Text>
      <Pressable
        onPress={onCreate}
        accessibilityRole="button"
        accessibilityLabel={createLabel}
        style={({ pressed }) => [styles.createButton, pressed && styles.createButtonPressed]}>
        <Text style={styles.createLabel}>{createLabel}</Text>
      </Pressable>
    </View>
  );
}

// Small enough to stay a mark rather than a button, and wide enough that
// three rings at three settings still read as three settings.
const SETTINGS_MARK = 20;
const SETTINGS_KNOB = 6;
// Three rules, each row the knob's height plus a point of air either side.
const SETTINGS_MARK_HEIGHT = (SETTINGS_KNOB + 2) * SETTINGS_KNOBS.length;

const makeStyles = (colors, shadows) =>
  StyleSheet.create({
  // Screen puts the app's gutter on every screen, which is right for all of
  // them and one pixel short for this one: a padded ancestor is also a touch
  // boundary on Android, and a habit's completion target is supposed to own the
  // empty strip beside it. So the scrolling column is let back out to the
  // screen edge and the gutter is re-applied inside it, where it is spacing
  // rather than a wall. Nothing moves: what was one inset is now the same inset
  // one level down.
  scroll: {
    marginHorizontal: -layout.screenPaddingX,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: layout.screenPaddingX,
    paddingBottom: spacing.xl,
  },
  // The day's column, carrying the gutter for everything in it except the
  // habits. Its own edges run to the screen so the list below can do the same.
  day: {
    marginHorizontal: -layout.screenPaddingX,
    paddingHorizontal: layout.screenPaddingX,
  },
  // Given real air beneath it so the wordmark reads as the app's signature
  // rather than as a heading for the greeting. The gap is the one the top bar
  // always had, kept here now that the header is the ScrollView's sibling
  // instead of its first child -- so the screen opens on exactly the rhythm it
  // opened on before, and simply keeps it while the day scrolls.
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.huge,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  // Padded out to a comfortable target and then pulled back in by the same
  // amount, so the words sit on the wordmark's line and the screen's opening
  // rhythm is exactly what it was.
  manageAction: {
    paddingVertical: spacing.sm,
    marginVertical: -spacing.sm,
    paddingHorizontal: spacing.md,
    marginLeft: -spacing.md,
  },
  // Fades rather than lighting a surface, which is how every quiet action in
  // the app answers a touch -- the chevron out, Edit on a habit, the add row
  // below.
  managePressed: {
    opacity: motion.pressed.fade,
  },
  // The same size, weight and colour as Edit on Habit Detail, sat in the same
  // corner at the same inset: the two secondary ways out of a screen should be
  // recognisably one thing. Still the quietest type up here, and no container
  // -- a pill would make it compete with the wordmark it sits opposite.
  manageLabel: {
    ...typography.body,
    color: colors.textSecondary,
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
  //
  // Horizontally it is the one block that opts out of the gutter. A habit row
  // draws itself inside the same margin as everything else, but it reaches the
  // screen edge, because the strip beside a habit is not decoration -- it is
  // the easiest place on the display to hit, and it belongs to the mark.
  list: {
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
    marginHorizontal: -layout.screenPaddingX,
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
    opacity: motion.pressed.fade,
  },
  addLabel: {
    ...typography.body,
    color: colors.textSecondary,
  },
  addPlus: {
    color: colors.accent,
  },
  // The full-height target BackButton and Edit use, inset the same way on the
  // right so the mark itself lands on the screen gutter while the tappable
  // area runs past it. The drawing inside stays small; only the target is
  // generous.
  settingsAction: {
    height: layout.touchTarget,
    // Pulled back in by what it added, the way the words beside it are, so a
    // 48pt target does not make the header 48pt tall. The wordmark keeps its
    // line and the day below it keeps its opening rhythm exactly.
    marginVertical: (SETTINGS_MARK_HEIGHT - layout.touchTarget) / 2,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    marginRight: -spacing.md,
  },
  // Fades, like every other quiet action on this screen.
  settingsPressed: {
    opacity: motion.pressed.fade,
  },
  settingsMark: {
    width: SETTINGS_MARK,
    justifyContent: 'center',
  },
  settingsRow: {
    height: SETTINGS_KNOB,
    justifyContent: 'center',
    marginVertical: 1,
  },
  settingsRule: {
    height: 1.5,
    borderRadius: 1,
    backgroundColor: colors.textSecondary,
  },
  // Drawn on the background rather than over the rule, which is what keeps a
  // 6pt ring readable at this size in both themes.
  settingsKnob: {
    position: 'absolute',
    width: SETTINGS_KNOB,
    height: SETTINGS_KNOB,
    borderRadius: SETTINGS_KNOB / 2,
    borderWidth: 1.5,
    borderColor: colors.textSecondary,
    backgroundColor: colors.background,
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
    opacity: motion.pressed.surface,
    transform: [{ scale: 0.985 }],
  },
  createLabel: {
    ...typography.button,
    color: colors.textOnBrand,
  },
  });
