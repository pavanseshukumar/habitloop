import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

import { WORDMARK_LETTERS } from '../components/Wordmark';
import {
  BOUNCE_DRIFT,
  CURVE,
  EMERGE_CLUSTER,
  GATHER,
  POP,
  at,
  bounceKeyframes,
  dotSizeFor,
  evenlySpaced,
  portalScale,
  ringBorderFor,
  ringSizeFor,
  track,
} from '../lib/splash';
import { motion, typography, useThemedStyles } from '../theme';

/**
 * The way into Habit Loop.
 *
 * One mark at the centre that separates into nine dots, one per letter of the
 * name; they bounce themselves still, become the wordmark, and then the two
 * O's take the eye, open, and the day is behind them. A little over two
 * seconds, once per launch.
 *
 * Three things make it read as one gesture rather than six effects:
 *
 *   It is one animation. Every phase is a window on a single linear progress
 *   and the windows overlap, so there is no frame anywhere in here on which
 *   one thing finishes and another starts. This is the whole of why it stopped
 *   feeling like steps -- see TIMELINE in lib/splash.js.
 *
 *   The letters are the wordmark's own. WORDMARK_LETTERS comes from the
 *   component Today's header uses, so there is exactly one place that decides
 *   what the brand says and which letters are coral. This file animates that
 *   list; it does not restate it.
 *
 *   The dots do not pretend to be the letters. Two passes were spent trying to
 *   morph a circle into an `a` and both read as one shape being swapped for
 *   another, because that is what they were: a circle has no honest path to a
 *   glyph, and every approximation of one drew attention to the seam. So the
 *   dots are the wind-up instead. They gather, they let go, and the wordmark is
 *   what the release puts on the screen -- stated, not disguised. The two O's
 *   then hand over to a coral ring the size they were, and the ring is what
 *   expands: the O opens rather than the screen zooming.
 *
 * This is an entrance layer, not a destination. It is rendered above the
 * navigator by App and removed when it is done, so Today is already mounted
 * underneath the whole time -- there is no push, no second Hero, and the
 * ground never changes colour, because both are painting `colors.background`.
 */
