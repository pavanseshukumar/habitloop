import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '../theme';

/**
 * The day's progress as one line of type and one hairline rule.
 *
 * Kept deliberately small: this is a sense of where the day stands, not a
 * metric to optimise. The rule growing on each completion is the only reward
 * the screen gives, and that is the point.
 */
export function ProgressSummary({ completed, total }) {
  const ratio = total > 0 ? completed / total : 0;
  const fill = useRef(new Animated.Value(ratio)).current;
  const allDone = total > 0 && completed === total;

  useEffect(() => {
    Animated.timing(fill, {
      toValue: ratio,
      duration: 340,
      easing: Easing.out(Easing.cubic),
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

const styles = StyleSheet.create({
  count: {
    ...typography.label,
    textTransform: 'uppercase',
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  countDone: {
    color: colors.accent,
  },
  track: {
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  fill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.accent,
    // Grow from the left edge rather than out from the centre.
    transformOrigin: 'left',
  },
});
