import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { motion, spacing, typography, useThemedStyles } from '../theme';

/**
 * Where the day stands, as one line of type and one soft bar.
 *
 * It sits below the habits rather than above them, because it is a closing
 * summary and not a target to hit on arrival -- you read what there is to do,
 * then see where you are.
 *
 * Deliberately small: this is a sense of the day, not a metric to optimise.
 * The bar growing on each completion is the only reward the screen gives, and
 * that is the point. No percentage, no score, nothing to be behind on.
 */
export function ProgressSummary({ completed, total }) {
  const styles = useThemedStyles(makeStyles);
  const ratio = total > 0 ? completed / total : 0;
  const fill = useRef(new Animated.Value(ratio)).current;
  const allDone = total > 0 && completed === total;

  useEffect(() => {
    Animated.timing(fill, {
      toValue: ratio,
      // A beat longer than a tap: the bar should be seen arriving, and it is
      // the last thing to settle after a completion.
      duration: motion.duration.settle,
      easing: motion.easing.out,
      useNativeDriver: true,
    }).start();
  }, [ratio, fill]);

  // The label used to announce the finished day at the first frame, while the
  // bar under it was still a third of a second from showing it -- the words
  // arriving ahead of the thing they describe, which is the one moment on this
  // screen where the two halves of the summary disagreed. Now the new words
  // rise into place on the bar's own timing, so what the user sees is the last
  // of the coral filling and the sentence landing together.
  //
  // Only the crossing matters. A label that faded on every completion would be
  // a flicker under each tap, so this watches whether the day is finished and
  // nothing else: "2 of 4" becoming "3 of 4" is the bar's news to tell.
  const arrival = useRef(new Animated.Value(1)).current;
  const wasAllDone = useRef(allDone);

  useEffect(() => {
    if (wasAllDone.current === allDone) return;
    wasAllDone.current = allDone;

    arrival.setValue(0);
    Animated.timing(arrival, {
      toValue: 1,
      // Finishing settles with the bar. Taking it back is quicker, the way
      // undoing is everywhere else in the app.
      duration: allDone ? motion.duration.settle : motion.duration.quick,
      easing: motion.easing.out,
      useNativeDriver: true,
    }).start();
  }, [allDone, arrival]);

  return (
    <View>
      <Animated.Text
        style={[
          styles.count,
          allDone && styles.countDone,
          {
            opacity: arrival,
            transform: [
              { translateY: arrival.interpolate({ inputRange: [0, 1], outputRange: [3, 0] }) },
            ],
          },
        ]}>
        {allDone ? 'All done today' : `${completed} of ${total} done`}
      </Animated.Text>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, { transform: [{ scaleX: fill }] }]} />
      </View>
    </View>
  );
}

const TRACK_HEIGHT = 4;

const makeStyles = (colors, shadows) =>
  StyleSheet.create({
  count: {
    ...typography.label,
    textTransform: 'uppercase',
    // A step up from muted: below a list of habit names this needs enough
    // presence to close the composition rather than trail off it.
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  countDone: {
    color: colors.accent,
  },
  // The one place the two brand colours meet in a single object: the day
  // still to come is cool structure, the part you have done is coral. Cooling
  // the track is also what stops the bar reading as coral-on-sand, which was
  // the warmest, least branded thing on the screen.
  track: {
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    backgroundColor: colors.markIdle,
    overflow: 'hidden',
  },
  fill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: TRACK_HEIGHT / 2,
    backgroundColor: colors.accent,
    // Grow from the left edge rather than out from the centre.
    transformOrigin: 'left',
  },
  });
