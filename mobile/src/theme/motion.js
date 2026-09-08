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
  /**
   * How far something fades while it is being pressed.
   *
   * Two values, because there are two kinds of pressable thing in this app and
   * the fade is doing a different amount of work in each. A word or a drawn
   * glyph has nothing else to give -- the fade is the whole of the feedback --
   * while a filled pill is already taking a fraction of a scale, so its fade
   * only has to confirm what the movement has said.
   *
   * They are here rather than written into each screen because they had
   * drifted: the same quiet action answered a finger at three different
   * strengths depending on which screen it was on, which is exactly the kind
   * of difference nobody can name and everybody can feel.
   */
  pressed: {
    /** Words, chevrons, marks: the fade is the feedback. */
    fade: 0.6,
    /** Filled surfaces, which are also moving. */
    surface: 0.9,
  },
  /**
   * How a screen arrives and leaves.
   *
   * Two categories, and deliberately only two. A navigation system with a
   * transition per destination teaches the user nothing; one that answers
   * "am I going somewhere, or making something?" teaches them the shape of the
   * app without ever saying so.
   *
   *   push     going somewhere that already exists -- a habit, the collection,
   *            settings. The screen behind slides a little and stays visible,
   *            which is the whole point: it says the new screen came *from*
   *            there, and going back will return to it.
   *   compose  starting something that does not exist yet. Softer and
   *            vertical, because nothing is being drilled into -- but still an
   *            ordinary screen, not a modal, because it is a place you can
   *            leave by the same door you came in.
   *
   * Back is not listed because it is not a third thing: the native stack plays
   * whichever of these brought the screen in, reversed. That is the cheapest
   * possible guarantee that leaving feels like the inverse of arriving.
   *
   * There is no duration here on purpose. These are the platform's own
   * animators, and on Android their timing is fixed natively -- React
   * Navigation's `animationDuration` is iOS-only, and is ignored even there for
   * animations that resolve to the platform default. A token that set nothing
   * would read as control the app does not have. What is tunable is the choice
   * itself, and that lives here so the app has one place to change how moving
   * through it feels.
   */
  screen: {
    push: { animation: 'ios_from_right' },
    compose: { animation: 'fade_from_bottom' },
  },
};
