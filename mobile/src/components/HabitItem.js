import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, motion, radii, spacing, typography } from '../theme';

/**
 * A habit as a line of type, not a checkbox row.
 *
 * The row carries two full-height targets -- the words open the habit, the mark
 * completes it -- and they acknowledge touch differently on purpose: pressing
 * the words lifts a soft surface under the whole row, pressing the mark presses
 * only the mark. The row teaches its own two-target model by how it responds.
 *
 * At rest there is no card and no container. The surface exists only under a
 * finger, which keeps the list editorial while still making it feel like there
 * is something physical there when you reach for it.
 *
 * One `progress` value drives the entire completion transition so the mark, the
 * check and the text settle together instead of snapping independently.
 * Everything is native-driven (opacity + transform only), so it holds up while
 * the list is being scrolled.
 */
export function HabitItem({ habit, completed, onToggle, onOpen }) {
  const progress = useRef(new Animated.Value(completed ? 1 : 0)).current;
  const rowPress = useRef(new Animated.Value(0)).current;
  const markPress = useRef(new Animated.Value(0)).current;

  // Runs once, when the row first exists. Today stays mounted underneath the
  // rest of the stack, so returning from a habit or from Create does not
  // re-mount the rows that were already there -- which means the only time a
  // single row plays this alone is the moment a habit the user just wrote down
  // arrives in the list. No new state and nothing to schedule: the animation is
  // simply what mounting looks like.
  const arrival = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(arrival, {
      toValue: 1,
      duration: motion.duration.settle,
      easing: motion.easing.out,
      useNativeDriver: true,
    }).start();
  }, [arrival]);

  useEffect(() => {
    Animated.timing(progress, {
      toValue: completed ? 1 : 0,
      // Undoing is quicker than deciding: taking something back should feel
      // light, not like a second ceremony.
      duration: completed ? motion.duration.base : motion.duration.quick,
      easing: motion.easing.out,
      useNativeDriver: true,
    }).start();
  }, [completed, progress]);

  const animate = (value, toValue) => {
    Animated.timing(value, {
      toValue,
      duration: motion.duration.press,
      easing: motion.easing.press,
      useNativeDriver: true,
    }).start();
  };

  // A single 7% swell as the state flips -- enough to feel like the mark
  // acknowledged the tap, short of anything bouncy.
  const markScale = progress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 1.07, 1],
  });
  // The ring gives way early, so the coral is what grows into the space rather
  // than something that lands on top of an outline still sitting there.
  const ringOpacity = progress.interpolate({
    inputRange: [0, 0.35],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  const fillOpacity = progress.interpolate({
    inputRange: [0, 0.3],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const fillScale = progress.interpolate({
    inputRange: [0, 0.45, 1],
    outputRange: [0.35, 1, 1],
  });
  const checkOpacity = progress.interpolate({
    inputRange: [0.35, 0.75],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const checkScale = progress.interpolate({
    inputRange: [0.35, 1],
    outputRange: [0.5, 1],
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
    outputRange: [0, 4],
  });

  const rowScale = rowPress.interpolate({ inputRange: [0, 1], outputRange: [1, 0.99] });
  const markPressScale = markPress.interpolate({ inputRange: [0, 1], outputRange: [1, 0.88] });

  const arrivalShift = arrival.interpolate({ inputRange: [0, 1], outputRange: [8, 0] });

  return (
    <Animated.View
      style={[styles.wrap, { opacity: arrival, transform: [{ translateY: arrivalShift }] }]}>
      {/* Bleeds into the screen gutter so a press reads as the row lighting up,
          not as a box drawn inside it. */}
      <Animated.View style={[styles.surface, { opacity: rowPress }]} pointerEvents="none" />

      <Animated.View style={[styles.row, { transform: [{ scale: rowScale }] }]}>
        <Pressable
          style={styles.textTarget}
          onPress={() => onOpen(habit.id)}
          onPressIn={() => animate(rowPress, 1)}
          onPressOut={() => animate(rowPress, 0)}
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
          onPressIn={() => animate(markPress, 1)}
          onPressOut={() => animate(markPress, 0)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: completed }}
          accessibilityLabel={habit.name}
          accessibilityHint={completed ? 'Marks this as not done' : 'Marks this as done'}>
          <Animated.View
            style={[
              styles.mark,
              { transform: [{ scale: Animated.multiply(markScale, markPressScale) }] },
            ]}>
            {/* A ring rather than the rhythm grid's small waiting dot, and the
                difference is deliberate: the grid is a record, this is a
                control. Something you are meant to reach out and press has to
                look like it has an edge to press. */}
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
    </Animated.View>
  );
}

const MARK_SIZE = 30;

const styles = StyleSheet.create({
  wrap: {
    justifyContent: 'center',
  },
  surface: {
    position: 'absolute',
    top: spacing.xs,
    bottom: spacing.xs,
    left: -spacing.md,
    right: -spacing.md,
    borderRadius: radii.xl,
    backgroundColor: colors.surfaceMuted,
  },
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
    ...typography.habitName,
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
    borderColor: colors.markWaiting,
  },
  fill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: MARK_SIZE / 2,
    backgroundColor: colors.markDone,
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
