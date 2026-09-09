/**
 * Assertion suite for Habit Loop's habit collection behaviour.
 *
 * Plain Node, no dependencies and no renderer: everything asserted here is the
 * pure logic the store and the screens share (lib/habitCollections.js and
 * lib/schedule.js), which is deliberately where all the behaviour lives. The
 * store's actions are one-line calls into these functions, and the management
 * screen is a one-line read of their output, so proving these proves what the
 * screens do with them.
 *
 * Run with: npm test
 */
import assert from 'node:assert/strict';
import { weekdayIdFor } from '../src/data/weekdays.js';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

import { isCompletedOn, toggleCompletionOn, completedDatesFor } from '../src/lib/completions.js';
import { addDays, fromDateKey, toDateKey } from '../src/lib/dates.js';
import {
  RETURN_STATEMENT,
  getDayStatement,
  getDayVoice,
  getRhythmNote,
  getSpanNote,
  getVoiceWindow,
} from '../src/lib/greeting.js';
import {
  currentPeriodStartKey,
  dateKeyFrom,
  firstActiveDayKey,
  initialHistory,
  hasOpenPeriod,
  inactiveReasonOn,
  isActiveOn,
  isDateKey,
  lastActiveDayKey,
  scheduleOn,
  wasScheduledOn,
  withActiveClosed,
  withActiveOpened,
  withScheduleVersion,
} from '../src/lib/history.js';
import { getHabitInsight, getHabitSpan } from '../src/lib/insights.js';
import { hasReturnedToday, isReturningHabit } from '../src/lib/recovery.js';
import { RHYTHM_WEEKS, buildRhythm, countCompleted, toWeeks } from '../src/lib/rhythm.js';
import {
  activeHabitsFrom,
  archiveHabitIn,
  archivedHabitsFrom,
  restoreHabitIn,
  scheduleSummary,
} from '../src/lib/habitCollections.js';
import {
  DEFAULT_REMINDER,
  diffReminderPlan,
  formatReminderTime,
  from12Hour,
  normalizeReminder,
  planReminders,
  plannedRemindersFor,
  reminderIdFor,
  to12Hour,
} from '../src/lib/reminders.js';
import {
  BOUNCE_COUNT,
  BOUNCE_DECAY,
  CURVE,
  DOT_COUNT,
  EMERGE_CLUSTER,
  GATHER,
  PHASES,
  POP,
  TIMELINE,
  at,
  bounceKeyframes,
  dotSizeFor,
  evenlySpaced,
  portalScale,
  ringBorderFor,
  ringSizeFor,
  track,
} from '../src/lib/splash.js';
import { isScheduledOn, scheduledOn } from '../src/lib/schedule.js';
import { SCHEMA_VERSION, normalizeState } from '../src/lib/storageSchema.js';
import {
  DEFAULT_THEME_MODE,
  THEME_MODES,
  isThemeMode,
  normalizeThemeMode,
  resolveScheme,
  themeFor,
  themes,
} from '../src/theme/colors.js';
import { layout } from '../src/theme/layout.js';
import { typography } from '../src/theme/typography.js';
import { spacing } from '../src/theme/spacing.js';

/**
 * A source file, read as text.
 *
 * Used only by the information-architecture section at the bottom, which
 * asserts about where things live rather than about what they compute. There
 * is no renderer here and there is not going to be one, so "Settings owns the
 * theme selector and the collection screen does not" has to be checked by
 * reading the files -- which is exactly the property that went wrong when
 * those controls were sitting on the wrong screen.
 */
function source(relativePath) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
}

/**
 * A source file with its prose taken out.
 *
 * Assertions of the form "this file no longer mentions X" keep matching the
 * comment that explains why X was removed -- which is the one place X is
 * guaranteed to still appear. Strip the comments and ask the code.
 */
function code(text) {
  const blocks = new RegExp('/\\*[\\s\\S]*?\\*/', 'g');
  const lines = new RegExp('//[^\\n]*', 'g');
  return text.replace(blocks, '').replace(lines, '');
}

/** The same file as bytes, for the one asset this suite has an opinion about. */
function bytes(relativePath) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url));
}

/**
 * Every pixel of a PNG's alpha channel, highest first.
 *
 * There is exactly one image in this app whose *content* matters to a test:
 * the native launch bridge, which has to draw nothing at all. "Draws nothing"
 * is not something a filename can promise, so this reads the file the way
 * Android will -- chunks, IHDR, inflated scanlines -- and reports the loudest
 * pixel in it. Only 8-bit RGBA is handled, because that is what a fully
 * transparent image is written as and anything else is already wrong.
 */
function peakAlpha(png) {
  let offset = 8;
  let width = 0;
  let height = 0;
  let colourType = -1;
  const idat = [];

  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colourType = data[9];
      if (data[8] !== 8) throw new Error('not an 8-bit PNG');
    }
    if (type === 'IDAT') idat.push(data);

    offset += 12 + length;
  }

  if (colourType !== 6) return 255; // no alpha channel at all: fully opaque.

  const raw = inflateSync(Buffer.concat(idat));
  let peak = 0;

  for (let y = 0; y < height; y += 1) {
    const row = y * (1 + width * 4);
    // A non-zero filter byte would mean the scanlines are encoded relative to
    // each other and reading them straight is meaningless.
    if (raw[row] !== 0) throw new Error('filtered scanlines');
    for (let x = 0; x < width; x += 1) peak = Math.max(peak, raw[row + 1 + x * 4 + 3]);
  }

  return peak;
}