export function SplashScreen({ onDone }) {
  const styles = useThemedStyles(makeStyles);
  const { width, height } = useWindowDimensions();

  // One value, and it runs the entire entrance.
  //
  // There were five, chained with Animated.sequence, and that was the whole of
  // what made this feel like steps rather than a gesture: a sequence cannot
  // overlap, so every phase began on the frame the one before it ended and the
  // joins were hard however well each phase was eased. Emergence, bounce,
  // transformation, settle, emphasis and portal are windows on this single
  // linear progress now, and they overlap -- see TIMELINE in lib/splash.js.
  //
  // It is also one native animation driving thirty-odd interpolations rather
  // than five animations started in turn, which is why nothing here can drift.
  const progress = useRef(new Animated.Value(0)).current;
  // Unused by the full sequence -- it sits at 1 and costs nothing. The reduced
  // path fades the whole layer with it instead of opening a portal.
  const exit = useRef(new Animated.Value(1)).current;

  // Null until asked. The app has no reduced-motion strategy to inherit, and
  // one platform call is not a framework: if the phone says animations are
  // off, the wordmark is simply shown and dismissed.
  const [reduced, setReduced] = useState(null);
  const [geometry, setGeometry] = useState(null);

  const done = useRef(false);
  const finish = useCallback(() => {
    if (done.current) return;
    done.current = true;
    onDone();
  }, [onDone]);

  useEffect(() => {
    let cancelled = false;

    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (!cancelled) setReduced(Boolean(value));
      })
      .catch(() => {
        if (!cancelled) setReduced(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // The one thing an entrance layer must never do is fail to leave. Everything
  // below waits on a measurement and a platform answer, both of which arrive in
  // the first frames -- and if either somehow does not, this hands the app over
  // anyway rather than holding the user at a logo.
  useEffect(() => {
    const timer = setTimeout(finish, FAILSAFE);
    return () => clearTimeout(timer);
  }, [finish]);

  // Measured rather than calculated: where each letter sits depends on the
  // typeface, and the alternative is a table of glyph widths that would be
  // wrong the first time the type scale moved. The row is laid out once, with
  // every letter still at zero opacity, and read back.
  const pending = useRef({ row: null, cells: WORDMARK_LETTERS.map(() => null) });
  const settled = useRef(false);

  const measure = useCallback(() => {
    if (settled.current) return;

    const { row, cells } = pending.current;
    if (!row || cells.some((cell) => cell === null)) return;

    settled.current = true;

    const centers = cells.map((cell) => cell.x + cell.width / 2);
    const letters = WORDMARK_LETTERS.map((letter, index) => ({ ...letter, index })).filter(
      (letter) => letter.char.trim().length > 0
    );
    const dotCenters = letters.map((letter) => centers[letter.index]);
    const oIndexes = letters.filter((letter) => letter.accent).map((letter) => letter.index);
    const ringSize = ringSizeFor(cells[oIndexes[0]].width);

    setGeometry({
      row,
      letters,
      centers,
      // Where each dot stands: evenly spaced across the span the wordmark
      // itself occupies. They stay there now -- with no morph to perform they
      // never need to travel to a letter's own centre, and a regular row is
      // what nine dots should be.
      starts: evenlySpaced(dotCenters),
      // And where all nine come from, and lean back toward -- the midpoint of
      // that span, which is the middle of the screen and of the word at once.
      centre: (dotCenters[0] + dotCenters[dotCenters.length - 1]) / 2,
      oIndexes,
      ringSize,
      ringBorder: ringBorderFor(ringSize),
    });
  }, []);

  const onRowLayout = useCallback(
    (event) => {
      pending.current.row = event.nativeEvent.layout;
      measure();
    },
    [measure]
  );

  const onCellLayout = useCallback(
    (index, event) => {
      pending.current.cells[index] = event.nativeEvent.layout;
      measure();
    },
    [measure]
  );

  // Runs once: both inputs settle exactly once, so this fires on the frame
  // after the row has been laid out and never again. Navigating away from
  // Today and back cannot reach it -- by then the component is unmounted.
  useEffect(() => {
    if (!geometry || reduced === null) return;

    if (reduced) {
      // No dots, no portal. The timeline is parked at the instant the word has
      // just finished settling, so the wordmark is whole on the first frame the
      // user sees; it holds for a beat and fades off Today.
      progress.setValue(REDUCED_FRAME);

      const shortened = Animated.sequence([
        Animated.delay(motion.duration.base),
        Animated.timing(exit, {
          toValue: 0,
          duration: motion.duration.settle,
          easing: motion.easing.out,
          useNativeDriver: true,
        }),
      ]);

      shortened.start(({ finished }) => {
        if (finished) finish();
      });

      return () => shortened.stop();
    }

    // One animation, start to finish, carrying time and nothing else: the feel
    // of each phase is in the curves the phase itself is drawn with, not in the
    // driver. Easing this would put the same curve through all six.
    const run = Animated.timing(progress, {
      toValue: 1,
      duration: motion.duration.entrance,
      easing: motion.easing.linear,
      useNativeDriver: true,
    });

    run.start(({ finished }) => {
      if (finished) finish();
    });

    return () => run.stop();
  }, [geometry, reduced, progress, exit, finish]);

  // The wordmark, as one thing.
  //
  // It used to be nine letters each on their own staggered schedule, which is
  // what made the arrival readable as nine events rather than one -- and with
  // no morph left to justify the stagger, there is no reason for the brand to
  // arrive in instalments. The whole lockup comes in on a single scale: in from
  // just under its own size, a couple of percent past it, and back down. That
  // overshoot is the pop, and it is the only place in the entrance where
  // anything overshoots at all.
  const lockupScale = progress.interpolate(
    track(at('pop', 0), POP.from, [
      { until: at('pop', 1), to: POP.overshoot, shape: CURVE.out, steps: 5 },
      { until: at('settle', 1), to: 1, shape: CURVE.out, steps: 4 },
    ])
  );

  // Opacity supports the scale rather than carrying it: the word is most of
  // the way to full size by the time it is fully opaque, so what is seen is
  // something landing, not something fading up.
  const lockupFade = progress.interpolate(
    track(at('pop', 0), 0, [{ until: at('pop', 0.45), to: 1, shape: CURVE.out, steps: 3 }])
  );

  // The splash's own paper, faded from under the rings rather than with them,
  // and started early on purpose: the day has to be visibly there while the
  // coral is still crossing it, or the portal reads as a wipe that finishes
  // and reveals rather than as an opening. Today is painting the same token
  // behind it, so what actually crosses is the content -- never the ground.
  const groundFade = progress.interpolate(
    track(at('portal', 0.15), 1, [
      { until: at('portal', 0.7), to: 0, shape: CURVE.inOut, steps: 4 },
    ])
  );

  // The ring picks the O up at exactly the size the O had reached and keeps
  // going, gathering speed. That is the whole of the continuity here: no jump,
  // no new object -- the letter's own outline carries on growing.
  const ringScale = useMemo(
    () =>
      geometry
        ? progress.interpolate(
            track(at('portal', 0), O_EMPHASIS, [
              {
                until: at('portal', 1),
                to: portalScale({ ringSize: geometry.ringSize, width, height }),
                shape: CURVE.accelerate,
                steps: 8,
              },
            ])
          )
        : null,
    [geometry, progress, width, height]
  );

  // Up while the O beneath it is still fading, and gone by the time it is off
  // the screen: the coral is a sweep the day arrives behind, never a wash the
  // day arrives after.
  const ringFade = progress.interpolate(
    track(at('portal', 0), 0, [
      { until: at('portal', 0.1), to: 1, shape: CURVE.out, steps: 3 },
      { until: at('portal', 0.6), to: 0.95 },
      { until: at('portal', 1), to: 0, shape: CURVE.inOut, steps: 3 },
    ])
  );

  const type = typography[VARIANT];
  const dotSize = dotSizeFor(type.fontSize);

  return (
    // Absolute over the navigator, and deliberately opaque to touches: Today is
    // live underneath and a habit must not be completable through the splash.
    <Animated.View
      style={[StyleSheet.absoluteFill, { opacity: exit }]}
      onStartShouldSetResponder={BLOCK_TOUCHES}
      accessibilityViewIsModal>
      <Animated.View style={[StyleSheet.absoluteFill, styles.ground, { opacity: groundFade }]} />

      {/* Dots under the letters, so a letter is seen to grow out of its dot
          rather than over it. Positioned against the screen rather than inside
          the row, because the row is laid out by the type and these have to
          land on measured centres. */}
      {geometry ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {geometry.letters.map((letter, dotIndex) => (
            <Dot
              key={letter.index}
              style={[
                styles.dot,
                letter.accent ? styles.dotAccent : styles.dotBrand,
                {
                  width: dotSize,
                  height: dotSize,
                  borderRadius: dotSize / 2,
                  left: geometry.row.x + geometry.starts[dotIndex] - dotSize / 2,
                  top: geometry.row.y + geometry.row.height / 2 - dotSize / 2,
                },
              ]}
              index={dotIndex}
              gathered={(geometry.centre - geometry.starts[dotIndex]) * (1 - EMERGE_CLUSTER)}
              lean={(geometry.centre - geometry.starts[dotIndex]) * GATHER.pull}
              progress={progress}
            />
          ))}
        </View>
      ) : null}

      <View style={[StyleSheet.absoluteFill, styles.centre]} pointerEvents="none">
        {/* The pop rides on the row itself rather than on a wrapper around it:
            a transform does not touch layout, so the measurement the dots and
            the rings are placed from stays exactly what it was. */}
        <Animated.View
          style={[styles.row, { opacity: lockupFade, transform: [{ scale: lockupScale }] }]}
          onLayout={onRowLayout}
          accessible
          accessibilityRole="header"
          accessibilityLabel="Habit Loop">
          {WORDMARK_LETTERS.map((letter, index) => (
            <View key={index} onLayout={(event) => onCellLayout(index, event)}>
              <Letter
                letter={letter}
                style={[type, letter.accent ? styles.accent : styles.base]}
                progress={progress}
              />
            </View>
          ))}
        </Animated.View>
      </View>

      {/* The portal: the two O's, kept, at the size they were, and opened. */}
      {geometry ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {geometry.oIndexes.map((index) => (
            <Animated.View
              key={index}
              style={[
                styles.ring,
                {
                  width: geometry.ringSize,
                  height: geometry.ringSize,
                  borderRadius: geometry.ringSize / 2,
                  borderWidth: geometry.ringBorder,
                  left: geometry.row.x + geometry.centers[index] - geometry.ringSize / 2,
                  top: geometry.row.y + geometry.row.height / 2 - geometry.ringSize / 2,
                  opacity: ringFade,
                  transform: [{ scale: ringScale }],
                },
              ]}
            />
          ))}
        </View>
      ) : null}
    </Animated.View>
  );
}

/**
 * One dot, and its whole life, as three interpolations on the one timeline.
 *
 * It is pulled out of the cluster at the centre, takes its place in the row,
 * bounces four times with the other eight, and then -- while the last of those
 * bounces is still running -- draws in: a little smaller, a little closer to
 * the middle. That is the wind-up, and it is the whole reason the wordmark's
 * arrival lands rather than merely happens.
 *
 * Then it lets go. The dot pushes back out and is gone inside a tenth of a
 * second, and the wordmark is what the release leaves behind. It is not
 * pretending to become anything: nine dots are still plainly nine dots on the
 * frame the pop begins, which is the honest version of a transition a circle
 * and a glyph were never going to make convincingly.
 */
function Dot({ style, index, gathered, lean, progress }) {
  // Out of the centre, into the row, and there it stays -- until the gather
  // leans it a few points back toward the middle it came from.
  const slide = progress.interpolate(
    track(at('emerge', 0), gathered, [
      { until: at('emerge', 1), to: 0, shape: CURVE.out, steps: 6 },
      { until: at('gather', 0), to: 0 },
      { until: at('gather', 1), to: lean, shape: CURVE.inOut, steps: 3 },
    ])
  );

  // Four bounces, decaying, offset by a few frames from the dot to its left --
  // enough that the row has some give in it, far too little to read as a wave.
  const bounce = bounceKeyframes(RISE);
  const shift = progress.interpolate({
    inputRange: bounce.input.map((point) => at('bounce', point) + index * BOUNCE_DRIFT),
    outputRange: bounce.output,
    extrapolate: 'clamp',
  });

  // Nearly nothing at the centre, a dot in the row, held through the bounce,
  // drawn down for the wind-up, and pushed back out as it lets go.
  const scale = progress.interpolate(
    track(at('emerge', 0), EMERGE_SEED, [
      { until: at('emerge', 1), to: 1, shape: CURVE.out, steps: 6 },
      { until: at('gather', 0), to: 1 },
      { until: at('gather', 1), to: GATHER.scale, shape: CURVE.inOut, steps: 4 },
      { until: at('pop', 0.55), to: POP.release, shape: CURVE.out, steps: 4 },
    ])
  );

  // Full colour right up to the release. The dots are not what fades to make
  // room for the wordmark -- they are what throws it.
  const fade = progress.interpolate(
    track(at('emerge', 0), 0, [
      { until: at('emerge', 0.45), to: 1, shape: CURVE.out, steps: 4 },
      { until: at('pop', 0.12), to: 1 },
      { until: at('pop', 0.5), to: 0, shape: CURVE.out, steps: 4 },
    ])
  );

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: fade,
          transform: [{ translateX: slide }, { translateY: shift }, { scale }],
        },
      ]}
    />
  );
}

