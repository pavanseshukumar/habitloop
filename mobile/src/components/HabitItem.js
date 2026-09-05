import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text } from 'react-native';

import { colors, spacing, typography } from '../theme';

const COMPLETE_MS = 260;
const UNDO_MS = 190;
const PRESS_MS = 90;

/**
 * A habit as a line of type, not a checkbox row.
 *
 * The row carries two full-height targets -- the words open the habit, the mark
 * completes it -- and one `progress` value drives the entire completion
 * transition so the mark, the check and the text all settle together instead of
 * snapping independently.
 *
 * Everything here is native-driven (opacity + transform only), so the
 * transition holds up while the list is being scrolled.
 */
export function HabitItem({ habit, completed, onToggle, onOpen }) {
  const progress = useRef(new Animated.Value(completed ? 1 : 0)).current;
  const press = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: completed ? 1 : 0,
      duration: completed ? COMPLETE_MS : UNDO_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [completed, progress]);

  const animatePress = (toValue) => {
    Animated.timing(press, {
      toValue,
      duration: PRESS_MS,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  };

  // A single 7% swell as the state flips -- enough to feel like the mark
  // acknowledged the tap, short of anything bouncy.
  const markScale = progress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 1.07, 1],
  });
  const ringOpacity = progress.interpolate({
    inputRange: [0, 0.45],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  const fillOpacity = progress.interpolate({
    inputRange: [0, 0.35],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const fillScale = progress.interpolate({
    inputRange: [0, 0.4, 1],
    outputRange: [0.7, 1, 1],
  });
  const checkOpacity = progress.interpolate({
    inputRange: [0.3, 0.75],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const checkScale = progress.interpolate({
    inputRange: [0.3, 1],
    outputRange: [0.6, 1],
    extrapolate: 'clamp',
  });

  // Done work stays fully legible -- it softens and settles a few pixels over,
  // rather than being struck through or greyed out of the way.
  const contentOpacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.5],
  });
  const contentShift = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 3],
  });
  const rowScale = press.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.985],
  });

  // Two targets, split down the row: the words open the habit, the mark
  // completes it. Both run the full height of the row, so neither is a small
  // thing to hit, and the mark keeps being the only thing that changes state.
  return (
    <Animated.View style={[styles.row, { transform: [{ scale: rowScale }] }]}>
      <Pressable
        style={styles.textTarget}
        onPress={() => onOpen(habit.id)}
        onPressIn={() => animatePress(1)}
        onPressOut={() => animatePress(0)}
        accessibilityRole="button"
        accessibilityLabel={habit.name}
        accessibilityHint="Opens this habit's rhythm">
        <Animated.View
          style={{ opacity: contentOpacity, transform: [{ translateX: contentShift }] }}>
          <Text style={styles.name}>{habit.name}</Text>
          {habit.detail ? <Text style={styles.detail}>{habit.detail}</Text> : null}
        </Animated.View>
      </Pressable>

      <Pressable
        style={styles.markTarget}
        onPress={() => onToggle(habit.id)}
        onPressIn={() => animatePress(1)}
        onPressOut={() => animatePress(0)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: completed }}
        accessibilityLabel={habit.name}
        accessibilityHint={completed ? 'Marks this as not done' : 'Marks this as done'}>
        <Animated.View style={[styles.mark, { transform: [{ scale: markScale }] }]}>
          <Animated.View style={[styles.ring, { opacity: ringOpacity }]} />
          <Animated.View
            style={[styles.fill, { opacity: fillOpacity, transform: [{ scale: fillScale }] }]}
          />
          <Animated.View
            style={[
              styles.check,
              { opacity: checkOpacity, transform: [{ scale: checkScale }, { rotate: '-45deg' }] },
            ]}
          />
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

const MARK_SIZE = 30;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  // The vertical padding lives on the targets, not the row, so both of them
  // are the full height of the row rather than just the height of their text.
  textTarget: {
    flex: 1,
    paddingVertical: spacing.lg,
    paddingRight: spacing.md,
  },
  markTarget: {
    paddingVertical: spacing.lg,
    paddingLeft: spacing.lg,
    justifyContent: 'center',
  },
  name: {
    ...typography.h2,
    color: colors.text,
  },
  detail: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: 2,
  },
  mark: {
    width: MARK_SIZE,
    height: MARK_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: MARK_SIZE / 2,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
  },
  fill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: MARK_SIZE / 2,
    backgroundColor: colors.accent,
  },
  // Two borders on a rotated box: a checkmark with no icon font to load.
  check: {
    width: 11,
    height: 6,
    marginTop: -3,
    borderLeftWidth: 2,
    borderBottomWidth: 2,
    borderColor: colors.textOnAccent,
  },
});
