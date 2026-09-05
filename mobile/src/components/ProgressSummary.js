import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { colors, motion, spacing, typography } from '../theme';

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

  return (
    <View>
      <Text style={[styles.count, allDone && styles.countDone]}>
        {allDone ? 'All done today' : `${completed} of ${total} done`}
      </Text>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, { transform: [{ scaleX: fill }] }]} />
      </View>
    </View>
  );
}

const TRACK_HEIGHT = 4;

const styles = StyleSheet.create({
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
  track: {
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    backgroundColor: colors.border,
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