/** WCAG relative luminance and contrast, so the palettes can assert about themselves. */
function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const channels = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((value) => {
    const v = value / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

let passed = 0;
const failures = [];

function test(name, run) {
  try {
    run();
    passed += 1;
  } catch (error) {
    failures.push({ name, error });
  }
}

/**
 * A habit as the store writes one. Overrides let each test say only what it means.
 *
 * The schedule history and active periods are seeded exactly as the store and
 * the v3 migration seed them -- current schedule, in force since creation, and
 * one stretch of being active that runs to the archive date if there is one.
 * A fixture without them would not be a habit this app can produce, and tests
 * built on one would prove nothing about the app.
 *
 * Overrides win, so a test that wants a hand-built history can simply say so.
 */
function habit(overrides = {}) {
  const base = {
    id: 'habit-1',
    name: 'Read',
    detail: '',
    frequency: 'daily',
    days: [],
    createdAt: '2026-01-01T09:00:00.000Z',
    archivedAt: null,
    ...overrides,
  };

  return { ...initialHistory(base), ...base };
}

/**
 * Restoring, with the day it happens stated rather than left to the clock.
 *
 * restoreHabitIn defaults to today, which is right for the app and wrong for a
 * test: an assertion that quietly changes meaning at midnight is not an
 * assertion. Every restore below names its date.
 */
const RESTORED_AT = '2026-06-20T09:00:00.000Z';
const restoreOn = (habits, habitId, at = RESTORED_AT) => restoreHabitIn(habits, habitId, at);

// A Monday and a Wednesday, built from local numeric parts so the weekday is
// the same one the user's calendar would show.
const MONDAY = new Date(2026, 8, 7);
const WEDNESDAY = new Date(2026, 8, 9);

// ---------------------------------------------------------------------------
// Management shows the whole collection
// ---------------------------------------------------------------------------

test('active habits appear in management', () => {
  const habits = [habit({ id: 'a', name: 'Read' }), habit({ id: 'b', name: 'Walk' })];

  assert.deepEqual(
    activeHabitsFrom(habits).map((item) => item.id),
    ['a', 'b']
  );
});

test('active habits keep their creation order', () => {
  const habits = [habit({ id: 'a' }), habit({ id: 'b' }), habit({ id: 'c' })];

  assert.deepEqual(
    activeHabitsFrom(habits).map((item) => item.id),
    ['a', 'b', 'c']
  );
});

test('habits not scheduled today still appear in management', () => {
  const mondayOnly = habit({ id: 'a', frequency: 'selected', days: ['mon'] });
  const habits = [mondayOnly];

  // Today is a Wednesday: not on Today's list...
  assert.equal(scheduledOn(habits, WEDNESDAY).length, 0);
  // ...but still in the collection.
  assert.deepEqual(
    activeHabitsFrom(habits).map((item) => item.id),
    ['a']
  );
});

test('archived habits disappear from the active list', () => {
  const habits = [
    habit({ id: 'a' }),
    habit({ id: 'b', archivedAt: '2026-02-01T09:00:00.000Z' }),
  ];

  assert.deepEqual(
    activeHabitsFrom(habits).map((item) => item.id),
    ['a']
  );
});

test('archived habits appear in the archived list', () => {
  const habits = [
    habit({ id: 'a' }),
    habit({ id: 'b', archivedAt: '2026-02-01T09:00:00.000Z' }),
  ];

  assert.deepEqual(
    archivedHabitsFrom(habits).map((item) => item.id),
    ['b']
  );
});

test('archived habits remain in the full record, so detail can still open them', () => {
  const habits = archiveHabitIn([habit({ id: 'a' })], 'a', '2026-02-01T09:00:00.000Z');

  // HabitDetail looks the habit up in the full list, not the active one.
  assert.ok(habits.find((item) => item.id === 'a'));
});

test('archived habits are ordered newest archived first', () => {
  const habits = [
    habit({ id: 'old', archivedAt: '2026-01-05T09:00:00.000Z' }),
    habit({ id: 'newest', archivedAt: '2026-03-05T09:00:00.000Z' }),
    habit({ id: 'middle', archivedAt: '2026-02-05T09:00:00.000Z' }),
  ];

  assert.deepEqual(
    archivedHabitsFrom(habits).map((item) => item.id),
    ['newest', 'middle', 'old']
  );
});

test('ordering habits for display never rearranges the stored list', () => {
  const habits = [
    habit({ id: 'old', archivedAt: '2026-01-05T09:00:00.000Z' }),
    habit({ id: 'newest', archivedAt: '2026-03-05T09:00:00.000Z' }),
  ];

  archivedHabitsFrom(habits);

  assert.deepEqual(
    habits.map((item) => item.id),
    ['old', 'newest']
  );
});

test('habits archived at the same moment keep their stored order', () => {
  const sameMoment = '2026-02-01T09:00:00.000Z';
  const habits = [
    habit({ id: 'a', archivedAt: sameMoment }),
    habit({ id: 'b', archivedAt: sameMoment }),
  ];

  assert.deepEqual(
    archivedHabitsFrom(habits).map((item) => item.id),
    ['a', 'b']
  );
});

// ---------------------------------------------------------------------------
// Empty states
// ---------------------------------------------------------------------------

test('no habits at all: both sections are empty', () => {
  assert.deepEqual(activeHabitsFrom([]), []);
  assert.deepEqual(archivedHabitsFrom([]), []);
});

test('empty active state: archived habits alone leave the active list empty', () => {
  const habits = [habit({ id: 'a', archivedAt: '2026-02-01T09:00:00.000Z' })];

  assert.deepEqual(activeHabitsFrom(habits), []);
  assert.equal(archivedHabitsFrom(habits).length, 1);
});

test('empty archived state: active habits alone leave the archived list empty', () => {
  const habits = [habit({ id: 'a' })];

  assert.equal(activeHabitsFrom(habits).length, 1);
  assert.deepEqual(archivedHabitsFrom(habits), []);
});

// ---------------------------------------------------------------------------
// Archiving
// ---------------------------------------------------------------------------

test('archiving stamps a date and changes nothing else', () => {
  const original = habit({
    id: 'a',
    name: 'Read',
    detail: 'One page',
    frequency: 'selected',
    days: ['mon', 'wed'],
  });
  const archivedAt = '2026-02-01T09:00:00.000Z';

  const [result] = archiveHabitIn([original], 'a', archivedAt);

  assert.equal(result.archivedAt, archivedAt);
  // Everything that describes what the habit *is* comes through untouched.
  assert.deepEqual(
    { ...result, archivedAt: null, activePeriods: original.activePeriods },
    original
  );

  // What archiving does change is the record of when it was running: the open
  // stretch is closed on the day it was put down, and nothing else moves.
  assert.deepEqual(result.activePeriods, [{ from: '2026-01-01', to: '2026-02-01' }]);
  assert.deepEqual(result.scheduleHistory, original.scheduleHistory);
});

test('archiving does not delete completion history', () => {
  let completions = toggleCompletionOn({}, 'a', '2026-01-10');
  completions = toggleCompletionOn(completions, 'a', '2026-01-11');

  const habits = archiveHabitIn([habit({ id: 'a' })], 'a', '2026-02-01T09:00:00.000Z');

  // Archiving is a habit-list change; the completion map is untouched by it.
  assert.deepEqual(completedDatesFor(completions, habits[0].id), ['2026-01-10', '2026-01-11']);
});

test('archiving an already-archived habit keeps the original date', () => {
  const first = '2026-02-01T09:00:00.000Z';
  const habits = archiveHabitIn([habit({ id: 'a', archivedAt: first })], 'a', '2026-05-01T09:00:00.000Z');

  assert.equal(habits[0].archivedAt, first);
});

test('archiving does not mutate the list it was given', () => {
  const habits = [habit({ id: 'a' })];
  archiveHabitIn(habits, 'a', '2026-02-01T09:00:00.000Z');

  assert.equal(habits[0].archivedAt, null);
});

test('management reflects the change after archive', () => {
  const before = [habit({ id: 'a' }), habit({ id: 'b' })];
  const after = archiveHabitIn(before, 'b', '2026-02-01T09:00:00.000Z');

  assert.deepEqual(
    activeHabitsFrom(after).map((item) => item.id),
    ['a']
  );
  assert.deepEqual(
    archivedHabitsFrom(after).map((item) => item.id),
    ['b']
  );
});

// ---------------------------------------------------------------------------
// Restoring
// ---------------------------------------------------------------------------

test('restoring an archived habit makes it active', () => {
  const habits = restoreOn(
    [habit({ id: 'a', archivedAt: '2026-02-01T09:00:00.000Z' })],
    'a'
  );

  assert.equal(habits[0].archivedAt, null);
  assert.deepEqual(
    activeHabitsFrom(habits).map((item) => item.id),
    ['a']
  );
});

test('restoring preserves the same habit id', () => {
  const habits = restoreOn(
    [habit({ id: 'habit-xyz', archivedAt: '2026-02-01T09:00:00.000Z' })],
    'habit-xyz'
  );

  assert.equal(habits[0].id, 'habit-xyz');
});

test('restoring preserves createdAt', () => {
  const createdAt = '2025-11-03T07:30:00.000Z';
  const habits = restoreOn(
    [habit({ id: 'a', createdAt, archivedAt: '2026-02-01T09:00:00.000Z' })],
    'a'
  );

  assert.equal(habits[0].createdAt, createdAt);
});

test('restoring preserves name, detail, frequency and days', () => {
  const archived = habit({
    id: 'a',
    name: 'Read',
    detail: 'One page',
    frequency: 'selected',
    days: ['mon', 'wed'],
    archivedAt: '2026-02-01T09:00:00.000Z',
  });

  const [restored] = restoreOn([archived], 'a');

  assert.equal(restored.name, 'Read');
  assert.equal(restored.detail, 'One page');
  assert.equal(restored.frequency, 'selected');
  assert.deepEqual(restored.days, ['mon', 'wed']);
});

test('restoring preserves completion history', () => {
  const completions = toggleCompletionOn({}, 'a', '2026-01-10');
  const archived = archiveHabitIn([habit({ id: 'a' })], 'a', '2026-02-01T09:00:00.000Z');
  const restored = restoreOn(archived, 'a');

  // Same id, so the same completion records are still the habit's own.
  assert.equal(restored[0].id, 'a');
  assert.deepEqual(completedDatesFor(completions, restored[0].id), ['2026-01-10']);
});

test('archiving and restoring on the same day leaves no trace', () => {
  // Changing your mind within the day is the one case that really is an
  // inverse: nothing happened in between, so there is no gap to record and the
  // habit should come out exactly as it went in.
  const original = habit({ id: 'a', frequency: 'selected', days: ['fri'] });
  const roundTrip = restoreOn(
    archiveHabitIn([original], 'a', '2026-02-01T09:00:00.000Z'),
    'a',
    '2026-02-01T18:00:00.000Z'
  );

  assert.deepEqual(roundTrip[0], original);
});

test('restoring later is deliberately not an inverse: the gap is kept', () => {
  // The months a habit spent put down are part of its record. Clearing the
  // flag alone would quietly convert a season the user chose to take off into
  // a season of missed days, which is the whole bug this model exists to fix.
  const original = habit({ id: 'a', createdAt: '2026-01-01T09:00:00.000Z' });
  const [result] = restoreOn(
    archiveHabitIn([original], 'a', '2026-03-15T09:00:00.000Z'),
    'a',
    '2026-06-20T09:00:00.000Z'
  );

  assert.equal(result.archivedAt, null);
  assert.deepEqual(result.activePeriods, [
    { from: '2026-01-01', to: '2026-03-15' },
    { from: '2026-06-20', to: null },
  ]);
});

test('restoring does not create a second habit', () => {
  const habits = restoreOn(
    [habit({ id: 'a', archivedAt: '2026-02-01T09:00:00.000Z' })],
    'a'
  );

  assert.equal(habits.length, 1);
});

test('restoring leaves other habits alone', () => {
  const habits = restoreOn(
    [
      habit({ id: 'a', archivedAt: '2026-02-01T09:00:00.000Z' }),
      habit({ id: 'b', archivedAt: '2026-03-01T09:00:00.000Z' }),
    ],
    'a'
  );

  assert.equal(habits[0].archivedAt, null);
  assert.equal(habits[1].archivedAt, '2026-03-01T09:00:00.000Z');
});

test('management reflects the change after restore', () => {
  const before = [
    habit({ id: 'a' }),
    habit({ id: 'b', archivedAt: '2026-02-01T09:00:00.000Z' }),
  ];
  const after = restoreOn(before, 'b');

  assert.deepEqual(
    activeHabitsFrom(after).map((item) => item.id),
    ['a', 'b']
  );
  assert.deepEqual(archivedHabitsFrom(after), []);
});

// ---------------------------------------------------------------------------
// Today integration
// ---------------------------------------------------------------------------

test('an archived habit is not on Today, whatever its schedule says', () => {
  const archived = habit({ archivedAt: '2026-02-01T09:00:00.000Z' });

  assert.equal(isScheduledOn(archived, MONDAY), false);
});

test('a restored habit returns to Today when it is scheduled for the day', () => {
  const habits = restoreOn(
    [
      habit({
        id: 'a',
        frequency: 'selected',
        days: ['mon'],
        archivedAt: '2026-02-01T09:00:00.000Z',
      }),
    ],
    'a'
  );

  assert.deepEqual(
    scheduledOn(habits, MONDAY).map((item) => item.id),
    ['a']
  );
});

test('a restored habit stays off Today when it is not scheduled for the day', () => {
  const habits = restoreOn(
    [
      habit({
        id: 'a',
        frequency: 'selected',
        days: ['mon'],
        archivedAt: '2026-02-01T09:00:00.000Z',
      }),
    ],
    'a'
  );

  assert.deepEqual(scheduledOn(habits, WEDNESDAY), []);
  // ...and is still reachable through management.
  assert.equal(activeHabitsFrom(habits).length, 1);
});

// ---------------------------------------------------------------------------
// Schedule summary shown on management rows
// ---------------------------------------------------------------------------

test('a daily habit summarises as every day', () => {
  assert.equal(scheduleSummary(habit()), 'Every day');
});

test('a selected habit summarises as the days it names', () => {
  assert.equal(
    scheduleSummary(habit({ frequency: 'selected', days: ['mon', 'wed', 'fri'] })),
    'Mo · We · Fr'
  );
});

test('summary days read in week order, not the order they were chosen', () => {
  assert.equal(
    scheduleSummary(habit({ frequency: 'selected', days: ['fri', 'mon'] })),
    'Mo · Fr'
  );
});

test('a selected habit covering the whole week summarises as every day', () => {
  const everyDay = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

  assert.equal(scheduleSummary(habit({ frequency: 'selected', days: everyDay })), 'Every day');
});

test('a selected habit with no days left says so rather than reading as daily', () => {
  assert.equal(scheduleSummary(habit({ frequency: 'selected', days: [] })), 'No days chosen');
});

// ---------------------------------------------------------------------------
// Reminder defaults and shape
// ---------------------------------------------------------------------------

test('a new habit form starts with the reminder switched off', () => {
  assert.equal(DEFAULT_REMINDER.enabled, false);
});

test('a missing reminder normalises to the disabled default', () => {
  assert.deepEqual(normalizeReminder(undefined), { enabled: false, hour: 9, minute: 0 });
});

test('a stored reminder is read back as it was saved', () => {
  assert.deepEqual(normalizeReminder({ enabled: true, hour: 20, minute: 30 }), {
    enabled: true,
    hour: 20,
    minute: 30,
  });
});

test('a broken reminder time falls back to the default rather than being trusted', () => {
  assert.deepEqual(normalizeReminder({ enabled: true, hour: 47, minute: -3 }), {
    enabled: true,
    hour: 9,
    minute: 0,
  });
});

test('only an explicit true enables a reminder', () => {
  assert.equal(normalizeReminder({ enabled: 'yes' }).enabled, false);
  assert.equal(normalizeReminder({ enabled: 1 }).enabled, false);
});

// ---------------------------------------------------------------------------
// Which reminders should exist
// ---------------------------------------------------------------------------

/** Fixed point in time: Monday 7 September 2026, 06:00 local. */
const MONDAY_6AM = new Date(2026, 8, 7, 6, 0, 0, 0);

function reminderHabit(overrides = {}) {
  return habit({ reminder: { enabled: true, hour: 20, minute: 30 }, ...overrides });
}

test('a daily habit is reminded on every day in the window', () => {
  const plan = plannedRemindersFor(reminderHabit(), {}, MONDAY_6AM, 7);

  assert.equal(plan.length, 7);
  assert.deepEqual(
    plan.map((item) => item.dateKey),
    ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13']
  );
});

test('a selected-days habit is reminded only on the days it names', () => {
  const plan = plannedRemindersFor(
    reminderHabit({ frequency: 'selected', days: ['mon', 'wed'] }),
    {},
    MONDAY_6AM,
    7
  );

  // Monday the 7th and Wednesday the 9th, and nothing else that week.
  assert.deepEqual(
    plan.map((item) => item.dateKey),
    ['2026-09-07', '2026-09-09']
  );
});

test('every planned reminder carries the habit time', () => {
  const plan = plannedRemindersFor(reminderHabit(), {}, MONDAY_6AM, 3);

  for (const item of plan) {
    assert.equal(item.date.getHours(), 20);
    assert.equal(item.date.getMinutes(), 30);
  }
});

test('an archived habit is reminded about nothing', () => {
  const archived = reminderHabit({ archivedAt: '2026-09-01T09:00:00.000Z' });

  assert.deepEqual(plannedRemindersFor(archived, {}, MONDAY_6AM, 7), []);
});

test('a disabled reminder produces nothing', () => {
  const off = habit({ reminder: { enabled: false, hour: 20, minute: 30 } });

  assert.deepEqual(plannedRemindersFor(off, {}, MONDAY_6AM, 7), []);
});

test('a habit with no reminder at all produces nothing', () => {
  assert.deepEqual(plannedRemindersFor(habit(), {}, MONDAY_6AM, 7), []);
});

test("a time that has already gone by today is not booked for today", () => {
  // 06:00 now, reminder at 05:00: today is missed, tomorrow is not.
  const early = reminderHabit({ reminder: { enabled: true, hour: 5, minute: 0 } });
  const plan = plannedRemindersFor(early, {}, MONDAY_6AM, 3);

  assert.deepEqual(
    plan.map((item) => item.dateKey),
    ['2026-09-08', '2026-09-09']
  );
});

test('reminders are addressed to the habit by name, calmly', () => {
  const [first] = plannedRemindersFor(reminderHabit({ name: 'Morning walk' }), {}, MONDAY_6AM, 1);

  assert.equal(first.title, 'Habit Loop');
  assert.equal(first.body, 'Morning walk is ready when you are.');
  assert.ok(!/streak|missed|don't|urgent|!/i.test(first.body));
});

// ---------------------------------------------------------------------------
// Completion awareness
// ---------------------------------------------------------------------------

test("completing a habit drops today's reminder and keeps the rest", () => {
  const completions = toggleCompletionOn({}, 'habit-1', '2026-09-07');
  const plan = plannedRemindersFor(reminderHabit(), completions, MONDAY_6AM, 3);

  assert.deepEqual(
    plan.map((item) => item.dateKey),
    ['2026-09-08', '2026-09-09']
  );
});

test('an incomplete habit keeps every reminder it had', () => {
  const plan = plannedRemindersFor(reminderHabit(), {}, MONDAY_6AM, 3);

  assert.equal(plan.length, 3);
  assert.ok(plan.some((item) => item.dateKey === '2026-09-07'));
});

test("completing one habit does not touch another habit's reminders", () => {
  const completions = toggleCompletionOn({}, 'habit-1', '2026-09-07');
  const other = reminderHabit({ id: 'habit-2' });

  assert.equal(plannedRemindersFor(other, completions, MONDAY_6AM, 1).length, 1);
});

// ---------------------------------------------------------------------------
// Identity and reconciliation
// ---------------------------------------------------------------------------

test('a reminder id is derived, so the same reminder always has the same id', () => {
  const subject = reminderHabit();

  assert.equal(reminderIdFor(subject, '2026-09-07'), reminderIdFor(subject, '2026-09-07'));
});

test('reminder ids separate habits, times and days', () => {
  const subject = reminderHabit();
  const later = reminderHabit({ reminder: { enabled: true, hour: 21, minute: 0 } });
  const other = reminderHabit({ id: 'habit-2' });

  assert.notEqual(reminderIdFor(subject, '2026-09-07'), reminderIdFor(subject, '2026-09-08'));
  assert.notEqual(reminderIdFor(subject, '2026-09-07'), reminderIdFor(later, '2026-09-07'));
  assert.notEqual(reminderIdFor(subject, '2026-09-07'), reminderIdFor(other, '2026-09-07'));
});

test('reconciling an empty device books the whole plan', () => {
  const plan = planReminders([reminderHabit()], {}, MONDAY_6AM, 3);
  const { toCancel, toSchedule } = diffReminderPlan([], plan);

  assert.deepEqual(toCancel, []);
  assert.equal(toSchedule.length, 3);
});

test('reconciling twice books nothing the second time', () => {
  const plan = planReminders([reminderHabit()], {}, MONDAY_6AM, 3);
  const booked = diffReminderPlan([], plan).toSchedule.map((item) => item.id);

  const second = diffReminderPlan(booked, plan);

  assert.deepEqual(second.toSchedule, []);
  assert.deepEqual(second.toCancel, []);
});

test('reconciling never touches notifications this feature did not book', () => {
  const foreign = ['some-other-app-notification'];
  const { toCancel } = diffReminderPlan(foreign, []);

  assert.deepEqual(toCancel, []);
});

test('turning a reminder off cancels everything it had booked', () => {
  const on = reminderHabit();
  const booked = planReminders([on], {}, MONDAY_6AM, 3).map((item) => item.id);

  const off = reminderHabit({ reminder: { enabled: false, hour: 20, minute: 30 } });
  const { toCancel, toSchedule } = diffReminderPlan(booked, planReminders([off], {}, MONDAY_6AM, 3));

  assert.deepEqual(toCancel.sort(), booked.sort());
  assert.deepEqual(toSchedule, []);
});

test('archiving a habit cancels everything it had booked', () => {
  const active = reminderHabit();
  const booked = planReminders([active], {}, MONDAY_6AM, 3).map((item) => item.id);

  const archived = reminderHabit({ archivedAt: '2026-09-07T09:00:00.000Z' });
  const { toCancel } = diffReminderPlan(booked, planReminders([archived], {}, MONDAY_6AM, 3));

  assert.equal(toCancel.length, 3);
});

test('restoring a habit books its reminders again', () => {
  const archived = reminderHabit({ archivedAt: '2026-09-07T09:00:00.000Z' });
  const restored = restoreOn([archived], 'habit-1');

  const { toSchedule } = diffReminderPlan([], planReminders(restored, {}, MONDAY_6AM, 3));

  assert.equal(toSchedule.length, 3);
});

test('changing the schedule replaces the old days rather than adding to them', () => {
  const daily = reminderHabit();
  const booked = planReminders([daily], {}, MONDAY_6AM, 3).map((item) => item.id);

  const mondaysOnly = reminderHabit({ frequency: 'selected', days: ['mon'] });
  const { toCancel, toSchedule } = diffReminderPlan(
    booked,
    planReminders([mondaysOnly], {}, MONDAY_6AM, 3)
  );

  // Tuesday and Wednesday go; Monday was already booked and is left alone.
  assert.equal(toCancel.length, 2);
  assert.deepEqual(toSchedule, []);
});

test('changing the time replaces every booking', () => {
  const evening = reminderHabit();
  const booked = planReminders([evening], {}, MONDAY_6AM, 3).map((item) => item.id);

  const later = reminderHabit({ reminder: { enabled: true, hour: 21, minute: 0 } });
  const { toCancel, toSchedule } = diffReminderPlan(booked, planReminders([later], {}, MONDAY_6AM, 3));

  assert.equal(toCancel.length, 3);
  assert.equal(toSchedule.length, 3);
});

test('two habits at the same time are booked independently', () => {
  const first = reminderHabit({ id: 'habit-1', name: 'Read' });
  const second = reminderHabit({ id: 'habit-2', name: 'Stretch' });

  const plan = planReminders([first, second], {}, MONDAY_6AM, 2);
  const ids = new Set(plan.map((item) => item.id));

  assert.equal(plan.length, 4);
  assert.equal(ids.size, 4);
});

// ---------------------------------------------------------------------------
// Storage migration
// ---------------------------------------------------------------------------

/** A v1 blob, exactly as the shipped app would have written it. */
function v1State() {
  return {
    version: 1,
    habits: [
      {
        id: 'habit-1',
        name: 'Read',
        detail: 'One page',
        frequency: 'selected',
        days: ['mon', 'wed'],
        createdAt: '2026-01-01T09:00:00.000Z',
        archivedAt: null,
      },
    ],
    completions: { 'habit-1': { '2026-01-10': true, '2026-01-11': true } },
  };
}

test('the schema version is now 3', () => {
  assert.equal(SCHEMA_VERSION, 3);
});

test('migrating v1 keeps every habit', () => {
  const state = normalizeState(v1State());

  assert.equal(state.habits.length, 1);
  assert.equal(state.habits[0].id, 'habit-1');
  assert.equal(state.habits[0].name, 'Read');
});

test('migrating v1 keeps everything a habit already was', () => {
  const [migrated] = normalizeState(v1State()).habits;

  assert.equal(migrated.detail, 'One page');
  assert.equal(migrated.frequency, 'selected');
  assert.deepEqual(migrated.days, ['mon', 'wed']);
  assert.equal(migrated.createdAt, '2026-01-01T09:00:00.000Z');
  assert.equal(migrated.archivedAt, null);
});

test('migrating v1 keeps every completion', () => {
  const state = normalizeState(v1State());

  assert.deepEqual(state.completions, {
    'habit-1': { '2026-01-10': true, '2026-01-11': true },
  });
});

test('migrating v1 adds a reminder that is switched off', () => {
  const [migrated] = normalizeState(v1State()).habits;

  assert.deepEqual(migrated.reminder, { enabled: false, hour: 9, minute: 0 });
});

test('migrating v1 does not mutate what it was given', () => {
  const original = v1State();
  normalizeState(original);

  assert.equal(original.version, 1);
  assert.equal(original.habits[0].reminder, undefined);
});

test('v2 state loads without being changed', () => {
  const stored = {
    version: 2,
    habits: [
      {
        id: 'habit-1',
        name: 'Read',
        detail: '',
        frequency: 'daily',
        days: [],
        createdAt: '2026-01-01T09:00:00.000Z',
        archivedAt: null,
        reminder: { enabled: true, hour: 20, minute: 30 },
      },
    ],
    completions: { 'habit-1': { '2026-01-10': true } },
  };

  const state = normalizeState(stored);

  assert.deepEqual(state.habits[0].reminder, { enabled: true, hour: 20, minute: 30 });
  assert.deepEqual(state.completions, { 'habit-1': { '2026-01-10': true } });
});

test('a version from a newer app is refused rather than half-read', () => {
  assert.equal(normalizeState({ version: 99, habits: [], completions: {} }), null);
});

test('state with no version at all is refused', () => {
  assert.equal(normalizeState({ habits: [], completions: {} }), null);
});

test('a migrated habit is immediately usable by the reminder planner', () => {
  const [migrated] = normalizeState(v1State()).habits;

  // Off, so nothing is planned -- an update must never start notifying anyone.
  assert.deepEqual(plannedRemindersFor(migrated, {}, MONDAY_6AM, 7), []);
});

// ---------------------------------------------------------------------------
// Theme resolution
// ---------------------------------------------------------------------------

test('a fresh install follows the device', () => {
  assert.equal(DEFAULT_THEME_MODE, 'system');
});

test('there are exactly three modes to choose from', () => {
  assert.deepEqual(THEME_MODES, ['system', 'light', 'dark']);
});

test('light mode resolves light whatever the device is doing', () => {
  assert.equal(resolveScheme('light', 'dark'), 'light');
  assert.equal(resolveScheme('light', 'light'), 'light');
  assert.equal(resolveScheme('light', null), 'light');
});

test('dark mode resolves dark whatever the device is doing', () => {
  assert.equal(resolveScheme('dark', 'light'), 'dark');
  assert.equal(resolveScheme('dark', 'dark'), 'dark');
  assert.equal(resolveScheme('dark', null), 'dark');
});

test('system mode follows the device', () => {
  assert.equal(resolveScheme('system', 'dark'), 'dark');
  assert.equal(resolveScheme('system', 'light'), 'light');
});

test('system mode falls back to light when the device says nothing', () => {
  assert.equal(resolveScheme('system', null), 'light');
  assert.equal(resolveScheme('system', undefined), 'light');
});

test('only the three known modes are accepted', () => {
  assert.equal(isThemeMode('system'), true);
  assert.equal(isThemeMode('light'), true);
  assert.equal(isThemeMode('dark'), true);
  assert.equal(isThemeMode('sepia'), false);
  assert.equal(isThemeMode(''), false);
  assert.equal(isThemeMode(undefined), false);
});

test('a stored mode this build does not understand falls back to system', () => {
  assert.equal(normalizeThemeMode('sepia'), 'system');
  assert.equal(normalizeThemeMode(null), 'system');
  assert.equal(normalizeThemeMode(7), 'system');
  assert.equal(normalizeThemeMode({}), 'system');
});

test('a valid stored mode is kept', () => {
  assert.equal(normalizeThemeMode('dark'), 'dark');
  assert.equal(normalizeThemeMode('light'), 'light');
});

test('an unreadable preference still resolves to a usable theme', () => {
  // The path a corrupt file takes: normalise, then resolve.
  assert.equal(resolveScheme(normalizeThemeMode('nonsense'), 'dark'), 'dark');
});

test('themeFor returns the palette itself', () => {
  assert.equal(themeFor('dark', 'light'), themes.dark);
  assert.equal(themeFor('light', 'dark'), themes.light);
  assert.equal(themeFor('system', 'dark'), themes.dark);
});

// ---------------------------------------------------------------------------
// Both palettes are complete and distinct
// ---------------------------------------------------------------------------

test('both themes define exactly the same tokens', () => {
  // The property the whole feature rests on: no component ever has to ask
  // which theme is running, because every token exists in both.
  assert.deepEqual(Object.keys(themes.light).sort(), Object.keys(themes.dark).sort());
});

test('every token in both themes is a colour', () => {
  for (const [name, palette] of Object.entries(themes)) {
    for (const [token, value] of Object.entries(palette)) {
      assert.match(value, /^#[0-9A-F]{6}$/i, `${name}.${token} is not a hex colour`);
    }
  }
});

test('the dark theme is not the light theme', () => {
  assert.notEqual(themes.dark.background, themes.light.background);
  assert.notEqual(themes.dark.text, themes.light.text);
});

test('dark mode never paints on pure black', () => {
  assert.notEqual(themes.dark.background.toUpperCase(), '#000000');
});

test('coral means the same thing in both themes', () => {
  // The one value shared verbatim: a day you showed up for should look
  // identical whichever atmosphere it is recorded in.
  assert.equal(themes.dark.accent, themes.light.accent);
  assert.equal(themes.dark.markDone, themes.light.markDone);
});

test('the dark background is lighter than its own text, and the light one darker', () => {
  assert.ok(luminance(themes.dark.background) < luminance(themes.dark.text));
  assert.ok(luminance(themes.light.background) > luminance(themes.light.text));
});

test('every dark pairing the app renders clears its contrast target', () => {
  const c = themes.dark;
  const pairs = [
    ['habit name', c.text, c.background, 4.5],
    ['habit name pressed', c.text, c.surfaceMuted, 4.5],
    ['secondary text', c.textSecondary, c.background, 4.5],
    ['muted text', c.textMuted, c.background, 4.5],
    ['muted text pressed', c.textMuted, c.surfaceMuted, 4.5],
    ['headings', c.brand, c.background, 4.5],
    ['insight', c.brandSoft, c.background, 4.5],
    ['progress label', c.accent, c.background, 4.5],
    ['primary button label', c.textOnBrand, c.brand, 4.5],
    ['waiting mark', c.markWaiting, c.background, 3],
  ];

  for (const [name, fg, bg, need] of pairs) {
    assert.ok(contrast(fg, bg) >= need, `${name}: ${contrast(fg, bg).toFixed(2)} < ${need}`);
  }
});

test('the faint rhythm mark stays faint in both themes', () => {
  // It means "this day was never due". Visible, and only just -- in dark mode
  // that means darker than the background, not lighter.
  assert.ok(contrast(themes.dark.markIdle, themes.dark.background) < 2.5);
  assert.ok(contrast(themes.light.markIdle, themes.light.background) < 2.5);
  assert.ok(luminance(themes.dark.markIdle) > luminance(themes.dark.background));
  assert.ok(luminance(themes.light.markIdle) < luminance(themes.light.background));
});

// ---------------------------------------------------------------------------
// Theme preference is not habit data
// ---------------------------------------------------------------------------

test('a theme preference is not part of the habit schema', () => {
  const state = normalizeState(v1State());

  assert.equal(state.habits[0].themeMode, undefined);
  assert.equal(state.themeMode, undefined);
});

test('the theme preference never became habit data', () => {
  // Themes are stored under their own key. Nothing about them reaches a habit
  // record, whatever the habit schema version happens to be.
  const [migrated] = normalizeState(v1State()).habits;

  assert.equal(migrated.themeMode, undefined);
  assert.equal('themeMode' in migrated, false);
});

test('habits and completions survive untouched alongside a theme preference', () => {
  // The preference lives under its own key, so reading habits cannot see it
  // and writing it cannot disturb them.
  const state = normalizeState(v1State());

  assert.equal(state.habits.length, 1);
  assert.deepEqual(state.completions, {
    'habit-1': { '2026-01-10': true, '2026-01-11': true },
  });
});

// ---------------------------------------------------------------------------
// Where things live: habits, habit editing, and app settings
// ---------------------------------------------------------------------------

const settingsScreen = source('src/screens/SettingsScreen.js');
const managementScreen = source('src/screens/HabitManagementScreen.js');
const todayScreen = source('src/screens/TodayScreen.js');
const rootNavigator = source('src/navigation/RootNavigator.js');
const themeProvider = source('src/theme/ThemeProvider.js');
const preferences = source('src/lib/preferences.js');
const habitForm = source('src/components/HabitFormFields.js');
const habitStore = source('src/store/habits.js');

/** What a file actually pulls in, which is the only reach it has. */
function imports(file) {
  return [...file.matchAll(/from '([^']+)'/g)].map((match) => match[1]);
}

test('Settings is a screen the navigator can reach', () => {
  assert.match(settingsScreen, /export function SettingsScreen/);
  assert.ok(imports(rootNavigator).includes('../screens/SettingsScreen'));
  assert.match(rootNavigator, /name="Settings" component=\{SettingsScreen\}/);
});

test('Settings is pushed like the other secondary screens, not made a shell', () => {
  // Same headerless native stack, same shared BackButton, nothing nested.
  assert.ok(imports(settingsScreen).includes('../components/BackButton'));
  assert.match(settingsScreen, /navigation\.goBack\(\)/);
  assert.equal(/createNativeStackNavigator|Tab\.Navigator|Drawer/.test(settingsScreen), false);
});

test('Settings is reachable, quietly, from Today', () => {
  // App-level, so it hangs off the app's front door rather than off the
  // collection: Today -> Settings, not Today -> All habits -> Settings.
  assert.match(todayScreen, /navigation\.navigate\('Settings'\)/);
  assert.match(todayScreen, /accessibilityLabel="Settings"/);
  assert.match(todayScreen, /accessibilityRole="button"/);
});

test('the collection screen no longer offers Settings at all', () => {
  assert.equal(managementScreen.includes("navigate('Settings')"), false);
  assert.equal(managementScreen.includes('accessibilityLabel="Settings"'), false);
  assert.equal(managementScreen.includes('settingsAction'), false);
});

test('Today keeps both ways out, and neither becomes the other', () => {
  assert.match(todayScreen, /navigation\.navigate\('HabitManagement'\)/);
  assert.match(todayScreen, /accessibilityLabel="All habits"/);
  assert.match(todayScreen, /navigation\.navigate\('CreateHabit'\)/);
  assert.match(todayScreen, /navigation\.navigate\('HabitDetail', \{ habitId: id \}\)/);

  // No tab bar, no drawer, no second Settings screen.
  assert.equal(/Tab\.Navigator|Drawer|createBottomTab/.test(todayScreen), false);
  assert.equal(todayScreen.includes('function SettingsScreen'), false);
});

test('the wordmark is held outside the scrolling day', () => {
  // The whole point of the change: the header is the ScrollView's sibling, so
  // a long list scrolls under the app's name instead of carrying it away.
  const header = todayScreen.indexOf('<View style={styles.header}>');
  const scroll = todayScreen.indexOf('<ScrollView');
  const wordmark = todayScreen.indexOf('<Wordmark />');

  assert.ok(header > 0 && scroll > 0, 'Today has both a header and a ScrollView');
  assert.ok(header < scroll, 'the header is rendered before the ScrollView opens');
  assert.ok(wordmark > header && wordmark < scroll, 'the wordmark sits inside the header');

  // One wordmark, one scroll view, and the safe area still comes from Screen.
  assert.equal((todayScreen.match(/<Wordmark \/>/g) ?? []).length, 1);
  assert.equal((todayScreen.match(/<ScrollView/g) ?? []).length, 1);
  assert.equal(todayScreen.includes('SafeAreaView'), false);
  assert.ok(imports(todayScreen).includes('../components/Screen'));
});

test('the settings mark is drawn from the theme, not from an icon package', () => {
  // Semantic tokens only: nothing here hard-codes a colour, and nothing new
  // was installed to draw three lines and three rings.
  assert.match(todayScreen, /backgroundColor: colors\.textSecondary/);
  assert.match(todayScreen, /borderColor: colors\.textSecondary/);
  assert.match(todayScreen, /backgroundColor: colors\.background/);
  assert.equal(/#[0-9a-fA-F]{6}/.test(todayScreen), false);
  assert.equal(/react-native-vector-icons|@expo\/vector-icons|Ionicons|MaterialIcons/.test(todayScreen), false);

  // A generous target around a small drawing, and a pressed state that is not
  // a colour change.
  assert.match(todayScreen, /height: layout\.touchTarget/);
  assert.match(todayScreen, /settingsPressed/);
});

test('the collection screen is habits only', () => {
  // The two things that moved out, by the names they were built under, and the
  // APIs they were built on.
  assert.equal(managementScreen.includes('AppearanceSetting'), false);
  assert.equal(managementScreen.includes('NotificationStatus'), false);
  assert.equal(managementScreen.includes('THEME_MODES'), false);
  assert.equal(managementScreen.includes('setThemeMode'), false);
  assert.equal(managementScreen.includes('getPermissionStatus'), false);
  assert.equal(imports(managementScreen).includes('../lib/notifications'), false);
});

test('the collection screen still shows both halves of the collection', () => {
  assert.match(managementScreen, /activeHabits/);
  assert.match(managementScreen, /archivedHabits/);
  assert.match(managementScreen, /label="Active"/);
  assert.match(managementScreen, /label="Archived"/);
  assert.match(managementScreen, /Nothing here yet\./);
  assert.match(managementScreen, /Nothing active right now\./);
});

// --- Starting a habit from the collection -----------------------------------
//
// The invariant, stated once: somebody who has reached the collection can add
// to it. Until now the only way to start a habit was Today, so a user who had
// navigated to their habits had to navigate back out of them to make one.
//
// There is no renderer here, so the four states the action has to survive --
// empty, active, archived-only, both -- are checked the only way a static
// suite can check them, which is also the way that actually matters: the
// action is drawn once, as a sibling of the state branches rather than inside
// any of them, so no state can be the one that loses it.

/** The collection band of the management screen: everything the states render. */
const collectionBand = (() => {
  const open = managementScreen.indexOf('band={BANDS.collection}');
  return managementScreen.slice(open, managementScreen.indexOf('</Band>', open));
})();

test('the collection screen offers a way to start a habit', () => {
  assert.match(managementScreen, /const openCreate = \(\) => navigation\.navigate\('CreateHabit'\)/);
  assert.match(managementScreen, /onPress=\{openCreate\}/);
  assert.match(managementScreen, /accessibilityRole="button"/);
  assert.match(managementScreen, /accessibilityLabel="Add a habit"/);
});

test('it goes to the CreateHabit that already exists, and invents no route', () => {
  // navigate, not push, and the same route name Today opens -- so what comes
  // back afterwards is the collection the new habit joined, by the goBack
  // CreateHabit already ends on.
  assert.equal(/navigation\.push\(/.test(managementScreen), false);
  // Read here rather than through the `createScreen` binding below, which this
  // section runs before.
  assert.match(source('src/screens/CreateHabitScreen.js'), /navigation\.goBack\(\)/);

  // Every route the app has, and no seventh one added for this.
  const routes = [...rootNavigator.matchAll(/<Stack\.Screen name="(\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(routes, [
    'Today',
    'CreateHabit',
    'HabitDetail',
    'EditHabit',
    'HabitManagement',
    'Settings',
  ]);
  assert.equal(/createNativeStackNavigator|Tab\.Navigator|Drawer/.test(managementScreen), false);
});

test('the action survives all four states, by sitting outside all four', () => {
  // Exactly one, so an empty collection and a full one are offered the same
  // thing rather than two things that have to be kept in agreement.
  assert.equal((managementScreen.match(/onPress=\{openCreate\}/g) ?? []).length, 1);

  // Inside the collection band, and after both arms of the state branch: the
  // "nothing here yet" arm, and the arm that draws Active and Archived. A
  // sibling of the states cannot be dropped by one of them.
  assert.ok(collectionBand.includes('onPress={openCreate}'), 'the action is in the collection');
  assert.ok(
    collectionBand.indexOf('onPress={openCreate}') > collectionBand.indexOf('Nothing here yet.'),
    'the empty arm does not contain the action'
  );
  assert.ok(
    collectionBand.indexOf('onPress={openCreate}') > collectionBand.indexOf('label="Archived"'),
    'neither section contains the action'
  );

  // The three states that say something of their own still say it, unchanged.
  assert.match(managementScreen, /Nothing here yet\./);
  assert.match(managementScreen, /Nothing active right now\./);
  assert.match(managementScreen, /Open one below to continue it whenever you want\./);
});

test('the action is the add row Today already uses, not a new kind of button', () => {
  // Same tokens, same restraint: the quietest body type, coral on the plus
  // alone, the shared fade on press. Nothing lifted, nothing floating, no icon
  // set, no colour written down.
  assert.match(managementScreen, /addLabel: \{\s*\.\.\.typography\.body,\s*color: colors\.textSecondary,/);
  assert.match(managementScreen, /addPlus: \{\s*color: colors\.accent,/);
  assert.match(managementScreen, /addRowPressed: \{\s*opacity: motion\.pressed\.fade,/);
  assert.match(todayScreen, /addPlus: \{\s*color: colors\.accent,/);

  assert.equal(managementScreen.includes('shadows.'), false);
  assert.equal(/position: 'absolute'/.test(managementScreen), false);
  assert.equal(/#[0-9a-fA-F]{3,8}\b/.test(managementScreen), false);
  assert.equal(
    /react-native-vector-icons|@expo\/vector-icons|Ionicons|MaterialIcons/.test(managementScreen),
    false
  );
});

test('Today keeps the create actions it already had', () => {
  // The flow that existed before this is untouched: the empty state's pill and
  // the add row under the day both still open the same route the same way.
  assert.match(todayScreen, /const openCreate = \(\) => navigation\.navigate\('CreateHabit'\)/);
  assert.match(todayScreen, /<EmptyState onCreate=\{openCreate\}/);
  assert.match(todayScreen, /onPress=\{openCreate\}/);
  assert.match(todayScreen, /accessibilityLabel="Add a habit"/);
  assert.match(
    todayScreen,
    /createLabel = hasHistory \? 'Create a habit' : 'Create your first habit'/
  );
});

test('opening a habit is still the same single press it was', () => {
  // Both halves still open Detail, by the row's own press, and the collection
  // still navigates nowhere else. What a habit's row *does* is unchanged; what
  // changed is that a second, separate target now sits beside it -- see the
  // lifecycle section below for the assertions that keep the two apart.
  assert.match(
    managementScreen,
    /const openHabit = \(habitId\) => navigation\.navigate\('HabitDetail', \{ habitId \}\)/
  );
  assert.equal((managementScreen.match(/onPress=\{openHabit\}/g) ?? []).length, 2);

  // Detail and Edit are the only routes this screen reaches, plus Create.
  assert.deepEqual(
    [...managementScreen.matchAll(/navigation\.navigate\('(\w+)'/g)].map((m) => m[1]).sort(),
    ['CreateHabit', 'HabitDetail']
  );
});

test('Settings holds appearance and notifications, and nothing about habits', () => {
  assert.match(settingsScreen, /label="Appearance"/);
  assert.match(settingsScreen, /label="Notifications"/);
  assert.equal(imports(settingsScreen).includes('../store/habits'), false);
  assert.equal(imports(settingsScreen).includes('../components/HabitRow'), false);
});

test('the theme selector reads and writes the one ThemeProvider', () => {
  assert.match(settingsScreen, /useTheme/);
  assert.match(settingsScreen, /setThemeMode\(mode\)/);
  assert.match(settingsScreen, /THEME_MODES\.map/);

  // No second provider and no second persistence path: Settings has the hook,
  // ThemeProvider still owns the state and the write.
  assert.equal(settingsScreen.includes('createContext'), false);
  assert.equal(settingsScreen.includes('savePreferences'), false);
  assert.match(themeProvider, /savePreferences\(\{ themeMode: next \}\)/);
});

test('the theme preference still persists under its own single key', () => {
  assert.match(preferences, /const PREFERENCES_KEY = 'habitloop_preferences'/);
  assert.equal((preferences.match(/habitloop_preferences/g) ?? []).length, 1);
  assert.equal(imports(settingsScreen).includes('../lib/preferences'), false);
  assert.equal(settingsScreen.includes('AsyncStorage'), false);
});

test('a stored theme preference still survives the round trip it is written in', () => {
  // Exactly what savePreferences writes and loadPreferences reads back.
  const write = (mode) => JSON.stringify({ themeMode: normalizeThemeMode(mode) });
  const read = (raw) => normalizeThemeMode(JSON.parse(raw)?.themeMode);

  assert.equal(read(write('dark')), 'dark');
  assert.equal(read(write('light')), 'light');
  assert.equal(read(write('system')), 'system');
});

test('a preference written by some other build still opens in a usable theme', () => {
  assert.equal(normalizeThemeMode(JSON.parse('{"themeMode":"sepia"}').themeMode), 'system');
  assert.equal(normalizeThemeMode(JSON.parse('{}').themeMode), 'system');
  assert.equal(resolveScheme(normalizeThemeMode(undefined), 'dark'), 'dark');
});

test('Settings reads the permission state and never asks for it', () => {
  assert.match(settingsScreen, /getPermissionStatus\(\)/);
  assert.equal(settingsScreen.includes('requestPermission'), false);
  assert.equal(settingsScreen.includes('requestPermissionsAsync'), false);
});

test('opening Settings schedules, cancels and reconciles nothing', () => {
  assert.equal(settingsScreen.includes('reconcileNotifications'), false);
  assert.equal(settingsScreen.includes('scheduleNotification'), false);
  assert.equal(settingsScreen.includes('cancelScheduled'), false);
  assert.equal(settingsScreen.includes('planReminders'), false);
});

test('changing the theme cannot touch a habit or a notification', () => {
  // ThemeProvider's whole reach: one preferences module, no store, no
  // scheduler, no habit storage.
  assert.deepEqual(
    imports(themeProvider).filter((path) => path.startsWith('.')).sort(),
    ['../lib/preferences', './colors']
  );
  assert.deepEqual(
    imports(preferences).filter((path) => path.startsWith('.')),
    ['../theme/colors']
  );
});

test('reconciling is still triggered from the habit store and nowhere else', () => {
  assert.match(habitStore, /reconcileNotifications\(\{ habits, completions \}\)/);
  assert.equal(managementScreen.includes('reconcileNotifications'), false);
  assert.equal(todayScreen.includes('reconcileNotifications'), false);
  assert.equal(settingsScreen.includes('reconcileNotifications'), false);
});

test('a reminder still belongs to a habit, and is still set where habits are', () => {
  assert.match(habitForm, /function ReminderField/);
  assert.match(habitForm, /requestPermission\(\)/);
  assert.match(habitForm, /form\.enableReminder\(\)/);

  // Nothing in Settings configures one: no plan, no time, no per-habit state.
  assert.equal(imports(settingsScreen).includes('../lib/reminders'), false);
  assert.equal(settingsScreen.includes('DateTimePicker'), false);
  assert.equal(settingsScreen.includes('setReminderTime'), false);
  assert.equal(settingsScreen.includes('enableReminder'), false);
});

test('Today holds up at both ends of the list', () => {
  // Zero habits: nothing is scheduled, and the empty state is what Today
  // renders instead of a list.
  assert.deepEqual(scheduledOn([], MONDAY_6AM), []);
  assert.match(todayScreen, /activeHabits\.length === 0 \? \(\s*<EmptyState/);

  // Twelve habits: every one of them is today's business, in the order they
  // were created, with the header outside the list that holds them.
  const many = Array.from({ length: 12 }, (_, index) =>
    habit({ id: `habit-${index}`, name: `Habit ${index}` })
  );
  const todays = scheduledOn(many, MONDAY_6AM);

  assert.equal(todays.length, 12);
  assert.deepEqual(
    todays.map((item) => item.id),
    many.map((item) => item.id)
  );
});

test('the habit record is untouched by any of this', () => {
  const state = normalizeState(v1State());

  assert.equal(state.habits[0].themeMode, undefined);
  assert.equal(state.habits[0].id, 'habit-1');
  assert.equal(state.habits[0].createdAt, '2026-01-01T09:00:00.000Z');
  assert.equal(state.habits[0].archivedAt, null);
  assert.deepEqual(state.completions, {
    'habit-1': { '2026-01-10': true, '2026-01-11': true },
  });
});

// ---------------------------------------------------------------------------
// The app's own dialogs: confirmation, and the reminder time picker
// ---------------------------------------------------------------------------

const modalSheet = source('src/components/ModalSheet.js');
const confirmationModal = source('src/components/ConfirmationModal.js');
const timePicker = source('src/components/TimePickerModal.js');
const formFields = source('src/components/HabitFormFields.js');
const createScreen = source('src/screens/CreateHabitScreen.js');
const editScreen = source('src/screens/EditHabitScreen.js');

/** Every colour a file paints, as the token it names. */
function tokens(file) {
  return [...file.matchAll(/colors\.([A-Za-z]+)/g)].map((match) => match[1]);
}

// --- Reading the clock both ways -------------------------------------------

test('a stored hour is read back the way a person says it', () => {
  assert.deepEqual(to12Hour(20), { hour: 8, meridiem: 'PM' });
  assert.deepEqual(to12Hour(9), { hour: 9, meridiem: 'AM' });
  assert.deepEqual(to12Hour(13), { hour: 1, meridiem: 'PM' });
  assert.deepEqual(to12Hour(23), { hour: 11, meridiem: 'PM' });
});

test('midnight and noon are the two the clock face gets wrong', () => {
  assert.deepEqual(to12Hour(0), { hour: 12, meridiem: 'AM' });
  assert.deepEqual(to12Hour(12), { hour: 12, meridiem: 'PM' });
  assert.equal(from12Hour(12, 'AM'), 0);
  assert.equal(from12Hour(12, 'PM'), 12);
});

test('what the picker hands back is a stored hour again', () => {
  assert.equal(from12Hour(8, 'PM'), 20);
  assert.equal(from12Hour(9, 'AM'), 9);
  assert.equal(from12Hour(1, 'PM'), 13);
  assert.equal(from12Hour(11, 'PM'), 23);
});

test('every hour of the day survives the round trip', () => {
  for (let hour = 0; hour < 24; hour += 1) {
    const read = to12Hour(hour);

    assert.ok(read.hour >= 1 && read.hour <= 12, `${hour} reads as an hour on a clock face`);
    assert.ok(read.meridiem === 'AM' || read.meridiem === 'PM');
    assert.equal(from12Hour(read.hour, read.meridiem), hour);
  }
});

test('a time chosen in the picker is a time the reminder planner accepts', () => {
  // 9:15 PM, picked the way the panel picks it, then stored.
  const chosen = { enabled: true, hour: from12Hour(9, 'PM'), minute: 15 };
  const stored = normalizeReminder(chosen);

  assert.deepEqual(stored, { enabled: true, hour: 21, minute: 15 });
  assert.equal(formatReminderTime(stored.hour, stored.minute), '9:15 PM');

  const planned = plannedRemindersFor(
    habit({ reminder: stored }),
    {},
    MONDAY_6AM,
    1
  );
  assert.equal(planned.length, 1);
  assert.equal(planned[0].date.getHours(), 21);
  assert.equal(planned[0].date.getMinutes(), 15);
});

test('a reminder id is unchanged by where the time was chosen', () => {
  // The id is derived from the habit, the time and the day, and nothing in
  // this change touches any of the three.
  assert.equal(
    reminderIdFor(habit({ reminder: { enabled: true, hour: 21, minute: 15 } }), '2026-09-07'),
    'habitloop-reminder:habit-1:2115:2026-09-07'
  );
});

// --- The picker panel ------------------------------------------------------

test('the picker opens on the reminder it was given', () => {
  assert.match(timePicker, /useState\(\(\) => draftFrom\(hour, minute\)\)/);
  assert.match(timePicker, /if \(visible\) setDraft\(draftFrom\(hour, minute\)\)/);
  assert.match(timePicker, /function draftFrom\(hour, minute\)/);
});

test('cancelling the picker cannot change the time', () => {
  // Cancel reaches onCancel and nothing else; the only path to onConfirm is
  // Done, through the draft.
  assert.match(timePicker, /onPress=\{onCancel\}/);
  assert.match(timePicker, /onPress=\{commit\}/);
  assert.match(
    timePicker,
    /const commit = \(\) => onConfirm\(from12Hour\(draft\.hour, draft\.meridiem\), draft\.minute\)/
  );
  assert.equal((timePicker.match(/onConfirm\(/g) ?? []).length, 1);
});

test('the form only records a time the picker confirmed', () => {
  assert.match(formFields, /onCancel=\{\(\) => setPicking\(false\)\}/);
  assert.match(formFields, /onConfirm=\{onPickTime\}/);
  assert.match(formFields, /form\.setReminderTime\(hour, minute\)/);

  // One commit path, and it is the form's -- the same one that existed before.
  assert.equal((formFields.match(/setReminderTime/g) ?? []).length, 1);
});

test('turning the reminder on and off is untouched by the new panel', () => {
  assert.match(formFields, /form\.enableReminder\(\)/);
  assert.match(formFields, /form\.disableReminder\(\)/);
  assert.match(formFields, /requestPermission\(\)/);
});

test('the picker offers a whole clock, and only a clock', () => {
  assert.match(timePicker, /const HOURS = Array\.from\(\{ length: 12 \}/);
  assert.match(timePicker, /const MINUTES = Array\.from\(\{ length: 60 \}/);
  assert.match(timePicker, /const MERIDIEMS = \['AM', 'PM'\]/);
});

test('nothing in the picker schedules, cancels or plans a notification', () => {
  // The second scheduling path this change must not introduce.
  for (const name of ['reconcileNotifications', 'scheduleNotification', 'planReminders']) {
    assert.equal(timePicker.includes(name), false, `${name} is not reachable from the picker`);
    assert.equal(modalSheet.includes(name), false);
  }

  assert.equal(imports(timePicker).includes('../lib/notifications'), false);
  assert.match(habitStore, /reconcileNotifications\(\{ habits, completions \}\)/);
});

test('the platform time picker is gone from the form', () => {
  assert.equal(formFields.includes('DateTimePicker'), false);
  assert.equal(imports(formFields).includes('@react-native-community/datetimepicker'), false);
  assert.ok(imports(formFields).includes('./TimePickerModal'));
});

// --- The confirmation panel ------------------------------------------------

test('the confirmation modal is nothing at all until it is asked for', () => {
  // Everything it draws lives inside ModalSheet, and ModalSheet renders null
  // while it is neither open nor still closing.
  assert.match(confirmationModal, /<ModalSheet visible=\{visible\}/);
  assert.match(modalSheet, /if \(!mounted\) return null;/);
  assert.match(modalSheet, /const \[mounted, setMounted\] = useState\(visible\)/);
});

test('the confirmation modal says what it was given', () => {
  assert.match(confirmationModal, /\{title\}/);
  assert.match(confirmationModal, /\{message\}/);
  assert.match(confirmationModal, /\{cancelLabel\}/);
  assert.match(confirmationModal, /\{confirmLabel\}/);

  // A message is optional; a title and the two answers are not.
  assert.match(confirmationModal, /\{message \? <Text style=\{styles\.message\}>\{message\}<\/Text> : null\}/);
  assert.match(confirmationModal, /cancelLabel = 'Cancel'/);
});

test('each answer is its own button, wired to its own callback', () => {
  assert.match(confirmationModal, /onPress=\{onCancel\}[\s\S]*accessibilityLabel=\{cancelLabel\}/);
  assert.match(confirmationModal, /onPress=\{onConfirm\}[\s\S]*accessibilityLabel=\{confirmLabel\}/);
  assert.equal((confirmationModal.match(/accessibilityRole="button"/g) ?? []).length, 2);
});

test('nothing but the confirm button can confirm', () => {
  // The backdrop and Android back both dismiss, and dismissing is cancelling.
  assert.match(confirmationModal, /<ModalSheet visible=\{visible\} onDismiss=\{onCancel\}/);
  assert.match(modalSheet, /onRequestClose=\{onDismiss\}/);
  assert.match(modalSheet, /onPress=\{onDismiss\}/);
  assert.equal(modalSheet.includes('onConfirm'), false);
});

test('a destructive answer is marked as one, calmly', () => {
  assert.match(confirmationModal, /destructive = false/);
  assert.match(confirmationModal, /destructive && styles\.destructiveAction/);
  assert.match(confirmationModal, /destructive && styles\.destructiveLabel/);
  assert.match(confirmationModal, /backgroundColor: colors\.accentSurface/);

  // The soft coral surface, not full-strength coral: no red button, and no
  // warning colour invented for the occasion.
  assert.equal(confirmationModal.includes('backgroundColor: colors.accent,'), false);
});

test('the dialog is a dialog to a screen reader', () => {
  assert.match(modalSheet, /accessibilityViewIsModal/);
  assert.match(modalSheet, /accessibilityRole="alert"/);
  assert.match(confirmationModal, /accessibilityRole="header"/);
  assert.match(timePicker, /accessibilityRole="header"/);
  assert.match(timePicker, /accessibilityLabel="Cancel"/);
  assert.match(timePicker, /accessibilityLabel="Done"/);
});

// --- Both panels are the app's, in whichever theme the app is in -----------

test('both panels paint from the theme and nothing else', () => {
  for (const [name, file] of [
    ['ModalSheet', modalSheet],
    ['ConfirmationModal', confirmationModal],
    ['TimePickerModal', timePicker],
  ]) {
    assert.equal(/#[0-9a-fA-F]{3,8}\b/.test(file), false, `${name} hard-codes a colour`);
    assert.equal(/rgba?\(/.test(file), false, `${name} hard-codes a colour`);
    assert.match(file, /useThemedStyles\(makeStyles\)/, `${name} follows the running theme`);
    assert.match(file, /const makeStyles = \(colors, shadows\) =>/);
  }
});

test('every token the panels name exists in both palettes', () => {
  // The property that makes "follows the app theme" true rather than hoped
  // for: the panels only ask for tokens, and both themes answer.
  const named = new Set([
    ...tokens(modalSheet),
    ...tokens(confirmationModal),
    ...tokens(timePicker),
  ]);

  assert.ok(named.size > 0);
  for (const token of named) {
    assert.notEqual(themes.light[token], undefined, `light is missing ${token}`);
    assert.notEqual(themes.dark[token], undefined, `dark is missing ${token}`);
  }
});

test('the panels resolve to the light palette in light mode', () => {
  const colors = themeFor('light', 'dark');

  assert.equal(colors, themes.light);
  assert.equal(colors.surface, themes.light.surface);
  // Paper, not ink: the panel is lighter than the words on it.
  assert.ok(luminance(colors.surface) > luminance(colors.text));
});

test('the panels resolve to the dark palette in dark mode', () => {
  const colors = themeFor('dark', 'light');

  assert.equal(colors, themes.dark);
  assert.equal(colors.surface, themes.dark.surface);
  assert.ok(luminance(colors.surface) < luminance(colors.text));
});

test('a panel is readable on its own surface in both themes', () => {
  for (const [name, palette] of Object.entries(themes)) {
    const pairs = [
      ['title', palette.text, palette.surface, 4.5],
      ['message', palette.textSecondary, palette.surface, 4.5],
      ['cancel', palette.textSecondary, palette.surface, 4.5],
      ['confirm', palette.brand, palette.surface, 4.5],
      ['destructive confirm', palette.text, palette.accentSurface, 4.5],
      ['unselected time', palette.textSecondary, palette.surface, 4.5],
      ['selected time', palette.text, palette.surfaceMuted, 4.5],
    ];

    for (const [what, fg, bg, need] of pairs) {
      const ratio = contrast(fg, bg);
      assert.ok(ratio >= need, `${name} ${what}: ${ratio.toFixed(2)} < ${need}`);
    }
  }
});

test('the modals move in the app\'s own motion, and never bounce', () => {
  assert.match(modalSheet, /duration: motion\.duration\.base/);
  assert.match(modalSheet, /duration: motion\.duration\.quick/);
  assert.match(modalSheet, /easing: motion\.easing\.out/);
  assert.match(modalSheet, /useNativeDriver: true/);
  assert.equal(/Animated\.spring|bounce/.test(modalSheet), false);
});

// --- The flows that used to be platform alerts -----------------------------

test('no app-controlled confirmation is a platform alert any more', () => {
  assert.equal(createScreen.includes('Alert.alert'), false);
  assert.equal(editScreen.includes('Alert.alert'), false);
  assert.equal(imports(createScreen).includes('react-native') && createScreen.includes('Alert,'), false);
});

test('discarding a new habit still interrupts the same leaving', () => {
  assert.match(createScreen, /addListener\('beforeRemove'/);
  assert.match(createScreen, /if \(isSaving\.current \|\| !form\.hasText\) return;/);
  assert.match(createScreen, /event\.preventDefault\(\);\s*setPendingExit\(event\.data\.action\);/);
  assert.match(createScreen, /title="Discard this habit\?"/);
  assert.match(createScreen, /navigation\.dispatch\(action\)/);
});

test('discarding an edit still interrupts the same leaving', () => {
  assert.match(editScreen, /if \(isLeaving\.current \|\| !form\.isDirty\) return;/);
  assert.match(editScreen, /title="Discard changes\?"/);
  assert.match(editScreen, /cancelLabel="Keep editing"/);
  assert.match(editScreen, /navigation\.dispatch\(action\)/);
});

test('archiving still does exactly what it did', () => {
  assert.match(editScreen, /title="Archive this habit\?"/);
  assert.match(editScreen, /message="Your history will stay saved\."/);
  assert.match(editScreen, /confirmLabel="Archive habit"/);

  // The store action, the flag that keeps the discard prompt quiet, and the
  // exit past a detail screen with nothing left to show.
  assert.match(editScreen, /isLeaving\.current = true;\s*archiveHabit\(habitId\);\s*navigation\.popTo\('Today'\)/);
});

test('archiving a habit is still only a stamped date', () => {
  // The flow the modal now fronts, proven where it actually lives.
  const before = [habit()];
  const after = archiveHabitIn(before, 'habit-1', '2026-09-07T10:00:00.000Z');

  assert.equal(after[0].archivedAt, '2026-09-07T10:00:00.000Z');
  assert.equal(after[0].id, before[0].id);
  assert.equal(after[0].createdAt, before[0].createdAt);
  assert.deepEqual(after[0].reminder, before[0].reminder);
  assert.equal(before[0].archivedAt, null);
});

// ---------------------------------------------------------------------------
// What Today says about the day it is showing
//
// Today's mood is derived, never stored: the screen asks the same pure
// functions asserted here and renders the answer. So the shape of the day is
// built the way the screen builds it -- active habits, today's habits, how
// many of them are marked -- and then the voice and the line are asked of it.
// ---------------------------------------------------------------------------

const progressSummary = source('src/components/ProgressSummary.js');

/** Every single-quoted string in a file: near enough the words a user reads. */
function quoted(file) {
  return file.match(/'[^'\n]*'/g) ?? [];
}

/** The same file with its prose removed, so only what runs is left. */
function withoutComments(file) {
  return file.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** The day as Today derives it, from the same functions the screen calls. */
function shapeOfDay(habits, completions, now) {
  const active = activeHabitsFrom(habits);
  const todays = scheduledOn(active, now);
  const key = toDateKey(now);
  const completed = todays.filter((item) => isCompletedOn(completions, item.id, key)).length;

  return {
    hasHabits: active.length > 0,
    total: todays.length,
    completed,
    allDone: todays.length > 0 && completed === todays.length,
  };
}

/** The whole line, from a set of habits and what has been marked on them. */
function statementFor(habits, completions, now, { hasReturned = false } = {}) {
  const day = shapeOfDay(habits, completions, now);
  const voice = getDayVoice(now, { markedToday: day.completed > 0 });
  return getDayStatement(voice, { ...day, hasReturned });
}

const MONDAY_9AM = new Date(2026, 8, 7, 9, 0, 0, 0);
const MONDAY_2PM = new Date(2026, 8, 7, 14, 0, 0, 0);
const MONDAY_8PM = new Date(2026, 8, 7, 20, 0, 0, 0);
const MONDAY_KEY = toDateKey(MONDAY_9AM);

test('an empty Today says nothing above the empty state', () => {
  // "Keep building your rhythm" over "Nothing here yet" is the app talking to
  // a user who has no rhythm and has been told so on the next line.
  assert.equal(statementFor([], {}, MONDAY_9AM), null);
  assert.equal(statementFor([], {}, MONDAY_2PM), null);
  assert.equal(statementFor([], {}, MONDAY_8PM), null);
});

test('a habit is all it takes for the line to come back', () => {
  const statement = statementFor([habit()], {}, MONDAY_2PM);

  assert.equal(typeof statement, 'string');
  assert.equal(statement, getDayVoice(MONDAY_2PM).statement);
});

test('one scheduled habit reads as one thing to do', () => {
  const day = shapeOfDay([habit()], {}, MONDAY_9AM);

  assert.deepEqual(day, { hasHabits: true, total: 1, completed: 0, allDone: false });
});

test('several habits are counted, and none of them are done yet', () => {
  const many = Array.from({ length: 6 }, (_, index) => habit({ id: `habit-${index}` }));
  const day = shapeOfDay(many, {}, MONDAY_9AM);

  assert.equal(day.total, 6);
  assert.equal(day.completed, 0);
  assert.equal(day.allDone, false);
});

test('partial completion is progress and not an ending', () => {
  const many = Array.from({ length: 4 }, (_, index) => habit({ id: `habit-${index}` }));
  const completions = { 'habit-0': { [MONDAY_KEY]: true }, 'habit-2': { [MONDAY_KEY]: true } };
  const day = shapeOfDay(many, completions, MONDAY_9AM);

  assert.equal(day.completed, 2);
  assert.equal(day.allDone, false);
  assert.equal(statementFor(many, completions, MONDAY_9AM), getDayVoice(MONDAY_9AM).statement);
});

test('finishing everything scheduled does not add a line of its own', () => {
  // This line used to be replaced by a second announcement of the finished
  // day. It is not the slot that owns that news, so it no longer moves at all.
  const many = Array.from({ length: 3 }, (_, index) => habit({ id: `habit-${index}` }));
  const completions = Object.fromEntries(
    many.map((item) => [item.id, { [MONDAY_KEY]: true }])
  );

  assert.equal(shapeOfDay(many, completions, MONDAY_9AM).allDone, true);
  assert.equal(statementFor(many, completions, MONDAY_9AM), getDayVoice(MONDAY_9AM).statement);
  // Finishing leaves the line exactly where an unfinished day had it.
  assert.equal(statementFor(many, {}, MONDAY_9AM), statementFor(many, completions, MONDAY_9AM));
});

test('a habit not scheduled today is not something the day is waiting on', () => {
  // Two habits, one of them a Wednesday habit: marking the Monday one finishes
  // Monday, and the other is simply not today's business.
  const monday = habit({ id: 'monday', frequency: 'selected', days: ['mon'] });
  const wednesday = habit({ id: 'wednesday', frequency: 'selected', days: ['wed'] });
  const completions = { monday: { [MONDAY_KEY]: true } };

  assert.equal(shapeOfDay([monday, wednesday], completions, MONDAY_9AM).allDone, true);
});

test('taking a completion back reopens the day', () => {
  const only = habit();
  const completions = toggleCompletionOn({}, only.id, MONDAY_KEY);
  assert.equal(shapeOfDay([only], completions, MONDAY_9AM).allDone, true);

  const undone = toggleCompletionOn(completions, only.id, MONDAY_KEY);
  const day = shapeOfDay([only], undone, MONDAY_9AM);

  assert.equal(day.allDone, false);
  assert.equal(day.completed, 0);
  assert.equal(statementFor([only], undone, MONDAY_9AM), getDayVoice(MONDAY_9AM).statement);
});

test('returning is said once the user has come back', () => {
  assert.equal(statementFor([habit()], {}, MONDAY_9AM, { hasReturned: true }), RETURN_STATEMENT);
});

test('finishing the day outranks having returned to it', () => {
  // Returning is how the day started, not how it ended -- a rule that outlives
  // the sentence that used to carry it. A closed day is not reopened by the
  // return line; it simply reads its voice.
  const only = habit();
  const completions = { [only.id]: { [MONDAY_KEY]: true } };
  const statement = statementFor([only], completions, MONDAY_9AM, { hasReturned: true });

  assert.notEqual(statement, RETURN_STATEMENT);
  assert.equal(statement, getDayVoice(MONDAY_9AM).statement);
});

// ---------------------------------------------------------------------------
// The finished day, said once
// ---------------------------------------------------------------------------

/** The three files any all-done copy could be written in. */
const COPY_FILES = [
  'src/lib/greeting.js',
  'src/screens/TodayScreen.js',
  'src/components/ProgressSummary.js',
];

/** Every habit in a day, marked. */
function allDoneOn(habits, dateKey) {
  return Object.fromEntries(habits.map((item) => [item.id, { [dateKey]: true }]));
}

test('the finished day is stated once, in the slot that owns it', () => {
  // The audit's triple: an evening greeting, a line under it and the progress
  // label all announcing the same fact at once. The label keeps it -- it sits
  // where the day's standing is already reported, beside the bar it describes,
  // and it is the only one of the three with an animation built for the
  // crossing.
  const many = Array.from({ length: 3 }, (_, index) => habit({ id: `habit-${index}` }));
  const completions = allDoneOn(many, MONDAY_KEY);

  assert.equal(shapeOfDay(many, completions, MONDAY_9AM).allDone, true);
  assert.equal(progressSummary.includes("'All done today'"), true);

  // Exactly one file in the app says a finished day out loud.
  const speakers = COPY_FILES.filter((file) => source(file).includes('All done'));
  assert.deepEqual(speakers, ['src/components/ProgressSummary.js']);

  // And the sentence that was removed is gone from the app rather than left
  // exported and unused, which is how retired copy finds its way back.
  for (const file of COPY_FILES) {
    assert.equal(source(file).includes("That's everything"), false, file);
    assert.equal(source(file).includes('COMPLETED_STATEMENT'), false, file);
  }
});

test('an evening that finished does not say so three times', () => {
  // The one hour of the day the audit was exactly right about. The greeting
  // keeps its claim -- it is earned by any completion, not by the last one --
  // but nothing underneath repeats it.
  const only = habit();
  const completions = { [only.id]: { [MONDAY_KEY]: true } };
  const voice = getDayVoice(MONDAY_8PM, { markedToday: true });

  assert.equal(voice.greeting, 'Nice work today');
  assert.equal(shapeOfDay([only], completions, MONDAY_8PM).allDone, true);

  const statement = statementFor([only], completions, MONDAY_8PM);
  assert.equal(statement, 'Whatever you did today counts.');
  assert.equal(statement.includes('All done'), false);
  assert.equal(statement.includes('everything'), false);
});

test('the line above the list holds still through a whole day', () => {
  // Empty, partway, finished, undone: the only thing that moves is the label
  // under the list, which is the point of moving the news down to it.
  const many = Array.from({ length: 3 }, (_, index) => habit({ id: `habit-${index}` }));
  const expected = getDayVoice(MONDAY_9AM).statement;

  const none = {};
  const some = { 'habit-0': { [MONDAY_KEY]: true } };
  const all = allDoneOn(many, MONDAY_KEY);
  const undone = toggleCompletionOn(all, 'habit-2', MONDAY_KEY);

  assert.deepEqual(
    [none, some, all, undone].map((entry) => shapeOfDay(many, entry, MONDAY_9AM).allDone),
    [false, false, true, false]
  );
  for (const completions of [none, some, all, undone]) {
    assert.equal(statementFor(many, completions, MONDAY_9AM), expected);
  }

  // Undoing from a finished day puts the label back to a count, so no stale
  // all-done copy can be left standing on the screen.
  assert.equal(shapeOfDay(many, undone, MONDAY_9AM).completed, 2);
});

test('the label that kept the news kept the machinery for it', () => {
  // Nothing was orphaned by deciding where the moment lives. The arrival
  // animation still has the label it was built to bring in, still tied to the
  // crossing rather than to every tap.
  assert.equal(progressSummary.includes("allDone ? 'All done today'"), true);
  assert.equal(progressSummary.includes('if (wasAllDone.current === allDone) return;'), true);
  assert.equal(progressSummary.includes('duration: allDone ? motion.duration.settle'), true);

  // And Today took on no machinery for a moment it no longer states.
  assert.equal(todayScreen.includes('useState('), false);
  assert.equal(todayScreen.includes('All done'), false);
  assert.equal(source('src/lib/greeting.js').includes('Animated'), false);
});

test('coming back after a gap is still recognised as a return', () => {
  // The recovery rule itself, unchanged: a habit with something behind it and
  // a due day left unfilled in between.
  const daily = habit({ createdAt: '2026-08-01T09:00:00.000Z' });
  const completions = { [daily.id]: { '2026-09-01': true } };

  assert.equal(isReturningHabit(daily, completions, MONDAY_9AM), true);
  // And nothing about the gap is measured or written down anywhere.
  assert.equal(source('src/lib/recovery.js').includes('daysSince'), false);
});

test('an evening with nothing marked does not congratulate anyone', () => {
  // The one greeting in the app that makes a claim about the user, held back
  // until the day gives it something to be about.
  assert.equal(getDayVoice(MONDAY_8PM).greeting, 'Good evening');
  assert.equal(getDayVoice(MONDAY_8PM, { markedToday: false }).greeting, 'Good evening');
  assert.equal(getDayVoice(MONDAY_8PM, { markedToday: true }).greeting, 'Nice work today');
});

test('the evening keeps its forgiving line either way', () => {
  // "Whatever you did today counts" is the point of the evening, and a day
  // with nothing in it is exactly when it should be read.
  assert.equal(
    getDayVoice(MONDAY_8PM, { markedToday: false }).statement,
    getDayVoice(MONDAY_8PM, { markedToday: true }).statement
  );
});

test('the morning and the afternoon greet the hour and nothing else', () => {
  for (const now of [MONDAY_9AM, MONDAY_2PM]) {
    assert.equal(
      getDayVoice(now, { markedToday: false }).greeting,
      getDayVoice(now, { markedToday: true }).greeting
    );
  }

  assert.equal(getDayVoice(MONDAY_9AM).greeting, 'Good morning');
  assert.equal(getDayVoice(MONDAY_2PM).greeting, 'Good afternoon');
});

test('no greeting anywhere raises its voice', () => {
  // Every word this module puts on screen lives in a quoted string, so the
  // strings are exactly the thing to check. Calm is a product decision here,
  // and an exclamation mark is the cheapest way to lose it.
  for (const line of quoted(source('src/lib/greeting.js'))) {
    assert.equal(line.includes('!'), false, `greeting.js shouts: ${line}`);
  }
});

test('the day is divided in exactly one place', () => {
  // The two hours that decide the greeting are read by the screen and by the
  // hook that notices they have passed, so they are written down once.
  assert.equal(getVoiceWindow(MONDAY_9AM), 'morning');
  assert.equal(getVoiceWindow(MONDAY_2PM), 'midday');
  assert.equal(getVoiceWindow(MONDAY_8PM), 'evening');

  // The boundaries themselves, from both sides.
  assert.equal(getVoiceWindow(new Date(2026, 8, 7, 11, 59)), 'morning');
  assert.equal(getVoiceWindow(new Date(2026, 8, 7, 12, 0)), 'midday');
  assert.equal(getVoiceWindow(new Date(2026, 8, 7, 16, 59)), 'midday');
  assert.equal(getVoiceWindow(new Date(2026, 8, 7, 17, 0)), 'evening');

  const today = source('src/hooks/useToday.js');
  assert.ok(imports(today).includes('../lib/greeting'));
  assert.equal(/hour < 1[27]/.test(today), false, 'useToday keeps its own copy of the hours');
});

test('an afternoon left open does not greet the evening as the afternoon', () => {
  // Today never unmounts, and the greeting used to be pinned to the calendar
  // day alone -- so an app still warm at six carried the afternoon with it.
  const today = source('src/hooks/useToday.js');
  assert.match(today, /momentKey\(now\) === momentKey\(current\)/);
  assert.match(today, /getVoiceWindow\(date\)/);

  // Midnight is still the only thing on a timer: that boundary decides where a
  // completion is filed, and it cannot wait for the next foreground.
  assert.match(today, /midnight\.setHours\(24, 0, 0, 0\)/);
});

test('an emptied Today is told the truth about why it is empty', () => {
  // A user who archived everything has not "nothing here yet" -- they have
  // everything, kept, which is the whole promise of archiving.
  assert.match(todayScreen, /hasHistory=\{archivedHabits\.length > 0\}/);
  assert.match(todayScreen, /hasHistory \? 'Nothing active right now\.' : 'Nothing here yet\.'/);
  assert.match(todayScreen, /'Your history is kept in All habits\.'/);
});

test('an emptied Today still offers the one thing it can do', () => {
  // Same slot, same button, a label that is true in both cases.
  assert.match(todayScreen, /hasHistory \? 'Create a habit' : 'Create your first habit'/);
  assert.match(todayScreen, /accessibilityLabel=\{createLabel\}/);
});

test('Today never writes down how it is feeling', () => {
  // Every mood on this screen is read back out of habits and completions --
  // now including the return, which used to be the one exception and was the
  // one thing up here that could disagree with the day underneath it.
  assert.equal((todayScreen.match(/useState\(/g) ?? []).length, 0);
  assert.equal(todayScreen.includes('setHasReturned'), false);
  assert.equal(todayScreen.includes('saveState'), false);
  assert.equal(source('src/lib/storageSchema.js').includes('hasReturned'), false);
});

test('the day is counted before the day is greeted', () => {
  // The evening greeting answers to the list, so it cannot be chosen above it.
  const counted = todayScreen.indexOf('const completedCount');
  const greeted = todayScreen.indexOf('getDayVoice(now');

  assert.ok(counted > 0 && greeted > counted);
});

test('the progress label arrives with the bar rather than ahead of it', () => {
  // The words used to announce the finished day at the first frame while the
  // coral under them was still a third of a second away.
  assert.match(progressSummary, /duration: allDone \? motion\.duration\.settle/);
  assert.match(progressSummary, /<Animated\.Text/);
});

test('the progress label only moves when the day is actually finished', () => {
  // Anything that fired per completion would be a flicker under every tap.
  assert.match(progressSummary, /if \(wasAllDone\.current === allDone\) return;/);
  assert.match(progressSummary, /\}, \[allDone, arrival\]\);/);
});

test('nothing on Today counts, scores or ranks anything', () => {
  // Comments stripped: the prose above these functions is allowed to name the
  // things the product is refusing to build. The code is not.
  for (const path of ['src/screens/TodayScreen.js', 'src/components/ProgressSummary.js']) {
    assert.equal(
      /streak|badge|level|score|trophy|achievement|confetti/i.test(withoutComments(source(path))),
      false,
      `${path} reaches for a game mechanic`
    );
  }
});

// ---------------------------------------------------------------------------
// One product: the details that had drifted between screens
// ---------------------------------------------------------------------------

const habitRow = source('src/components/HabitRow.js');
const habitItem = source('src/components/HabitItem.js');
const backButton = source('src/components/BackButton.js');
const primaryButton = source('src/components/PrimaryButton.js');
const motionTokens = source('src/theme/motion.js');

/** Every file that draws something the user can touch. */
const INTERFACE_FILES = [
  'src/components/BackButton.js',
  'src/components/ConfirmationModal.js',
  'src/components/HabitFormFields.js',
  'src/components/HabitItem.js',
  'src/components/HabitRow.js',
  'src/components/ModalSheet.js',
  'src/components/PrimaryButton.js',
  'src/components/ProgressSummary.js',
  'src/components/RhythmGrid.js',
  'src/components/Screen.js',
  'src/components/TimePickerModal.js',
  'src/components/Wordmark.js',
  'src/screens/CreateHabitScreen.js',
  'src/screens/EditHabitScreen.js',
  'src/screens/HabitDetailScreen.js',
  'src/screens/HabitManagementScreen.js',
  'src/screens/SettingsScreen.js',
  'src/screens/TodayScreen.js',
];

test('a press answers at one strength across the whole app', () => {
  // It used to answer at three, depending on which screen the finger was on.
  assert.match(motionTokens, /pressed: \{/);
  assert.match(motionTokens, /fade: 0\.6,/);
  assert.match(motionTokens, /surface: 0\.9,/);

  for (const path of INTERFACE_FILES) {
    const file = source(path);
    const literals = file.match(/opacity: 0\.\d+,/g) ?? [];
    assert.deepEqual(literals, [], `${path} sets a press opacity of its own`);
  }
});

test('the two kinds of pressable thing use the two named strengths', () => {
  // A word or a glyph fades; a filled pill, which is already moving, barely
  // does.
  assert.match(backButton, /opacity: motion\.pressed\.fade/);
  assert.match(todayScreen, /managePressed: \{\s*opacity: motion\.pressed\.fade/);
  assert.match(todayScreen, /settingsPressed: \{\s*opacity: motion\.pressed\.fade/);
  assert.match(todayScreen, /addRowPressed: \{\s*opacity: motion\.pressed\.fade/);
  assert.match(confirmationModal, /actionPressed: \{\s*opacity: motion\.pressed\.fade/);
  assert.match(timePicker, /actionPressed: \{\s*opacity: motion\.pressed\.fade/);

  assert.match(primaryButton, /opacity: motion\.pressed\.surface/);
  assert.match(todayScreen, /createButtonPressed: \{\s*opacity: motion\.pressed\.surface/);
});

test('an archived habit is quieter in its name, not in its affordance', () => {
  // The archived voice is one step down the text scale, and that is all of it.
  assert.match(habitRow, /nameMuted: \{\s*color: colors\.textSecondary,/);

  // The chevron is the same mark on every row. It used to be drawn in markIdle
  // when muted -- the token whose job is to be almost the background, which is
  // 1.6:1 on warm paper: an affordance you cannot see, on the one row where
  // "this still opens" is the whole message. No colour in the palette is
  // quieter than the active chevron in both themes without vanishing in one.
  assert.equal(habitRow.includes('chevronMuted'), false);
  assert.equal(habitRow.includes('colors.markIdle'), false);

  for (const [name, palette] of Object.entries(themes)) {
    const ratio = contrast(palette.markWaiting, palette.background);
    assert.ok(ratio >= 3, `${name}: chevron at ${ratio.toFixed(2)}`);
    assert.ok(
      contrast(palette.markIdle, palette.background) < 2,
      `${name}: markIdle is not a colour a control can be drawn in`
    );
  }
});

test('a habit gets the same second line wherever it is drawn', () => {
  // Today's detail line and the collection's schedule line are one
  // relationship, and it comes off the spacing scale in both.
  assert.match(habitItem, /detail: \{[\s\S]*?marginTop: spacing\.xs,/);
  assert.match(habitRow, /meta: \{[\s\S]*?marginTop: spacing\.xs,/);
});

/** The mark's drawn size, read off the component rather than restated here. */
function markSize() {
  return Number(habitItem.match(/const MARK_SIZE = (\d+);/)[1]);
}

test('the completion mark is the app-wide target, not the size of its drawing', () => {
  // The most-pressed control in the app used to be the only quiet control
  // narrower than the convention every other one is built to: a 30pt mark with
  // 16pt of padding on one side and nothing on the other.
  assert.match(habitItem, /markTarget: \{[\s\S]*?minWidth: layout\.touchTarget,/);
  assert.match(habitItem, /markTarget: \{[\s\S]*?paddingLeft: spacing\.xl,/);
  assert.ok(imports(habitItem).includes('../theme'));
  assert.match(habitItem, /import \{ layout,/);

  // Widening it did not move it. The gap between the words and the mark is
  // the same distance it always was -- it changed hands, it did not change
  // size -- so the mark still sits on the content edge the rest of the screen
  // is aligned to.
  assert.match(habitItem, /textTarget: \{[\s\S]*?paddingRight: spacing\.xs,/);
  assert.equal(spacing.xs + spacing.xl, spacing.md + spacing.lg);

  // And the target now runs out to the screen edge, which is the easiest place
  // on the display to hit and was previously dead.
  assert.equal(px(styleBlock(habitItem, 'markTarget').paddingRight), layout.screenPaddingX);
  assert.ok(spacing.xl + markSize() + layout.screenPaddingX >= layout.touchTarget);
});

test('the mark only reaches into space that belongs to nothing else', () => {
  // Rows sit directly against each other and the words sit directly against
  // the mark, so reaching on any edge but the right would silently take
  // presses from a neighbouring row or from the habit's own name. The gutter
  // is the one direction with nothing on the other side of it -- and the reach
  // is the target's own box, so there is no rectangle to get any of this
  // wrong with.
  // The prop, not the word: the comment above the target is allowed to name
  // the mechanism it deliberately does not use.
  assert.equal(habitItem.includes('hitSlop='), false);

  const mark = styleBlock(habitItem, 'markTarget');
  assert.deepEqual(
    Object.keys(mark).filter((key) => key.startsWith('margin')),
    []
  );

  // The vertical target was already past the convention on its own, which is
  // why padding is all that holds it there.
  assert.equal(px(mark.paddingVertical), spacing.lg);
  assert.ok(2 * spacing.lg + markSize() >= layout.touchTarget);
});

// ---------------------------------------------------------------------------
// The gutter beside a habit, and the Android boundary it had to cross
// ---------------------------------------------------------------------------

/**
 * One StyleSheet block, as { property: 'the source expression' }.
 *
 * Read rather than matched, so the tests below can assert what a value comes
 * out as instead of how it happens to be spelled.
 */
function styleBlock(file, name) {
  const start = file.indexOf('  ' + name + ': {');
  assert.ok(start > 0, name + ' is not a style block');
  const body = file.slice(start, file.indexOf('  },', start));

  const declarations = {};
  for (const line of body.split('\n').slice(1)) {
    const text = line.trim();
    if (!text || text.startsWith('//')) continue;
    const colon = text.indexOf(':');
    if (colon === -1) continue;
    declarations[text.slice(0, colon).trim()] = text.slice(colon + 1).replace(/,$/, '').trim();
  }
  return declarations;
}

/** A style expression, in points, evaluated against the real tokens. */
function px(expression) {
  assert.equal(typeof expression, 'string', 'no such declaration');
  return Function('layout', 'spacing', 'return (' + expression + ');')(layout, spacing);
}

test('every boundary between the screen edge and the mark is open', () => {
  // The Android bug in one line: a touch is delivered by walking down the view
  // tree, and a child is only reached if the point is inside its parent too.
  // Screen's gutter made every ancestor of a habit row stop at the content
  // edge, so a target reaching past them was never asked about the gutter.
  //
  // Each pair below opens one boundary and puts the same distance back, so the
  // chain nets to zero and nothing on screen moves.
  const scroll = styleBlock(todayScreen, 'scroll');
  const content = styleBlock(todayScreen, 'content');
  const day = styleBlock(todayScreen, 'day');
  const list = styleBlock(todayScreen, 'list');

  assert.equal(px(scroll.marginHorizontal) + px(content.paddingHorizontal), 0);
  assert.equal(px(day.marginHorizontal) + px(day.paddingHorizontal), 0);
  assert.equal(px(scroll.marginHorizontal), -layout.screenPaddingX);

  // The list is the one block that opts out and stays out: it is what carries
  // the rows, and a row is meant to be as wide as the screen.
  assert.equal(px(list.marginHorizontal), -layout.screenPaddingX);
  assert.equal('paddingHorizontal' in list, false);

  // Stated once, off the shared token, at every step.
  for (const value of [
    scroll.marginHorizontal,
    content.paddingHorizontal,
    day.marginHorizontal,
    day.paddingHorizontal,
    list.marginHorizontal,
  ]) {
    assert.ok(value.includes('layout.screenPaddingX'), value);
  }
});

test('the row is as wide as the screen and its words are not', () => {
  // What the row gives up in ancestors it takes back in padding, so the habit
  // name begins on exactly the gutter it always began on and the mark still
  // ends on it.
  const row = styleBlock(habitItem, 'row');
  const mark = styleBlock(habitItem, 'markTarget');

  assert.equal(px(row.paddingLeft), layout.screenPaddingX);
  assert.equal(px(mark.paddingRight), layout.screenPaddingX);
  assert.equal('paddingRight' in row, false);
  assert.equal('marginHorizontal' in row, false);

  // The pressed surface still stops the same distance short of the words as it
  // always did -- measured from the screen edge now, since that is where the
  // row starts.
  const surface = styleBlock(habitItem, 'surface');
  assert.equal(px(surface.left), layout.screenPaddingX - spacing.md);
  assert.equal(px(surface.right), layout.screenPaddingX - spacing.md);
  assert.equal(px(surface.left), px(surface.right));
});

test('#40 geometry came through the fix unchanged', () => {
  const mark = styleBlock(habitItem, 'markTarget');
  const text = styleBlock(habitItem, 'textTarget');

  // The convention, the mark, and the gap between the words and the mark.
  assert.equal(mark.minWidth, 'layout.touchTarget');
  assert.equal(markSize(), 30);
  assert.equal(px(text.paddingRight) + px(mark.paddingLeft), spacing.md + spacing.lg);

  // The target clears the app's convention on its own padding, before the
  // gutter is counted -- the gutter is the bonus, not the qualification.
  assert.ok(px(mark.paddingLeft) + markSize() >= layout.touchTarget);
  assert.ok(2 * px(mark.paddingVertical) + markSize() >= layout.touchTarget);
});

test('the two targets in a row still answer to different things', () => {
  // The words open the habit and the mark completes it, in that order, and
  // widening the row did not hand the whole of it to either one.
  const words = habitItem.indexOf('style={styles.textTarget}');
  const mark = habitItem.indexOf('style={styles.markTarget}');
  const open = habitItem.indexOf('onOpen(habit.id)');
  const toggle = habitItem.indexOf('onToggle(habit.id)');

  assert.ok(words > 0 && mark > words, 'the row has two targets, words first');
  assert.ok(open > words && open < mark, 'the words open the habit');
  assert.ok(toggle > mark, 'the mark completes it');

  // The row itself is not pressable: a full-width row that toggled would be
  // exactly the thing this change must not turn into.
  assert.equal(habitItem.includes('<Pressable style={styles.row}'), false);
  assert.equal((habitItem.match(/<Pressable/g) ?? []).length, 2);
});

test('a row can only be completed from its own line', () => {
  // The reach is horizontal and it is a box, so a habit's completion region is
  // exactly as tall as its row. Nothing pulls up or down into a neighbour, and
  // the list stacks rows with no overlap for one to pull into.
  for (const name of ['wrap', 'row', 'markTarget', 'textTarget']) {
    const box = styleBlock(habitItem, name);
    for (const [property, value] of Object.entries(box)) {
      if (!property.startsWith('margin')) continue;
      const vertical =
        property === 'marginTop' || property === 'marginBottom' || property === 'marginVertical';
      assert.equal(vertical && px(value) < 0, false, name + '.' + property + ' reaches into a neighbouring row');
    }
  }

  // And the list stacks them plainly: no negative vertical margin pulling one
  // row's box over the next one's.
  const list = styleBlock(todayScreen, 'list');
  assert.ok(px(list.marginTop) >= 0);
  assert.ok(px(list.marginBottom) >= 0);
});

test('micro-labels are uppercased by the style, never in the string', () => {
  // One mechanism, and a screen reader that hears "Archived" rather than
  // being handed a run of capitals to spell out.
  for (const path of INTERFACE_FILES) {
    assert.equal(source(path).includes('toUpperCase()'), false, `${path} uppercases a string`);
  }

  assert.match(managementScreen, /sectionLabel: \{[\s\S]*?textTransform: 'uppercase',/);
  assert.match(settingsScreen, /sectionLabel: \{[\s\S]*?textTransform: 'uppercase',/);
  assert.match(timePicker, /columnLabel: \{[\s\S]*?textTransform: 'uppercase',/);
});

test('nothing anywhere paints a colour the theme did not give it', () => {
  // The whole theme feature rests on this, and it is cheap to keep true.
  for (const path of INTERFACE_FILES) {
    const file = source(path);
    assert.equal(/#[0-9a-fA-F]{3,8}\b/.test(file), false, `${path} hard-codes a colour`);
    assert.equal(/rgba?\(/.test(file), false, `${path} hard-codes a colour`);
  }
});

// ---------------------------------------------------------------------------
// The record a habit builds: what Detail says as it gets older
//
// Everything on that screen is derived -- buildRhythm for the marks,
// getHabitInsight for the observation, getRhythmNote for the line under the
// grid, and a count for the sentence above it -- so the question "does this get
// more meaningful after three months?" is answerable here, without a renderer,
// by building the history and asking the same functions the screen asks.
// ---------------------------------------------------------------------------

const habitDetail = source('src/screens/HabitDetailScreen.js');
const rhythmGrid = source('src/components/RhythmGrid.js');

/** A day, as the grid draws it. Lets a test read a rhythm by date. */
function stateOn(days, date) {
  const day = days.find((item) => item.key === toDateKey(date));
  assert.ok(day, `no day for ${toDateKey(date)} in the window`);
  return day.state;
}

/** Completions for one habit on the given dates. */
function completionsOn(habitId, dates) {
  const forHabit = {};
  for (const date of dates) forHabit[toDateKey(date)] = true;
  return { [habitId]: forHabit };
}

/** Every date from `daysAgo` up to and including `end`, oldest first. */
function daysBack(end, daysAgo) {
  const dates = [];
  for (let index = daysAgo; index >= 0; index -= 1) dates.push(addDays(end, -index));
  return dates;
}

// A Sunday, so a four-week window is exactly four whole rows ending today.
const TODAY = new Date(2026, 8, 6);

test('zero history: a brand-new habit draws no marks and claims nothing', () => {
  const subject = habit({ createdAt: TODAY.toISOString() });
  const days = buildRhythm(subject, {}, TODAY);

  assert.equal(countCompleted(days), 0);
  // Every day before it existed is blank rather than an unfilled obligation.
  assert.equal(days.filter((day) => day.state === 'before').length, RHYTHM_WEEKS * 7 - 1);
  assert.equal(stateOn(days, TODAY), 'scheduled');

  // The count line points forward, and the grid's own line stays silent.
  assert.equal(getRhythmNote(0, 0), null);
  assert.equal(getHabitInsight(subject, {}, TODAY), null);
  assert.match(habitDetail, /Your first one/);
});

test('one completion: the day is marked and the copy is singular', () => {
  const subject = habit({ createdAt: TODAY.toISOString() });
  const days = buildRhythm(subject, completionsOn(subject.id, [TODAY]), TODAY);

  assert.equal(countCompleted(days), 1);
  assert.equal(stateOn(days, TODAY), 'completed');
  assert.equal(getRhythmNote(1, 1), 'One is enough to begin.');
  // "1 time", never "1 times".
  assert.match(habitDetail, /lifetimeCount === 1 \? 'time' : 'times'/);
});

test('several completions: each marked day is counted once', () => {
  const subject = habit({ createdAt: addDays(TODAY, -13).toISOString() });
  const dates = [0, 2, 4, 7, 9].map((ago) => addDays(TODAY, -ago));
  const days = buildRhythm(subject, completionsOn(subject.id, dates), TODAY);

  assert.equal(countCompleted(days), 5);
  for (const date of dates) assert.equal(stateOn(days, date), 'completed');
  assert.equal(getRhythmNote(5, 5), '5 in the last four weeks');
});

test('a scheduled day that was completed reads as completed', () => {
  const subject = habit({
    frequency: 'selected',
    days: ['mon'],
    createdAt: addDays(TODAY, -20).toISOString(),
  });
  const monday = addDays(TODAY, -6);

  assert.equal(stateOn(buildRhythm(subject, completionsOn(subject.id, [monday]), TODAY), monday), 'completed');
});

test('a scheduled day that was missed reads as scheduled, and stores nothing', () => {
  const subject = habit({
    frequency: 'selected',
    days: ['mon'],
    createdAt: addDays(TODAY, -20).toISOString(),
  });
  const completions = {};
  const days = buildRhythm(subject, completions, TODAY);

  assert.equal(stateOn(days, addDays(TODAY, -6)), 'scheduled');
  // A miss is the absence of a record, never a record of an absence.
  assert.deepEqual(completions, {});
});

test('an unscheduled day is neither a miss nor an achievement', () => {
  const subject = habit({
    frequency: 'selected',
    days: ['mon'],
    createdAt: addDays(TODAY, -20).toISOString(),
  });
  const days = buildRhythm(subject, {}, TODAY);

  // The Tuesday after that Monday was never this habit's day.
  assert.equal(stateOn(days, addDays(TODAY, -5)), 'unscheduled');
  assert.equal(countCompleted(days), 0);
});

test('a completion outlives the schedule that produced it', () => {
  // Built as Monday/Wednesday/Friday, later switched to Tuesdays. Every day the
  // user actually showed up for still reads as completed: what happened is
  // never re-decided by what the habit has since become.
  const created = addDays(TODAY, -20).toISOString();
  const asBuilt = habit({ frequency: 'selected', days: ['mon', 'wed', 'fri'], createdAt: created });
  const shownUp = [6, 4, 2].map((ago) => addDays(TODAY, -ago));
  const completions = completionsOn(asBuilt.id, shownUp);

  const days = buildRhythm({ ...asBuilt, days: ['tue'] }, completions, TODAY);

  for (const date of shownUp) assert.equal(stateOn(days, date), 'completed');
  assert.equal(countCompleted(days), 3);
});

test('the window stays four weeks whatever the history behind it', () => {
  // Six months in, the grid is still the same four rows. Longevity is carried
  // by the count and the observation, not by growing the record into a wall.
  const subject = habit({ createdAt: addDays(TODAY, -182).toISOString() });
  const days = buildRhythm(subject, completionsOn(subject.id, daysBack(TODAY, 182)), TODAY);

  assert.equal(days.length, RHYTHM_WEEKS * 7);
  assert.equal(toWeeks(days).length, RHYTHM_WEEKS);
  assert.equal(countCompleted(days), RHYTHM_WEEKS * 7);
});

test('long history: the lifetime count is the thing that grows', () => {
  const subject = habit({ createdAt: addDays(TODAY, -182).toISOString() });
  const completions = completionsOn(subject.id, daysBack(TODAY, 182));

  assert.equal(completedDatesFor(completions, subject.id).length, 183);
  // The sentence reads the whole record; the note reads only the window.
  assert.match(habitDetail, /lifetimeCount = completedDatesFor\(completions, habit\.id\)\.length/);
  assert.match(habitDetail, /recentCount = countCompleted\(buildRhythm\(/);
});

test('an archived habit keeps the record it built, however long ago', () => {
  // The bug this pins: a window anchored to today drains an archived habit's
  // grid a row a week, so a habit someone kept for months eventually opens onto
  // weekday letters over an empty field. The window ends where the habit ended.
  const archivedAt = addDays(TODAY, -120);
  const subject = habit({
    createdAt: addDays(TODAY, -204).toISOString(),
    archivedAt: archivedAt.toISOString(),
  });
  const days = buildRhythm(subject, completionsOn(subject.id, daysBack(archivedAt, 83)), TODAY);

  assert.ok(countCompleted(days) > 0, 'an archived record still draws its marks');
  assert.equal(stateOn(days, archivedAt), 'completed');
  // The day after it was put away is outside its life, and blank.
  assert.equal(stateOn(days, addDays(archivedAt, 1)), 'after');
});

test('an archived habit is not marked with a today it was no longer part of', () => {
  const subject = habit({
    createdAt: addDays(TODAY, -40).toISOString(),
    archivedAt: addDays(TODAY, -3).toISOString(),
  });

  assert.equal(buildRhythm(subject, {}, TODAY).some((day) => day.isToday), false);
});

test('an active habit still marks today', () => {
  const subject = habit({ createdAt: addDays(TODAY, -40).toISOString() });
  const marked = buildRhythm(subject, {}, TODAY).filter((day) => day.isToday);

  assert.equal(marked.length, 1);
  assert.equal(marked[0].key, toDateKey(TODAY));
});

test('an archived habit collects no new missed days after it was put away', () => {
  const archivedKey = toDateKey(addDays(TODAY, -10));
  const subject = habit({
    createdAt: addDays(TODAY, -40).toISOString(),
    archivedAt: addDays(TODAY, -10).toISOString(),
  });

  for (const day of buildRhythm(subject, {}, TODAY)) {
    if (day.key > archivedKey) assert.equal(day.state, 'after');
  }
});

test("an archived habit's note describes its own last weeks, not these ones", () => {
  assert.equal(getRhythmNote(60, 18, { archived: true }), '18 in its final four weeks');
  // The encouragements meant for someone still going are withheld.
  assert.equal(getRhythmNote(1, 1, { archived: true }), '1 in its final four weeks');
  assert.equal(getRhythmNote(0, 0, { archived: true }), null);
  assert.match(habitDetail, /getRhythmNote\(lifetimeCount, recentCount, \{ archived: isArchived \}\)/);
});

test('restoring a habit returns the record to the present', () => {
  const created = addDays(TODAY, -40).toISOString();
  const completions = completionsOn('habit-1', [addDays(TODAY, -30), addDays(TODAY, -29)]);
  const archived = habit({ createdAt: created, archivedAt: addDays(TODAY, -28).toISOString() });

  // Nothing it built is lost while it is away...
  assert.equal(countCompleted(buildRhythm(archived, completions, TODAY)), 2);

  // ...and the window follows the habit back to today when it is picked up.
  const restored = restoreOn([archived], 'habit-1')[0];
  const days = buildRhythm(restored, completions, TODAY);

  assert.equal(days.some((day) => day.isToday), true);
  assert.equal(stateOn(days, TODAY), 'scheduled');
  assert.equal(completedDatesFor(completions, 'habit-1').length, 2);
});

test('no insight is invented from too little history', () => {
  const subject = habit({ createdAt: addDays(TODAY, -6).toISOString() });

  // Seven completions in one week: real, and not yet anything worth naming.
  assert.equal(getHabitInsight(subject, completionsOn(subject.id, daysBack(TODAY, 6)), TODAY), null);
});

test('a rhythm is named only once it has crossed weeks', () => {
  const subject = habit({ createdAt: addDays(TODAY, -20).toISOString() });

  assert.deepEqual(getHabitInsight(subject, completionsOn(subject.id, daysBack(TODAY, 20)), TODAY), {
    kind: 'rhythm',
    text: 'This is becoming part of your week.',
  });
});

/**
 * One completion a week, counting back from today, oldest last.
 *
 * Every date lands on the same weekday, so the weekday observation can never
 * answer first and the rung under test is the one being read.
 */
const weeklyBack = (count, end = TODAY) =>
  Array.from({ length: count }, (_, index) => addDays(end, -7 * index));

test('the observation matures once the habit is months old', () => {
  // The sentence a habit outgrows: "becoming" is right in the second month and
  // wrong in the sixth, and a screen that cannot tell them apart says the same
  // beginner's line forever.
  const subject = habit({ createdAt: addDays(TODAY, -182).toISOString() });

  assert.deepEqual(getHabitInsight(subject, completionsOn(subject.id, daysBack(TODAY, 182)), TODAY), {
    kind: 'established',
    text: 'This has been part of your week for months.',
  });
});

test('"for months" is arithmetic rather than a flourish', () => {
  // Twelve weeks of history still says "becoming"; the thirteenth is where the
  // span cannot be less than a quarter of a year however the days fall.
  const subject = habit({ createdAt: addDays(TODAY, -365).toISOString() });
  const weeklyFor = (count) => Array.from({ length: count }, (_, index) => addDays(TODAY, -7 * index));

  assert.equal(getHabitInsight(subject, completionsOn(subject.id, weeklyFor(12)), TODAY).kind, 'rhythm');
  assert.equal(getHabitInsight(subject, completionsOn(subject.id, weeklyFor(13)), TODAY).kind, 'established');
});

test('the observation matures again once the habit is a year old', () => {
  // "For months" undersells a habit in its second year by a factor of four, so
  // the ladder has a third rung for the same reason it has a second one.
  const subject = habit({ createdAt: addDays(TODAY, -500).toISOString() });

  assert.deepEqual(
    getHabitInsight(subject, completionsOn(subject.id, weeklyBack(54)), TODAY),
    { kind: 'year', text: 'This has been part of your week for a year.' }
  );
});

test('"a year" is arithmetic rather than a round number', () => {
  // Fifty-two is the tempting constant and it is short: fifty-two week-starts
  // put only fifty-one weeks between the first and the last, which is 357 days.
  // Fifty-four guarantees 371, so the sentence cannot be false however the
  // completions fall inside it.
  const subject = habit({ createdAt: addDays(TODAY, -500).toISOString() });
  const kindAt = (weeks) =>
    getHabitInsight(subject, completionsOn(subject.id, weeklyBack(weeks)), TODAY).kind;

  assert.equal(kindAt(52), 'established');
  assert.equal(kindAt(53), 'established');
  assert.equal(kindAt(54), 'year');

  // The span the winning threshold actually guarantees, stated as a fact rather
  // than as a comment: 53 whole weeks between the first week-start and the last.
  const dates = weeklyBack(54);
  const spanInDays = Math.round((dates[0] - dates[dates.length - 1]) / 86400000);
  assert.equal(spanInDays, 53 * 7);
  assert.ok(spanInDays > 365, 'the claim outlives the year it names');
});

test('the year rung is spoken about in the past tense once retired', () => {
  const createdAt = addDays(TODAY, -500).toISOString();
  const completions = completionsOn('habit-1', weeklyBack(54));

  const archived = habit({ createdAt, archivedAt: addDays(TODAY, -1).toISOString() });

  assert.deepEqual(getHabitInsight(archived, completions, TODAY), {
    kind: 'year',
    text: 'This was part of your week for a year.',
  });
});

test('the year rung is still one sentence with no number in it', () => {
  const subject = habit({ createdAt: addDays(TODAY, -500).toISOString() });
  const insight = getHabitInsight(subject, completionsOn(subject.id, weeklyBack(54)), TODAY);

  assert.equal(/d/.test(insight.text), false, 'the observation stays a sentence');
  assert.equal(/%|streak/i.test(insight.text), false);
});

test('the rungs below the year one are untouched by it', () => {
  const subject = habit({ createdAt: addDays(TODAY, -500).toISOString() });
  const kindAt = (weeks) =>
    getHabitInsight(subject, completionsOn(subject.id, weeklyBack(weeks)), TODAY)?.kind ?? null;

  // Seven weekly marks is seven completions, still under the eight the first
  // rung asks for -- the two bars are independent and both still hold.
  assert.equal(kindAt(2), null);
  assert.equal(kindAt(7), null);
  assert.equal(kindAt(8), 'rhythm');
  assert.equal(kindAt(13), 'established');
});

test('a retired habit is spoken about in the past tense', () => {
  const created = addDays(TODAY, -200).toISOString();
  const completions = completionsOn('habit-1', daysBack(addDays(TODAY, -10), 182));

  const active = habit({ createdAt: created });
  const archived = habit({ createdAt: created, archivedAt: addDays(TODAY, -10).toISOString() });

  assert.equal(
    getHabitInsight(active, completions, TODAY).text,
    'This has been part of your week for months.'
  );
  assert.equal(
    getHabitInsight(archived, completions, TODAY).text,
    'This was part of your week for months.'
  );
});

test('an even spread of weekdays names nobody', () => {
  const subject = habit({ createdAt: addDays(TODAY, -60).toISOString() });
  const evenly = [1, 2, 8, 9, 15, 16].map((ago) => addDays(TODAY, -ago));

  assert.notEqual(getHabitInsight(subject, completionsOn(subject.id, evenly), TODAY)?.kind, 'weekday');
});

test('a weekday is named only when it is genuinely ahead', () => {
  const subject = habit({ createdAt: addDays(TODAY, -60).toISOString() });
  // Four Mondays against one Wednesday and one Friday. TODAY is a Sunday, so
  // these offsets are the weekdays they say they are.
  const skewed = [6, 13, 20, 27].map((ago) => addDays(TODAY, -ago));
  const spread = [25, 23].map((ago) => addDays(TODAY, -ago));

  const insight = getHabitInsight(subject, completionsOn(subject.id, [...skewed, ...spread]), TODAY);

  assert.equal(insight.kind, 'weekday');
  assert.match(insight.text, /^You've shown up most often on \w+s\.$/);
});

test('only ever one observation, and never a number inside it', () => {
  const subject = habit({ createdAt: addDays(TODAY, -182).toISOString() });
  const insight = getHabitInsight(subject, completionsOn(subject.id, daysBack(TODAY, 182)), TODAY);

  assert.equal(typeof insight.text, 'string');
  assert.equal(/\d/.test(insight.text), false, 'the observation stays a sentence');
  // One slot on the screen, not a stack of them.
  assert.equal((habitDetail.match(/insight\.text/g) ?? []).length, 1);
});

test('the duration sits between the recognition and the record', () => {
  // The locked reading order, with the new line in it: identity, how much, how
  // long, the evidence, and then the one interpretation of it.
  let cursor = -1;

  for (const marker of ['{habit.name}', 'styles.recognition', 'styles.span', '<RhythmGrid', 'styles.insight']) {
    const at = habitDetail.indexOf(marker);
    assert.ok(at > cursor, `${marker} is out of reading order`);
    cursor = at;
  }
});

test('the duration line is absent rather than empty when there is nothing to say', () => {
  // Rendered conditionally, exactly as the observation below it is. A young
  // habit gets no line, not a line saying it is young.
  assert.match(habitDetail, /\{spanNote \? <Text style=\{styles\.span\}>\{spanNote\}<\/Text> : null\}/);
});

test('the screen words the duration through the two helpers and neither guesses', () => {
  const logic = withoutComments(habitDetail);

  // The derivation, then the wording, in that order and with no month name,
  // no year arithmetic and no date maths of the screen's own in between.
  assert.match(logic, /getSpanNote\(getHabitSpan\(habit, completions, now\)/);
  assert.match(logic, /archived: isArchived/);
  assert.match(logic, /today: now/);

  for (const forbidden of ['getFullYear', 'getMonth(', 'MONTHS', 'slice(0, 7)']) {
    assert.equal(logic.includes(forbidden), false, `HabitDetail re-implements ${forbidden}`);
  }
});

test('the duration is set quieter than the count it belongs to', () => {
  // Context for the sentence above it, not a second headline. Same register as
  // the archive notice and the line under the grid; its contrast pairing is
  // already covered by "secondary text" in the palette assertions above.
  assert.match(habitDetail, /span: \{\s*\.\.\.typography\.bodySmall,\s*color: colors\.textSecondary,/);
  assert.equal(/span: \{[^}]*typography\.recognition/.test(habitDetail), false);
});

test('a habit too young to have a duration renders no duration', () => {
  // End to end through exactly what the screen calls: three weekly marks is
  // under the evidence bar, so both halves stay silent and nothing is drawn.
  const subject = habit({ id: 'a', createdAt: addDays(TODAY, -500).toISOString() });
  const completions = completionsOn('a', weeklyBack(3));

  assert.equal(getHabitSpan(subject, completions, TODAY), null);
  assert.equal(getSpanNote(getHabitSpan(subject, completions, TODAY), { today: TODAY }), null);
});

test('a habit with a real record renders a duration beside its count', () => {
  const subject = habit({ id: 'a', createdAt: addDays(TODAY, -500).toISOString() });
  const completions = completionsOn('a', weeklyBack(20));

  // The two halves of one thought, as the screen assembles them.
  assert.equal(completedDatesFor(completions, 'a').length, 20);
  assert.equal(
    getSpanNote(getHabitSpan(subject, completions, TODAY), { archived: false, today: TODAY }),
    "You've been doing this since April."
  );
});

test('a retired habit says its duration in the past, like everything else there', () => {
  const archived = habit({
    id: 'a',
    createdAt: addDays(TODAY, -500).toISOString(),
    archivedAt: addDays(TODAY, -10).toISOString(),
  });
  const completions = completionsOn('a', weeklyBack(20, addDays(TODAY, -11)));

  assert.equal(
    getSpanNote(getHabitSpan(archived, completions, TODAY), { archived: true, today: TODAY }),
    'You did this from April to August.'
  );
});

test('the record is never described as a score', () => {
  // No percentage, no streak, no target -- in the copy or in the logic.
  for (const file of [habitDetail, rhythmGrid, source('src/lib/insights.js')]) {
    assert.equal(/%|streak/i.test(quoted(file).join(' ')), false);
  }

  assert.equal(/%/.test(withoutComments(source('src/lib/insights.js'))), false);
});

test('reading order is identity, then recognition, then record, then reflection', () => {
  // The evidence outranks the interpretation of it.
  let cursor = -1;

  for (const marker of ['{habit.name}', 'styles.recognition', '<RhythmGrid', 'styles.insight']) {
    const at = habitDetail.indexOf(marker);
    assert.ok(at > cursor, `${marker} is out of reading order`);
    cursor = at;
  }
});

test('a long habit name wraps rather than being truncated or shrunk', () => {
  // "Read at least ten pages of a non-fiction book before going to sleep" has
  // to fit by wrapping. Nothing here clips a name or measures one down.
  assert.equal(/numberOfLines|ellipsizeMode|adjustsFontSizeToFit/.test(habitDetail), false);
  // And the title sits below the header row, so it cannot reach the back button.
  assert.ok(habitDetail.indexOf('styles.header') < habitDetail.indexOf('styles.name'));
});

test('the screen reads the history rather than re-deriving it', () => {
  // No date arithmetic of its own: every question it asks about the past goes
  // through the pure functions asserted above.
  const logic = withoutComments(habitDetail);

  for (const forbidden of ['getDay(', 'setDate(', 'startOfWeek', 'matchesSchedule']) {
    assert.equal(logic.includes(forbidden), false, `HabitDetail re-implements ${forbidden}`);
  }
});

// ---------------------------------------------------------------------------
// What was true then: schedule history and the archive lifecycle
//
// Everything below is about one promise -- that changing a habit today cannot
// change what the app says about last month. The two records that make it
// keepable are scheduleHistory and activePeriods, and lib/history.js is the
// only place either is interpreted, so proving it here proves it for the
// rhythm, the insights and recovery alike.
//
// THE BOUNDARY RULE under test throughout: intervals are half-open on local
// date keys, [from, to). A boundary date belongs to the period it begins. So
// the creation date is the first active day, an effectiveFrom is the first day
// its schedule applies, the archive date is the first INACTIVE day, and the
// restore date is the first active day again.
//
// Dates are fixed and constructed from local numeric parts, never from the
// clock and never from an ISO string the spec would parse as UTC.
// ---------------------------------------------------------------------------

const on = (year, month, day) => new Date(year, month - 1, day);
const keyOn = (year, month, day) => toDateKey(on(year, month, day));
/** A stored timestamp for that local calendar day, as the store writes one. */
const stampOn = (year, month, day, hour = 9) =>
  new Date(year, month - 1, day, hour, 0, 0, 0).toISOString();

// ---------------------------------------------------------------------------
// Schedule history
// ---------------------------------------------------------------------------

test('a new habit schedules from the day it was created, and not before', () => {
  const subject = habit({
    createdAt: stampOn(2026, 1, 5),
    frequency: 'selected',
    days: ['mon', 'wed', 'fri'],
  });

  assert.deepEqual(subject.scheduleHistory, [
    { effectiveFrom: '2026-01-05', frequency: 'selected', days: ['mon', 'wed', 'fri'] },
  ]);
  assert.deepEqual(subject.activePeriods, [{ from: '2026-01-05', to: null }]);
});

test('the creation date itself is the first active day', () => {
  const subject = habit({ createdAt: stampOn(2026, 1, 5) });

  assert.equal(isActiveOn(subject, on(2026, 1, 5)), true);
  assert.equal(isActiveOn(subject, on(2026, 1, 4)), false);
});

test('a date before the habit existed is inactive, and never a missed day', () => {
  const subject = habit({ createdAt: stampOn(2026, 1, 10) });

  for (const day of [1, 5, 9]) {
    assert.equal(isActiveOn(subject, on(2026, 1, day)), false);
    assert.equal(wasScheduledOn(subject, on(2026, 1, day)), false);
    assert.equal(inactiveReasonOn(subject, on(2026, 1, day)), 'before');
  }
});

test('a daily schedule covers every day it is in force for', () => {
  const subject = habit({ createdAt: stampOn(2026, 1, 5), frequency: 'daily' });

  for (const day of [5, 6, 7, 8, 9, 10, 11]) {
    assert.equal(wasScheduledOn(subject, on(2026, 1, day)), true);
  }
});

test('a selected-days schedule covers only the weekdays it names', () => {
  // 2026-01-05 is a Monday, so this week runs Mon 5 to Sun 11.
  const subject = habit({
    createdAt: stampOn(2026, 1, 5),
    frequency: 'selected',
    days: ['mon', 'wed', 'fri'],
  });

  assert.deepEqual(
    [5, 6, 7, 8, 9, 10, 11].map((day) => wasScheduledOn(subject, on(2026, 1, day))),
    [true, false, true, false, true, false, false]
  );
});

test('the schedule in force is looked up by date, not read off the habit', () => {
  const created = habit({
    createdAt: stampOn(2026, 1, 1),
    frequency: 'selected',
    days: ['mon', 'wed', 'fri'],
  });
  const subject = {
    ...created,
    frequency: 'daily',
    days: [],
    scheduleHistory: withScheduleVersion(created, { frequency: 'daily', days: [] }, '2026-03-10'),
  };

  assert.equal(scheduleOn(subject, on(2026, 2, 1)).frequency, 'selected');
  assert.deepEqual(scheduleOn(subject, on(2026, 2, 1)).days, ['mon', 'wed', 'fri']);
  assert.equal(scheduleOn(subject, on(2026, 4, 1)).frequency, 'daily');
});

test('a date before a schedule change keeps the schedule it actually had', () => {
  // Mon/Wed/Fri until March 10, when it becomes daily. March 3 is a Tuesday.
  const created = habit({
    createdAt: stampOn(2026, 1, 1),
    frequency: 'selected',
    days: ['mon', 'wed', 'fri'],
  });
  const subject = {
    ...created,
    frequency: 'daily',
    days: [],
    scheduleHistory: withScheduleVersion(created, { frequency: 'daily', days: [] }, '2026-03-10'),
  };

  // The Tuesday nobody ever owed.
  assert.equal(wasScheduledOn(subject, on(2026, 3, 3)), false);
  // The Wednesday they did.
  assert.equal(wasScheduledOn(subject, on(2026, 3, 4)), true);
});

test('the change takes effect on its own date, and not the day before', () => {
  const created = habit({
    createdAt: stampOn(2026, 1, 1),
    frequency: 'selected',
    days: ['mon'],
  });
  const subject = {
    ...created,
    scheduleHistory: withScheduleVersion(created, { frequency: 'daily', days: [] }, '2026-03-10'),
  };

  // 2026-03-09 is a Monday and 2026-03-10 a Tuesday, so the boundary is the
  // only thing that can make the Tuesday scheduled.
  assert.equal(wasScheduledOn(subject, on(2026, 3, 9)), true);
  assert.equal(wasScheduledOn(subject, on(2026, 3, 10)), true);
  // The Tuesday a week earlier was not covered by the old Monday-only schedule.
  assert.equal(wasScheduledOn(subject, on(2026, 3, 3)), false);
});

test('a date after a schedule change uses the new schedule', () => {
  const created = habit({ createdAt: stampOn(2026, 1, 1), frequency: 'daily' });
  const subject = {
    ...created,
    scheduleHistory: withScheduleVersion(
      created,
      { frequency: 'selected', days: ['mon'] },
      '2026-03-10'
    ),
  };

  // 2026-03-17 is a Tuesday: daily once, Monday-only now.
  assert.equal(wasScheduledOn(subject, on(2026, 3, 17)), false);
  assert.equal(wasScheduledOn(subject, on(2026, 3, 16)), true);
});

test('several edits on one day collapse to the last one', () => {
  // 10:00 Mon/Wed/Fri, 14:00 daily, 18:00 Monday only.
  const created = habit({
    createdAt: stampOn(2026, 1, 1),
    frequency: 'selected',
    days: ['mon', 'wed', 'fri'],
  });

  let history = withScheduleVersion(created, { frequency: 'daily', days: [] }, '2026-03-10');
  history = withScheduleVersion(
    { scheduleHistory: history },
    { frequency: 'selected', days: ['mon'] },
    '2026-03-10'
  );

  // One entry for that day, not three, and it is the one they settled on.
  assert.equal(history.filter((version) => version.effectiveFrom === '2026-03-10').length, 1);
  assert.deepEqual(history, [
    { effectiveFrom: '2026-01-01', frequency: 'selected', days: ['mon', 'wed', 'fri'] },
    { effectiveFrom: '2026-03-10', frequency: 'selected', days: ['mon'] },
  ]);
});

test('a same-day edit that lands back where it started writes nothing', () => {
  const created = habit({ createdAt: stampOn(2026, 1, 1), frequency: 'daily' });

  let history = withScheduleVersion(
    created,
    { frequency: 'selected', days: ['mon'] },
    '2026-03-10'
  );
  history = withScheduleVersion(
    { scheduleHistory: history },
    { frequency: 'daily', days: [] },
    '2026-03-10'
  );

  assert.deepEqual(history, created.scheduleHistory);
});

test('an edit that changes nothing about the rhythm adds no version', () => {
  // Renaming a habit runs through the same writer. History records changes of
  // rhythm, and a rename is not one.
  const created = habit({
    createdAt: stampOn(2026, 1, 1),
    frequency: 'selected',
    days: ['mon', 'wed'],
  });

  const history = withScheduleVersion(
    created,
    { frequency: 'selected', days: ['wed', 'mon'] },
    '2026-03-10'
  );

  assert.deepEqual(history, created.scheduleHistory);
});

test('multiple schedule changes each govern their own stretch', () => {
  const created = habit({ createdAt: stampOn(2026, 1, 1), frequency: 'daily' });

  let history = withScheduleVersion(
    created,
    { frequency: 'selected', days: ['mon'] },
    '2026-02-01'
  );
  history = withScheduleVersion(
    { scheduleHistory: history },
    { frequency: 'selected', days: ['sat'] },
    '2026-04-01'
  );
  const subject = { ...created, scheduleHistory: history };

  // 2026-01-06, 2026-02-03 and 2026-04-07 are all Tuesdays.
  assert.equal(wasScheduledOn(subject, on(2026, 1, 6)), true);
  assert.equal(wasScheduledOn(subject, on(2026, 2, 3)), false);
  // 2026-02-02 and 2026-04-06 are Mondays; only the middle stretch wants them.
  assert.equal(wasScheduledOn(subject, on(2026, 2, 2)), true);
  assert.equal(wasScheduledOn(subject, on(2026, 4, 6)), false);
  // 2026-04-04 is a Saturday, wanted only by the last stretch.
  assert.equal(wasScheduledOn(subject, on(2026, 4, 4)), true);
});

test('the schedule lookup does not depend on the order entries are stored in', () => {
  const created = habit({ createdAt: stampOn(2026, 1, 1), frequency: 'daily' });
  const history = withScheduleVersion(
    created,
    { frequency: 'selected', days: ['mon'] },
    '2026-02-01'
  );

  const forwards = { ...created, scheduleHistory: history };
  const backwards = { ...created, scheduleHistory: [...history].reverse() };

  for (const day of [10, 20]) {
    assert.equal(
      wasScheduledOn(forwards, on(2026, 2, day)),
      wasScheduledOn(backwards, on(2026, 2, day))
    );
    assert.deepEqual(scheduleOn(forwards, on(2026, 2, day)), scheduleOn(backwards, on(2026, 2, day)));
  }
});

// ---------------------------------------------------------------------------
// The archive lifecycle
// ---------------------------------------------------------------------------

test('a habit is active on every day up to the one it was put down on', () => {
  const [archived] = archiveHabitIn(
    [habit({ id: 'a', createdAt: stampOn(2026, 1, 1) })],
    'a',
    stampOn(2026, 3, 15)
  );

  assert.equal(isActiveOn(archived, on(2026, 3, 13)), true);
  assert.equal(isActiveOn(archived, on(2026, 3, 14)), true);
});

test('the archive date itself is the first inactive day', () => {
  // The boundary rule, stated as an assertion: [from, to), so `to` is out.
  const [archived] = archiveHabitIn(
    [habit({ id: 'a', createdAt: stampOn(2026, 1, 1) })],
    'a',
    stampOn(2026, 3, 15)
  );

  assert.equal(isActiveOn(archived, on(2026, 3, 15)), false);
  assert.equal(wasScheduledOn(archived, on(2026, 3, 15)), false);
});

test('every day of an archived stretch is inactive, not missed', () => {
  const [archived] = archiveHabitIn(
    [habit({ id: 'a', createdAt: stampOn(2026, 1, 1) })],
    'a',
    stampOn(2026, 3, 15)
  );
  const [restored] = restoreOn([archived], 'a', stampOn(2026, 6, 20));

  for (const [month, day] of [[3, 15], [3, 31], [4, 15], [5, 1], [6, 19]]) {
    assert.equal(isActiveOn(restored, on(2026, month, day)), false);
    assert.equal(wasScheduledOn(restored, on(2026, month, day)), false);
    assert.equal(inactiveReasonOn(restored, on(2026, month, day)), 'inactive');
  }
});

test('the restore date is the first active day again', () => {
  const [archived] = archiveHabitIn(
    [habit({ id: 'a', createdAt: stampOn(2026, 1, 1) })],
    'a',
    stampOn(2026, 3, 15)
  );
  const [restored] = restoreOn([archived], 'a', stampOn(2026, 6, 20));

  assert.equal(isActiveOn(restored, on(2026, 6, 19)), false);
  assert.equal(isActiveOn(restored, on(2026, 6, 20)), true);
  assert.equal(isActiveOn(restored, on(2026, 6, 21)), true);
});

test('the worked example, end to end', () => {
  // Created Jan 1, archived Mar 15, restored Jun 20:
  //   Jan 1  - Mar 14   active
  //   Mar 15 - Jun 19   inactive
  //   Jun 20 - onwards  active
  const [archived] = archiveHabitIn(
    [habit({ id: 'a', createdAt: stampOn(2026, 1, 1) })],
    'a',
    stampOn(2026, 3, 15)
  );
  const [restored] = restoreOn([archived], 'a', stampOn(2026, 6, 20));

  assert.deepEqual(restored.activePeriods, [
    { from: '2026-01-01', to: '2026-03-15' },
    { from: '2026-06-20', to: null },
  ]);
});

test('several archive and restore cycles each keep their own gap', () => {
  let habits = [habit({ id: 'a', createdAt: stampOn(2026, 1, 1) })];

  habits = archiveHabitIn(habits, 'a', stampOn(2026, 2, 1));
  habits = restoreOn(habits, 'a', stampOn(2026, 3, 1));
  habits = archiveHabitIn(habits, 'a', stampOn(2026, 4, 1));
  habits = restoreOn(habits, 'a', stampOn(2026, 5, 1));

  assert.deepEqual(habits[0].activePeriods, [
    { from: '2026-01-01', to: '2026-02-01' },
    { from: '2026-03-01', to: '2026-04-01' },
    { from: '2026-05-01', to: null },
  ]);

  // Both gaps stay gaps, and both live stretches stay live.
  assert.equal(isActiveOn(habits[0], on(2026, 1, 15)), true);
  assert.equal(isActiveOn(habits[0], on(2026, 2, 15)), false);
  assert.equal(isActiveOn(habits[0], on(2026, 3, 15)), true);
  assert.equal(isActiveOn(habits[0], on(2026, 4, 15)), false);
  assert.equal(isActiveOn(habits[0], on(2026, 5, 15)), true);
});

test('restoring preserves the schedule history and every earlier period', () => {
  const created = habit({
    id: 'a',
    createdAt: stampOn(2026, 1, 1),
    frequency: 'selected',
    days: ['mon', 'wed'],
  });
  const [archived] = archiveHabitIn([created], 'a', stampOn(2026, 3, 15));
  const [restored] = restoreOn([archived], 'a', stampOn(2026, 6, 20));

  assert.equal(restored.id, 'a');
  assert.equal(restored.createdAt, created.createdAt);
  assert.equal(restored.frequency, 'selected');
  assert.deepEqual(restored.days, ['mon', 'wed']);
  assert.deepEqual(restored.scheduleHistory, created.scheduleHistory);
  assert.deepEqual(restored.activePeriods[0], { from: '2026-01-01', to: '2026-03-15' });
});

test('an archived habit reports the last day it was actually running', () => {
  const [archived] = archiveHabitIn(
    [habit({ id: 'a', createdAt: stampOn(2026, 1, 1) })],
    'a',
    stampOn(2026, 3, 15)
  );

  assert.equal(hasOpenPeriod(archived), false);
  assert.equal(lastActiveDayKey(archived), '2026-03-14');
});

test('a running habit has no last day', () => {
  const subject = habit({ createdAt: stampOn(2026, 1, 1) });

  assert.equal(hasOpenPeriod(subject), true);
  assert.equal(lastActiveDayKey(subject), null);
});

test('a habit created and put down the same day records no lived stretch', () => {
  const [archived] = archiveHabitIn(
    [habit({ id: 'a', createdAt: stampOn(2026, 1, 5) })],
    'a',
    stampOn(2026, 1, 5, 18)
  );

  // [Jan 5, Jan 5) is no days at all, and a record of no days is not a record.
  assert.deepEqual(archived.activePeriods, []);
  assert.equal(isActiveOn(archived, on(2026, 1, 5)), false);
});

// ---------------------------------------------------------------------------
// Where a stretch began: firstActiveDayKey and currentPeriodStartKey
//
// Two questions that only agree for a habit that was never put down. The first
// is where the whole record starts; the second is where the stretch the habit
// is living in now starts, which is the one that describes what the user is
// doing today. Both read activePeriods and nothing else -- no createdAt, no
// completions, no clock -- so an unknown start stays unknown.
// ---------------------------------------------------------------------------

/** A habit with its periods stated outright, for histories the app cannot reach. */
const withPeriods = (activePeriods) => habit({ activePeriods });

test('one open period: both readers name the day it began', () => {
  const subject = withPeriods([{ from: '2026-01-10', to: null }]);

  assert.equal(firstActiveDayKey(subject), '2026-01-10');
  assert.equal(currentPeriodStartKey(subject), '2026-01-10');
});

test('the first day is the earliest period, whatever came after it', () => {
  const subject = withPeriods([
    { from: '2026-01-10', to: '2026-02-01' },
    { from: '2026-03-05', to: null },
  ]);

  assert.equal(firstActiveDayKey(subject), '2026-01-10');
});

test('the earliest period wins however the periods are ordered', () => {
  // The store keeps them sorted; the reader does not rely on it.
  const subject = withPeriods([
    { from: '2026-03-05', to: null },
    { from: '2026-01-10', to: '2026-02-01' },
  ]);

  assert.equal(firstActiveDayKey(subject), '2026-01-10');
  assert.equal(currentPeriodStartKey(subject), '2026-03-05');
});

test('an unbounded legacy period has no first day to report', () => {
  // What the v3 migration writes for a habit whose creation date was lost.
  const subject = withPeriods([{ from: null, to: null }]);

  assert.equal(firstActiveDayKey(subject), null);
  assert.equal(currentPeriodStartKey(subject), null);
});

test('an unbounded start makes the beginning unknown even beside a dated one', () => {
  const subject = withPeriods([
    { from: null, to: '2026-02-01' },
    { from: '2026-03-05', to: null },
  ]);

  // Nothing is earlier than the beginning of time, so there is no date to give.
  assert.equal(firstActiveDayKey(subject), null);
  // The stretch being lived is still perfectly well known.
  assert.equal(currentPeriodStartKey(subject), '2026-03-05');
});

test('no periods at all: neither reader invents one', () => {
  assert.equal(firstActiveDayKey(withPeriods([])), null);
  assert.equal(currentPeriodStartKey(withPeriods([])), null);
  assert.equal(firstActiveDayKey({}), null);
  assert.equal(currentPeriodStartKey({}), null);
});

test('a running habit reports the stretch it is in, not the one before it', () => {
  const [archived] = archiveHabitIn(
    [habit({ id: 'a', createdAt: stampOn(2026, 1, 10) })],
    'a',
    stampOn(2026, 2, 1)
  );
  const [restored] = restoreOn([archived], 'a', stampOn(2026, 3, 5));

  assert.equal(hasOpenPeriod(restored), true);
  assert.equal(currentPeriodStartKey(restored), '2026-03-05');
  // And the record it came from is untouched.
  assert.equal(firstActiveDayKey(restored), '2026-01-10');
});

test('an archived habit reports the final stretch it lived', () => {
  const [first] = archiveHabitIn(
    [habit({ id: 'a', createdAt: stampOn(2026, 1, 10) })],
    'a',
    stampOn(2026, 2, 1)
  );
  const [restored] = restoreOn([first], 'a', stampOn(2026, 3, 5));
  const [archived] = archiveHabitIn([restored], 'a', stampOn(2026, 7, 1));

  assert.equal(hasOpenPeriod(archived), false);
  assert.deepEqual(archived.activePeriods, [
    { from: '2026-01-10', to: '2026-02-01' },
    { from: '2026-03-05', to: '2026-07-01' },
  ]);

  // Putting a habit down does not revert it to the run before the one it had.
  assert.equal(currentPeriodStartKey(archived), '2026-03-05');
  assert.equal(firstActiveDayKey(archived), '2026-01-10');
  assert.equal(lastActiveDayKey(archived), '2026-06-30');
});

test('a habit created and put down the same day has no current stretch', () => {
  const [archived] = archiveHabitIn(
    [habit({ id: 'a', createdAt: stampOn(2026, 1, 5) })],
    'a',
    stampOn(2026, 1, 5, 18)
  );

  assert.deepEqual(archived.activePeriods, []);
  assert.equal(currentPeriodStartKey(archived), null);
  assert.equal(firstActiveDayKey(archived), null);
});

test('the current stretch of a same-day restore is the one that reopened', () => {
  // Archiving and restoring on the same day reopens the period rather than
  // starting a second one, so there is still only one stretch to name.
  const [archived] = archiveHabitIn(
    [habit({ id: 'a', createdAt: stampOn(2026, 1, 10) })],
    'a',
    stampOn(2026, 4, 2)
  );
  const [restored] = restoreOn([archived], 'a', stampOn(2026, 4, 2, 18));

  assert.deepEqual(restored.activePeriods, [{ from: '2026-01-10', to: null }]);
  assert.equal(currentPeriodStartKey(restored), '2026-01-10');
  assert.equal(firstActiveDayKey(restored), '2026-01-10');
});

// ---------------------------------------------------------------------------
// How long it has been going: getHabitSpan
//
// Two ends of a stretch and nothing else -- no sentence, no month name, no
// count of weeks. What it must never do is claim a duration the record cannot
// carry, so most of what is asserted here is the silence.
// ---------------------------------------------------------------------------

/** Completions stated as date keys outright, for histories built by hand. */
const completionKeys = (habitId, keys) => ({
  [habitId]: Object.fromEntries(keys.map((key) => [key, true])),
});

/** stampOn, from a date rather than from its parts. */
const stampAt = (date) => stampOn(date.getFullYear(), date.getMonth() + 1, date.getDate());

test('a running habit reports an open stretch from its first completion', () => {
  const subject = habit({ createdAt: stampOn(2026, 1, 1) });

  assert.deepEqual(getHabitSpan(subject, completionsOn(subject.id, weeklyBack(20)), TODAY), {
    fromKey: '2026-04-26',
    toKey: null,
  });
});

test('the span is held to the same bar the rhythm observation is', () => {
  const subject = habit({ createdAt: stampOn(2026, 1, 1) });
  const span = (dates) => getHabitSpan(subject, completionsOn(subject.id, dates), TODAY);

  // Seven weekly marks is seven completions, one short of the eight.
  assert.equal(span(weeklyBack(7)), null);
  assert.deepEqual(span(weeklyBack(8)), { fromKey: '2026-07-19', toKey: null });

  // Ten completions in ten consecutive days is enthusiasm rather than a
  // stretch: they fall in two weeks, and three is the bar.
  assert.equal(span(Array.from({ length: 10 }, (_, index) => addDays(TODAY, -index))), null);
});

test('a stretch that begins and ends inside one month says nothing', () => {
  // Eight completions across four distinct weeks, every one of them in June.
  const june = [
    '2026-06-01', '2026-06-03', '2026-06-05', '2026-06-09',
    '2026-06-11', '2026-06-16', '2026-06-18', '2026-06-23',
  ];
  const [archived] = archiveHabitIn(
    [habit({ id: 'a', createdAt: stampOn(2026, 1, 1) })],
    'a',
    stampOn(2026, 7, 1)
  );

  assert.equal(getHabitSpan(archived, completionKeys('a', june), TODAY), null);

  // One day of it spilling into July is a stretch with two months in it.
  const [intoJuly] = archiveHabitIn(
    [habit({ id: 'a', createdAt: stampOn(2026, 1, 1) })],
    'a',
    stampOn(2026, 7, 2)
  );

  assert.deepEqual(getHabitSpan(intoJuly, completionKeys('a', [...june, '2026-07-01']), TODAY), {
    fromKey: '2026-06-01',
    toKey: '2026-07-01',
  });
});

test('a running habit whose whole record is this month says nothing yet', () => {
  // Read late in the month, so the week bar is comfortably met and the month
  // gate is what is actually being asked.
  const lateInSeptember = new Date(2026, 8, 28);
  const september = [
    '2026-09-01', '2026-09-03', '2026-09-05', '2026-09-09',
    '2026-09-11', '2026-09-16', '2026-09-18', '2026-09-23',
  ];
  const subject = habit({ id: 'a', createdAt: stampOn(2026, 1, 1) });

  assert.equal(getHabitSpan(subject, completionKeys('a', september), lateInSeptember), null);

  // A single day in August, and there is a duration worth naming.
  assert.deepEqual(
    getHabitSpan(subject, completionKeys('a', ['2026-08-30', ...september]), lateInSeptember),
    { fromKey: '2026-08-30', toKey: null }
  );
});

test('the same month a year apart is not the same month', () => {
  const lateInSeptember = new Date(2026, 8, 28);
  const yearApart = [
    '2025-09-02', '2025-09-09', '2025-09-16', '2025-09-23',
    '2025-09-30', '2026-09-01', '2026-09-03', '2026-09-05',
  ];
  const subject = habit({ id: 'a', createdAt: stampOn(2025, 1, 1) });

  assert.deepEqual(getHabitSpan(subject, completionKeys('a', yearApart), lateInSeptember), {
    fromKey: '2025-09-02',
    toKey: null,
  });
});

test('an archived habit reports a closed stretch ending the day it last ran', () => {
  const [archived] = archiveHabitIn(
    [habit({ id: 'a', createdAt: stampOn(2026, 1, 1) })],
    'a',
    stampAt(addDays(TODAY, -10))
  );

  assert.equal(lastActiveDayKey(archived), toDateKey(addDays(TODAY, -11)));
  assert.deepEqual(
    getHabitSpan(archived, completionsOn('a', weeklyBack(20, addDays(TODAY, -11))), TODAY),
    { fromKey: '2026-04-15', toKey: toDateKey(addDays(TODAY, -11)) }
  );
});

test('a restored habit is described by the stretch it is in, not the one before', () => {
  const [archived] = archiveHabitIn(
    [habit({ id: 'a', createdAt: stampOn(2026, 1, 1) })],
    'a',
    stampAt(addDays(TODAY, -200))
  );
  const [restored] = restoreOn([archived], 'a', stampAt(addDays(TODAY, -120)));

  // A long record either side of the gap; only the near side may anchor it.
  const across = [...weeklyBack(12, addDays(TODAY, -250)), ...weeklyBack(12)];

  assert.deepEqual(getHabitSpan(restored, completionsOn('a', across), TODAY), {
    fromKey: toDateKey(addDays(TODAY, -77)),
    toKey: null,
  });
});

test('a habit picked back up recently is silent however long its record is', () => {
  // Thirty weeks behind the gap and three marks since it reopened. Naming a
  // duration here would describe a fortnight using two years of evidence.
  const [archived] = archiveHabitIn(
    [habit({ id: 'a', createdAt: stampOn(2025, 1, 1) })],
    'a',
    stampAt(addDays(TODAY, -200))
  );
  const [restored] = restoreOn([archived], 'a', stampAt(addDays(TODAY, -40)));

  const dates = [...weeklyBack(30, addDays(TODAY, -250)), ...weeklyBack(3)];

  assert.equal(getHabitSpan(restored, completionsOn('a', dates), TODAY), null);
});

test('an unbounded legacy history falls back to the record it does have', () => {
  // What the v3 migration writes for a habit whose creation date was lost.
  // history.js declines to invent a start; the span reads the whole record.
  const subject = habit({ createdAt: null, activePeriods: [{ from: null, to: null }] });

  assert.equal(currentPeriodStartKey(subject), null);
  assert.deepEqual(getHabitSpan(subject, completionsOn(subject.id, weeklyBack(20)), TODAY), {
    fromKey: '2026-04-26',
    toKey: null,
  });
});

test('the span invents nothing from nothing', () => {
  assert.equal(getHabitSpan(habit(), {}, TODAY), null);
  assert.equal(getHabitSpan(null, {}, TODAY), null);
  assert.equal(getHabitSpan(habit(), completionsOn('habit-1', [TODAY]), TODAY), null);
});

test('a completion dated in the future cannot stretch the span', () => {
  const subject = habit({ createdAt: stampOn(2026, 1, 1) });
  const dates = [...weeklyBack(20), addDays(TODAY, 30)];

  assert.deepEqual(getHabitSpan(subject, completionsOn(subject.id, dates), TODAY), {
    fromKey: '2026-04-26',
    toKey: null,
  });
});

test('the span is dates only -- the wording belongs to whatever shows it', () => {
  const subject = habit({ createdAt: stampOn(2026, 1, 1) });
  const span = getHabitSpan(subject, completionsOn(subject.id, weeklyBack(20)), TODAY);

  assert.deepEqual(Object.keys(span).sort(), ['fromKey', 'toKey']);
  for (const value of Object.values(span)) {
    assert.ok(value === null || isDateKey(value), 'a span end is a date key or nothing');
  }
  // No month name, no sentence, no count of anything.
  assert.equal(/[A-Za-z]/.test(span.fromKey), false);
});

// ---------------------------------------------------------------------------
// How long it has been going, in words: getSpanNote
//
// The wording half of getHabitSpan. It is handed two date keys and decides how
// to say them; every question about whether there is anything to say at all was
// already answered by the derivation, and none of it is asked again here.
// ---------------------------------------------------------------------------

/** A span as the derivation returns one. */
const span = (fromKey, toKey = null) => ({ fromKey, toKey });

test('a habit still going is described from its beginning onward', () => {
  assert.equal(
    getSpanNote(span('2026-03-14'), { today: TODAY }),
    "You've been doing this since March."
  );
});

test('a retired habit is described in the past, between two months', () => {
  assert.equal(
    getSpanNote(span('2026-03-14', '2026-07-20'), { archived: true, today: TODAY }),
    'You did this from March to July.'
  );
});

test('the year is left out inside the year the reader is in', () => {
  // Everybody knows which March. Printing it would be noise on the common case.
  assert.equal(
    getSpanNote(span('2026-01-05'), { today: TODAY }),
    "You've been doing this since January."
  );
  assert.equal(
    getSpanNote(span('2026-03-14', '2026-12-31'), { archived: true, today: TODAY }),
    'You did this from March to December.'
  );
});

test('the year appears as soon as leaving it out would mislead', () => {
  // "Since March" on a habit kept since 2023 undersells it by three years, and
  // the reader has no way to tell from the sentence that it is doing so.
  assert.equal(
    getSpanNote(span('2025-03-14'), { today: TODAY }),
    "You've been doing this since March 2025."
  );
  assert.equal(
    getSpanNote(span('2023-11-02'), { today: TODAY }),
    "You've been doing this since November 2023."
  );
});

test('a closed stretch inside one earlier year states that year once', () => {
  // Both ends share it, so the trailing one settles both halves and saying it
  // twice would read as a form rather than as a sentence.
  assert.equal(
    getSpanNote(span('2023-03-14', '2023-07-20'), { archived: true, today: TODAY }),
    'You did this from March to July 2023.'
  );
});

test('a stretch that crossed a new year states both years', () => {
  assert.equal(
    getSpanNote(span('2025-11-02', '2026-04-09'), { archived: true, today: TODAY }),
    'You did this from November 2025 to April 2026.'
  );
});

test('nothing derived is nothing said', () => {
  assert.equal(getSpanNote(null, { today: TODAY }), null);
  assert.equal(getSpanNote(undefined, { today: TODAY }), null);
  assert.equal(getSpanNote(span(null, null), { today: TODAY }), null);
});

test('an open end is described as open however the habit is flagged', () => {
  // getHabitSpan closes the end for an archived habit, so the two always agree.
  // If they ever disagreed, the span is the one holding the dates.
  assert.equal(
    getSpanNote(span('2025-09-02'), { archived: true, today: TODAY }),
    "You've been doing this since September 2025."
  );
});

test('the note takes its own defaults without being handed any', () => {
  // Asserted by shape rather than by year: an assertion that changes meaning on
  // the first of January is not an assertion.
  const note = getSpanNote(span('2026-03-14'));

  assert.match(note, /^You've been doing this since March( \d{4})?\.$/);
});

test('the duration names a month and never a day', () => {
  // The record stores days and could name one. "Since March 14th" claims a
  // precision about a beginning that nobody experiences.
  const running = getSpanNote(span('2026-03-14'), { today: TODAY });
  const closed = getSpanNote(span('2026-03-14', '2026-07-20'), { archived: true, today: TODAY });

  for (const note of [running, closed]) {
    assert.equal(/\b(14|20)(th|st|nd|rd)?\b/.test(note), false, 'a day of the month leaked out');
    assert.equal(/%|streak/i.test(note), false);
  }
});

test('the duration and the derivation meet without either one guessing', () => {
  // End to end: the same history read by getHabitSpan and worded by getSpanNote.
  const subject = habit({ id: 'a', createdAt: stampOn(2026, 1, 1) });
  const live = getHabitSpan(subject, completionsOn('a', weeklyBack(20)), TODAY);

  assert.deepEqual(live, { fromKey: '2026-04-26', toKey: null });
  assert.equal(getSpanNote(live, { today: TODAY }), "You've been doing this since April.");

  const [archived] = archiveHabitIn(
    [habit({ id: 'a', createdAt: stampOn(2026, 1, 1) })],
    'a',
    stampAt(addDays(TODAY, -10))
  );
  const closed = getHabitSpan(archived, completionsOn('a', weeklyBack(20, addDays(TODAY, -11))), TODAY);

  assert.equal(
    getSpanNote(closed, { archived: true, today: TODAY }),
    'You did this from April to August.'
  );

  // And a history the derivation declines to describe is a line that is absent
  // rather than a line that hedges.
  assert.equal(getSpanNote(getHabitSpan(subject, completionsOn('a', weeklyBack(3)), TODAY)), null);
});

// ---------------------------------------------------------------------------
// The rhythm, read through the history
// ---------------------------------------------------------------------------

/** TODAY is a Sunday, so these offsets are the weekdays they claim to be. */
const A_PAST_MONDAY = addDays(TODAY, -6);
const A_PAST_TUESDAY = addDays(TODAY, -12);

/** Mon/Wed/Fri for eight weeks, switched to daily today. */
function switchedToDaily() {
  const created = habit({
    createdAt: addDays(TODAY, -56).toISOString(),
    frequency: 'selected',
    days: ['mon', 'wed', 'fri'],
  });

  return {
    ...created,
    frequency: 'daily',
    days: [],
    scheduleHistory: withScheduleVersion(created, { frequency: 'daily', days: [] }, toDateKey(TODAY)),
  };
}

test('active, scheduled and completed reads as completed', () => {
  const subject = habit({ createdAt: addDays(TODAY, -56).toISOString() });
  const days = buildRhythm(subject, completionsOn(subject.id, [A_PAST_MONDAY]), TODAY);

  assert.equal(stateOn(days, A_PAST_MONDAY), 'completed');
});

test('active, scheduled and not completed reads as a day still waiting', () => {
  const subject = habit({
    createdAt: addDays(TODAY, -56).toISOString(),
    frequency: 'selected',
    days: ['mon'],
  });

  assert.equal(stateOn(buildRhythm(subject, {}, TODAY), A_PAST_MONDAY), 'scheduled');
});

test('active but not scheduled reads as a day off', () => {
  const subject = habit({
    createdAt: addDays(TODAY, -56).toISOString(),
    frequency: 'selected',
    days: ['mon'],
  });

  assert.equal(stateOn(buildRhythm(subject, {}, TODAY), A_PAST_TUESDAY), 'unscheduled');
});

test('changing the schedule today does not grow missed days backwards', () => {
  // The bug in one assertion. Mon/Wed/Fri for two months, switched to daily:
  // every past Tuesday must stay a day off, not become a day they let slip.
  const subject = switchedToDaily();
  const days = buildRhythm(subject, {}, TODAY);

  assert.equal(wasScheduledOn(subject, A_PAST_TUESDAY), false);
  assert.equal(stateOn(days, A_PAST_TUESDAY), 'unscheduled');
  // And the days it really did ask for still read as its own.
  assert.equal(stateOn(days, A_PAST_MONDAY), 'scheduled');
});

test('the change still applies from today forward', () => {
  // A schedule change changes the future; that half has to keep working.
  const subject = switchedToDaily();

  // TODAY is a Sunday, which the old Mon/Wed/Fri schedule never wanted.
  assert.equal(wasScheduledOn(subject, TODAY), true);
  assert.equal(stateOn(buildRhythm(subject, {}, TODAY), TODAY), 'scheduled');
});

test('narrowing the schedule does not erase the days it used to ask for', () => {
  // Daily for eight weeks, then Mondays only. Past Tuesdays were genuinely due.
  const created = habit({ createdAt: addDays(TODAY, -56).toISOString(), frequency: 'daily' });
  const subject = {
    ...created,
    frequency: 'selected',
    days: ['mon'],
    scheduleHistory: withScheduleVersion(
      created,
      { frequency: 'selected', days: ['mon'] },
      toDateKey(TODAY)
    ),
  };

  assert.equal(wasScheduledOn(subject, A_PAST_TUESDAY), true);
  assert.equal(stateOn(buildRhythm(subject, {}, TODAY), A_PAST_TUESDAY), 'scheduled');
  // TODAY is a Sunday, and the new schedule does not want it.
  assert.equal(wasScheduledOn(subject, TODAY), false);
});

test('an archived stretch draws nothing at all in the grid', () => {
  // Archived four weeks ago, picked back up today: the weeks in between are
  // blank, not a wall of days the user is being shown they missed.
  const created = habit({ id: 'a', createdAt: addDays(TODAY, -84).toISOString() });
  const [archived] = archiveHabitIn([created], 'a', addDays(TODAY, -28).toISOString());
  const [restored] = restoreOn([archived], 'a', TODAY.toISOString());

  const days = buildRhythm(restored, {}, TODAY);
  const gap = days.filter((day) => day.key >= toDateKey(addDays(TODAY, -28)) && day.key < toDateKey(TODAY));

  assert.ok(gap.length > 0, 'the window covers part of the gap');
  for (const day of gap) assert.equal(day.state, 'inactive');
  // Nothing in the gap is counted as anything.
  assert.equal(countCompleted(days.filter((day) => day.state === 'inactive')), 0);
});

test('a completion inside a stretch the habit was later put down on is still shown', () => {
  // Someone showed up that morning and archived the habit that evening. The
  // day is inactive by the boundary rule, and they still did the thing.
  const created = habit({ id: 'a', createdAt: addDays(TODAY, -56).toISOString() });
  const archiveDay = addDays(TODAY, -14);
  const [archived] = archiveHabitIn([created], 'a', archiveDay.toISOString());

  const days = buildRhythm(archived, completionsOn('a', [archiveDay]), TODAY);

  assert.equal(isActiveOn(archived, archiveDay), false);
  assert.equal(stateOn(days, archiveDay), 'completed');
});

// ---------------------------------------------------------------------------
// Insights, reading the same history
// ---------------------------------------------------------------------------

test('a weekday observation counts only days the habit was due at the time', () => {
  // Mon/Wed/Fri, completed on Mondays far more often, then switched to daily.
  // The observation must not be re-weighed by a schedule that arrived after
  // every one of those days had already happened.
  const created = habit({
    createdAt: addDays(TODAY, -84).toISOString(),
    frequency: 'selected',
    days: ['mon', 'wed', 'fri'],
  });
  const mondays = [6, 13, 20, 27].map((ago) => addDays(TODAY, -ago));
  const others = [25, 23].map((ago) => addDays(TODAY, -ago));
  const completions = completionsOn(created.id, [...mondays, ...others]);

  const before = getHabitInsight(created, completions, TODAY);

  const switched = {
    ...created,
    frequency: 'daily',
    days: [],
    scheduleHistory: withScheduleVersion(created, { frequency: 'daily', days: [] }, toDateKey(TODAY)),
  };

  assert.deepEqual(getHabitInsight(switched, completions, TODAY), before);
  assert.equal(before.kind, 'weekday');
});

test('an archived gap does not count against an observation', () => {
  // Nothing in the app counts absence, and the gap adds none of its own: the
  // same completions produce the same sentence whether or not the habit spent
  // a season put down.
  const created = habit({ id: 'a', createdAt: addDays(TODAY, -182).toISOString() });
  const completions = completionsOn('a', daysBack(addDays(TODAY, -120), 60));

  const [archived] = archiveHabitIn([created], 'a', addDays(TODAY, -119).toISOString());
  const [restored] = restoreOn([archived], 'a', addDays(TODAY, -7).toISOString());

  assert.deepEqual(
    getHabitInsight(restored, completions, TODAY),
    getHabitInsight(created, completions, TODAY)
  );
});

test('the existing insight thresholds are unchanged by any of this', () => {
  const subject = habit({ createdAt: addDays(TODAY, -365).toISOString() });
  const weeklyFor = (count) =>
    Array.from({ length: count }, (_, index) => addDays(TODAY, -7 * index));

  assert.equal(getHabitInsight(subject, completionsOn(subject.id, weeklyFor(2)), TODAY), null);
  assert.equal(getHabitInsight(subject, completionsOn(subject.id, weeklyFor(12)), TODAY).kind, 'rhythm');
  assert.equal(
    getHabitInsight(subject, completionsOn(subject.id, weeklyFor(13)), TODAY).kind,
    'established'
  );
});

test('the rhythm and the insights never disagree about a day', () => {
  // The property that matters more than any single sentence: one helper
  // answers "was this due?", so the grid and the observation cannot drift.
  const subject = switchedToDaily();
  const days = buildRhythm(subject, {}, TODAY);

  for (const day of days) {
    if (day.state === 'scheduled') assert.equal(wasScheduledOn(subject, day.date), true);
    if (day.state === 'unscheduled') assert.equal(wasScheduledOn(subject, day.date), false);
    if (day.state === 'inactive') assert.equal(isActiveOn(subject, day.date), false);
  }
});

// ---------------------------------------------------------------------------
// Recovery
// ---------------------------------------------------------------------------

test('coming back after an archived season is not a recovery', () => {
  // Those days were never asked for, so there is nothing to have returned
  // from. Picking a habit back up is a decision, not a lapse.
  const created = habit({ id: 'a', createdAt: addDays(TODAY, -182).toISOString() });
  const completions = completionsOn('a', [addDays(TODAY, -120)]);

  const [archived] = archiveHabitIn([created], 'a', addDays(TODAY, -119).toISOString());
  const [restored] = restoreOn([archived], 'a', TODAY.toISOString());

  assert.equal(isReturningHabit(restored, completions, TODAY), false);
});

test('simply missing days it was due is still a return', () => {
  // The product behaviour this must not break: nothing archived, days genuinely
  // skipped, and the habit is due again today.
  const subject = habit({ id: 'a', createdAt: addDays(TODAY, -60).toISOString() });
  const completions = completionsOn('a', [addDays(TODAY, -20)]);

  assert.equal(isReturningHabit(subject, completions, TODAY), true);
});

test('a gap judged by the schedule that was in force, not the one now', () => {
  // Mon/Wed/Fri, last done on a Friday, and today is the next Monday. Switching
  // to daily today must not retroactively invent skipped weekend days.
  const created = habit({
    id: 'a',
    createdAt: addDays(TODAY, -60).toISOString(),
    frequency: 'selected',
    days: ['sun'],
  });
  const subject = {
    ...created,
    frequency: 'daily',
    days: [],
    scheduleHistory: withScheduleVersion(created, { frequency: 'daily', days: [] }, toDateKey(TODAY)),
  };
  // TODAY is a Sunday and so is TODAY - 7: consecutive occurrences of the only
  // day the old schedule ever wanted, so nothing was skipped in between.
  const completions = completionsOn('a', [addDays(TODAY, -7)]);

  assert.equal(isReturningHabit(subject, completions, TODAY), false);
});

test('a return still reads as one once the mark has landed', () => {
  // Today asks after the completion, not before it, and the rule has to answer
  // the same way at both moments. The scenario is the existing one: something
  // behind the habit, a due day left unfilled, and the habit due again today.
  const subject = habit({ id: 'a', createdAt: addDays(TODAY, -60).toISOString() });
  const before = completionsOn('a', [addDays(TODAY, -20)]);
  assert.equal(isReturningHabit(subject, before, TODAY), true);

  const marked = toggleCompletionOn(before, 'a', toDateKey(TODAY));
  assert.equal(hasReturnedToday([subject], marked, TODAY), true);
});

test('undoing the completion takes the return back with it', () => {
  // The bug: Today latched this on the tap that caused it, so an undo left the
  // screen saying "Back in rhythm." about a habit that was no longer done.
  const subject = habit({ id: 'a', createdAt: addDays(TODAY, -60).toISOString() });
  const before = completionsOn('a', [addDays(TODAY, -20)]);
  const marked = toggleCompletionOn(before, 'a', toDateKey(TODAY));

  const undone = toggleCompletionOn(marked, 'a', toDateKey(TODAY));
  assert.equal(hasReturnedToday([subject], undone, TODAY), false);

  // And the undo really did put the history back where it started, which is
  // the reason the answer is allowed to follow it.
  assert.deepEqual(undone, before);
});

test('completing it again derives the return again, from nothing kept', () => {
  const subject = habit({ id: 'a', createdAt: addDays(TODAY, -60).toISOString() });
  const before = completionsOn('a', [addDays(TODAY, -20)]);
  const key = toDateKey(TODAY);

  const marked = toggleCompletionOn(before, 'a', key);
  const undone = toggleCompletionOn(marked, 'a', key);
  const redone = toggleCompletionOn(undone, 'a', key);

  assert.equal(hasReturnedToday([subject], redone, TODAY), true);
  // Same habit, same completions, same answer -- whatever route the user took
  // to get there. That is what makes it a reading rather than a memory.
  assert.equal(
    hasReturnedToday([subject], redone, TODAY),
    hasReturnedToday([subject], marked, TODAY)
  );
});

test('an ordinary completion is not a return', () => {
  // Nothing was missed, so there is nothing to have come back from: marking
  // today must not turn an unbroken run into a recovery.
  const subject = habit({ id: 'a', createdAt: addDays(TODAY, -60).toISOString() });
  const completions = completionsOn('a', [addDays(TODAY, -2), addDays(TODAY, -1), TODAY]);

  assert.equal(hasReturnedToday([subject], completions, TODAY), false);
});

test('an archived season is not a return once the habit is marked again', () => {
  // The same restraint as the rule underneath it, asked from the other side:
  // days the habit was put away were never asked for, so the first completion
  // after a restore is a continuation and the screen says nothing about it.
  const created = habit({ id: 'a', createdAt: addDays(TODAY, -182).toISOString() });
  const before = completionsOn('a', [addDays(TODAY, -120)]);

  const [archived] = archiveHabitIn([created], 'a', addDays(TODAY, -119).toISOString());
  const [restored] = restoreOn([archived], 'a', TODAY.toISOString());

  const marked = toggleCompletionOn(before, 'a', toDateKey(TODAY));
  assert.equal(hasReturnedToday([restored], marked, TODAY), false);
});

test('the return is a reading of the day, not a record of one', () => {
  // Nothing about coming back is written down and nothing about it is kept:
  // the screen holds no flag that could go stale, and the rule still lives in
  // one module rather than being restated on the screen.
  assert.equal(source('src/lib/storageSchema.js').includes('hasReturned'), false);
  assert.equal(source('src/lib/recovery.js').includes('useState'), false);
  assert.match(todayScreen, /const hasReturned = useMemo\(/);
  assert.match(todayScreen, /hasReturnedToday\(todaysHabits, completions, now\)/);
  assert.equal(todayScreen.includes('isScheduledOn'), false);

  // A habit due today that nobody has marked has not returned -- it is being
  // offered the chance to.
  const subject = habit({ id: 'a', createdAt: addDays(TODAY, -60).toISOString() });
  const waiting = completionsOn('a', [addDays(TODAY, -20)]);
  assert.equal(hasReturnedToday([subject], waiting, TODAY), false);
});

// ---------------------------------------------------------------------------
// Migration to v3
// ---------------------------------------------------------------------------

function v2State(habitOverrides = {}) {
  return {
    version: 2,
    habits: [
      {
        id: 'habit-1',
        name: 'Read',
        detail: 'One page',
        frequency: 'selected',
        days: ['mon', 'wed'],
        createdAt: '2026-01-01T09:00:00.000Z',
        archivedAt: null,
        reminder: { enabled: true, hour: 8, minute: 30 },
        ...habitOverrides,
      },
    ],
    completions: { 'habit-1': { '2026-01-10': true, '2026-01-11': true } },
  };
}

test('migrating v2 gives a habit the history it can honestly be given', () => {
  const [migrated] = normalizeState(v2State()).habits;

  assert.deepEqual(migrated.scheduleHistory, [
    { effectiveFrom: dateKeyFrom('2026-01-01T09:00:00.000Z'), frequency: 'selected', days: ['mon', 'wed'] },
  ]);
  assert.deepEqual(migrated.activePeriods, [
    { from: dateKeyFrom('2026-01-01T09:00:00.000Z'), to: null },
  ]);
});

test('migrating v2 invents no schedule changes and no archive cycles', () => {
  const [migrated] = normalizeState(v2State()).habits;

  assert.equal(migrated.scheduleHistory.length, 1);
  assert.equal(migrated.activePeriods.length, 1);
});

test('migrating v2 preserves everything the habit already was', () => {
  const [migrated] = normalizeState(v2State()).habits;

  assert.equal(migrated.id, 'habit-1');
  assert.equal(migrated.name, 'Read');
  assert.equal(migrated.detail, 'One page');
  assert.equal(migrated.frequency, 'selected');
  assert.deepEqual(migrated.days, ['mon', 'wed']);
  assert.equal(migrated.createdAt, '2026-01-01T09:00:00.000Z');
  assert.equal(migrated.archivedAt, null);
  assert.deepEqual(migrated.reminder, { enabled: true, hour: 8, minute: 30 });
});

test('migrating v2 keeps every completion exactly as it was', () => {
  const state = normalizeState(v2State());

  assert.deepEqual(state.completions, {
    'habit-1': { '2026-01-10': true, '2026-01-11': true },
  });
  assert.equal(completedDatesFor(state.completions, 'habit-1').length, 2);
});

test('an already-archived habit migrates with its stretch closed where it ended', () => {
  const [migrated] = normalizeState(
    v2State({ archivedAt: '2026-03-15T09:00:00.000Z' })
  ).habits;

  assert.equal(migrated.archivedAt, '2026-03-15T09:00:00.000Z');
  assert.deepEqual(migrated.activePeriods, [
    { from: dateKeyFrom('2026-01-01T09:00:00.000Z'), to: dateKeyFrom('2026-03-15T09:00:00.000Z') },
  ]);
  assert.equal(hasOpenPeriod(migrated), false);
});

test('v1 migrates all the way to v3 in one read', () => {
  const [migrated] = normalizeState(v1State()).habits;

  // v2 gave it a reminder...
  assert.deepEqual(migrated.reminder, DEFAULT_REMINDER);
  // ...and v3 gave it a history.
  assert.deepEqual(migrated.scheduleHistory, [
    { effectiveFrom: '2026-01-01', frequency: 'selected', days: ['mon', 'wed'] },
  ]);
  assert.deepEqual(migrated.activePeriods, [{ from: '2026-01-01', to: null }]);
});

test('migration is idempotent: reading its own output changes nothing', () => {
  const once = normalizeState(v2State());
  const twice = normalizeState({ version: SCHEMA_VERSION, ...once });

  assert.deepEqual(twice, once);
});

test('a real history is never replaced by an inferred one', () => {
  // The migration and the normaliser both fill only what is missing, so a habit
  // that has genuinely been through a schedule change keeps it.
  const real = [
    { effectiveFrom: '2026-01-01', frequency: 'daily', days: [] },
    { effectiveFrom: '2026-03-10', frequency: 'selected', days: ['mon'] },
  ];
  const [migrated] = normalizeState(
    v2State({ scheduleHistory: real, activePeriods: [{ from: '2026-01-01', to: null }] })
  ).habits;

  assert.deepEqual(migrated.scheduleHistory, real);
});

test('an unreadable history is rebuilt rather than half-trusted', () => {
  const [migrated] = normalizeState(
    v2State({ scheduleHistory: [{ effectiveFrom: 'not-a-date', frequency: 'daily' }] })
  ).habits;

  assert.deepEqual(migrated.scheduleHistory, [
    { effectiveFrom: '2026-01-01', frequency: 'selected', days: ['mon', 'wed'] },
  ]);
});

test('state from a newer build is refused rather than guessed at', () => {
  assert.equal(normalizeState({ version: SCHEMA_VERSION + 1, habits: [], completions: {} }), null);
  assert.equal(normalizeState({ version: 99, habits: [], completions: {} }), null);
});

test('a field this build has never heard of survives being read by it', () => {
  // A newer build's habit field, reached through a downgrade. Dropping it
  // silently on the next save is a slow way to destroy someone's data.
  const [migrated] = normalizeState(v2State({ somethingNewer: { keep: 'me' } })).habits;

  assert.deepEqual(migrated.somethingNewer, { keep: 'me' });
});

// ---------------------------------------------------------------------------
// Notifications still answer to the present, and only to the present
// ---------------------------------------------------------------------------

test('reminders follow the current schedule, never the historical one', () => {
  // Mon/Wed/Fri once, daily now. The planner must book the days the user is
  // actually being reminded about, which is every day from here on.
  const subject = {
    ...switchedToDaily(),
    reminder: { enabled: true, hour: 9, minute: 0 },
  };

  const planned = plannedRemindersFor(subject, {}, TODAY, 7);
  assert.equal(planned.length, 7);
});

test('a narrowed schedule books only the days it now names', () => {
  const created = habit({
    createdAt: addDays(TODAY, -56).toISOString(),
    frequency: 'daily',
    reminder: { enabled: true, hour: 9, minute: 0 },
  });
  const subject = {
    ...created,
    frequency: 'selected',
    days: ['mon'],
    scheduleHistory: withScheduleVersion(
      created,
      { frequency: 'selected', days: ['mon'] },
      toDateKey(TODAY)
    ),
  };

  const planned = plannedRemindersFor(subject, {}, TODAY, 14);

  // Two Mondays in a fortnight, and nothing from the daily stretch behind it.
  assert.equal(planned.length, 2);
  for (const reminder of planned) {
    assert.equal(weekdayIdFor(fromDateKey(reminder.dateKey)), 'mon');
  }
});

test('an archived habit is reminded about nothing, whatever its history says', () => {
  const created = habit({
    id: 'a',
    createdAt: addDays(TODAY, -56).toISOString(),
    reminder: { enabled: true, hour: 9, minute: 0 },
  });
  const [archived] = archiveHabitIn([created], 'a', addDays(TODAY, -1).toISOString());

  assert.deepEqual(plannedRemindersFor(archived, {}, TODAY, 14), []);
});

test('restoring a habit books reminders again from the current schedule', () => {
  const created = habit({
    id: 'a',
    createdAt: addDays(TODAY, -56).toISOString(),
    reminder: { enabled: true, hour: 9, minute: 0 },
  });
  const [archived] = archiveHabitIn([created], 'a', addDays(TODAY, -30).toISOString());
  const [restored] = restoreOn([archived], 'a', TODAY.toISOString());

  assert.equal(plannedRemindersFor(restored, {}, TODAY, 7).length, 7);
});

test('adding history did not change a single reminder id', () => {
  // Ids are derived from the habit, the time and the day. None of the new
  // fields is one of those, and an id that shifted would orphan every booking
  // already sitting on the device.
  const subject = habit({
    id: 'habit-1',
    reminder: { enabled: true, hour: 8, minute: 30 },
  });

  assert.equal(
    reminderIdFor(subject, '2026-09-06'),
    'habitloop-reminder:habit-1:0830:2026-09-06'
  );
});

test('reconciling a schedule change still replaces rather than accumulates', () => {
  const created = habit({
    id: 'a',
    createdAt: addDays(TODAY, -56).toISOString(),
    frequency: 'daily',
    reminder: { enabled: true, hour: 9, minute: 0 },
  });
  const booked = planReminders([created], {}, TODAY, 14).map((reminder) => reminder.id);

  const narrowed = {
    ...created,
    frequency: 'selected',
    days: ['mon'],
    scheduleHistory: withScheduleVersion(
      created,
      { frequency: 'selected', days: ['mon'] },
      toDateKey(TODAY)
    ),
  };
  const { toCancel, toSchedule } = diffReminderPlan(booked, planReminders([narrowed], {}, TODAY, 14));

  // The days it no longer wants are cancelled, and the Mondays it kept are not
  // booked a second time.
  assert.equal(toCancel.length, 12);
  assert.equal(toSchedule.length, 0);
});

// ---------------------------------------------------------------------------
// Moving between screens
//
// The transitions themselves are native and cannot be asserted here. What can
// be asserted is the thing that actually went wrong before: that the app has
// one navigation language rather than a default per screen, that the choice
// lives in the motion system rather than scattered through the navigator, and
// that nothing about moving between screens can strand or duplicate a screen.
// ---------------------------------------------------------------------------

const navigationTheme = source('src/navigation/navigationTheme.js');

/** Every screen the root stack registers. */
const SCREEN_FILES = [
  'src/screens/CreateHabitScreen.js',
  'src/screens/EditHabitScreen.js',
  'src/screens/HabitDetailScreen.js',
  'src/screens/HabitManagementScreen.js',
  'src/screens/SettingsScreen.js',
  'src/screens/TodayScreen.js',
];

test('there are two transition categories, and only two', () => {
  // A transition per destination teaches the user nothing. Going somewhere and
  // making something are the only two things this app does with a screen.
  assert.match(motionTokens, /screen: \{/);
  assert.match(motionTokens, /push: \{ animation: 'ios_from_right' \}/);
  assert.match(motionTokens, /compose: \{ animation: 'fade_from_bottom' \}/);

  assert.deepEqual((motionTokens.match(/animation: '[a-z_]+'/g) ?? []).length, 2);
});

test('the navigator spends the motion system rather than naming its own', () => {
  // The durations and curves of this app live in one file. A transition chosen
  // inline in the navigator is exactly the drift that file exists to prevent.
  assert.match(rootNavigator, /\.\.\.motion\.screen\.push/);
  assert.match(rootNavigator, /options=\{COMPOSE\}/);
  assert.equal(/animation:/.test(withoutComments(rootNavigator)), false);
  assert.equal(/\b\d{2,4}\s*\/\/|duration/.test(withoutComments(rootNavigator)), false);
});

test('composing is the one screen that arrives differently', () => {
  assert.match(
    rootNavigator,
    /name="CreateHabit" component=\{CreateHabitScreen\} options=\{COMPOSE\}/
  );

  // Everything else takes the navigator's default, which is the push.
  for (const screen of ['Today', 'HabitDetail', 'EditHabit', 'HabitManagement', 'Settings']) {
    assert.match(rootNavigator, new RegExp(`name="${screen}" component=\\{\\w+\\} />`));
  }
});

test('the gap between two screens is painted from the palette', () => {
  // Mid-push the stack draws neither screen for a moment. That moment used to
  // be whatever the platform defaulted to; it is now the app's own ground.
  assert.match(rootNavigator, /contentStyle: \{ backgroundColor: colors\.background \}/);

  for (const path of ['src/navigation/RootNavigator.js', 'src/navigation/navigationTheme.js']) {
    const file = source(path);
    assert.equal(/#[0-9a-fA-F]{3,8}\b/.test(file), false, `${path} hard-codes a colour`);
    assert.equal(/rgba?\(/.test(file), false, `${path} hard-codes a colour`);
  }
});

test('the navigation background follows the theme, both halves of it', () => {
  // navigationTheme already did this; the assertion is here so the two places
  // that answer "what is behind a screen" cannot drift apart.
  assert.match(navigationTheme, /background: colors\.background/);
  assert.match(rootNavigator, /\[colors\.background\]/);
});

test('no screen navigates by pushing, so a double tap cannot stack two', () => {
  // navigate() finds a screen already in the stack instead of adding a second.
  // push() would not, and a fast finger on a habit row would leave the user two
  // back presses from the day.
  for (const path of SCREEN_FILES) {
    assert.equal(/navigation\.push\(/.test(source(path)), false, `${path} pushes`);
  }
});

test('leaving a compose screen is still guarded, whichever way you leave', () => {
  // beforeRemove catches the chevron and Android's hardware back alike, so the
  // discard confirmation cannot be skipped by the gesture the transition made
  // nicer to perform.
  for (const path of ['src/screens/CreateHabitScreen.js', 'src/screens/EditHabitScreen.js']) {
    assert.match(source(path), /addListener\('beforeRemove'/);
  }
});
// ---------------------------------------------------------------------------
// The time picker's selection group
//
// Not pixel assertions -- the two rules below are the ones that were actually
// broken, and both are one property each. A row of flex children with no
// justification packs to the start, which is how the whole control came to sit
// against the left edge of a panel it was supposed to be centred in.
// ---------------------------------------------------------------------------

test('the selection group is centred in the panel rather than packed to its left', () => {
  assert.match(timePicker, /columns: \{[\s\S]*?justifyContent: 'center',/);
});

test('a column label is centred over the numbers it names', () => {
  // The values inside the scroller are centred in their track, so a label
  // aligned to the start of that track sits to the left of everything it names.
  assert.match(timePicker, /column: \{\s*alignItems: 'center',/);
});

test('tapping a number answers at the same strength as everything else', () => {
  // It was the one target in the panel that answered with nothing at all.
  assert.match(timePicker, /rowPressed: \{\s*opacity: motion\.pressed\.fade,/);
  assert.match(timePicker, /\[styles\.row, pressed && styles\.rowPressed\]/);
});
// ---------------------------------------------------------------------------
// A habit that was put down before it was ever done
//
// Found on a real device: create a habit, never complete it, archive it. The
// recognition line offered to begin something the user had just closed, two
// lines under a notice saying it was archived. The count line was already
// past-tense-safe and getRhythmNote already withheld its encouragements from an
// archived habit; this was the one line that had not been told.
// ---------------------------------------------------------------------------

test('a closed record does not offer to begin', () => {
  // The forward-looking line is kept for habits that still have a forward.
  assert.match(habitDetail, /lifetimeCount === 0 && isArchived \?/);
  assert.match(habitDetail, /Nothing was recorded for this one\./);

  // And it comes first, so an archived habit can never reach the invitation.
  assert.ok(
    habitDetail.indexOf('Nothing was recorded for this one.') <
      habitDetail.indexOf('Your first one')
  );
});

test('a habit still being built is still invited to begin', () => {
  assert.match(habitDetail, /lifetimeCount === 0 \? \(/);
  assert.match(habitDetail, /Your first one<\/Text> is waiting\./);
});

// ---------------------------------------------------------------------------
// What is behind the app
//
// Every background in this app used to be painted inside a screen -- the Screen
// shell and the stack's contentStyle -- which left the window itself unpainted.
// On Android that window is white (expo-splash-screen sets windowBackground, and
// `android.backgroundColor` is a single static value that could not follow light
// and dark in any case), so any frame the navigator did not fully cover fell
// through to white in both themes.
//
// Proven rather than assumed: with this backdrop temporarily set to magenta, a
// recorded push/pop exposed ~57,000 magenta pixels; painted from the palette
// instead, the same navigation exposed none.
// ---------------------------------------------------------------------------

const appRoot = source('App.js');

test('one themed surface sits behind the whole navigator', () => {
  assert.match(appRoot, /backdrop: \{ flex: 1 \}/);
  assert.match(appRoot, /backgroundColor: colors\.background/);

  // Under the stack, not inside it: the gap a transition opens is above this.
  assert.ok(appRoot.indexOf('styles.backdrop') < appRoot.indexOf('<RootNavigator />'));
});

test('the surface behind the app is never a written-down colour', () => {
  // It has to follow light, dark and system, so it can only come from the
  // resolved palette -- which is also why the Android window colour, being a
  // single static value, could never have been the fix.
  assert.equal(/#[0-9a-fA-F]{3,8}\b/.test(appRoot), false, 'App.js hard-codes a colour');
  assert.equal(/rgba?\(/.test(appRoot), false, 'App.js hard-codes a colour');
  assert.match(appRoot, /const \{ colors, scheme, ready: themeReady \} = useTheme\(\)/);
});

test('the transition itself was not touched by any of this', () => {
  // Same two categories, same animations: the fix was the surface behind them.
  assert.match(motionTokens, /push: \{ animation: 'ios_from_right' \}/);
  assert.match(motionTokens, /compose: \{ animation: 'fade_from_bottom' \}/);
  assert.match(rootNavigator, /\.\.\.motion\.screen\.push/);
  assert.match(rootNavigator, /contentStyle: \{ backgroundColor: colors\.background \}/);
});

// --- Putting a habit down, and picking it back up, from the collection -------
//
// The lifecycle itself is proven where it lives, against habitCollections.js,
// and those tests are untouched -- archiveHabitIn and restoreHabitIn are the
// only implementation and this screen was deliberately given no second one.
// What is asserted here is the wiring: that the collection spends those store
// actions rather than reimplementing them, that the word and the habit are two
// targets rather than one, and that the question archiving has always asked is
// still asked in the same words.

/** The HabitRow markup, which is where the two targets are actually kept apart. */
const rowMarkup = habitRow.slice(habitRow.indexOf('return ('), habitRow.indexOf('const CHEVRON_SIZE'));

test('an active habit can be archived from the collection', () => {
  assert.match(managementScreen, /label: 'Archive'/);
  assert.match(managementScreen, /action=\{actions\.archive\}/);

  // The store's action, taken from the store, called with the habit's id --
  // and no second implementation anywhere on the screen.
  assert.match(managementScreen, /const \{ activeHabits, archivedHabits, archiveHabit, restoreHabit \} = useHabits\(\)/);
  assert.match(managementScreen, /archiveHabit\(habitId\)/);
  assert.equal(managementScreen.includes('archiveHabitIn'), false);
  assert.equal(managementScreen.includes('archivedAt'), false);
  assert.equal(imports(managementScreen).includes('../lib/history'), false);
});

test('archiving from the collection asks exactly what Edit asks', () => {
  // The same act, so the same question, word for word. A second wording would
  // make one of the two screens sound like it was doing something else.
  for (const screen of [managementScreen, editScreen]) {
    assert.match(screen, /title="Archive this habit\?"/);
    assert.match(screen, /message="Your history will stay saved\."/);
    assert.match(screen, /confirmLabel="Archive habit"/);
    assert.match(screen, /destructive/);
  }

  assert.ok(imports(managementScreen).includes('../components/ConfirmationModal'));
  assert.equal(managementScreen.includes('Alert.alert'), false);

  // Cancelling forgets the question and changes nothing.
  assert.match(managementScreen, /onCancel=\{\(\) => setArchiving\(null\)\}/);
  assert.match(managementScreen, /setArchiving\(null\);\s*archiveHabit\(habitId\)/);
});

test('archiving from the collection leaves you in the collection', () => {
  // Edit has to navigate away -- it is a form for a habit that is no longer
  // active. This screen has no such reason, and sending the user to Today after
  // archiving would take away the one thing they came here to look at.
  const confirmed = managementScreen.slice(
    managementScreen.indexOf('const onArchiveConfirmed'),
    managementScreen.indexOf('const actions')
  );

  assert.equal(/navigation\./.test(confirmed), false, 'archiving navigates somewhere');
  assert.equal(managementScreen.includes('popTo'), false);
  assert.equal(managementScreen.includes('goBack()') && confirmed.includes('goBack'), false);
});

test('an archived habit can be continued from the collection', () => {
  assert.match(managementScreen, /label: 'Continue'/);
  assert.match(managementScreen, /action=\{actions\.continue\}/);

  // The store's action, passed straight through: no wrapper to get the
  // semantics wrong, and no restoreHabitIn call of its own.
  assert.match(managementScreen, /continue: \{[\s\S]*?onPress: restoreHabit,/);
  assert.equal(managementScreen.includes('restoreHabitIn'), false);
  assert.equal(managementScreen.includes('activePeriods'), false);
});

test('continuing is not asked about, the way Habit Detail already does not ask', () => {
  // One confirmation on the screen, and it is the archive one. Continuing is
  // reversible in one word, and a prompt would say it was the dangerous half.
  assert.equal((managementScreen.match(/<ConfirmationModal/g) ?? []).length, 1);
  assert.match(managementScreen, /visible=\{archiving !== null\}/);

  // Detail's Continue is still unconfirmed too, so the two agree.
  assert.match(habitDetail, /onPress=\{\(\) => restoreHabit\(habit\.id\)\}/);
  assert.equal(habitDetail.includes('ConfirmationModal'), false);
});

test('the word and the habit are two targets, not one', () => {
  // The bug this shape exists to prevent: a row that archives when you meant
  // to open it. Siblings inside the row, never nested, so a finger lands on
  // exactly one -- the same split HabitItem makes for the mark.
  assert.match(rowMarkup, /<Pressable[\s\S]*?style=\{styles\.openTarget\}/);
  assert.match(rowMarkup, /\{action \? \(\s*<Pressable/);
  assert.match(rowMarkup, /onPress=\{\(\) => action\.onPress\(habit\.id\)\}/);
  assert.equal((rowMarkup.match(/<Pressable/g) ?? []).length, 2);

  // The action's target is closed before the row's opening target is, and vice
  // versa -- neither contains the other.
  const open = rowMarkup.indexOf('style={styles.openTarget}');
  const closed = rowMarkup.indexOf('</Pressable>');
  const actionAt = rowMarkup.indexOf('styles.actionTarget');
  assert.ok(open < closed && closed < actionAt, 'the action sits outside the opening target');
});

test('a row without an action is the row it always was', () => {
  // The action is optional and defaults to nothing, so the component is still
  // usable as the single-target row -- and an actionless row draws no target,
  // rather than an empty one a finger could find.
  assert.match(habitRow, /action = null/);
  assert.match(rowMarkup, /\{action \? \([\s\S]*?\) : null\}/);
});

test('pressing the word cannot open the habit', () => {
  // The action's Pressable carries no onPress of the row's, and does not drive
  // the row's press animation -- so the surface does not light up under a
  // finger that is archiving rather than opening.
  const actionTarget = rowMarkup.slice(rowMarkup.indexOf('{action ? ('));

  assert.equal(actionTarget.includes('onPress(habit.id)') && !actionTarget.includes('action.onPress(habit.id)'), false);
  assert.equal(/onPressIn/.test(actionTarget), false, 'the word drives the row surface');
  assert.match(actionTarget, /accessibilityRole="button"/);
  // The dot stands in for the backtick of the template literal.
  assert.match(actionTarget, /accessibilityLabel=\{.\$\{action\.label\} \$\{habit\.name\}.\}/);
});

test('the collection still derives both halves from the store', () => {
  // The one piece of state on the screen is the question, not the list. A
  // local copy of the habits would be a second source of truth that could
  // disagree with the record.
  assert.equal((managementScreen.match(/useState/g) ?? []).length, 2);
  assert.match(managementScreen, /const \[archiving, setArchiving\] = useState\(null\)/);
  assert.equal(/useState\(\[\]\)|setHabits|setActive|setArchived/.test(managementScreen), false);

  // Both lists are still read straight from the store on every render.
  assert.match(managementScreen, /activeHabits\.map\(\(habit\)/);
  assert.match(managementScreen, /archivedHabits\.map\(\(habit\)/);
});

test('archiving the last active habit lands on the state that already existed', () => {
  // Not a new empty state: the one the screen has always drawn when habits
  // exist and none are active. Proven on the store functions the screen reads,
  // then on the branch that renders their output.
  const before = [habit({ id: 'a', name: 'Read' })];
  const after = archiveHabitIn(before, 'a', '2026-09-07T10:00:00.000Z');

  assert.deepEqual(activeHabitsFrom(after), []);
  assert.deepEqual(
    archivedHabitsFrom(after).map((item) => item.id),
    ['a']
  );

  // hasNothing stays false, so the screen shows Active-empty plus Archived
  // rather than "Nothing here yet."
  assert.match(managementScreen, /activeHabits\.length === 0 \? \(/);
  assert.match(managementScreen, /Nothing active right now\./);
  assert.match(managementScreen, /const hasNothing = activeHabits\.length === 0 && archivedHabits\.length === 0/);
});

test('continuing the last archived habit empties the archived half', () => {
  const archived = [habit({ id: 'a', archivedAt: '2026-02-01T09:00:00.000Z' })];
  const after = restoreOn(archived, 'a');

  assert.deepEqual(
    activeHabitsFrom(after).map((item) => item.id),
    ['a']
  );
  assert.deepEqual(archivedHabitsFrom(after), []);

  // And the section is not drawn at all when it holds nothing.
  assert.match(managementScreen, /archivedHabits\.length > 0 \? \(/);
});

test('moving one habit moves only that habit', () => {
  const habits = [
    habit({ id: 'a', name: 'Read' }),
    habit({ id: 'b', name: 'Walk' }),
    habit({ id: 'c', name: 'Stretch', archivedAt: '2026-02-01T09:00:00.000Z' }),
  ];

  const afterArchive = archiveHabitIn(habits, 'a', '2026-09-07T10:00:00.000Z');
  assert.deepEqual(
    activeHabitsFrom(afterArchive).map((item) => item.id),
    ['b']
  );
  assert.deepEqual(
    archivedHabitsFrom(afterArchive).map((item) => item.id),
    ['a', 'c']
  );

  // Every other habit comes through byte-identical, including the one that was
  // already archived.
  assert.deepEqual(afterArchive[1], habits[1]);
  assert.deepEqual(afterArchive[2], habits[2]);
});

test('archiving and continuing from the collection keep the record intact', () => {
  // The same guarantee the lifecycle tests make, asserted once more from the
  // collection's angle: the id is what completions are filed under, so as long
  // as it survives, so does everything recorded against it.
  const created = habit({ id: 'a', createdAt: '2026-01-01T09:00:00.000Z' });
  const completions = { a: { '2026-01-10': true, '2026-01-11': true } };

  const [archived] = archiveHabitIn([created], 'a', '2026-02-01T09:00:00.000Z');
  const [continued] = restoreOn([archived], 'a');

  assert.equal(continued.id, 'a');
  assert.equal(continued.createdAt, created.createdAt);
  assert.equal(continued.archivedAt, null);
  assert.deepEqual(continued.scheduleHistory, created.scheduleHistory);
  assert.deepEqual(completedDatesFor(completions, 'a'), ['2026-01-10', '2026-01-11']);

  // The season it spent put down is still in the record as exactly that.
  // isActiveOn asks about a calendar day, so it is handed one the way every
  // other history test hands it one -- local parts, not a key.
  assert.equal(isActiveOn(continued, on(2026, 3, 1)), false);
  assert.equal(isActiveOn(continued, on(2026, 6, 20)), true);

  // Two stretches, not one healed over: the gap is still in the record.
  assert.equal(continued.activePeriods.length, 2);
});

test('the create action from the collection is still there', () => {
  // #47, unchanged by any of this: one add row, outside both state branches.
  assert.equal((managementScreen.match(/onPress=\{openCreate\}/g) ?? []).length, 1);
  assert.match(managementScreen, /const openCreate = \(\) => navigation\.navigate\('CreateHabit'\)/);
  assert.match(managementScreen, /accessibilityLabel="Add a habit"/);
});

test('the collection is still a collection, not an admin panel', () => {
  // The shapes this checkpoint was told not to reach for.
  assert.equal(/Swipeable|PanResponder|Gesture|onLongPress/.test(managementScreen), false);
  assert.equal(/Swipeable|PanResponder|Gesture|onLongPress/.test(habitRow), false);
  // Quoted, so this asks about an ellipsis the user would read rather than
  // matching the spread operator in every style block.
  assert.equal(/Menu|Popover|ActionSheet|⋮|'\.\.\.'|>\.\.\.</.test(habitRow), false);
  assert.equal(managementScreen.includes('shadows.'), false);
  assert.equal(habitRow.includes('shadows.'), false);

  // The word is quiet type in a palette colour, not a button and not a warning.
  assert.match(habitRow, /actionLabel: \{\s*\.\.\.typography\.bodySmall,\s*color: colors\.textSecondary,/);
  assert.match(habitRow, /actionPressed: \{\s*opacity: motion\.pressed\.fade,/);
  assert.equal(/colors\.(accent|markDone)\b/.test(habitRow), false, 'the word is coloured like a warning');
  assert.equal(/backgroundColor: colors\.(accent|brand)/.test(habitRow), false);

  // And it is a real target, at the app's own size.
  assert.match(habitRow, /actionTarget: \{\s*minHeight: layout\.touchTarget,/);
});

test('nothing here is written for one platform', () => {
  for (const file of [managementScreen, habitRow]) {
    assert.equal(/Platform\.(OS|select)/.test(file), false);
    assert.equal(/android_ripple|TouchableNativeFeedback/.test(file), false);
  }
});

// ---------------------------------------------------------------------------
// The branded entrance
//
// Nine dots become the wordmark and the two O's open into Today. There is no
// renderer here, so this section splits the way the rest of the suite does:
// the arithmetic that decides where the dots sit and when each one hands over
// is asserted directly, and the things that can only be true of a file -- that
// the splash reads the palette rather than writing hexadecimal down, that it
// runs on the native driver, that it is a layer above the navigator rather
// than a screen inside it -- are asserted by reading the source.
// ---------------------------------------------------------------------------

const splashScreen = source('src/screens/SplashScreen.js');
const appEntry = source('App.js');
const wordmarkComponent = source('src/components/Wordmark.js');
const appManifest = JSON.parse(source('app.json'));

const [, nativeSplash] = appManifest.expo.plugins.find(
  (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-splash-screen'
);

/** The motion tokens, read as text -- theme/motion.js imports Easing and cannot load here. */
const motionSource = source('src/theme/motion.js');
const DURATION = Object.fromEntries(
  [
    ...motionSource
      .slice(motionSource.indexOf('duration: {'), motionSource.indexOf('easing: {'))
      .matchAll(/(\w+): (\d+),/g),
  ].map(([, token, value]) => [token, Number(value)])
);

/** How long the whole entrance runs, read off the token it is timed by. */
const ENTRANCE = DURATION.entrance;

/** A phase's window in milliseconds, for tests that care what a person sees. */
const ms = (phase) => TIMELINE[phase].map((point) => point * ENTRANCE);

const splashVariant = splashScreen.match(/const VARIANT = '(\w+)';/)[1];

// The wordmark's letters, read out of the component that owns them. The splash
// derives its nine dots from the same array at runtime; this asserts what that
// array is, which is the one piece of brand data the animation depends on.
const wordmarkSegments = [
  ...wordmarkComponent
    .slice(wordmarkComponent.indexOf('const SEGMENTS'), wordmarkComponent.indexOf('WORDMARK_SPACE_SCALE'))
    .matchAll(/\{ text: '([^']*)', accent: (true|false)(, narrow: true)? \}/g),
].map(([, text, accent, narrow]) => ({ text, accent: accent === 'true', narrow: Boolean(narrow) }));

const wordmarkLetters = wordmarkSegments.flatMap(({ text, accent, narrow }) =>
  [...text].map((char) => ({ char, accent, narrow }))
);

test('the brand is nine letters, and the splash has nine dots', () => {
  const letters = wordmarkLetters.filter(({ char }) => char.trim().length > 0);

  assert.equal(letters.length, DOT_COUNT);
  assert.equal(letters.map(({ char }) => char).join('').toLowerCase(), 'habitloop');
});

test('only the two Os carry the coral, in the order the wordmark sets', () => {
  const letters = wordmarkLetters.filter(({ char }) => char.trim().length > 0);
  const accented = letters
    .map((letter, index) => ({ ...letter, index }))
    .filter(({ accent }) => accent);

  assert.deepEqual(
    accented.map(({ index }) => index),
    [6, 7],
    'the coral belongs to the seventh and eighth letters -- the OO of habitloop'
  );
  assert.equal(accented.every(({ char }) => char.toLowerCase() === 'o'), true);
});

test('the lockup is one word, with nothing between the t and the l', () => {
  // It used to carry a narrowed word space here, on the reasoning that two
  // syllables need air between them. The drawn logo sets the name closed, and
  // a gap in the middle of a nine-letter name is what stopped it reading as a
  // name -- so the space is gone from the shared component, which means it is
  // gone from the header and the splash at once and cannot come back to one
  // without the other.
  assert.equal(
    wordmarkLetters.some(({ char }) => char.trim().length === 0),
    false,
    'the lockup has a space in it again'
  );
  assert.equal(wordmarkLetters.length, DOT_COUNT, 'every entry is a letter');
  assert.equal(wordmarkLetters.map(({ char }) => char).join(''), 'habitlOOp');
});

test('closing the gap did not close up the letters themselves', () => {
  // The gap goes; the tracking stays. Removing a word space is a change to the
  // lockup, and squeezing the letters would have been a change to the
  // typeface -- the header's own -0.025em is what holds "habitloop" together
  // and it is still what does it.
  assert.equal(typography.wordmark.letterSpacing, -0.5);
  assert.equal(typography.wordmark.fontSize, 20);
  const trackingOf = ({ letterSpacing, fontSize }) => letterSpacing / fontSize;
  assert.ok(
    Math.abs(trackingOf(typography.wordmarkLaunch) - trackingOf(typography.wordmark)) < 1e-6,
    'the splash and the header track the name differently'
  );
});

test('the splash reads those letters rather than writing the brand down again', () => {
  assert.match(splashScreen, /WORDMARK_LETTERS/);
  assert.equal(/'habit|"habit/.test(splashScreen), false, 'the name is spelled out a second time');
  assert.match(wordmarkComponent, /WORDMARK_LETTERS = SEGMENTS\.flatMap/);
});

// --- Where the dots sit -----------------------------------------------------

test('nine dots come in evenly spaced', () => {
  // Letter centres as a typeface actually gives them: an i is narrow, a b is
  // not, so the gaps between these are all different.
  const centers = [12, 34, 58, 68, 82, 104, 126, 150, 170];
  const starts = evenlySpaced(centers);

  const gaps = starts.slice(1).map((value, index) => value - starts[index]);
  for (const gap of gaps) assert.ok(Math.abs(gap - gaps[0]) < 1e-9, 'the row is not regular');
});

test('the row of dots spans exactly the width the wordmark will', () => {
  const centers = [12, 34, 58, 68, 82, 104, 126, 150, 170];
  const starts = evenlySpaced(centers);

  assert.equal(starts[0], centers[0]);
  assert.equal(starts[starts.length - 1], centers[centers.length - 1]);
});

test('a dot only ever has a short way to travel to its letter', () => {
  const centers = [12, 34, 58, 68, 82, 104, 126, 150, 170];
  const starts = evenlySpaced(centers);
  const span = centers[centers.length - 1] - centers[0];

  for (const [index, start] of starts.entries()) {
    assert.ok(
      Math.abs(start - centers[index]) < span * 0.2,
      'a dot drifts far enough that the letters would be seen to slide'
    );
  }
});

test('evenly spacing nothing, or one thing, is not an error', () => {
  assert.deepEqual(evenlySpaced([]), []);
  assert.deepEqual(evenlySpaced([40]), [40]);
});

// --- When each dot hands over ----------------------------------------------

test('the wordmark arrives as one lockup, not as nine letters', () => {
  // Two passes were spent staggering the letters so each could grow out of its
  // own dot. With no morph left, a stagger would only be nine events where the
  // brand should be one -- so the whole lockup is animated on the row, and a
  // letter has nothing of its own until it leaves.
  assert.equal(/stagger|morphAt/i.test(code(splashScreen)), false, 'the letters arrive separately');
  assert.match(splashScreen, /styles\.row, \{ opacity: lockupFade, transform: \[\{ scale: lockupScale \}\] \}/);

  // The per-letter component is down to leaving, plus the O's own step forward.
  assert.match(splashScreen, /function Letter\(\{ letter, style, progress \}\)/);
});

test('nothing is left pretending to be a morph', () => {
  // The machinery that existed only to fake a circle becoming a glyph is gone
  // rather than kept alive behind its tests.
  const lib = source('src/lib/splash.js');

  for (const name of ['dotStretch', 'letterSeed', 'inkHeightFor', 'DOT_FILL', 'morphAt', 'DOT_STAGGER']) {
    assert.equal(
      new RegExp(`export (const|function) ${name}\\b`).test(lib),
      false,
      `${name} survived the morph it belonged to`
    );
  }

  assert.equal(/scaleX|scaleY/.test(code(splashScreen)), false, 'the per-axis deformation is still here');
});

// --- That it is a transformation and not a crossfade ------------------------

test('the dots draw in before they let go', () => {
  // The compression is the anticipation. Without it the wordmark simply
  // replaces the dots, which is a cut however well the rest is timed.
  assert.ok(GATHER.scale < 1, 'the dots do not compress at all');
  assert.ok(GATHER.scale > 0.7, `the dots shrink to ${GATHER.scale}, which reads as vanishing`);
  assert.ok(GATHER.pull > 0 && GATHER.pull < 0.2, `the dots lean ${GATHER.pull} toward the middle`);
});

test('the gather takes the last bounce with it rather than following it', () => {
  // It has to start while the fourth bounce is still running, or there is a
  // pause between settling and winding up -- which is the dead beat the whole
  // choreography is meant to avoid.
  assert.ok(TIMELINE.gather[0] < TIMELINE.bounce[1], 'the dots settle, stop, and then gather');

  const { input, output } = bounceKeyframes(16);
  const lastPeak = input[output.indexOf(Math.min(...output.slice(-5)))];
  const gatherStart = (TIMELINE.gather[0] - TIMELINE.bounce[0]) /
    (TIMELINE.bounce[1] - TIMELINE.bounce[0]);
  assert.ok(gatherStart > lastPeak - 0.4, 'the gather starts before the bounces are nearly done');
});

test('the pop is the release of the gather, not a separate event', () => {
  assert.ok(TIMELINE.pop[0] < TIMELINE.gather[1], 'the dots finish gathering before anything pops');
  assert.ok(POP.release > 1, 'the dots do not push back out as they let go');
  assert.ok(POP.release > GATHER.scale, 'the release is smaller than the wind-up');
  assert.ok(POP.release < 1.4, `the dots fly out to ${POP.release}, which is a celebration`);
});

test('the dots are still nine dots on the frame the pop begins', () => {
  // They must not have quietly faded out under the wordmark: the reveal is
  // supposed to look like it was thrown by them.
  assert.match(splashScreen, /until: at\('pop', 0\.12\), to: 1 \}/);
  const fadeBy = splashScreen.match(/until: at\('pop', ([\d.]+)\), to: 0, shape: CURVE\.out/);
  assert.ok(fadeBy, 'the dots do not leave during the pop');
  assert.ok(Number(fadeBy[1]) <= 0.6, 'the dots linger past the pop');
});

test('the wordmark lands rather than fades up', () => {
  // Scale carries the reveal and opacity supports it. A lockup that only faded
  // in is the generic version of this moment.
  assert.ok(POP.from < 1 && POP.from >= 0.88, `the lockup comes in from ${POP.from}`);
  assert.ok(POP.overshoot > 1, 'the lockup does not overshoot at all');
  assert.ok(POP.overshoot <= 1.05, `the lockup overshoots to ${POP.overshoot}, which is a bounce`);

  // And it is fully opaque well before it has finished settling, so the last
  // thing seen is movement rather than a fade.
  assert.match(splashScreen, /until: at\('pop', 0\.45\), to: 1, shape: CURVE\.out/);
  assert.match(splashScreen, /until: at\('settle', 1\), to: 1, shape: CURVE\.out/);
});

test('the reveal beats are quick, and none of them is a pause', () => {
  const gather = ms('gather');
  const pop = ms('pop');
  const settle = ms('settle');

  assert.ok(gather[1] - gather[0] >= 90 && gather[1] - gather[0] <= 170);
  assert.ok(pop[1] - pop[0] >= 90 && pop[1] - pop[0] <= 200);
  assert.ok(settle[1] - settle[0] >= 110 && settle[1] - settle[0] <= 200);

  // Together they are far shorter than the 759ms morph they replace: the
  // entrance got tighter, not longer, for dropping the pretence.
  const reveal = settle[1] - gather[0];
  assert.ok(reveal < 500, `the reveal takes ${Math.round(reveal)}ms`);
});

test('the dots keep their own row rather than chasing the letters', () => {
  // With no morph there is nothing for a dot to travel to: nine evenly spaced
  // dots are the point, and they stay evenly spaced until they gather.
  assert.match(splashScreen, /left: geometry\.row\.x \+ geometry\.starts\[dotIndex\] - dotSize \/ 2/);
  assert.equal(/slideBy/.test(code(splashScreen)), false, 'the dots still drift onto letter centres');
});

// --- The portal -------------------------------------------------------------

test('a dot carries the weight of the word it sets up', () => {
  const size = typography[splashVariant].fontSize;
  const dot = dotSizeFor(size);

  // Drawn at 0.22 of the type size these were punctuation weight and read as
  // something loading. They are the wind-up for the brand and have to carry
  // comparable ink.
  assert.ok(dot / size > 0.25, `a dot is ${dot} points against ${size}pt type`);
  assert.ok(dot > Math.round(size * 0.22), 'the dots did not actually grow');

  // And still a dot.
  assert.ok(dot < size * 0.5, 'the dots are large enough to read as marks rather than dots');
  assert.ok(dot >= 3, 'and small enough to disappear');
});

test('the splash sets the wordmark at launch size, from the type system', () => {
  const launch = typography.wordmarkLaunch;

  assert.match(splashScreen, /const VARIANT = 'wordmarkLaunch';/);
  assert.equal(/fontSize: \d/.test(splashScreen), false, 'a size was written into the splash');

  assert.ok(
    launch.fontSize > typography.wordmark.fontSize,
    'the launch lockup is no larger than the header one'
  );
  assert.ok(launch.fontSize > typography.display.fontSize, 'the launch lockup did not grow');
  assert.ok(launch.fontSize <= 56, `${launch.fontSize}pt is a headline, not a lockup`);
  assert.ok(launch.lineHeight > launch.fontSize);
});

test('the launch lockup is bold by cut, never by synthesis', () => {
  const launch = typography.wordmarkLaunch;

  assert.equal(launch.fontFamily, 'PlusJakartaSans_700Bold');
  assert.equal('fontWeight' in launch, false, 'Android would synthesise this bold');

  // The rule is the type system's, not this token's: nothing in it may lean on
  // a synthetic weight. Asserted over the tokens themselves rather than over
  // the file, which is free to talk about fontWeight in order to forbid it.
  for (const [name, token] of Object.entries(typography)) {
    assert.equal('fontWeight' in token, false, `typography.${name} carries a fontWeight`);
    assert.match(token.fontFamily, /^PlusJakartaSans_/, `typography.${name}`);
  }
});

test('the ring starts life the size of the letter O it takes over from', () => {
  const oWidth = 30;
  const ring = ringSizeFor(oWidth);

  assert.ok(ring <= oWidth, 'the ring is wider than the letter it replaces');
  assert.ok(ring > oWidth * 0.85, 'and narrow enough that the swap is visible');
});

test('the portal clears the corner of the screen it opens on', () => {
  for (const [width, height] of [[360, 640], [412, 915], [1024, 768], [430, 932]]) {
    const ringSize = ringSizeFor(30);
    const scale = portalScale({ ringSize, width, height });
    const radius = (ringSize * scale) / 2;

    assert.ok(
      radius >= Math.sqrt(width * width + height * height),
      `the ring stops short of the corner at ${width}x${height}`
    );
  }
});

test('the portal never has to shrink to open', () => {
  assert.ok(portalScale({ ringSize: 4000, width: 360, height: 640 }) >= 1);
  assert.ok(Number.isFinite(portalScale({ ringSize: 0, width: 360, height: 640 })));
});

test('the ring picks the O up where the O left off', () => {
  // The portal has to be the O continuing, not a new object appearing at the
  // O's address: it starts at exactly the scale the emphasis grew the letter
  // to, and accelerates from there.
  assert.match(
    splashScreen,
    /track\(at\('portal', 0\), O_EMPHASIS, \[[\s\S]{0,200}shape: CURVE\.accelerate/
  );

  // And the letter itself is still growing into the portal rather than being
  // switched off at the boundary.
  assert.match(splashScreen, /until: at\('portal', 0\.5\), to: O_EMPHASIS \* [\d.]+/);
});

test('Today is already showing while the coral is still crossing it', () => {
  // The reveal has to start before the portal is gone, or it reads as a wipe
  // that finishes and then uncovers rather than as an opening.
  const ground = splashScreen.match(/track\(at\('portal', ([\d.]+)\), 1, \[\s*\{ until: at\('portal', ([\d.]+)\)/);
  assert.ok(ground, 'the ground fade is not written against the portal');

  const [, fadeFrom, fadeTo] = ground.map(Number);
  assert.ok(fadeFrom < 0.4, 'the day starts arriving too late');
  assert.ok(fadeTo < 1, 'the day is not there until the portal has gone');
});

test('the ring is drawn as a ring rather than as a disc', () => {
  const ring = ringSizeFor(30);

  assert.ok(ringBorderFor(ring) > 0);
  assert.ok(ringBorderFor(ring) < ring / 4, 'the ring is thick enough to read as a filled O');
  assert.match(splashScreen, /borderWidth: geometry\.ringBorder/);
  assert.match(splashScreen, /backgroundColor: 'transparent'/);
});

// --- Theme ------------------------------------------------------------------

test('the splash stands on the same paper as the Hero', () => {
  assert.match(splashScreen, /backgroundColor: colors\.background/);
  // Screen paints the same token, and so does the backdrop the splash sits in,
  // which is what makes the hand-off a layer leaving rather than a ground
  // changing.
  assert.match(source('src/components/Screen.js'), /backgroundColor: colors\.background/);
  assert.match(appEntry, /backgroundColor: colors\.background/);
});

test('the splash never writes a colour down', () => {
  assert.equal(
    /#[0-9a-fA-F]{3,8}\b/.test(splashScreen),
    false,
    'a hexadecimal colour in the splash cannot follow the theme'
  );
  assert.equal(/rgba?\(/.test(splashScreen), false);
  assert.equal(/[Gg]radient/.test(splashScreen), false);
});

test('the dots are the wordmark colours and nothing else', () => {
  const used = [...splashScreen.matchAll(/colors\.([A-Za-z]+)/g)].map(([, token]) => token);

  assert.deepEqual(
    [...new Set(used)].sort(),
    ['accent', 'background', 'brand'],
    'the splash reaches for a token the wordmark does not use'
  );
  assert.match(splashScreen, /dotBrand: \{\s*backgroundColor: colors\.brand,/);
  assert.match(splashScreen, /dotAccent: \{\s*backgroundColor: colors\.accent,/);
  assert.match(splashScreen, /ring: \{[\s\S]*?borderColor: colors\.accent,/);
});

test('the splash does not decide for itself which theme is running', () => {
  assert.equal(/Appearance|useColorScheme/.test(splashScreen), false);
  assert.match(splashScreen, /useThemedStyles/);
});

test('the wordmark is legible on the ground the splash paints, in both themes', () => {
  for (const scheme of ['light', 'dark']) {
    const palette = themes[scheme];

    // The seven blue letters are text and are held to text's standard. The
    // coral is not: it is the mark colour, and on warm paper it sits at
    // roughly 2.4:1 by design -- which is why the O's are never the only thing
    // carrying meaning here, and why the seven letters beside them are.
    assert.ok(contrast(palette.brand, palette.background) >= 4.5, `${scheme}: the letters`);
    // The OO is told apart from the rest by hue, not by lightness -- coral and
    // the brand blue sit at nearly the same luminance in the dark palette -- so
    // what is asserted here is that they are genuinely two colours and that the
    // splash never has to invent a third.
    assert.notEqual(palette.accent, palette.brand, `${scheme}: the OO`);
    assert.notEqual(palette.accent, palette.background, `${scheme}: the OO on the ground`);
  }

  // The one value the two palettes share verbatim, and the splash inherits it
  // without knowing that: a completed day and the portal are the same coral at
  // noon and at midnight.
  assert.equal(themes.light.accent, themes.dark.accent);
});

test('the native launch background is the theme it hands over to, in both themes', () => {
  const [, splashPlugin] = appManifest.expo.plugins.find(
    (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-splash-screen'
  );

  // These two are the only places in the app where a background colour is
  // written down rather than read, because a manifest cannot import a palette.
  // If either drifts, a cold launch flashes the wrong ground before the first
  // React frame -- so they are pinned to the tokens here instead.
  assert.equal(splashPlugin.backgroundColor.toUpperCase(), themes.light.background.toUpperCase());
  assert.equal(splashPlugin.dark.backgroundColor.toUpperCase(), themes.dark.background.toUpperCase());
});

// --- Where it lives ---------------------------------------------------------

test('the splash is a layer above the navigator, not a screen inside it', () => {
  assert.equal(/Splash/.test(rootNavigator), false, 'the entrance became a route');
  assert.match(appEntry, /<RootNavigator \/>[\s\S]*<BrandSplash/, 'Today is not underneath it');
  assert.equal(/navigation\.(navigate|replace|push)/.test(splashScreen), false);
  assert.equal(/useNavigation|NavigationContainer/.test(splashScreen), false);
});

test('the entrance plays once per launch, and nothing below it can replay it', () => {
  // The flag is held by AppContent, which mounts when the app starts and is
  // never unmounted: a push to a habit, to Settings or to the collection
  // happens several levels down and cannot reach it.
  assert.match(appEntry, /const \[entered, setEntered\] = useState\(false\)/);
  assert.match(appEntry, /\{entered \? null : <BrandSplash onDone=\{onEntered\} \/>\}/);
  assert.equal(
    /entered/.test(rootNavigator),
    false,
    'the navigator has an opinion about the entrance'
  );
});

test('the entrance waits for the app and then does not hold it', () => {
  // Rendered inside the same gate the app already had -- fonts, habits and the
  // saved appearance -- rather than beside a second readiness system.
  assert.match(appEntry, /const canRender = fontsReady && habitsReady && themeReady;/);
  assert.match(appEntry, /if \(!canRender\) return null;/);
  assert.equal(/notification/i.test(splashScreen), false, 'the splash waits on unrelated work');

  // And it always leaves, whatever the measurement or the platform does --
  // with a margin derived from the entrance itself, so retiming the animation
  // cannot leave the failsafe firing in the middle of it.
  assert.match(splashScreen, /setTimeout\(finish, FAILSAFE\)/);
  assert.match(splashScreen, /const FAILSAFE = motion\.duration\.entrance \+ (\d+);/);
  const margin = Number(splashScreen.match(/const FAILSAFE = motion\.duration\.entrance \+ (\d+);/)[1]);
  assert.ok(margin > 0, 'the failsafe can fire before the entrance has finished');
});

test('the native splash is still the app handing over to itself', () => {
  assert.equal(nativeSplash.resizeMode, 'contain');
  assert.ok(nativeSplash.image, 'the native splash lost its asset');
  assert.match(appEntry, /SplashScreen\.preventAutoHideAsync\(\)/);
  assert.match(appEntry, /SplashScreen\.hideAsync\(\)/);
});

test('the native launch shows no wordmark, in either theme', () => {
  // The first branded thing the user sees has to be the nine dots. A native
  // splash carrying the drawn logo made the launch read
  // wordmark -> dots -> wordmark, which is the sequence backwards.
  for (const image of [nativeSplash.image, nativeSplash.dark.image]) {
    assert.ok(image, 'a theme was left without a launch asset');
    assert.equal(
      /logo|wordmark|splash-icon|icon/.test(image),
      false,
      `the native launch still points at ${image}`
    );
  }

  assert.equal(nativeSplash.image, nativeSplash.dark.image, 'the two themes bridge differently');
});

test('the native launch asset is there, and draws nothing', () => {
  // Both halves matter. It has to exist, because expo-splash-screen writes
  // windowSplashScreenAnimatedIcon = @drawable/splashscreen_logo into the
  // generated styles whether or not an image was configured -- dropping the
  // image would leave that reference dangling. And it has to be empty, because
  // the whole point is that nothing is drawn before the dots.
  const asset = nativeSplash.image.replace(/^\.\//, '');

  assert.match(asset, /\.png$/);
  assert.equal(
    peakAlpha(bytes(asset)),
    0,
    'the native launch asset has visible pixels in it'
  );
});

// --- How it is animated -----------------------------------------------------

test('the entrance brought no new dependency with it', () => {
  const imports = [...splashScreen.matchAll(/from '([^']+)'/g)].map(([, from]) => from);

  for (const from of imports) {
    assert.ok(
      from === 'react' || from === 'react-native' || from.startsWith('.'),
      `the splash imports ${from}`
    );
  }

  const manifest = JSON.parse(source('package.json'));
  assert.equal('react-native-reanimated' in manifest.dependencies, false);
  assert.equal(
    Object.keys(manifest.dependencies).some((name) => /lottie|svg|skia/i.test(name)),
    false
  );
});

test('every frame of it runs off the JS thread', () => {
  assert.equal(
    /useNativeDriver: false/.test(splashScreen),
    false,
    'something in the entrance animates on the JS thread'
  );

  const drivers = splashScreen.match(/useNativeDriver: true/g) ?? [];
  const timings = splashScreen.match(/Animated\.timing\(/g) ?? [];
  assert.equal(drivers.length, timings.length, 'a timing was left without a driver');

  // Which is only possible because the only things moving are transforms the
  // native driver knows, and there are exactly three of them.
  const moved = [...splashScreen.matchAll(/transform: \[([^\]]*)\]/g)]
    .flatMap(([, entries]) => [...entries.matchAll(/\{ ([A-Za-z]+):/g)])
    .map(([, key]) => key);

  assert.ok(moved.length > 0, 'nothing in the entrance moves');
  assert.deepEqual([...new Set(moved)].sort(), ['scale', 'translateX', 'translateY']);
  assert.equal(/LayoutAnimation/.test(splashScreen), false);
});

test('the entrance is timed in the app own motion tokens', () => {
  assert.match(splashScreen, /duration: motion\.duration\.entrance/);
  assert.match(splashScreen, /duration: motion\.duration\.settle/);
  assert.match(splashScreen, /easing: motion\.easing\./);
  assert.equal(/duration: \d/.test(splashScreen), false, 'a duration was written down');
  assert.equal(/Easing\./.test(splashScreen), false, 'the splash reaches past the motion system');
});

test('the phases are shaped by different curves, because they mean different things', () => {
  // One curve everywhere is the other way an animation reads as mechanical.
  // The driver is linear precisely so these can differ.
  for (const curve of ['out', 'inOut', 'accelerate']) {
    assert.ok(typeof CURVE[curve] === 'function');
    assert.ok(Math.abs(CURVE[curve](0)) < 1e-9, `CURVE.${curve} does not start at 0`);
    assert.ok(Math.abs(CURVE[curve](1) - 1) < 1e-9, `CURVE.${curve} does not end at 1`);
  }

  // Decelerating, accelerating, and slow at both ends -- checked by where each
  // has got to at the halfway point rather than by name.
  assert.ok(CURVE.out(0.5) > 0.5, 'CURVE.out does not front-load');
  assert.ok(CURVE.accelerate(0.5) < 0.5, 'CURVE.accelerate does not gather speed');
  assert.ok(Math.abs(CURVE.inOut(0.5) - 0.5) < 1e-9, 'CURVE.inOut is not symmetrical');
  assert.ok(CURVE.inOut(0.25) < 0.25 && CURVE.inOut(0.75) > 0.75);

  const used = [...splashScreen.matchAll(/CURVE\.(\w+)/g)].map(([, name]) => name);
  assert.ok(new Set(used).size >= 3, 'the whole entrance is drawn with one curve');
});

test('a curve is sampled into enough keyframes to stop being a straight line', () => {
  // React Native interpolates in straight lines, so a two-point "eased" range
  // is not eased at all. track() samples; this is that promise.
  const straight = track(0, 0, [{ until: 1, to: 1, shape: CURVE.out }]);
  assert.equal(straight.inputRange.length, 2);

  const curved = track(0, 0, [{ until: 1, to: 1, shape: CURVE.out, steps: 6 }]);
  assert.equal(curved.inputRange.length, 7);
  assert.ok(curved.outputRange[1] > curved.inputRange[1], 'the samples are not on the curve');
  assert.ok(curved.inputRange.every((v, i) => i === 0 || v > curved.inputRange[i - 1]));
  assert.equal(curved.outputRange.at(-1), 1);
  assert.equal(curved.extrapolate, 'clamp');
});

test('a track can hold a value still while other phases run', () => {
  // Holding is how a property sits out a phase that does not concern it --
  // the dots keep their place in the row for the whole bounce this way.
  const held = track(0, 5, [
    { until: 0.4, to: 5 },
    { until: 1, to: 0, shape: CURVE.inOut, steps: 4 },
  ]);

  assert.equal(held.outputRange[0], 5);
  assert.equal(held.outputRange[1], 5);
  assert.equal(held.outputRange.at(-1), 0);
  assert.ok(held.inputRange.every((v, i) => i === 0 || v > held.inputRange[i - 1]));
});

test('the entrance is a branded entrance, not an interaction', () => {
  // Long enough for six overlapping phases to be seen as six things, short
  // enough that a returning user is not waiting on it.
  assert.ok(ENTRANCE >= 2100 && ENTRANCE <= 2400, `the entrance runs for ${ENTRANCE}ms`);

  // And it is the one duration in the system allowed to be this long: nothing
  // an interaction reaches for may borrow it.
  for (const [token, value] of Object.entries(DURATION)) {
    if (token === 'entrance') continue;
    assert.ok(value <= 400, `motion.duration.${token} is ${value}ms`);
  }
});

test('no phase is rushed, and none of them is a pause', () => {
  // The dots own the long half of the entrance; the reveal is deliberately the
  // quick part of it.
  const [emergeFrom, emergeTo] = ms('emerge');
  assert.ok(emergeTo - emergeFrom >= 300);

  // Every phase is long enough to be perceived at all.
  for (const phase of PHASES) {
    const [from, to] = ms(phase);
    assert.ok(to - from >= 100, `${phase} lasts ${Math.round(to - from)}ms`);
  }

  // And the dots still hold the screen for most of it, which is what makes the
  // pop a payoff rather than the subject.
  const dots = ms('bounce')[1] - ms('emerge')[0];
  assert.ok(dots > ENTRANCE * 0.4, `the dots hold the screen for ${Math.round(dots)}ms`);
});

test('the dots bounce four times, and each one is smaller than the last', () => {
  const rise = Number(splashScreen.match(/const RISE = (\d+);/)[1]);
  const { heights, input, output } = bounceKeyframes(rise);

  assert.equal(heights.length, BOUNCE_COUNT);
  assert.ok(BOUNCE_COUNT >= 3 && BOUNCE_COUNT <= 4, `${BOUNCE_COUNT} bounces`);

  for (let i = 1; i < heights.length; i += 1) {
    assert.ok(heights[i] < heights[i - 1], 'a bounce is no smaller than the one before it');
  }

  // Visibly running out of energy rather than four polite copies: the last is
  // a small fraction of the first.
  assert.ok(heights.at(-1) / heights[0] < 0.25, 'the bounces barely decay');
  assert.ok(heights.at(-1) > 0.5, 'the last bounce is too small to see');

  // Starts at rest and ends at rest, having actually left the line in between.
  assert.equal(output[0], 0);
  assert.equal(output.at(-1), 0);
  assert.ok(Math.min(...output) <= -rise + 0.001, 'the first bounce is short of RISE');
  assert.equal(input[0], 0);
  assert.equal(input.at(-1), 1);
  assert.ok(input.every((value, i) => i === 0 || value > input[i - 1]), 'keyframes double back');
});

test('the bounces crowd together as they die away', () => {
  // A real bounce takes less time the less height it has. Four evenly spaced
  // bounces of decreasing height is a cartoon; four that also speed up is an
  // object running out of energy.
  const { input, output } = bounceKeyframes(16);
  const peaks = input.filter((_, i) => output[i] < -0.001 && output[i] === Math.min(
    output[i], output[i - 1] ?? 0, output[i + 1] ?? 0
  ));

  assert.equal(peaks.length, BOUNCE_COUNT, 'the arcs are not distinguishable');
  const gaps = peaks.slice(1).map((peak, i) => peak - peaks[i]);
  for (let i = 1; i < gaps.length; i += 1) {
    assert.ok(gaps[i] < gaps[i - 1], 'the bounces do not quicken');
  }
});

test('the bounce is a settling object, not a spring or a loop', () => {
  assert.equal(/Animated\.spring|Easing\.bounce|Easing\.elastic/.test(splashScreen), false);
  assert.equal(/iterations|Animated\.loop/.test(splashScreen), false);

  // The first bounce is the tallest the row ever gets, and it stays well
  // inside the height of the word it is about to become -- so the row reads as
  // settling rather than leaping.
  const rise = Number(splashScreen.match(/const RISE = (\d+);/)[1]);
  const size = typography[splashVariant].fontSize;
  assert.ok(rise > 0, 'the dots do not move at all');
  assert.ok(rise < size * 0.4, `the dots rise ${rise} points against ${size}pt type`);
  assert.ok(rise > dotSizeFor(size) * 0.5, 'the first bounce is too small to read');
});

test('the dots get long enough to be watched bouncing', () => {
  const [from, to] = ms('bounce');
  assert.ok(to - from >= 700, `the bounce lasts ${Math.round(to - from)}ms`);
  assert.ok(to - from <= 1100, 'the bounce outstays its welcome');
});

test('the dots are drawn out of one point at the centre', () => {
  // Not nine dots switched on where they will end up: one mark that separates.
  assert.ok(EMERGE_CLUSTER > 0, 'nine dots at one point is one dot');
  assert.ok(EMERGE_CLUSTER < 0.25, 'the dots do not start gathered enough to read as one');

  const [from, to] = ms('emerge');
  assert.ok(to - from >= 300, `the emergence takes ${Math.round(to - from)}ms`);
  assert.match(splashScreen, /gathered=\{/);
  assert.match(splashScreen, /geometry\.centre/);
  assert.match(splashScreen, /centre: \(dotCenters\[0\] \+ dotCenters\[dotCenters\.length - 1\]\) \/ 2/);
});

test('the entrance is one gesture, in the order the concept says', () => {
  assert.deepEqual(PHASES, ['emerge', 'bounce', 'gather', 'pop', 'settle', 'emphasis', 'portal']);

  for (const phase of PHASES) {
    const [from, to] = TIMELINE[phase];
    assert.ok(to > from, `${phase} has no duration`);
  }

  // Read in order, and covering the whole of it.
  const starts = PHASES.map((phase) => TIMELINE[phase][0]);
  for (let i = 1; i < starts.length; i += 1) {
    assert.ok(starts[i] > starts[i - 1], `${PHASES[i]} does not follow ${PHASES[i - 1]}`);
  }
  assert.equal(TIMELINE.emerge[0], 0);
  assert.equal(TIMELINE.portal[1], 1);
});

test('every phase begins before the one before it has ended', () => {
  // This is the whole of what was wrong. Animated.sequence cannot overlap:
  // each step started on the frame the last one finished, so six well-eased
  // movements still read as six movements. An overlap everywhere means there
  // is no frame on which one thing stops and another starts.
  for (let i = 1; i < PHASES.length; i += 1) {
    const previous = TIMELINE[PHASES[i - 1]];
    const current = TIMELINE[PHASES[i]];

    assert.ok(
      current[0] < previous[1],
      `${PHASES[i]} starts after ${PHASES[i - 1]} has finished`
    );
    const overlap = (previous[1] - current[0]) * ENTRANCE;
    assert.ok(overlap >= 30, `${PHASES[i]} overlaps by only ${Math.round(overlap)}ms`);
  }
});

test('and there is no moment when nothing is happening', () => {
  // A gap between two phases is a dead pause on screen, and the timeline is
  // the only place one could hide.
  let covered = 0;
  for (const phase of PHASES) {
    const [from, to] = TIMELINE[phase];
    assert.ok(from <= covered, `nothing is moving between ${covered} and ${from}`);
    covered = Math.max(covered, to);
  }
  assert.equal(covered, 1);
});

test('the entrance is driven by exactly one animation', () => {
  // Six drivers started in turn is what made this a slideshow. There is one
  // now, it carries time only, and the shaping is per phase.
  assert.match(splashScreen, /Animated\.timing\(progress, \{[\s\S]{0,120}duration: motion\.duration\.entrance/);
  assert.match(splashScreen, /easing: motion\.easing\.linear/);

  // Exactly one timing, and no chain, outside the reduced-motion branch --
  // which is allowed its own short sequence because it is not choreography.
  const full = splashScreen.slice(splashScreen.indexOf('return () => shortened.stop();'));
  assert.equal((full.match(/Animated\.timing\(/g) || []).length, 1);
  assert.equal(/Animated\.sequence|Animated\.delay/.test(full), false, 'the chain is back');
});

test('the OO grows, and stops well short of a zoom', () => {
  const emphasis = Number(splashScreen.match(/const O_EMPHASIS = ([\d.]+);/)[1]);

  assert.ok(emphasis > 1, 'the OO does not take the eye at all');

  // The ceiling is not taste, it is geometry. The two O's are adjacent glyphs
  // tracked at a negative letterSpacing, so there are only a couple of points
  // of air between them; each grows about its own centre, and past roughly a
  // tenth the two bowls meet and the OO stops being two letters and becomes an
  // infinity symbol -- which is the one shape this moment must not make. This
  // was measured on a Pixel at the display size: 1.18 merged them, 1.09 does
  // not.
  assert.ok(emphasis <= 1.1, `the OO grows to ${emphasis} and the two bowls touch`);
});

test('the entrance answers a phone that has asked for less motion', () => {
  assert.match(splashScreen, /AccessibilityInfo\.isReduceMotionEnabled\(\)/);
  // Shortened rather than skipped, and it still hands over the same way.
  assert.match(splashScreen, /if \(reduced\)/);
  assert.match(splashScreen, /\.catch\(\(\) => \{\s*if \(!cancelled\) setReduced\(false\)/);
});

test('the entrance cannot be tapped through while Today is live underneath', () => {
  assert.match(splashScreen, /onStartShouldSetResponder=\{BLOCK_TOUCHES\}/);
  assert.match(splashScreen, /const BLOCK_TOUCHES = \(\) => true;/);
});

test('the wordmark is read by a screen reader as a name, not as nine letters', () => {
  assert.match(splashScreen, /accessibilityLabel="Habit Loop"/);
  assert.match(splashScreen, /accessible\b/);
});

test('the entrance is not written for one platform', () => {
  assert.equal(/Platform\.(OS|select)/.test(splashScreen), false);
});

test('Today still renders the wordmark component it always did', () => {
  assert.match(todayScreen, /<Wordmark \/>/);
  assert.equal(/SplashScreen|BrandSplash/.test(todayScreen), false, 'Today knows about the splash');
  // The component still renders one Text of segments at whichever variant it
  // is handed -- the lockup lost its word space, not its structure.
  assert.match(wordmarkComponent, /accessibilityRole="header"\s*accessibilityLabel="Habit Loop">/);
  assert.match(wordmarkComponent, /const scale = typography\[variant\] \?\? typography\.wordmark;/);
  assert.match(wordmarkComponent, /\{SEGMENTS\.map\(\(segment, index\) => \(/);
  assert.equal(/SPACE_SCALE|narrowSpace/.test(wordmarkComponent), false, 'the space machinery lingers');
  assert.equal(/SPACE_SCALE|narrowSpace/.test(splashScreen), false, 'the splash still fakes a space');
});

// ---------------------------------------------------------------------------

for (const { name, error } of failures) {
  console.error(`FAIL  ${name}`);
  console.error(`      ${error.message.split('\n').join('\n      ')}`);
}

console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
