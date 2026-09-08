import { Platform } from 'react-native';
import { isRunningInExpoGo } from 'expo';

// Imported a piece at a time rather than as `from 'expo-notifications'`.
//
// The package index pulls in DevicePushTokenAutoRegistration, which registers
// a push-token listener at module scope, and that listener throws outright on
// Android under Expo Go -- remote push was taken out of Expo Go in SDK 53. It
// is thrown on import, so a single `import * as Notifications` is enough to
// redbox the app before Today has rendered.
//
// This feature is entirely local: nothing here asks for a push token, talks to
// a server, or wants anything the index's side effect exists to set up. Taking
// the local-notification modules directly says exactly that, and keeps the app
// runnable in Expo Go. The cost is depending on the package's internal file
// layout, which is why every one of these imports is in this one file -- under
// a development build the plain index import would work and these would
// collapse back to one line.
import { setNotificationHandler } from 'expo-notifications/build/NotificationsHandler';
import { setNotificationChannelAsync } from 'expo-notifications/build/setNotificationChannelAsync';
import { AndroidImportance } from 'expo-notifications/build/NotificationChannelManager.types';
import {
  getPermissionsAsync,
  requestPermissionsAsync,
} from 'expo-notifications/build/NotificationPermissions';
import { getAllScheduledNotificationsAsync } from 'expo-notifications/build/getAllScheduledNotificationsAsync';
import { scheduleNotificationAsync } from 'expo-notifications/build/scheduleNotificationAsync';
import { cancelScheduledNotificationAsync } from 'expo-notifications/build/cancelScheduledNotificationAsync';
import {
  addNotificationResponseReceivedListener,
  getLastNotificationResponseAsync,
} from 'expo-notifications/build/NotificationsEmitter';
import { SchedulableTriggerInputTypes } from 'expo-notifications/build/Notifications.types';

import { diffReminderPlan, isReminderId, planReminders } from './reminders';

/**
 * The one place the operating system's notification API is spoken to.
 *
 * Everything above this file deals in habits and reminders; everything below
 * it is Expo. Keeping the boundary here is what lets the interesting half --
 * which reminders should exist, in lib/reminders.js -- be plain functions that
 * a Node test can run, and it means a screen never has to know that
 * notifications are a native concern at all.
 */

/**
 * One channel, and a quiet one.
 *
 * Android needs a channel before anything can be delivered, and its importance
 * is fixed at creation. DEFAULT posts a notification without a heads-up banner
 * or a sound interrupting whatever the user is doing -- which is the whole
 * point of this feature. HIGH would make a habit reminder behave like a phone
 * call.
 */
const ANDROID_CHANNEL_ID = 'habit-reminders';

/**
 * A reminder that arrives while the app is open should stay quiet.
 *
 * The user is already here; a banner over the screen they are using to tick
 * the habit off would be the app talking over itself.
 */
setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: false,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/** Safe to call more than once; Android treats it as an update. */
export async function configureNotifications() {
  if (Platform.OS !== 'android') return;

  // Expo Go has no channel manager behind this call, and it fails with a raw
  // NullPointerException that reads like a bug in this app rather than the
  // known gap it is. Reminders still schedule and still arrive there, on
  // Android's fallback channel; the channel below is what a real build uses.
  if (isRunningInExpoGo()) {
    if (__DEV__) {
      console.log('[notifications] Expo Go: reminders use the default channel');
    }
    return;
  }

  try {
    await setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
      name: 'Habit reminders',
      importance: AndroidImportance.DEFAULT,
      sound: null,
      vibrationPattern: null,
      enableVibrate: false,
      showBadge: false,
    });
  } catch (error) {
    report('could not create the notification channel', error);
  }
}

/**
 * Whether we may post notifications, without ever asking.
 *
 * Every automatic path -- startup, foreground, restoring a habit -- goes
 * through this rather than through requestPermission, so the app can only ever
 * prompt in response to something the user actually did.
 */
export async function getPermissionStatus() {
  try {
    const { status } = await getPermissionsAsync();
    return status;
  } catch (error) {
    report('could not read notification permission', error);
    return 'undetermined';
  }
}

export async function hasPermission() {
  return (await getPermissionStatus()) === 'granted';
}

/**
 * Asks, once, because the user just asked for something that needs it.
 *
 * Only ever called from turning a reminder on. If the system has already made
 * up its mind the OS returns the standing answer without showing anything,
 * which is what stops a denied user being prompted again and again.
 */
