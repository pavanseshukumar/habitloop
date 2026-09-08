import { useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { motion, radii, spacing, typography, useThemedStyles } from '../theme';

/**
 * A habit as one thing you can open, and nothing else.
 *
 * Today's HabitItem is a two-target row -- the words open the habit, the mark
 * completes it -- because Today is where doing happens. This row is the same
 * habit read somewhere that has nothing to do with today, so it carries a
 * single target and none of the completion machinery: no mark, no toggle, no
 * state. One press, one destination.
 *
 * It answers touch exactly the way Today's rows do, because it is the same kind
 * of object: a soft surface lights up under the whole row, bleeding into the
 * screen gutter so the press reads as the row responding rather than as a box
 * being drawn inside it. Nothing here is a card at rest. That restraint is what
 * keeps a list of these editorial instead of administrative.
 *
 * `muted` is the archived voice, and it lives entirely in the name: one step
 * down the text hierarchy, and nothing else. A paused habit is quieter, not
 * disabled, not struck through, and never greyed to the edge of readable.
 *
 * The chevron deliberately does not join in. It was drawn a shade fainter for
 * archived rows, which on warm paper put it at 1.6:1 -- an affordance you
 * could not see, on the one row where "you can still open this" is the whole
 * message. There is no colour in the palette that is quieter than the active
 * chevron in both themes without disappearing in one of them, and a new one
 * would be a colour invented for a 9pt glyph. So the mark that says "this
 * opens" is the same on every row, and the name carries the difference.
 */
export function HabitRow({ habit, meta, hint, muted = false, onPress }) {
  const styles = useThemedStyles(makeStyles);
  const press = useRef(new Animated.Value(0)).current;

  const animate = (toValue) => {
    Animated.timing(press, {
      toValue,
      duration: motion.duration.press,
      easing: motion.easing.press,
      useNativeDriver: true,
    }).start();
  };

  // The same 1% give as Today's rows. Enough to feel the row take the press,
  // far short of anything that reads as a button travelling.
  const scale = press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.99] });

  return (
    <View style={styles.wrap}>
      <Animated.View style={[styles.surface, { opacity: press }]} pointerEvents="none" />

      <Pressable
        onPress={() => onPress(habit.id)}
        onPressIn={() => animate(1)}
        onPressOut={() => animate(0)}
        accessibilityRole="button"
        accessibilityLabel={meta ? `${habit.name}, ${meta}` : habit.name}
        accessibilityHint={hint}>
        <Animated.View style={[styles.row, { transform: [{ scale }] }]}>
          <View style={styles.text}>
            <Text style={[styles.name, muted && styles.nameMuted]}>{habit.name}</Text>
            {meta ? <Text style={styles.meta}>{meta}</Text> : null}
          </View>

          {/* The same two-border corner BackButton draws, pointed the other
              way and left far quieter. It is not asking to be pressed -- the
              row already is -- it only says which way this goes.

              It gets a box of its own because a rotated view still occupies
              its unrotated footprint in layout: see CHEVRON_BOX below. */}
          <View style={styles.chevronBox}>
            <View style={styles.chevron} />
          </View>
        </Animated.View>
      </Pressable>
    </View>
  );
}

const CHEVRON_SIZE = 9;
/**
 * The room the chevron actually needs.
 *
 * A transform does not change layout: the rotated square still measures
 * CHEVRON_SIZE to Yoga, while what gets painted is its diagonal --
 * 9 * sqrt(2) ~= 12.7pt across. Left to sit directly in the row, the glyph
 * therefore overhung its own box by ~1.9pt on every side, and the side that
 * mattered was the right one, because the row ends exactly on the screen
 * gutter: the point was painted past the content edge and cut off there.
 *
 * So the glyph is given a box that holds its diagonal, and the box is what the
 * row lays out. Nothing overhangs anything, so there is no longer an ancestor
 * anywhere that could clip it.
 *
 * Kept to the smallest step on the spacing scale that still clears 12.7pt: the
 * box takes its width from the habit name beside it, and a larger one would
 * buy clearance nobody can see at the cost of wrapping long names sooner. The
 * row itself is the touch target, so this box never needs to be one.
 */
const CHEVRON_BOX = spacing.lg;

const makeStyles = (colors, shadows) =>
  StyleSheet.create({
  wrap: {
    justifyContent: 'center',
  },
  // Inset top and bottom so two pressed rows never meet, and bled out to the
  // gutter so the lit surface is the width of the screen's content.
  surface: {
    position: 'absolute',
    top: spacing.xs,
    bottom: spacing.xs,
    left: -spacing.md,
    right: -spacing.md,
    borderRadius: radii.xl,
    backgroundColor: colors.surfaceMuted,
  },
  // The padding lives here rather than on the text, so the target is the full
  // height and width of the row.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  // Takes the space the chevron does not, which is what lets a long habit name
  // wrap onto a second line instead of being cut off.
  //
  // The padding is the narrower step because the chevron's box now carries the
  // rest of the gap itself: the glyph sits in the right half of that box, so
  // the clear space between the longest line of a name and the point of the
  // chevron comes out where it has always been. Widening the box without
  // taking this back would have cost the name a word.
  text: {
    flex: 1,
    paddingRight: spacing.sm,
  },
  name: {
    ...typography.habitName,
    color: colors.text,
  },
  nameMuted: {
    color: colors.textSecondary,
  },
  // The schedule, in the quietest voice on the row. It exists to answer "why
  // was this not on Today?" without the user having to open anything.
  meta: {
    ...typography.bodySmall,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  // Square, so the glyph is centred with the same clearance whichever way it
  // overhangs. The row's own `alignItems: center` keeps this box on the row's
  // middle, which is what holds the chevron centred against a name that has
  // wrapped onto a second line.
  chevronBox: {
    width: CHEVRON_BOX,
    height: CHEVRON_BOX,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevron: {
    width: CHEVRON_SIZE,
    height: CHEVRON_SIZE,
    borderTopWidth: 1.5,
    borderRightWidth: 1.5,
    borderColor: colors.markWaiting,
    transform: [{ rotate: '45deg' }],
  },
  });
