import { useState } from 'react';
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
 *
 * The composition is what keeps it from reading as a spreadsheet. Weeks are
 * spaced further apart than days are, so the four rows read as lines of a
 * record rather than as cells of a table, and every mark is guaranteed a
 * gutter of clear paper around it whatever the screen is wide.
 */
export function RhythmGrid({ habit, completions, today }) {
  const weeks = withoutEmptyWeeks(toWeeks(buildRhythm(habit, completions, today)));
  const [markSize, setMarkSize] = useState(MAX_MARK);

  // The mark is sized from the space it actually has rather than from a
  // constant. Seven columns of a 32px circle on a narrow phone leaves barely
  // ten points between marks, and a dense grid of touching circles is exactly
  // the heatmap this is not. MIN_GUTTER is the promise: the marks never crowd,
  // they shrink. Width is what is measured and only the mark depends on it, so
  // this settles on the first pass rather than chasing its own layout.
  const onLayout = (event) => {
    const cell = event.nativeEvent.layout.width / WEEKDAYS.length;
    const next = Math.round(Math.min(MAX_MARK, Math.max(MIN_MARK, cell - MIN_GUTTER)));
    setMarkSize((current) => (current === next ? current : next));
  };

  return (
    <View onLayout={onLayout}>
      {/* One letter per column, at the quietest weight on the screen. Two would
          be more precise, and would also invite the grid to be read as a
          calendar you look dates up in -- which it is not. It orients the eye
          across the week and then gets out of the way. */}
      <View style={styles.weekdays}>
        {WEEKDAYS.map((weekday) => (
          <View key={weekday.id} style={styles.cell}>
            <Text style={styles.weekdayLabel}>{weekday.short[0]}</Text>
          </View>
        ))}
      </View>

      {/* The gap belongs between weeks, not after the last one: whatever the
          screen puts below the grid should sit close enough to read as its
          closing line rather than as the next thing along. */}
      {weeks.map((week, index) => (
        <View
          key={week[0].key}
          style={[styles.week, index < weeks.length - 1 && styles.weekGap]}>
          {week.map((day) => (
            <RhythmDay key={day.key} day={day} markSize={markSize} />
          ))}
        </View>
      ))}
    </View>
  );
}

/** The states that draw nothing at all: days outside the habit's own life. */
const MARKLESS = new Set(['before', 'after', 'upcoming']);

/**
 * Drops the weeks at either end in which nothing is drawn.
 *
 * The window is still four weeks -- buildRhythm is untouched and no day that
 * has anything to show is hidden. This is only about height.
 *
 * A habit created on Thursday has three weeks above it that are blank because
 * they are older than the habit, and reserving that space produces a column of
 * weekday letters standing over an empty field: a chart with no data, which is
 * the last thing a habit on its first day should be shown. Trimmed, the grid
 * starts small and grows a row a week until it is the full four -- the record
 * filling in as the habit gets a history, with nothing to explain.
 *
 * At the other end the same thing happens to an archived habit, whose last week
 * or two are blank because it had already ended. A closed record should stop
 * where the habit stopped rather than trail off past it.
 *
 * Blank runs only ever occur at the ends -- 'before' comes first, 'after' and
 * 'upcoming' last -- so this never takes a bite out of the middle. An active
 * habit is never trimmed at the end, because its last week holds today and
 * today always draws something.
 */
function withoutEmptyWeeks(weeks) {
  const drawn = (week) => week.some((day) => !MARKLESS.has(day.state));

  const first = weeks.findIndex(drawn);
  if (first === -1) return weeks.slice(-1);

  let last = weeks.length - 1;
  while (last > first && !drawn(weeks[last])) last -= 1;

  return weeks.slice(first, last + 1);
}

const DESCRIPTIONS = {
  completed: 'completed',
  scheduled: 'scheduled, not completed',
  unscheduled: 'not scheduled',
  upcoming: 'still to come',
  before: 'before this habit began',
  after: 'after this habit was archived',
};

function RhythmDay({ day, markSize }) {
  const box = { width: markSize, height: markSize };

  return (
    <View
      style={styles.cell}
      accessible
      accessibilityLabel={`${formatDate(day.date)}, ${DESCRIPTIONS[day.state]}`}>
      <View style={[styles.markBox, box]}>
        {day.state === 'completed' ? (
          <View style={[styles.completed, box, { borderRadius: markSize / 2 }]} />
        ) : null}
        {day.state === 'scheduled' ? <View style={styles.waiting} /> : null}
        {day.state === 'unscheduled' ? <View style={styles.idle} /> : null}
      </View>

      {/* Today is marked underneath rather than on the mark itself, so it never
          competes with the state the mark is already showing. A ring around the
          cell would make today look selected; a dot under it just says where
          you are. The space is reserved on every day so the rows stay level. */}
      <View style={[styles.todayDot, day.isToday && styles.todayDotVisible]} />
    </View>
  );
}

// The coral mark at its most generous, on a wide screen, and at its smallest
// before the states stop being told apart by size alone.
const MAX_MARK = 32;
const MIN_MARK = 24;
// Clear paper either side of every mark, whatever the column width works out to.
const MIN_GUTTER = 14;

const WAITING_SIZE = 10;
const IDLE_SIZE = 4;
const TODAY_SIZE = 4;

const styles = StyleSheet.create({
  // A clear break before the record starts: the letters label the columns, they
  // are not the first row of it.
  weekdays: {
    flexDirection: 'row',
    marginBottom: spacing.lg,
  },
  week: {
    flexDirection: 'row',
  },
  // Weeks sit clearly further apart than days do. Seven columns fix the
  // horizontal pitch at roughly the size of a mark plus its gutter, and matching
  // that vertically produces a square lattice -- a table. Giving the rows half
  // again as much air is what makes them read as four lines of a record.
  weekGap: {
    marginBottom: spacing.xl,
  },
  cell: {
    flex: 1,
    alignItems: 'center',
  },
  weekdayLabel: {
    ...typography.label,
    // Single characters have nothing to track, and the trailing space that
    // letterSpacing adds would push each letter off the centre of its column.
    letterSpacing: 0,
    color: colors.textMuted,
  },
  markBox: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  completed: {
    backgroundColor: colors.markDone,
  },
  // Solid, small and neutral: a day that was available and is still waiting.
  // Not an outline, which reads as a hole, and never warm -- the colour on this
  // screen belongs to the days that happened.
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
    width: TODAY_SIZE,
    height: TODAY_SIZE,
    borderRadius: TODAY_SIZE / 2,
    marginTop: spacing.xs,
    backgroundColor: 'transparent',
  },
  // Brand blue, and the darkest thing in the grid by a distance. Once the
  // waiting dots became blue-grey a mid-tone marker stopped standing apart from
  // them; four points of the full brand colour is unmistakably "you are here"
  // and still far too small to compete with a coral mark.
  todayDotVisible: {
    backgroundColor: colors.brand,
  },
});
