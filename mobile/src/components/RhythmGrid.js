import { StyleSheet, Text, View } from 'react-native';

import { WEEKDAYS } from '../data/weekdays';
import { formatDate } from '../lib/greeting';
import { buildRhythm, toWeeks } from '../lib/rhythm';
import { colors, spacing, typography } from '../theme';

/**
 * Four weeks of a habit, read at a glance.
 *
 * The whole grid is one sentence: a small grey dot grows into a large coral
 * mark. A day the habit was due and has not happened yet is a quiet solid dot
 * -- something waiting to be filled, deliberately not an empty outline, which
 * reads as a hole where something should have been. Days the habit was never
 * due are fainter and smaller still, and days outside its life are simply
 * absent.
 *
 * Nothing here is red, nothing is a warning, and nothing counts against
 * anything. Size and colour both carry the state, so the difference survives
 * without colour vision as well as with it.
 */
export function RhythmGrid({ habit, completions, today }) {
  const weeks = toWeeks(buildRhythm(habit, completions, today));

  return (
    <View>
      <View style={styles.week}>
        {WEEKDAYS.map((weekday) => (
          <View key={weekday.id} style={styles.cell}>
            <Text style={styles.weekdayLabel}>{weekday.short[0]}</Text>
          </View>
        ))}
      </View>

      {weeks.map((week) => (
        <View key={week[0].key} style={styles.week}>
          {week.map((day) => (
            <RhythmDay key={day.key} day={day} />
          ))}
        </View>
      ))}
    </View>
  );
}

const DESCRIPTIONS = {
  completed: 'completed',
  scheduled: 'scheduled, not completed',
  unscheduled: 'not scheduled',
  upcoming: 'still to come',
  before: 'before this habit began',
  after: 'after this habit was archived',
};

function RhythmDay({ day }) {
  return (
    <View
      style={styles.cell}
      accessible
      accessibilityLabel={`${formatDate(day.date)}, ${DESCRIPTIONS[day.state]}`}>
      <View style={styles.markBox}>
        {day.state === 'completed' ? <View style={styles.completed} /> : null}
        {day.state === 'scheduled' ? <View style={styles.waiting} /> : null}
        {day.state === 'unscheduled' ? <View style={styles.idle} /> : null}
      </View>

      {/* Today is marked underneath rather than on the mark itself, so it never
          competes with the state the mark is already showing. */}
      <View style={[styles.todayDot, day.isToday && styles.todayDotVisible]} />
    </View>
  );
}

const MARK_SIZE = 32;
const WAITING_SIZE = 10;
const IDLE_SIZE = 4;

const styles = StyleSheet.create({
  week: {
    flexDirection: 'row',
    marginBottom: spacing.sm,
  },
  cell: {
    flex: 1,
    alignItems: 'center',
  },
  weekdayLabel: {
    ...typography.label,
    letterSpacing: 0,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  markBox: {
    width: MARK_SIZE,
    height: MARK_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  completed: {
    width: MARK_SIZE,
    height: MARK_SIZE,
    borderRadius: MARK_SIZE / 2,
    backgroundColor: colors.markDone,
  },
  // Solid, small and neutral. The same dot Today shows inside an uncompleted
  // habit's mark, so a day waiting to be filled looks identical in both places.
  waiting: {
    width: WAITING_SIZE,
    height: WAITING_SIZE,
    borderRadius: WAITING_SIZE / 2,
    backgroundColor: colors.markWaiting,
  },
  idle: {
    width: IDLE_SIZE,
    height: IDLE_SIZE,
    borderRadius: IDLE_SIZE / 2,
    backgroundColor: colors.markIdle,
  },
  todayDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: spacing.xs,
    backgroundColor: 'transparent',
  },
  todayDotVisible: {
    backgroundColor: colors.textMuted,
  },
});
