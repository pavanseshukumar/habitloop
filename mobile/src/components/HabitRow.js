import { useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { layout, motion, radii, spacing, typography, useThemedStyles } from '../theme';

/**
 * A habit as one thing you can open, and -- where the screen asks for it -- one
 * thing you can do to it.
 *
 * Today's HabitItem is a two-target row: the words open the habit, the mark
 * completes it. This row is the same habit read somewhere that has nothing to
 * do with today, so it carries none of the completion machinery -- no mark, no
 * toggle, no state. Pressing the habit opens it, and that is still the whole of
 * what the row itself decides.
 *
 * `action` is optional, and what it means is the screen's business rather than
 * the row's. Given one, the row becomes two targets in the same shape HabitItem
 * uses -- sibling Pressables inside the row, never nested, so a finger lands on
 * exactly one of them and opening a habit can never be an accident of reaching
 * for the word beside it. The row is handed a label, a hint and a callback; it
 * does not know what the word does and holds no state about it.
 *
 * The two targets answer touch differently, which is how the row teaches its
 * own model: pressing the habit lifts the soft surface under the whole row,
 * pressing the word fades only the word. Without an action the row is exactly
 * the single-target row it has always been.
 *
 * It answers touch the way Today's rows do, because it is the same kind of
 * object: a soft surface lights up under the whole row, bleeding into the
 * screen gutter so the press reads as the row responding rather than as a box
 * being drawn inside it. Nothing here is a card at rest. That restraint is what
 * keeps a list of these editorial instead of administrative.
 *
 * `muted` is the archived voice, and it lives entirely in the name: one step
 * down the text hierarchy, and nothing else. A paused habit is quieter, not
 * disabled, not struck through, and never greyed to the edge of readable.
 *
 * The chevron sits inside the opening target rather than at the far edge of the
 * row, which is what keeps it honest once there is a word to its right: it
 * marks the end of the thing it describes, and the gap after it is what
 * separates the two. On a row with no action that target is the whole row, so
 * the chevron lands exactly where it always did.
 *
 * The chevron deliberately does not join in with `muted`. It was drawn a shade
 * fainter for archived rows, which on warm paper put it at 1.6:1 -- an
 * affordance you could not see, on the one row where "you can still open this"
 * is the whole message. There is no colour in the palette that is quieter than
 * the active chevron in both themes without disappearing in one of them, and a
 * new one would be a colour invented for a 9pt glyph. So the mark that says
 * "this opens" is the same on every row, and the name carries the difference.
 */
export function HabitRow({ habit, meta, hint, muted = false, action = null, onPress }) {
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

      <Animated.View style={[styles.row, { transform: [{ scale }] }]}>
        <Pressable
          style={styles.openTarget}
          onPress={() => onPress(habit.id)}
          onPressIn={() => animate(1)}
          onPressOut={() => animate(0)}
          accessibilityRole="button"
          accessibilityLabel={meta ? `${habit.name}, ${meta}` : habit.name}
          accessibilityHint={hint}>
          <View style={styles.text}>
            <Text style={[styles.name, muted && styles.nameMuted]}>{habit.name}</Text>
            {meta ? <Text style={styles.meta}>{meta}</Text> : null}
          </View>

          {/* The same two-border corner BackButton draws, pointed the other
              way and left far quieter. It is not asking to be pressed -- the
              target around it already is -- it only says which way this goes.

              It gets a box of its own because a rotated view still occupies
              its unrotated footprint in layout: see CHEVRON_BOX below. */}
          <View style={styles.chevronBox}>
            <View style={styles.chevron} />
          </View>
        </Pressable>

        {/* The habit's name goes in the label because a screen reader meets
            this button on its own rather than in the run of the row it belongs
            to, and "Archive" by itself is a button with no subject. */}
        {action ? (
          <Pressable
            style={({ pressed }) => [styles.actionTarget, pressed && styles.actionPressed]}
            onPress={() => action.onPress(habit.id)}
            accessibilityRole="button"
            accessibilityLabel={`${action.label} ${habit.name}`}
            accessibilityHint={action.hint}>
            <Text style={styles.actionLabel}>{action.label}</Text>
          </Pressable>
        ) : null}
      </Animated.View>
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
 * target around it is what a finger presses, so this box never needs to be one.
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
  // Holds the targets side by side. The vertical padding moved down onto them,
  // so each is the full height of the row rather than the height of its own
  // text -- the same split HabitItem makes for the same reason.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  // Everything the chevron describes, and the whole row when there is no
  // action beside it.
  openTarget: {
    flex: 1,
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
  // A full-height target, so the word is as easy to hit as the habit is and
  // the two never share a pixel. The left padding is the gap that groups the
  // chevron with the name rather than with this: proximity is what says the
  // arrow belongs to the habit and the word is a separate offer.
  //
  // Padding rather than hitSlop, for the reason HabitItem's mark records --
  // slop is checked against every ancestor's box, so a target reaching past
  // one is simply not delivered on Android. Padding is the box.
  actionTarget: {
    minHeight: layout.touchTarget,
    justifyContent: 'center',
    paddingLeft: spacing.xl,
    paddingVertical: spacing.lg,
  },
  actionPressed: {
    opacity: motion.pressed.fade,
  },
  // One step quieter than the same word is on Edit and Habit Detail, because
  // there it is the one action on a screen and here it repeats down a list.
  // Still `textSecondary` rather than the muted neutral the schedule uses: this
  // is something to press, and the palette's quietest text does not clear 3:1
  // on warm paper. Findable, and no louder than that.
  actionLabel: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  });
