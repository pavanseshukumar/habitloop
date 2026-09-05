import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { isCompletedOn, toggleCompletionOn } from '../lib/completions';
import { loadState, saveState } from '../lib/storage';

/**
 * The in-memory home for habits and their completion history, backed by
 * AsyncStorage.
 *
 * Two separate concerns live here on purpose:
 *   habits       what the user intends to do, and on which days
 *   completions  { [habitId]: { [dateKey]: true } } -- what they actually did
 *
 * A habit is { id, name, detail, frequency, days, createdAt, archivedAt }:
 *   frequency   'daily' | 'selected'
 *   days        weekday ids from data/weekdays.js, only when 'selected'
 *   archivedAt  ISO string once retired; null while active
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
      const stored = await loadState();
      if (cancelled) return;

      if (stored) {
        setHabits(stored.habits);
        setCompletions(stored.completions);
      }
      // No stored state: the useState defaults above are already the empty app.

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
    if (!ready) return;
    saveState({ habits, completions });
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
  const addHabit = useCallback(({ name, detail, frequency, days }) => {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    setHabits((current) => [
      ...current,
      {
        id: createId(),
        name: trimmedName,
        detail: (detail ?? '').trim(),
        frequency,
        days: frequency === 'selected' ? days : [],
        createdAt: new Date().toISOString(),
        archivedAt: null,
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
  const updateHabit = useCallback((habitId, { name, detail, frequency, days }) => {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    setHabits((current) =>
      current.map((habit) =>
        habit.id === habitId
          ? {
              ...habit,
              name: trimmedName,
              detail: (detail ?? '').trim(),
              frequency,
              days: frequency === 'selected' ? days : [],
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
    setHabits((current) =>
      current.map((habit) =>
        habit.id === habitId && !habit.archivedAt
          ? { ...habit, archivedAt: new Date().toISOString() }
          : habit
      )
    );
  }, []);

  /** Did this habit get done on this date? The one question history will ask. */
  const getHabitCompletion = useCallback(
    (habitId, dateKey) => isCompletedOn(completions, habitId, dateKey),
    [completions]
  );

  // What the user is currently building. `habits` stays the whole record --
  // HabitDetail still has to open an archived one -- so screens asking "what am
  // I doing?" read this instead, and archived habits fall out in one place.
  const activeHabits = useMemo(() => habits.filter((habit) => !habit.archivedAt), [habits]);

  const value = useMemo(
    () => ({
      habits,
      activeHabits,
      completions,
      ready,
      toggleCompletion,
      addHabit,
      updateHabit,
      archiveHabit,
      getHabitCompletion,
    }),
    [
      habits,
      activeHabits,
      completions,
      ready,
      toggleCompletion,
      addHabit,
      updateHabit,
      archiveHabit,
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
