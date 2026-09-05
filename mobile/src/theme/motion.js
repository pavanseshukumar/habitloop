import { Easing } from 'react-native';

/**
 * The app's motion language, in one place.
 *
 * Two rules hold everywhere: nothing bounces, and everything decelerates into
 * position. Habit Loop is a calm product, and overshoot reads as excitement --
 * which is the wrong note for an app whose whole subject is showing up quietly
 * and often.
 *
 * Durations are short on purpose. The longest thing here is a third of a
 * second, because motion should acknowledge a tap, not stage a performance.
 */
export const motion = {
  duration: {
    /** A finger going down or coming up. Must feel instant. */
    press: 90,
    /** Undo, and anything reversing a decision -- quicker than making it. */
    quick: 190,
    /** The default: a state change the user asked for. */
    base: 260,
    /** Something arriving or coming to rest, given a beat longer to land. */
    settle: 340,
  },
  easing: {
    /** The house curve. Fast out of the gate, gentle into place. */
    out: Easing.out(Easing.cubic),
    /** Flatter, for press states, where cubic reads as sluggish. */
    press: Easing.out(Easing.quad),
  },
};
