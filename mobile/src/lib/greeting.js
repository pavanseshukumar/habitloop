import { weekdayLabelFor } from '../data/weekdays';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Month names are written out rather than taken from Intl: the format is
// fixed, and this avoids depending on which locale data the Hermes build
// happens to ship. Weekday names come from data/weekdays.js so the app has
// exactly one list of them.
export function formatDate(date) {
  return `${weekdayLabelFor(date)}, ${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

/**
 * The time of day shifts the tone of the screen, never its structure -- the
 * user should feel the difference without ever being shown a "mode".
 */
const VOICE = {
  morning: {
    greeting: 'Good morning',
    statement: 'Small actions become something bigger.',
  },
  // Just the time of day. The statement below already says something about
  // rhythm, and two lines saying it in a row read as one line stuttering.
  midday: {
    greeting: 'Good afternoon',
    statement: 'Keep building your rhythm.',
  },
  evening: {
    greeting: 'Nice work today',
    statement: 'Whatever you did today counts.',
  },
};

export function getDayVoice(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return VOICE.morning;
  if (hour < 17) return VOICE.midday;
  return VOICE.evening;
}

/**
 * Replaces the time-based statement once the day's habits are all done.
 *
 * The point of finishing is the reinforcement beat of the loop, and a 12px
 * label alone was too quiet for it -- this lets the top of the screen notice,
 * without tipping into celebration.
 */
export const COMPLETED_STATEMENT = "That's everything for today.";

/**
 * Shown once the user has completed a habit they had been away from.
 *
 * Four words, and none of them about the absence. It does not say how long
 * they were gone, does not welcome them back from anywhere, and does not ask
 * them to keep it up -- any of those would make the gap the subject. The
 * subject is the thing they just did.
 */
export const RETURN_STATEMENT = 'Back in rhythm.';

/**
 * The line under a habit's rhythm grid.
 *
 * At low counts a bare "1 in the last four weeks" reads like a thin statistic,
 * so the first few days get a quiet observation instead. Everything here is a
 * pure function of the count -- the same habit always says the same thing, so
 * the screen never feels like it is talking at the user.
 *
 * Zero returns null: the recognition line above the grid already says it.
 */
export function getRhythmNote(lifetimeCount, recentCount) {
  if (lifetimeCount === 0) return null;
  if (lifetimeCount === 1) return 'One is enough to begin.';
  if (lifetimeCount === 2) return 'Two is the start of a pattern.';

  return recentCount > 0 ? `${recentCount} in the last four weeks` : null;
}
