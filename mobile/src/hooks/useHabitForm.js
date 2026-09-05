import { useCallback, useState } from 'react';

import { WEEKDAYS, weekdayIdFor } from '../data/weekdays';

/**
 * The state behind "what is this habit, and when?" -- shared by creating a
 * habit and changing one, so both screens validate a name the same way and
 * neither can drift.
 *
 * The hook owns only the answers. How they are asked lives in
 * HabitFormFields; what happens on save is the screen's business.
 */
export function useHabitForm(initial) {
  // Seeded once, on purpose. The form is a draft of the habit, not a mirror of
  // it -- a store update mid-edit must never overwrite what is being typed.
  const [baseline] = useState(() => toValues(initial));

  const [name, setName] = useState(baseline.name);
  const [detail, setDetail] = useState(baseline.detail);
  const [frequency, setFrequency] = useState(baseline.frequency);
  const [days, setDays] = useState(baseline.days);

  // Newlines are stripped rather than blocked so a pasted line break collapses
  // instead of turning the field into a paragraph.
  const changeName = useCallback((text) => setName(text.replace(/\n/g, '')), []);
  const changeDetail = useCallback((text) => setDetail(text.replace(/\n/g, '')), []);

  const selectFrequency = useCallback((next) => {
    setFrequency(next);
    // Start from today rather than an empty week, so choosing "Selected days"
    // is never a dead end the user has to dig out of.
    setDays((current) => (next === 'selected' && current.length === 0 ? [weekdayIdFor()] : current));
  }, []);

  const toggleDay = useCallback((id) => {
    setDays((current) =>
      current.includes(id) ? current.filter((day) => day !== id) : [...current, id]
    );
  }, []);

  const trimmedName = name.trim();
  const trimmedDetail = detail.trim();

  // The habit as it would be saved: trimmed, and with the day list dropped
  // entirely unless it is actually in use.
  const values = {
    name: trimmedName,
    detail: trimmedDetail,
    frequency,
    days: frequency === 'selected' ? days : [],
  };

  // One real character is the whole bar for a name -- no arbitrary minimum.
  // "Selected days" with nothing selected is the only other way to be invalid.
  const canSave = trimmedName.length > 0 && !(frequency === 'selected' && days.length === 0);

  // Two different questions, deliberately kept apart: has anything been typed
  // (a new habit worth warning about), and has anything actually changed (an
  // edit worth warning about).
  const hasText = trimmedName.length > 0 || trimmedDetail.length > 0;
  const isDirty =
    values.name !== baseline.name ||
    values.detail !== baseline.detail ||
    values.frequency !== baseline.frequency ||
    !sameDays(values.days, baseline.days);

  return {
    name,
    detail,
    frequency,
    days,
    changeName,
    changeDetail,
    selectFrequency,
    toggleDay,
    values,
    canSave,
    hasText,
    isDirty,
  };
}

/** A habit -- or nothing at all, when creating -- read into form values. */
function toValues(habit) {
  const frequency = habit?.frequency === 'selected' ? 'selected' : 'daily';

  return {
    name: typeof habit?.name === 'string' ? habit.name.trim() : '',
    detail: typeof habit?.detail === 'string' ? habit.detail.trim() : '',
    frequency,
    days: frequency === 'selected' && Array.isArray(habit?.days) ? orderDays(habit.days) : [],
  };
}

/** Monday-first, so two equal day sets compare equal whatever order they were tapped in. */
function orderDays(days) {
  return WEEKDAYS.filter((weekday) => days.includes(weekday.id)).map((weekday) => weekday.id);
}

function sameDays(a, b) {
  return orderDays(a).join() === orderDays(b).join();
}
