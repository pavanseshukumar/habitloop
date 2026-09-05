import { Pressable, StyleSheet, View } from 'react-native';

import { colors, layout, spacing } from '../theme';

/**
 * The unobtrusive way back, shared by every pushed screen so they all sit the
 * chevron in the same place.
 */
export function BackButton({ onPress }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={12}
      style={styles.button}
      accessibilityRole="button"
      accessibilityLabel="Go back">
      <View style={styles.chevron} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: layout.touchTarget,
    height: layout.touchTarget,
    justifyContent: 'center',
    marginLeft: -spacing.md,
  },
  // The same two-border trick as the completion check, pointed left.
  chevron: {
    width: 11,
    height: 11,
    marginLeft: spacing.md,
    borderLeftWidth: 2,
    borderBottomWidth: 2,
    borderColor: colors.brand,
    transform: [{ rotate: '45deg' }],
  },
});
