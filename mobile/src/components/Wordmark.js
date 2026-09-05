import { StyleSheet, Text } from 'react-native';

import { colors, typography } from '../theme';

/**
 * The Habit Loop wordmark: one name, not two words.
 *
 * "habit loop" is a single brand name, so the lockup is tracked tight and the
 * word space is narrowed until the eye reads one thing. The two O's carry the
 * coral; every other letter is brand deep blue. No mark, no loop, no arrow --
 * the O's already do that job by being there.
 *
 * This is still a stand-in for real artwork. Keeping the letters as data means
 * swapping in the drawn logo is one component, not a hunt through the app.
 */
const SEGMENTS = [
  { text: 'habit', accent: false },
  { text: ' ', accent: false, narrow: true },
  { text: 'l', accent: false },
  { text: 'OO', accent: true },
  { text: 'p', accent: false },
];

// A full word space is what makes "habit loop" look like two words -- and no
// space at all makes it one unreadable one. Two thirds keeps both syllables
// legible inside a single lockup. Set as a fraction of the type size rather
// than a fixed number, so it holds together at whatever size it is used.
const SPACE_SCALE = 0.65;

export function Wordmark({ variant = 'wordmark', style }) {
  const scale = typography[variant] ?? typography.wordmark;
  const narrowSpace = { fontSize: Math.round(scale.fontSize * SPACE_SCALE) };

  return (
    <Text
      style={[scale, styles.base, style]}
      accessibilityRole="header"
      accessibilityLabel="Habit Loop">
      {SEGMENTS.map((segment, index) => (
        <Text
          key={index}
          style={[segment.accent && styles.accent, segment.narrow && narrowSpace]}>
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
