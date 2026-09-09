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

/**
 * The evening, before the day has anything in it.
 *
 * "Nice work today" is the only greeting in the app that makes a claim about
 * the user rather than about the hour, and it is the only one that can be
 * false: at six in the evening with nothing marked, it congratulates someone
 * for work they can still see waiting two inches below it. That is the one
 * note this product cannot afford -- a voice that is not listening reads as
 * automated, and everything else on this screen is trying to read as
 * attentive.
 *
 * So the acknowledgement is kept for the evenings that earned it, and every
 * other evening gets the plain salutation its two siblings already use. The
 * statement underneath is deliberately unchanged either way: "Whatever you did
 * today counts" is the forgiving line, and an evening with nothing marked in
 * it is exactly when it should be read.
 */
const EVENING_UNMARKED = { ...VOICE.evening, greeting: 'Good evening' };

/**
 * Which of the three the clock is in.
 *
 * Exported because the screen is not the only thing that needs to know. Today
 * stays mounted for as long as the app is warm, so something has to notice
 * that the afternoon has become the evening -- and the two hours that decide
 * it should be written down once, here, rather than once here and once in
 * whatever does the noticing.
 */
export function getVoiceWindow(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'midday';
  return 'evening';
}

/**
 * `markedToday` is whether anything at all has been completed today. It is
 * asked of the evening alone; the morning and the afternoon greet the hour and
 * nothing else, and neither of them can be contradicted by the day.
 */
export function getDayVoice(date = new Date(), { markedToday = false } = {}) {
  const window = getVoiceWindow(date);
  if (window === 'evening') return markedToday ? VOICE.evening : EVENING_UNMARKED;
  return VOICE[window];
}

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
 * The one line on Today that answers to what the user has done, chosen here
 * rather than inside the screen so the order of precedence is a rule with a
 * name instead of a ternary in a render.
 *
 * Two things are being decided, and one that used to be decided here no longer
 * is. A finished day says nothing of its own in this slot. The label under the
 * list already names it, in the place that owns where the day stands and
 * beside the bar it describes -- so a sentence up here saying the same thing
 * left the screen announcing one fact in three voices at once. This slot is
 * the voice, and a finished day is allowed to just be spoken to.
 *
 * Finishing still outranks coming back, which is the thing that is decided:
 * returning is how the day started and not how it ended, so an all-done day
 * reads its voice rather than reopening the morning's news.
 *
 * And a user with no habits at all gets nothing: the empty state below already
 * says the only true thing there is to say, and a line above it about rhythm
 * or about what you did today would be the app talking over an empty app.
 * Silence is the correct answer there, which is why this returns null rather
 * than reaching for another sentence.
 */
export function getDayStatement(voice, { hasHabits, allDone, hasReturned }) {
  if (!hasHabits) return null;
  if (hasReturned && !allDone) return RETURN_STATEMENT;
  return voice.statement;
}

/**
 * The line under a habit's rhythm grid.
 *
 * At low counts a bare "1 in the last four weeks" reads like a thin statistic,
 * so the first few days get a quiet observation instead. Everything here is a
 * pure function of the count -- the same habit always says the same thing, so
 * the screen never feels like it is talking at the user.
 *
 * Zero returns null: the recognition line above the grid already says it.
 *
 * An archived habit is counted the same way and described differently. Its grid
 * ends on the week it was put away rather than on this one, so "the last four
 * weeks" would be naming a window the habit was not alive for -- and the two
 * encouragements above it are addressed to someone still going. A closed record
 * gets the plain figure, in the past tense, or nothing.
 */
export function getRhythmNote(lifetimeCount, recentCount, { archived = false } = {}) {
  if (lifetimeCount === 0) return null;

  if (archived) return recentCount > 0 ? `${recentCount} in its final four weeks` : null;

  if (lifetimeCount === 1) return 'One is enough to begin.';
  if (lifetimeCount === 2) return 'Two is the start of a pattern.';

  return recentCount > 0 ? `${recentCount} in the last four weeks` : null;
}

/**
 * How long a habit has been going, as one sentence, or null.
 *
 * The wording half of lib/insights.js's getHabitSpan, kept here because this is
 * where the detail screen's copy lives and because the month names are already
 * written down above. The derivation decides whether there is anything to say;
 * this decides how to say it, and neither knows the other's job.
 *
 * Month resolution, deliberately. The record stores days and could name one,
 * but "since March 14th" claims a precision about a beginning that nobody
 * experiences -- a habit does not start on an afternoon, it starts around a
 * time -- and the exactness would read as a receipt rather than as a memory.
 *
 * THE YEAR IS SHOWN ONLY WHEN LEAVING IT OUT WOULD MISLEAD
 *
 * Inside the current year the year is noise: everybody knows which March. Once
 * an end falls outside it, saying "since March" would quietly invite the reader
 * to assume this one and undersell the habit by however long they have kept it.
 * So a stretch entirely in some earlier year carries the year once, at the end
 * where it settles both halves, and a stretch that crosses a new year carries
 * it on each end because there the two genuinely differ.
 *
 * A closed record is spoken about in the past, like everything else on that
 * screen once a habit has been put down.
 */
export function getSpanNote(span, { archived = false, today = new Date() } = {}) {
  if (!span || !span.fromKey) return null;

  const thisYear = String(today.getFullYear());
  const from = monthParts(span.fromKey);

  // Still going: one end, and today is the other. The year is the anchor's own.
  if (!archived || !span.toKey) {
    const since = from.year === thisYear ? from.month : `${from.month} ${from.year}`;
    return `You've been doing this since ${since}.`;
  }

  const to = monthParts(span.toKey);

  // Both ends in one year that is not this one: said once, at the end, where it
  // covers the whole stretch without being read twice.
  if (from.year === to.year) {
    const closed = to.year === thisYear ? to.month : `${to.month} ${to.year}`;
    return `You did this from ${from.month} to ${closed}.`;
  }

  // A stretch that crossed a new year. Both years, because they differ.
  return `You did this from ${from.month} ${from.year} to ${to.month} ${to.year}.`;
}

/** A date key split into the two things a duration is allowed to name. */
function monthParts(key) {
  return { month: MONTHS[Number(key.slice(5, 7)) - 1], year: key.slice(0, 4) };
}

