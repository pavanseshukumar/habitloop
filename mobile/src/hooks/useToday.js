import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { toDateKey } from '../lib/dates';
import { getVoiceWindow } from '../lib/greeting';

/**
 * The two things about "now" that any screen actually reads: which day it is,
 * and which part of the day it is.
 *
 * Both belong here because both can go stale the same way. The day is the one
 * that matters for correctness -- a completion filed under yesterday is data
 * loss -- and the part of the day is the one that matters for the voice: the
 * screen greets the hour, and Today never unmounts, so an app left open
 * through five o'clock would go on saying "Good afternoon" all evening.
 */
const momentKey = (date) => `${toDateKey(date)} ${getVoiceWindow(date)}`;

/**
 * Today's date, kept honest when the day changes underneath a mounted screen.
 *
 * Today is the stack root and never unmounts, so a date captured once at mount
 * is the date the app launched on -- which for a phone that gets backgrounded
 * overnight is yesterday. That is not just a stale header: the completion a
 * user taps in the morning would be filed under the previous day, quietly
 * corrupting the one thing this product exists to keep.
 *
 * Two things can move the day, so both are watched: coming back to the app
 * (the common case, and the only one that survives the OS throttling timers),
 * and sitting on the screen through midnight.
 *
 * The same Date object is returned unless the moment above has genuinely moved
 * on, so callers can keep it in dependency arrays without re-rendering on every
 * foreground. Only the foreground is watched for the part of the day: crossing
 * five o'clock while someone is looking at the screen is a greeting a few
 * minutes behind, which the next glance at the app corrects, and it is not
 * worth a second timer to catch. Midnight keeps the one it has, because that
 * boundary decides where a completion is filed rather than how it is greeted.
 */
export function useToday() {
  const [today, setToday] = useState(() => new Date());

  useEffect(() => {
    let timer;

    const sync = () => {
      setToday((current) => {
        const now = new Date();
        return momentKey(now) === momentKey(current) ? current : now;
      });
      scheduleNextMidnight();
    };

    // setHours(24, ...) is the start of tomorrow in local time, so this stays
    // correct across DST shifts and month ends without any date arithmetic.
    const scheduleNextMidnight = () => {
      clearTimeout(timer);

      const now = new Date();
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0);

      // A second past the boundary, so the timer never lands on 23:59:59.999.
      timer = setTimeout(sync, midnight.getTime() - now.getTime() + 1000);
    };

    scheduleNextMidnight();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') sync();
    });

    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, []);

  return today;
}