/**
 * One letter of the wordmark.
 *
 * It has almost nothing to do, and that is the point: the lockup arrives as a
 * whole, on the row's own scale, so a letter is not something that appears --
 * it is part of something that appeared. All that is left per letter is the
 * leaving, and the two O's, which take a small step forward and then keep
 * going straight into the portal. Every other letter leaves by fading, because
 * the O's are the subject of that moment and seven letters moving would take
 * it from them.
 */
function Letter({ letter, style, progress }) {
  const leave = progress.interpolate(
    track(at('portal', 0), 1, [
      {
        until: at('portal', letter.accent ? 0.4 : 0.32),
        to: 0,
        shape: CURVE.inOut,
        steps: 4,
      },
    ])
  );

  if (!letter.accent) {
    return <Animated.Text style={[style, { opacity: leave }]}>{letter.char}</Animated.Text>;
  }

  // The O's do not stop. They take the eye and keep going out past the edge of
  // the screen, with the ring picking up exactly where the glyph gives up.
  const scale = progress.interpolate(
    track(at('emphasis', 0), 1, [
      { until: at('emphasis', 1), to: O_EMPHASIS, shape: CURVE.inOut, steps: 4 },
      { until: at('portal', 0.5), to: O_EMPHASIS * 1.55, shape: CURVE.accelerate, steps: 4 },
    ])
  );

  return (
    <Animated.Text style={[style, { opacity: leave, transform: [{ scale }] }]}>
      {letter.char}
    </Animated.Text>
  );
}

