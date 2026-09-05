import { StyleSheet, Text, View } from 'react-native';

import { WEEKDAYS } from '../data/weekdays';
import { formatDate } from '../lib/greeting';
import { buildRhythm, toWeeks } from '../lib/rhythm';
import { colors, spacing, typography } from '../theme';

/**
 * Four weeks of a habit, read at a glance.
 *
 * Filled coral is a day it happened. A day it was due and did not happen is a
 * quiet outline -- present, but carrying no colour and no weight. Days the
 * habit was never due are barely there, and days outside its life are simply
 * absent. Nothing on this grid is red, and nothing counts against anything.
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
        {day.state === 'scheduled' ? <View style={styles.scheduled} /> : null}
        {day.state === 'unscheduled' ? <View style={styles.unscheduled} /> : null}
      </View>

      {/* Today is marked underneath rather than on the mark itself, so it never
          competes with the state the mark is already showing. */}
      <View style={[styles.todayDot, day.isToday && styles.todayDotVisible]} />
    </View>
  );
}

const MARK_SIZE = 32;

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
    backgroundColor: colors.accent,
  },
  scheduled: {
    width: MARK_SIZE,
    height: MARK_SIZE,
    borderRadius: MARK_SIZE / 2,
    borderWidth: 1.5,
    // borderStrong, matching the empty completion mark on Today, so an
    // untouched day reads the same in both places.
    borderColor: colors.borderStrong,
  },
  unscheduled: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.border,
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
