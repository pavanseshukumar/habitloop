import { StyleSheet, Text } from 'react-native';

import { colors, typography } from '../theme';

/**
 * Text stand-in for the Habit Loop logo: the two O's carry the coral accent,
 * everything else is brand deep blue.
 *
 * This is a placeholder for the real logo artwork -- keeping the wordmark as
 * data makes it a one-line change when the asset is dropped in.
 */
const SEGMENTS = [
  { text: 'habit l', accent: false },
  { text: 'OO', accent: true },
  { text: 'p', accent: false },
];

export function Wordmark({ variant = 'display', style }) {
  return (
    <Text
      style={[typography[variant], styles.base, style]}
      accessibilityRole="header"
      accessibilityLabel="Habit Loop">
      {SEGMENTS.map((segment, index) => (
        <Text key={index} style={segment.accent ? styles.accent : null}>
          {segment.text}
        </Text>
      ))}
    </Text>
  );
}

const styles = StyleSheet.create({
  base: {
    color: colors.brand,
  },
  accent: {
    color: colors.accent,
  },
});