// The lockup at launch size. The token carries the size, the weight and the
// tracking, so this file decides *which* wordmark treatment to use and nothing
// about what it looks like -- see typography.wordmarkLaunch for the reasoning.
const VARIANT = 'wordmarkLaunch';

// How far the dots rise on the first bounce. The three after it are smaller in
// turn -- see bounceKeyframes -- so this is the tallest the row ever gets, and
// it is still under a dot's own diameter.
const RISE = 16;

// How big a dot is in the cluster before it is drawn out. Small enough that
// the emergence is a growth and not a slide.
const EMERGE_SEED = 0.18;

// The O's grow, and stop well short of anything that would look like a zoom.
const O_EMPHASIS = 1.09;

// Where the timeline is parked when the phone has asked for less motion: the
// instant the word has just finished settling, before the O's start moving.
const REDUCED_FRAME = at('settle', 1);

// If the measurement or the platform never answers, hand over anyway. Derived
// so it cannot go stale behind a retimed entrance.
const FAILSAFE = motion.duration.entrance + 1200;

const BLOCK_TOUCHES = () => true;

const makeStyles = (colors, shadows) =>
  StyleSheet.create({
    // The same token Screen paints and the same one App paints behind the
    // navigator, so the splash and Today are standing on one sheet of paper --
    // which is what lets this layer leave without the ground appearing to
    // change.
    ground: {
      backgroundColor: colors.background,
    },
    centre: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    row: {
      flexDirection: 'row',
    },
    base: {
      color: colors.brand,
    },
    accent: {
      color: colors.accent,
    },
    dot: {
      position: 'absolute',
    },
    dotBrand: {
      backgroundColor: colors.brand,
    },
    dotAccent: {
      backgroundColor: colors.accent,
    },
    ring: {
      position: 'absolute',
      borderColor: colors.accent,
      backgroundColor: 'transparent',
    },
  });
