import { isCompletedOn } from './completions';
import { addDays, toDateKey } from './dates';
import { isScheduledOn } from './schedule';

/**
 * What a reminder is, and which ones ought to exist right now.
 *
 * Everything in this file is a plain function over plain data: no notification
 * API, no storage, no clock of its own. That is deliberate -- deciding *which*
 * reminders should exist is the part with all the rules in it (a habit's
 * rhythm, whether it has been archived, whether today is already done), and it
 * is the part worth being able to test without an operating system. Actually
 * placing them with the OS lives in lib/notifications.js, which is a thin
 * wrapper around this.
 *
 * A reminder is deliberately tiny: { enabled, hour, minute }. No timezone --
 * it means "this local clock time", the same way an alarm does, so a habit
 * carried to another country still nudges at breakfast rather than at 3am.
 * And no notification ids: the id of a reminder is derived from the habit and
 * the day it falls on (see reminderIdFor), which is what makes reconciling
 * them idempotent.
 */

/** Off, and at a time nobody will ever see until they turn it on. */
export const DEFAULT_REMINDER = Object.freeze({ enabled: false, hour: 9, minute: 0 });

/**
 * How far ahead reminders are placed.
 *
 * Local notifications have to be booked one at a time, so the app keeps a
 * rolling fortnight in front of the user and tops it up every time it opens.
 * Two weeks is long enough that someone who puts their phone down for a
 * holiday still comes back to a working app, and short enough to stay well
 * inside the number of pending notifications a platform will hold.
 */
export const REMINDER_WINDOW_DAYS = 14;

/**
 * Marks the notifications this feature owns.
 *
 * Reconciling cancels anything with this prefix that is no longer wanted, so
 * the prefix is what stops it reaching for notifications it did not schedule.
 */
const ID_PREFIX = 'habitloop-reminder';

/** The product's name, not the habit's -- the body carries the habit. */
export const REMINDER_TITLE = 'Habit Loop';

/**
 * What a reminder says.
 *
 * One sentence, the habit's own name, and no verb telling the user what to do.
 * "is ready when you are" is the whole tone of the feature: the habit is
 * available, and that is all this is here to say. Nothing counts anything,
 * nothing is at risk, and there is no exclamation mark anywhere in it.
 */
export function reminderBody(habit) {
  return `${habit.name} is ready when you are.`;
}

/** Reads a stored reminder, filling in the default for anything missing or broken. */
export function normalizeReminder(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_REMINDER };

  const hour = Number.isInteger(raw.hour) && raw.hour >= 0 && raw.hour <= 23 ? raw.hour : DEFAULT_REMINDER.hour;
  const minute =
    Number.isInteger(raw.minute) && raw.minute >= 0 && raw.minute <= 59
      ? raw.minute
      : DEFAULT_REMINDER.minute;

  return { enabled: raw.enabled === true, hour, minute };
}

const pad = (value) => String(value).padStart(2, '0');

/**
 * The id a given day's reminder will always have.
 *
 * Built from the habit, the time it is set for and the day it falls on, so the
 * same reminder computed twice is the same id twice -- which is what lets
 * reconciling be a set comparison rather than a guess. The time is part of the
 * id on purpose: moving a reminder from 8:30 to 9:00 changes every id, so the
 * old bookings fall out of the desired set and get cancelled without anyone
 * having to remember that the time used to be something else.
 */
export function reminderIdFor(habit, dateKey) {
  const { hour, minute } = habit.reminder;
  return `${ID_PREFIX}:${habit.id}:${pad(hour)}${pad(minute)}:${dateKey}`;
}

export function isReminderId(id) {
  return typeof id === 'string' && id.startsWith(`${ID_PREFIX}:`);
}

/** 20:30 as a person would read it. */
export function formatReminderTime(hour, minute) {
  const suffix = hour < 12 ? 'AM' : 'PM';
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:${pad(minute)} ${suffix}`;
}

/**
 * The same clock, read the two different ways the app needs it.
 *
 * Stored time is 24-hour because that is what a schedule is; a person picks
 * 8:30 PM. These two functions are the whole of that translation, and they are
 * here rather than in the picker so the round trip -- what the picker opens
 * on, and what it hands back -- can be proven without a screen.
 *
 * Midnight and noon are the only interesting cases, and they are the ones a
 * modulo gets wrong: hour 0 reads as 12 AM, hour 12 as 12 PM.
 */
export function to12Hour(hour) {
  return {
    hour: hour % 12 === 0 ? 12 : hour % 12,
    meridiem: hour < 12 ? 'AM' : 'PM',
  };
}

export function from12Hour(hour, meridiem) {
  const base = hour % 12;
  return meridiem === 'PM' ? base + 12 : base;
}

/**
 * Every reminder a single habit should currently have booked.
 *
 * Four things can rule a day out, and each is asked exactly once:
 *
 *   the habit is archived or its reminder is off  -- nothing at all
 *   the day is not one the habit falls on         -- isScheduledOn, not a
 *                                                    second reading of `days`
 *   the habit is already done that day            -- the completion map
 *   the time has already gone by                  -- only ever true for today
 *
 * The third is what keeps the feature quiet: finish something in the morning
 * and the evening nudge for it simply never existed. The fourth is why
 * enabling a reminder at 9pm for 8am does not fire one immediately.
 */
export function plannedRemindersFor(
  habit,
  completions,
  now = new Date(),
  windowDays = REMINDER_WINDOW_DAYS
) {
  if (!habit || habit.archivedAt) return [];
  if (!habit.reminder?.enabled) return [];

  const { hour, minute } = habit.reminder;
  const planned = [];

  for (let offset = 0; offset < windowDays; offset += 1) {
    const day = addDays(now, offset);

    // The same question Today asks. Archived habits and unscheduled weekdays
    // both fall out here, so weekday handling lives in one place only.
    if (!isScheduledOn(habit, day)) continue;

    const dateKey = toDateKey(day);
    if (isCompletedOn(completions, habit.id, dateKey)) continue;

    const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute, 0, 0);
    if (at.getTime() <= now.getTime()) continue;

    planned.push({
      id: reminderIdFor(habit, dateKey),
      habitId: habit.id,
      dateKey,
      date: at,
      title: REMINDER_TITLE,
      body: reminderBody(habit),
    });
  }

  return planned;
}

/** Every reminder every habit should currently have booked. */
export function planReminders(
  habits,
  completions,
  now = new Date(),
  windowDays = REMINDER_WINDOW_DAYS
) {
  return habits.flatMap((habit) => plannedRemindersFor(habit, completions, now, windowDays));
}

/**
 * What to cancel and what to book, given what is already booked.
 *
 * The whole duplicate-prevention story is this function. Because ids are
 * derived rather than generated, "already booked" and "wanted" are directly
 * comparable, and anything in both sets is simply left alone. Run it twice
 * against an unchanged app and the second run has nothing to do -- which is
 * what makes it safe to call on every startup, every foreground and after
 * every edit.
 *
 * Only ids this feature owns are ever considered for cancellation.
 */
export function diffReminderPlan(scheduledIds, plan) {
  const wanted = new Set(plan.map((reminder) => reminder.id));
  const booked = new Set(scheduledIds.filter(isReminderId));

  return {
    toCancel: [...booked].filter((id) => !wanted.has(id)),
    toSchedule: plan.filter((reminder) => !booked.has(reminder.id)),
  };
}
