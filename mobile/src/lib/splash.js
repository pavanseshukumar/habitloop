/**
 * The arithmetic behind the branded entrance.
 *
 * The splash screen itself is transforms and opacity -- nothing worth asserting
 * about. What is worth asserting about is where the nine dots sit, how hard
 * they bounce, how far they draw in before they let go, and how far a letter O
 * has to grow before it has left the screen. Those are decisions with inputs
 * and answers, so they live here as plain functions over plain numbers, the
 * same way the schedule and the rhythm grid do.
 *
 * Nothing in this file imports React or React Native. That is the point: the
 * one part of an animation that can be wrong in a way a person would notice --
 * dots that are not evenly spaced, a bounce that does not decay, a portal that
 * stops just short of the corner -- is checkable without a device.
 */

/** h a b i t l o o p. The wordmark has nine letters and the splash has nine dots. */
export const DOT_COUNT = 9;

/**
 * The whole entrance as one score, in fractions of a single timeline.
 *
 * This replaces a chain of separate animations, and the reason is the only
 * thing about this file worth reading twice. `Animated.sequence` cannot
 * overlap: each step begins on the frame the one before it ended, so however
 * carefully each was eased, the joins between them were hard edges. Six good
 * movements played back to back still read as six movements -- which is
 * exactly what "it feels like separate steps being triggered" means.
 *
 * So there is one driver now, running linearly from 0 to 1, and every phase is
 * a window on it. Windows may -- and here always do -- overlap: the dots are
 * still bouncing when they begin to gather, the gather is still running when
 * the pop releases it, the wordmark is still settling when the O's begin to
 * grow, and the O's are still growing when the portal takes over. Nothing
 * waits for anything to finish.
 *
 * Two invariants hold, and both are asserted: the phases run in order, and
 * every phase begins before the one before it has ended. A gap anywhere here
 * would be a dead pause on screen.
 */
export const TIMELINE = {
  /** Nine dots pulled out of one point at the centre. */
  emerge: [0, 0.18],
  /** Four bounces, each smaller and quicker than the last. */
  bounce: [0.16, 0.59],
  /** They draw in, taking the last bounce's energy with them. */
  gather: [0.55, 0.62],
  /** And let go, which is what puts the wordmark on the screen. */
  pop: [0.6, 0.68],
  /** The lockup lands back on its own size. */
  settle: [0.66, 0.74],
  /** The two O's take the eye. */
  emphasis: [0.72, 0.81],
  /** And open. */
  portal: [0.79, 1],
};

/** The order the score is read in. */
export const PHASES = ['emerge', 'bounce', 'gather', 'pop', 'settle', 'emphasis', 'portal'];

/**
 * A point inside a phase, as a position on the one timeline.
 *
 * `at('pop', 0)` is the moment the reveal starts and `at('pop', 1)` the moment
 * it ends; everything in between is written as a fraction of the phase's own
 * length, so retiming a phase is editing one pair of numbers above rather than
 * hunting for constants in the component.
 */
export function at(phase, point) {
  const [from, to] = TIMELINE[phase];
  return from + point * (to - from);
}

/**
 * The shapes a value can travel through, as plain functions of 0..1.
 *
 * The timeline itself runs linearly, on purpose: if the driver were eased,
 * every window on it would inherit that easing and the phases could not have
 * curves of their own. So the driver carries time and these carry feel, which
 * is what lets the emergence decelerate, the transformation ease in and out,
 * and the portal accelerate away -- inside a single animation.
 */
export const CURVE = {
  linear: (t) => t,
  /** Fast out of the gate, gentle into place. The house curve. */
  out: (t) => 1 - (1 - t) ** 3,
  /** Slow at both ends. For anything that has to look considered. */
  inOut: (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2),
  /** Gathering speed. For the one thing here that is leaving. */
  accelerate: (t) => t * t,
};