export async function requestPermission() {
  try {
    const existing = await getPermissionsAsync();
    if (existing.status === 'granted') return 'granted';

    const { status } = await requestPermissionsAsync();
    return status;
  } catch (error) {
    report('could not request notification permission', error);
    return 'denied';
  }
}

/**
 * Reconciling is serialised.
 *
 * It reads what is booked, works out the difference and writes the result, and
 * two of those interleaving would both read the same "nothing booked yet" and
 * both book it. Startup and the first foreground can land within a frame of
 * each other, so the runs are simply queued behind one another instead.
 */
let pending = Promise.resolve();

/**
 * Makes the operating system agree with the app.
 *
 * The single scheduling path: habit state, permission state and completion
 * state go in, and the correct set of pending notifications comes out. Every
 * event that could change the answer -- create, edit, archive, restore,
 * complete, launch, foreground -- calls this and nothing else, which is why
 * there is no scheduling code anywhere else in the app.
 *
 * Without permission it cancels rather than schedules: a user who turned
 * notifications off in system settings should stop receiving what was booked
 * while they were on, and their reminder settings stay saved for if they come
 * back.
 */
export function reconcileNotifications({ habits, completions, now = new Date() }) {
  pending = pending.then(() => run({ habits, completions, now })).catch(() => {});
  return pending;
}

async function run({ habits, completions, now }) {
  let booked;
  try {
    booked = await getAllScheduledNotificationsAsync();
  } catch (error) {
    report('could not read scheduled notifications', error);
    return;
  }

  const bookedIds = booked.map((request) => request.identifier).filter(isReminderId);

  // No permission means no reminders, but the plan is still computed as empty
  // rather than skipped, so everything already booked is cleaned up.
  const plan = (await hasPermission()) ? planReminders(habits, completions, now) : [];
  const { toCancel, toSchedule } = diffReminderPlan(bookedIds, plan);

  for (const id of toCancel) {
    try {
      await cancelScheduledNotificationAsync(id);
    } catch (error) {
      report(`could not cancel reminder ${id}`, error);
    }
  }

  for (const reminder of toSchedule) {
    try {
      await scheduleNotificationAsync({
        // The derived id, handed to the OS. Booking the same reminder twice is
        // therefore impossible: the second call would carry an identifier the
        // diff above already saw and skipped.
        identifier: reminder.id,
        content: {
          title: reminder.title,
          body: reminder.body,
          // What the tap handler needs to find its way back to the habit.
          data: { habitId: reminder.habitId },
          sound: null,
        },
        trigger: {
          type: SchedulableTriggerInputTypes.DATE,
          date: reminder.date,
          channelId: ANDROID_CHANNEL_ID,
        },
      });
    } catch (error) {
      report(`could not schedule reminder ${reminder.id}`, error);
    }
  }

  if (__DEV__) await describeBooked(toCancel.length, toSchedule.length);
}

/**
 * What the operating system is actually holding, in development only.
 *
 * The whole correctness of this feature is "the right set of pending
 * notifications exists", and that set is invisible from the app itself. This
 * prints it after every reconcile so the two things worth watching -- that the
 * days and times are right, and that running again changes nothing -- can be
 * read off the log rather than waited for.
 */
async function describeBooked(cancelled, scheduled) {
  try {
    const booked = await getAllScheduledNotificationsAsync();
    const mine = booked.filter((request) => isReminderId(request.identifier));

    console.log(
      `[notifications] reconciled: -${cancelled} +${scheduled}, ${mine.length} pending\n` +
        mine
          .map((request) => `  ${request.identifier}  ${describeTrigger(request.trigger)}`)
          .sort()
          .join('\n')
    );
  } catch {
    // Diagnostics only.
  }
}

function describeTrigger(trigger) {
  const value = trigger?.value ?? trigger?.date;
  return typeof value === 'number' || typeof value === 'string'
    ? new Date(value).toString()
    : JSON.stringify(trigger);
}

/** Every reminder this app currently has booked. Used by the tests-by-hand path and diagnostics. */
export async function getScheduledReminders() {
  try {
    const booked = await getAllScheduledNotificationsAsync();
    return booked.filter((request) => isReminderId(request.identifier));
  } catch (error) {
    report('could not read scheduled notifications', error);
    return [];
  }
}

export function addNotificationResponseListener(handler) {
  return addNotificationResponseReceivedListener(handler);
}

export function getLastNotificationResponse() {
  return getLastNotificationResponseAsync();
}

function report(message, error) {
  if (__DEV__) console.warn(`[notifications] ${message}`, error);
}
