import { useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text } from 'react-native';

import { colors, motion, radii, shadows, spacing, typography } from '../theme';

/**
 * The one committing action on a form screen. Full width, brand-filled, and
 * pinned below the scroll by its screen -- there is never a second one.
 *
 * It is the same pill as Today's one button, because it is the same kind of
 * moment: the end of a decision. It sits a little above the paper while it can
 * be pressed and flat on it while it cannot, so whether the form is finished is
 * something you can see before you reach for it.
 */
export function PrimaryButton({ label, onPress, disabled = false }) {
  const press = useRef(new Animated.Value(0)).current;

  const animate = (toValue) => {
    Animated.timing(press, {
      toValue,
      duration: motion.duration.press,
      easing: motion.easing.press,
      useNativeDriver: true,
    }).start();
  };

  const scale = press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.98] });

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        onPressIn={() => animate(1)}
        onPressOut={() => animate(0)}
        style={({ pressed }) => [
          styles.button,
          disabled ? styles.disabled : shadows.soft,
          pressed && !disabled && styles.pressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled }}>
        <Text style={[styles.label, disabled && styles.labelDisabled]}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: colors.brand,
    borderRadius: radii.pill,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  // Not the brand colour at a low opacity, which reads as a broken button
  // behind frosted glass. A quiet filled surface instead: the shape is still
  // there, still legible, simply not ready yet.
  disabled: {
    backgroundColor: colors.surfaceMuted,
  },
  pressed: {
    opacity: 0.9,
  },
  label: {
    ...typography.button,
    color: colors.textOnBrand,
  },
  // Still legible, not greyed to the edge of readable: the shape and the flat
  // fill already say the button is not ready, and the user still needs to know
  // what it is going to do once it is.
  labelDisabled: {
    color: colors.textSecondary,
  },
});