/**
 * One property's whole life on the timeline, as a single interpolation.
 *
 * Written as a start value and a list of moves -- "be at 1 by here, hold, then
 * be at 0.35 by there" -- because that is how the choreography is actually
 * reasoned about, and because a move that holds a value is how a property sits
 * still through a phase that does not concern it. A curve is sampled into as
 * many keyframes as it needs, since React Native interpolates straight lines
 * between points and a straight line is the thing that reads as mechanical.
 *
 * The result is one `inputRange`/`outputRange` pair per property, clamped at
 * both ends, driven by the one value that runs the whole entrance.
 */
export function track(from, value, moves) {
  const inputRange = [from];
  const outputRange = [value];
  let previousInput = from;
  let previousValue = value;

  for (const move of moves) {
    const { until, to, shape = CURVE.linear, steps = 1 } = move;

    for (let step = 1; step <= steps; step += 1) {
      const t = step / steps;
      inputRange.push(previousInput + t * (until - previousInput));
      outputRange.push(previousValue + (to - previousValue) * shape(t));
    }

    previousInput = until;
    previousValue = to;
  }

  return { inputRange, outputRange, extrapolate: 'clamp' };
}

/** How many times the dots bounce before they are still. */
export const BOUNCE_COUNT = 4;

/**
 * How much of its height each bounce keeps.
 *
 * Just over half, which is roughly what a hard ball on a hard surface does and
 * comfortably inside what reads as restrained: the fourth bounce is an eighth
 * of the first, which is present without being a wobble.
 */
export const BOUNCE_DECAY = 0.52;

/**
 * Four bounces, decaying, as keyframes across the bounce phase.
 *
 * Two things make this read as a physical object rather than as an animation
 * repeated four times. Each bounce keeps a little over half the height of the
 * one before it, so the energy visibly runs out; and each takes less *time*
 * than the one before it, in the same proportion a real one would -- flight
 * time falls with the square root of the height -- so the bounces crowd
 * together as they die away instead of ticking past at a fixed rate.
 *
 * Each arc is sampled as a parabola rather than a peak, because a triangular
 * bounce is exactly what a bounce interpolated in straight lines looks like.
 *
 * Returns local 0..1 positions and offsets in points, negative being up.
 */
export function bounceKeyframes(rise, count = BOUNCE_COUNT, decay = BOUNCE_DECAY) {
  const heights = Array.from({ length: count }, (_, index) => rise * decay ** index);
  const spans = heights.map((height) => Math.sqrt(height / heights[0]));
  const total = spans.reduce((sum, span) => sum + span, 0);

  const input = [0];
  const output = [0];
  let clock = 0;

  for (const [index, span] of spans.entries()) {
    for (const tau of [0.25, 0.5, 0.75, 1]) {
      input.push((clock + span * tau) / total);
      // The trailing `|| 0` keeps the moment of rest at 0 rather than -0. This
      // is data other code compares against, and -0 is a needless surprise.
      output.push(-heights[index] * 4 * tau * (1 - tau) || 0);
    }
    clock += span;
  }

  return { input, output, heights };
}

/**
 * How tightly the dots are gathered before they emerge.
 *
 * A fraction of the spread they will end up occupying. Not zero: nine dots at
 * one point is one dot, and what has to be legible in the first frames is that
 * there are several of something. At a tenth they overlap heavily and read as
 * a single dense mark that then pulls itself apart.
 */
export const EMERGE_CLUSTER = 0.1;

/**
 * How far one dot's bounce lags the one to its left.
 *
 * Small enough that the row still lands as one object -- across all nine it is
 * a few frames -- and just enough that the line has some give in it rather
 * than moving like a printed rule.
 */
export const BOUNCE_DRIFT = 0.004;

/**
 * Nine dots, evenly spaced, spanning the same width the wordmark will.
 *
 * The letters are not evenly spaced -- an `i` takes a third of the room a `b`
 * does -- so dots dropped at the letter centres would arrive as a ragged line.
 * They come in evenly instead, across exactly the span the finished wordmark
 * occupies, and close the difference as they become letters. First and last
 * dot therefore never move: the row is pinned at both ends, and the drift
 * happens inside it.
 *
 * `centers` is the measured centre of each letter, in order. The answer is the
 * position each dot starts from, in the same order.
 */
