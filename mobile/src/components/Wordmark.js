import { StyleSheet, Text } from 'react-native';

import { typography, useThemedStyles } from '../theme';

/**
 * The Habit Loop wordmark: one name, one word.
 *
 * "habitloop" is set closed, exactly as the drawn logo sets it -- no word
 * space, narrowed or otherwise. It had one for a while, on the reasoning that
 * two syllables need air between them; the drawn artwork says otherwise, and a
 * gap in the middle of a nine-letter name is the one thing that stops it
 * reading as a name at all. The tracking in `typography.wordmark` is what
 * holds the two halves together now, and it is the only thing that needs to.
 *
 * The two O's carry the coral; every other letter is brand deep blue. No mark,
 * no loop, no arrow -- the O's already do that job by being there.
 *
 * This is still a stand-in for real artwork. Keeping the letters as data means
 * swapping in the drawn logo is one component, not a hunt through the app.
 */
const SEGMENTS = [
  { text: 'habitl', accent: false },
  { text: 'OO', accent: true },
  { text: 'p', accent: false },
];

/**
 * The same lockup, one letter at a time.
 *
 * The splash animates each letter separately -- a dot becomes an `h`, another
 * becomes an `a` -- and the one thing that must not happen is a second copy of
 * the brand drifting out of step with this one. So the letters are derived
 * from the segments above rather than written out again: change SEGMENTS and
 * the splash changes with it, including which letters carry the coral.
 *
 * Nine entries, nine letters, nine dots. There is nothing in here that is not
 * a letter, which is what lets the splash put a dot under every one of them
 * without having to ask which are real.
 */
export const WORDMARK_LETTERS = SEGMENTS.flatMap(({ text, accent }) =>
  [...text].map((char) => ({ char, accent: Boolean(accent) }))
);

export function Wordmark({ variant = 'wordmark', style }) {
  const styles = useThemedStyles(makeStyles);
  const scale = typography[variant] ?? typography.wordmark;

  return (
    <Text
      style={[scale, styles.base, style]}
      accessibilityRole="header"
      accessibilityLabel="Habit Loop">
      {SEGMENTS.map((segment, index) => (
        <Text key={index} style={segment.accent && styles.accent}>
          {segment.text}
        </Text>
      ))}
    </Text>
  );
}

const makeStyles = (colors, shadows) =>
  StyleSheet.create({
  base: {
    color: colors.brand,
  },
  accent: {
    color: colors.accent,
  },
  });
