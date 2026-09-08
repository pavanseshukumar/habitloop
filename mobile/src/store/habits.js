import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';

import { isCompletedOn, toggleCompletionOn } from '../lib/completions';
import {
  activeHabitsFrom,
  archiveHabitIn,
  archivedHabitsFrom,
  restoreHabitIn,
} from '../lib/habitCollections';
import { dateKeyFrom, initialHistory, withScheduleVersion } from '../lib/history';
import { configureNotifications, reconcileNotifications } from '../lib/notifications';
import { DEFAULT_REMINDER, normalizeReminder } from '../lib/reminders';
import { loadState, saveState } from '../lib/storage';

/**
 * The in-memory home for habits and their completion history, backed by
 * AsyncStorage.
 *
 * Two separate concerns live here on purpose:
 *   habits       what the user intends to do, and on which days
 *   completions  { [habitId]: { [dateKey]: true } } -- what they actually did
 *
 * A habit is { id, name, detail, frequency, days, createdAt, archivedAt,
 * reminder, scheduleHistory, activePeriods }:
 *   frequency   'daily' | 'selected'  -- the CURRENT rhythm
 *   days        weekday ids from data/weekdays.js, only when 'selected'
 *   archivedAt  ISO string once retired; null while active
 *   reminder    { enabled, hour, minute } -- off by default, see lib/reminders
 *
 * The last two are the habit's memory of itself, and lib/history.js is the only
 * place they are interpreted:
 *   scheduleHistory  [{ effectiveFrom, frequency, days }] -- what the rhythm
 *                    was, so changing it today does not rewrite last month
 *   activePeriods    [{ from, to }] -- when it was actually running, so a
 *                    season spent archived never reads as a season of misses
 *
 * `frequency` and `days` deliberately remain the current schedule. Today and
 * the reminder planner ask them and nothing else, which is what keeps both
 * fast and keeps history out of anything that has to be right about tomorrow.
 *
 * Completion is deliberately absent from the habit -- what happened on a given
 * day belongs to the map above, keyed by habit and date. `detail` is a quiet
 * supporting line: it should lower the bar for doing the habit, never add a
 * rule to follow.
 *
 * Keeping completion out of the habit is what makes history, streak recovery
 * and insights possible later without another migration.
 *
 * Context rather than a store library: one slice of state, one writer per
 * action, no cross-screen selectors to optimise.
 */
const HabitsContext = createContext(null);

let sequence = 0;
const createId = () => `habit-${Date.now().toString(36)}-${sequence++}`;

