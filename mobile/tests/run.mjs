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

import { isCompletedOn, toggleCompletionOn, completedDatesFor } from '../src/lib/completions.js';
import { addDays, fromDateKey, toDateKey } from '../src/lib/dates.js';
import {
  COMPLETED_STATEMENT,
  RETURN_STATEMENT,
  getDayStatement,
  getDayVoice,
  getRhythmNote,
  getVoiceWindow,
} from '../src/lib/greeting.js';
import {
  dateKeyFrom,
  initialHistory,
  hasOpenPeriod,
  inactiveReasonOn,
  isActiveOn,
  lastActiveDayKey,
  scheduleOn,
  wasScheduledOn,
  withActiveClosed,
  withActiveOpened,
  withScheduleVersion,
} from '../src/lib/history.js';
import { getHabitInsight } from '../src/lib/insights.js';
import { isReturningHabit } from '../src/lib/recovery.js';
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
  assert.notEqual(statement, COMPLETED_STATEMENT);
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
  assert.notEqual(statementFor(many, completions, MONDAY_9AM), COMPLETED_STATEMENT);
});

test('finishing everything scheduled changes the line', () => {
  const many = Array.from({ length: 3 }, (_, index) => habit({ id: `habit-${index}` }));
  const completions = Object.fromEntries(
    many.map((item) => [item.id, { [MONDAY_KEY]: true }])
  );

  assert.equal(shapeOfDay(many, completions, MONDAY_9AM).allDone, true);
  assert.equal(statementFor(many, completions, MONDAY_9AM), COMPLETED_STATEMENT);
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
  assert.notEqual(statementFor([only], undone, MONDAY_9AM), COMPLETED_STATEMENT);
});

test('returning is said once the user has come back', () => {
  assert.equal(statementFor([habit()], {}, MONDAY_9AM, { hasReturned: true }), RETURN_STATEMENT);
});

test('finishing the day outranks having returned to it', () => {
  // Returning is how the day started, not how it ended.
  const only = habit();
  const completions = { [only.id]: { [MONDAY_KEY]: true } };

  assert.equal(
    statementFor([only], completions, MONDAY_9AM, { hasReturned: true }),
    COMPLETED_STATEMENT
  );
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
  // Every mood on this screen is read back out of habits and completions. The
  // one piece of state is the session-only return, which is a moment rather
  // than a status and is deliberately forgotten on relaunch.
  assert.equal((todayScreen.match(/useState\(/g) ?? []).length, 1);
  assert.match(todayScreen, /useState\(false\)/);
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

// ---------------------------------------------------------------------------

for (const { name, error } of failures) {
  console.error(`FAIL  ${name}`);
  console.error(`      ${error.message.split('\n').join('\n      ')}`);
}

console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