export function evenlySpaced(centers) {
  if (!Array.isArray(centers) || centers.length === 0) return [];
  if (centers.length === 1) return [centers[0]];

  const first = centers[0];
  const last = centers[centers.length - 1];
  const step = (last - first) / (centers.length - 1);

  return centers.map((_, index) => first + step * index);
}

/**
/**
 * How far the dots draw in before they let go.
 *
 * The compression is the whole of the anticipation: nine dots that simply
 * stopped bouncing and were replaced by a word would read as a cut, and nine
 * that visibly gather first read as a wind-up. It is deliberately small --
 * they are still plainly nine dots at the moment the wordmark arrives, which
 * is the thing that would be lost by shrinking them away.
 */
export const GATHER = {
  /** How far down they draw. */
  scale: 0.86,
  /** And how far they lean toward the middle, as a fraction of their offset. */
  pull: 0.08,
};

/**
 * The release, and what the wordmark does with it.
 *
 * This replaces a dot-into-glyph morph that was never going to be honest: a
 * circle cannot become an `a` by scaling, and every approximation of it read
 * as one shape being swapped for another. So the splash stops pretending. The
 * dots are the wind-up, the pop is the transition, and the wordmark is the
 * payoff -- stated plainly, which is a thing a brand entrance is allowed to
 * do, rather than badly disguised as physics.
 *
 * The numbers are small on purpose. The pop has to be felt in the timing, not
 * seen as an effect, and it must not out-move the portal that follows it.
 */
export const POP = {
  /** The dots' last act: a small push outward as they hand over. */
  release: 1.18,
  /** Where the wordmark comes in from -- near enough to full size to be itself. */
  from: 0.93,
  /** And how far past itself it goes before settling back. */
  overshoot: 1.025,
};

/**
 * A dot, at whatever size the wordmark is set.
 *
 * The first pass drew these at a fifth of the type size, which is the size a
 * dot is when it is punctuation. These are not punctuation -- they are the
 * nine letters of the name, standing in for themselves before they arrive --
 * and at that weight they read as something loading rather than something
 * being built. Three tenths puts them at roughly the width of the wordmark's
 * own stems, so the row carries the same ink the word will.
 *
 * Still comfortably under half the gap between two letter centres, which is
 * what keeps nine of them reading as nine dots rather than as a rule.
 */
export function dotSizeFor(fontSize) {
  return Math.max(3, Math.round(fontSize * 0.3));
}

/**
 * The portal ring, sized from the letter O it grows out of.
 *
 * Taken from the measured width of the O's own cell rather than from font
 * metrics, so the ring starts life the size of the glyph it replaces without
 * this file having to know anything about Plus Jakarta Sans.
 */
export function ringSizeFor(oWidth) {
  return Math.max(8, oWidth * 0.96);
}

/**
 * How thick the ring is drawn.
 *
 * A border scales with the view it is on, so this is the thickness at rest --
 * a hairline, which is not what a letter O looks like. It is not meant to be:
 * the ring is invisible at rest and fades in over the first fraction of the
 * expansion, by which point it has already grown several times and the band
 * has grown with it to roughly the weight of the stroke it took over from.
 */
export function ringBorderFor(ringSize) {
  return Math.max(1, ringSize * 0.055);
}

/**
 * How far the ring has to grow to be gone.
 *
 * The O's sit near the middle of the screen but not at it, so the distance to
 * the furthest corner is not the half-diagonal. Rather than measure it, this
 * takes the whole diagonal as the radius -- generous by roughly a factor of
 * two, which costs nothing (it is one number in a transform) and guarantees
 * the ring has cleared every corner of every screen shape before it is
 * finished fading.
 */
export function portalScale({ ringSize, width, height }) {
  const radius = Math.sqrt(width * width + height * height);
  return Math.max(1, (2 * radius) / Math.max(1, ringSize));
}