export function HabitsProvider({ children }) {
  const [habits, setHabits] = useState([]);
  const [completions, setCompletions] = useState({});
  const [ready, setReady] = useState(false);
  // False only when storage holds a file written by a newer build. See below.
  const [writable, setWritable] = useState(true);

  // Hydrate once.
  //
  // Nothing is invented here. A first launch opens on an empty app rather than
  // on examples, because the first habit is the user's decision to make and
  // there is nothing to explain that an empty screen and one button do not.
  // Anyone with stored habits is simply restored -- loadState() returns null
  // only when there is genuinely nothing usable to read, so no existing list is
  // ever replaced. Example habits for development live in
  // data/developmentHabits.js and are wired to nothing.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { state: stored, writable: canWrite } = await loadState();
      if (cancelled) return;

      if (stored) {
        setHabits(stored.habits);
        setCompletions(stored.completions);
      }
      // No stored state: the useState defaults above are already the empty app.

      // Unreadable-because-newer means hands off entirely. Opening an old build
      // against a newer file should cost the user nothing, and saving an empty
      // app over their habits would cost them everything.
      setWritable(canWrite);
      setReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Writes trail the render rather than gating it, so every interaction lands
  // on screen immediately whether or not the disk write succeeds. The first
  // pass after hydration rewrites what we just read, which is harmless and
  // saves branching on it.
  useEffect(() => {
    if (!ready || !writable) return;
    saveState({ habits, completions });
  }, [ready, writable, habits, completions]);

  /**
   * The one place reminders are scheduled, and it is a consequence rather than
   * a call.
   *
   * Creating, editing, archiving, restoring and completing all end in the same
   * thing -- `habits` or `completions` is now different -- so rather than
   * remembering to reschedule in five places, this watches the state those
   * five actions produce and reconciles once. Nothing else in the app calls
   * into the notification layer at all, which is what makes it impossible for
   * one of those paths to be forgotten or to disagree with another.
   *
   * Reconciling is a set comparison against what the OS already holds, so
   * running it more often than strictly needed costs a read and changes
   * nothing. Permission is only ever read here, never requested.
   */
  // Android needs its channel to exist before anything can be delivered into
  // it. Once per launch is enough.
  useEffect(() => {
    configureNotifications();
  }, []);

  useEffect(() => {
    if (!ready) return;

    reconcileNotifications({ habits, completions });

    // Coming back from the background is the other moment the answer can have
    // gone stale without any state changing: the day may have rolled over, or
    // the user may have just turned notifications off in system settings.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') reconcileNotifications({ habits, completions });
    });

    return () => subscription.remove();
  }, [ready, habits, completions]);

  // Only active habits accept new records. An archived habit is a closed book:
  // everything it already holds stays readable, nothing more is written into it.
  const toggleCompletion = useCallback(
    (habitId, dateKey) => {
      const habit = habits.find((item) => item.id === habitId);
      if (!habit || habit.archivedAt) return;

      setCompletions((current) => toggleCompletionOn(current, habitId, dateKey));
    },
    [habits]
  );

  // Appended rather than prepended so the list the user already knows keeps its
  // order, and no existing habit or completion record is touched.
  const addHabit = useCallback(({ name, detail, frequency, days, reminder }) => {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    // Stamped once, outside the updater, so the habit's birthday and the first
    // day of its history are the same moment however often React replays this.
    const createdAt = new Date().toISOString();
    const chosen = { frequency, days: frequency === 'selected' ? days : [] };

    setHabits((current) => [
      ...current,
      {
        id: createId(),
        name: trimmedName,
        detail: (detail ?? '').trim(),
        ...chosen,
        createdAt,
        archivedAt: null,
        // Its history begins the day it does: one schedule, in force from now,
        // and one stretch of being active that is still open.
        ...initialHistory({ createdAt, ...chosen, archivedAt: null }),
        // Off unless the form comes back with one switched on, which it only
        // can once the user has been asked and has agreed.
        reminder: reminder ? normalizeReminder(reminder) : { ...DEFAULT_REMINDER },
      },
    ]);
  }, []);

  /**
   * Changes what a habit is, in place.
   *
   * Spreading the existing habit first is the whole safety property here: id,
   * createdAt and archivedAt are carried through untouched, and completions are
   * a separate map this never reaches, so no amount of editing can cost the
   * user a day they already showed up for.
   */
  const updateHabit = useCallback((habitId, { name, detail, frequency, days, reminder }) => {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    // The calendar day the change lands on, read once. A schedule change takes
    // effect today and says nothing about yesterday: the old version keeps
    // describing the days it actually governed.
    const onKey = dateKeyFrom(new Date().toISOString());
    const chosen = { frequency, days: frequency === 'selected' ? days : [] };

    setHabits((current) =>
      current.map((habit) =>
        habit.id === habitId
          ? {
              ...habit,
              name: trimmedName,
              detail: (detail ?? '').trim(),
              ...chosen,
              // Only a real change to the rhythm writes a version, so renaming
              // a habit leaves its history exactly as it was.
              scheduleHistory:
                onKey === null ? habit.scheduleHistory : withScheduleVersion(habit, chosen, onKey),
              // Changing the rhythm or the time rewrites which reminders are
              // wanted; the effect below is what notices and rebooks them.
              reminder: reminder ? normalizeReminder(reminder) : habit.reminder,
            }
          : habit
      )
    );
  }, []);

  /**
   * Retires a habit. Not a delete: the record stays exactly as it was and only
   * gains a date, because this app is about remembering what someone built, and
   * that does not stop being true when they stop doing it.
   */
  const archiveHabit = useCallback((habitId) => {
    // Stamped outside the updater: React may run it more than once, and the
    // date a habit was put down should not depend on how often that happens.
    const archivedAt = new Date().toISOString();
    setHabits((current) => archiveHabitIn(current, habitId, archivedAt));
  }, []);

  /**
   * Picks a habit back up. The reverse of archiving, and the reason archiving
   * is safe to offer at all: nothing in this app should be a one-way door.
   *
   * The habit resumes as itself -- same id, same createdAt, same name, detail
   * and days, the same schedule history, and every completion still filed under
   * that id -- so this is a habit continuing rather than a new one starting.
   * Today picks it up again on the next day its own schedule names, and not
   * before.
   *
   * A new active stretch begins today. The one it spent archived stays in the
   * record as exactly that, because it was.
   */
  const restoreHabit = useCallback((habitId) => {
    // Stamped outside the updater for the same reason archiving is: the day a
    // habit was picked back up should not depend on how often React replays.
    const restoredAt = new Date().toISOString();
    setHabits((current) => restoreHabitIn(current, habitId, restoredAt));
  }, []);

  /** Did this habit get done on this date? The one question history will ask. */
  const getHabitCompletion = useCallback(
    (habitId, dateKey) => isCompletedOn(completions, habitId, dateKey),
    [completions]
  );

  // What the user is currently building. `habits` stays the whole record --
  // HabitDetail still has to open an archived one -- so screens asking "what am
  // I doing?" read this instead, and archived habits fall out in one place.
  const activeHabits = useMemo(() => activeHabitsFrom(habits), [habits]);

  // The other half of the collection, most recently archived first. Only
  // HabitManagement asks for it, but it belongs beside activeHabits so both
  // halves are defined in one place and neither screen invents its own filter.
  const archivedHabits = useMemo(() => archivedHabitsFrom(habits), [habits]);

  const value = useMemo(
    () => ({
      habits,
      activeHabits,
      archivedHabits,
      completions,
      ready,
      toggleCompletion,
      addHabit,
      updateHabit,
      archiveHabit,
      restoreHabit,
      getHabitCompletion,
    }),
    [
      habits,
      activeHabits,
      archivedHabits,
      completions,
      ready,
      toggleCompletion,
      addHabit,
      updateHabit,
      archiveHabit,
      restoreHabit,
      getHabitCompletion,
    ]
  );

  return <HabitsContext.Provider value={value}>{children}</HabitsContext.Provider>;
}

export function useHabits() {
  const value = useContext(HabitsContext);
  if (!value) throw new Error('useHabits must be used within a HabitsProvider');
  return value;
}
