import { useEffect, useRef } from 'react';

import { addNotificationResponseListener, getLastNotificationResponse } from '../lib/notifications';
import { useHabits } from '../store/habits';

/**
 * Takes a tapped reminder to the habit it is about.
 *
 * A reminder is about one habit, so landing on Today and leaving the user to
 * find it would waste the one piece of context the notification had. The habit
 * id travels in the notification's data; this resolves it against the store and
 * pushes its detail screen.
 *
 * Two ways in, because a notification can be tapped in two states: the app was
 * already running (the listener), or the tap is what launched it (the last
 * response, which the OS holds for us). The launch case has to wait for habits
 * to load before it can resolve anything, which is why `ready` is a dependency.
 *
 * Anything that does not resolve is simply left alone -- the app opens on
 * Today, which is where it was going anyway. A reminder for a habit that has
 * since been archived or removed is a stale message, not an error worth
 * showing anyone.
 */
export function useNotificationRouting(navigationRef) {
  const { habits, ready } = useHabits();

  // The store's habits, without making the effects below re-subscribe every
  // time a completion changes them.
  const latest = useRef(habits);
  latest.current = habits;

  // A launch tap is delivered once but read on every render, so remember which
  // one has been acted on rather than pushing the same screen repeatedly.
  const handled = useRef(new Set());

  useEffect(() => {
    if (!ready) return;

    const open = (response) => {
      const id = response?.notification?.request?.identifier;
      if (!id || handled.current.has(id)) return;
      handled.current.add(id);

      const habitId = response?.notification?.request?.content?.data?.habitId;
      if (typeof habitId !== 'string') return;

      // Archived or deleted: there is nothing to continue, so Today it is.
      const habit = latest.current.find((item) => item.id === habitId);
      if (!habit || habit.archivedAt) return;

      navigationRef.current?.navigate('HabitDetail', { habitId });
    };

    // The tap that launched the app, if there was one.
    getLastNotificationResponse().then(open).catch(() => {});

    const subscription = addNotificationResponseListener(open);
    return () => subscription.remove();
  }, [ready, navigationRef]);
}
