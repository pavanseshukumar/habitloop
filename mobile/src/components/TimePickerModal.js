import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ModalSheet } from './ModalSheet';
import { formatReminderTime, from12Hour, to12Hour } from '../lib/reminders';
import { layout, motion, radii, spacing, typography, useThemedStyles } from '../theme';

/**
 * What time the nudge should come.
 *
 * Habit Loop's own picker rather than the platform's, for one reason: Android
 * draws its time dialog in the *device's* theme and offers no supported way to
 * tell it otherwise -- `themeVariant` is iOS-only -- so an app set to Dark on a
 * daylit phone opened a white dialog over a dark screen. This is the same
 * question asked in the app's paper, type and spacing, in whichever theme the
 * user actually chose.
 *
 * Two short columns and a pair of the app's choice marks: the hour and the
 * minute scroll, AM and PM are picked the way every other either/or in this
 * product is picked. Every minute is reachable, because a reminder at 7:05 is
 * a real thing somebody wants and a five-minute grid would have quietly
 * decided otherwise.
 *
 * The panel is a draft. Nothing here touches the habit until Done, which is
 * what makes Cancel free -- it simply throws the draft away, and the form is
 * left holding exactly what it held before.
 */
export function TimePickerModal({ visible, hour, minute, onCancel, onConfirm }) {
  const styles = useThemedStyles(makeStyles);

  // Seeded from the reminder each time the panel opens, so it always opens on
  // the time the habit currently has -- including after a cancel, which is the
  // case a component that kept its own state across openings would get wrong.
  const [draft, setDraft] = useState(() => draftFrom(hour, minute));

  useEffect(() => {
    if (visible) setDraft(draftFrom(hour, minute));
  }, [visible, hour, minute]);

  const commit = () => onConfirm(from12Hour(draft.hour, draft.meridiem), draft.minute);

  return (
    <ModalSheet visible={visible} onDismiss={onCancel} accessibilityLabel="Reminder time">
      <Text style={styles.title} accessibilityRole="header">
        Reminder time
      </Text>

      {/* The answer, read back as a person would say it. It is the one thing
          in the panel that is unambiguous at a glance -- the columns say 8 and
          30, and this says half past eight in the evening. */}
      <Text style={styles.reading} accessibilityLiveRegion="polite">
        {formatReminderTime(from12Hour(draft.hour, draft.meridiem), draft.minute)}
      </Text>

      <View style={styles.columns}>
        <Column
          label="Hour"
          values={HOURS}
          value={draft.hour}
          format={(value) => String(value)}
          onChange={(next) => setDraft((current) => ({ ...current, hour: next }))}
        />

        <Beside>
          <Text style={styles.separator}>:</Text>
        </Beside>

        <Column
          label="Minute"
          values={MINUTES}
          value={draft.minute}
          format={(value) => String(value).padStart(2, '0')}
          onChange={(next) => setDraft((current) => ({ ...current, minute: next }))}
        />

        <Beside style={styles.meridiem}>
          <View accessibilityRole="radiogroup">
            {MERIDIEMS.map((option) => (
              <MeridiemOption
                key={option}
                label={option}
                selected={draft.meridiem === option}
                onPress={() => setDraft((current) => ({ ...current, meridiem: option }))}
              />
            ))}
          </View>
        </Beside>
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={onCancel}
          hitSlop={8}
          style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
          accessibilityRole="button"
          accessibilityLabel="Cancel">
          <Text style={styles.cancelLabel}>Cancel</Text>
        </Pressable>

        <Pressable
          onPress={commit}
          hitSlop={8}
          style={({ pressed }) => [styles.action, styles.doneAction, pressed && styles.actionPressed]}
          accessibilityRole="button"
          accessibilityLabel="Done">
          <Text style={styles.doneLabel}>Done</Text>
        </Pressable>
      </View>
    </ModalSheet>
  );
}

/**
 * Anything that stands next to a column, on the column's own line.
 *
 * It carries an empty copy of the column label so the heights match exactly,
 * then centres its content against the selection band. Alignment by structure
 * rather than by a hand-tuned margin, which is what stops the colon drifting
 * off the numbers when the type changes.
 */
function Beside({ style, children }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={style}>
      <Text style={styles.columnLabel} />
      <View style={styles.besideBody}>{children}</View>
    </View>
  );
}

/** The reminder's stored 24-hour time, as the three things the panel edits. */
function draftFrom(hour, minute) {
  const read = to12Hour(hour);
  return { hour: read.hour, minute, meridiem: read.meridiem };
}

const HOURS = Array.from({ length: 12 }, (_, index) => index + 1);
const MINUTES = Array.from({ length: 60 }, (_, index) => index);
const MERIDIEMS = ['AM', 'PM'];

/**
 * Three rows visible: the chosen value, with one either side.
 *
 * Enough to show which way the numbers run and that there are more of them,
 * and no taller than it has to be -- this is a panel over a form, not a screen
 * of its own.
 */
const ROW = 44;
const VISIBLE_ROWS = 3;
const EDGE_ROWS = (VISIBLE_ROWS - 1) / 2;

/**
 * A column of times, snapped.
 *
 * A short scroll rather than a long list of buttons -- sixty minutes have to
 * be reachable one-handed, and dragging a column is the gesture everyone
 * already has for that. It is deliberately not a 3D wheel: no perspective, no
 * fade, no curvature, just the app's own type moving under a band that marks
 * where the choice is made.
 *
 * Both scroll ends are handled. Momentum settles through onMomentumScrollEnd,
 * and a slow drag that stops without any momentum settles through
 * onScrollEndDrag, which is the case a picker that listens for only the first
 * of those leaves stranded between two values.
 */
function Column({ label, values, value, format, onChange }) {
  const styles = useThemedStyles(makeStyles);
  const scroller = useRef(null);

  // The offset the current value sits at. Used to open in the right place and
  // to correct the column when the value changes from outside a scroll.
  const offsetFor = (next) => Math.max(0, values.indexOf(next)) * ROW;

  useEffect(() => {
    scroller.current?.scrollTo({ y: offsetFor(value), animated: false });
    // Only when the value arrives from outside -- a scroll that reports its
    // own new value is already where it needs to be.
  }, [value]);

  const settle = (event) => {
    const index = Math.round(event.nativeEvent.contentOffset.y / ROW);
    const next = values[Math.min(values.length - 1, Math.max(0, index))];
    if (next !== value) onChange(next);
  };

  return (
    <View style={styles.column}>
      <Text style={styles.columnLabel}>{label}</Text>

      <View style={styles.columnBody}>
        {/* The band that says "this one". Behind the numbers rather than over
            them, in the same muted surface a pressed row lights up with. */}
        <View style={styles.selectionBand} pointerEvents="none" />

        <ScrollView
          ref={scroller}
          // Android ignores a scrollTo issued before the list has been laid
          // out, so the opening position is set here as well as in the effect
          // above -- this is the one that actually lands on a cold open.
          onLayout={() => scroller.current?.scrollTo({ y: offsetFor(value), animated: false })}
          style={styles.columnScroll}
          contentContainerStyle={styles.columnContent}
          showsVerticalScrollIndicator={false}
          snapToInterval={ROW}
          decelerationRate="fast"
          onMomentumScrollEnd={settle}
          onScrollEndDrag={settle}
          accessibilityLabel={`${label}, ${format(value)}`}>
          {values.map((option) => (
            <Pressable
              key={option}
              onPress={() => onChange(option)}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              accessibilityRole="button"
              accessibilityState={{ selected: option === value }}
              accessibilityLabel={`${label} ${format(option)}`}>
              <Text style={[styles.rowLabel, option === value && styles.rowLabelSelected]}>
                {format(option)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

/**
 * AM or PM, in the app's mark for a choice already made.
 *
 * The same ring that fills with brand blue as "Every day", "Selected days" and
 * the appearance modes -- one more question asked the way this product asks
 * every question with two answers.
 */
function MeridiemOption({ label, selected, onPress }) {
  const styles = useThemedStyles(makeStyles);
  const fill = useRef(new Animated.Value(selected ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(fill, {
      toValue: selected ? 1 : 0,
      duration: motion.duration.base,
      easing: motion.easing.out,
      useNativeDriver: true,
    }).start();
  }, [selected, fill]);

  const ringOpacity = fill.interpolate({
    inputRange: [0, 0.4],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  const fillScale = fill.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.meridiemOption, pressed && styles.actionPressed]}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}>
      <View style={styles.choiceMark}>
        <Animated.View style={[styles.choiceRing, { opacity: ringOpacity }]} />
        <Animated.View
          style={[styles.choiceFill, { opacity: fill, transform: [{ scale: fillScale }] }]}
        />
      </View>
      <Text style={[styles.meridiemLabel, selected && styles.meridiemLabelSelected]}>{label}</Text>
    </Pressable>
  );
}

// The same mark the habit form draws for a chosen frequency, at the same size.
const CHOICE_MARK = 22;

const makeStyles = (colors, shadows) =>
  StyleSheet.create({
    title: {
      ...typography.h3,
      color: colors.text,
    },
    // The chosen time, in the type a habit's own name is set in: it is the
    // answer, and the columns underneath are only how it is reached.
    reading: {
      ...typography.habitTitle,
      color: colors.brand,
      marginTop: spacing.sm,
    },
    // One control, centred, rather than three things starting at the left
    // margin. Without a justification the row packed to the start and left the
    // whole of its slack on the right, which read as the picker having drifted
    // off the middle of its own panel -- most visible against the title and the
    // reading above it, both of which are set from the left and are supposed to
    // be the things that sit against that edge.
    columns: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'center',
      marginTop: spacing.lg,
    },
    // Centred on the column it labels. The numbers inside the scroller are
    // centred in their 64pt track, so a label aligned to the start of the same
    // track sat a few points to the left of everything it was naming.
    column: {
      alignItems: 'center',
    },
    // Uppercased by the style, as every other micro-label in the app is.
    columnLabel: {
      ...typography.label,
      textTransform: 'uppercase',
      color: colors.textMuted,
      marginBottom: spacing.xs,
    },
    columnBody: {
      height: ROW * VISIBLE_ROWS,
      justifyContent: 'center',
    },
    columnScroll: {
      width: 64,
    },
    columnContent: {
      // Two empty rows either end, so the first and last values can reach the
      // middle band like every other one.
      paddingVertical: ROW * EDGE_ROWS,
    },
    selectionBand: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: ROW * EDGE_ROWS,
      height: ROW,
      borderRadius: radii.md,
      backgroundColor: colors.surfaceMuted,
    },
    row: {
      height: ROW,
      justifyContent: 'center',
      alignItems: 'center',
    },
    // Tapping a number straight onto the band is the quick way to use this, and
    // it was the one action in the panel that answered with nothing at all --
    // the scroll moved, eventually, and until it did there was no sign the tap
    // had landed. The same fade every other quiet target in the app uses.
    rowPressed: {
      opacity: motion.pressed.fade,
    },
    // Secondary rather than muted: the values either side of the chosen one
    // are still targets you can tap straight onto, so they have to be read as
    // easily as they are reached.
    rowLabel: {
      ...typography.body,
      color: colors.textSecondary,
    },
    rowLabelSelected: {
      ...typography.h3,
      color: colors.text,
    },
    // The same height as a column's scroll area, so whatever sits in it lands
    // on the selected row rather than near it.
    besideBody: {
      height: ROW * VISIBLE_ROWS,
      justifyContent: 'center',
    },
    separator: {
      ...typography.h3,
      color: colors.textMuted,
      marginHorizontal: spacing.xs,
    },
    meridiem: {
      marginLeft: spacing.lg,
    },
    meridiemOption: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: layout.touchTarget,
    },
    meridiemLabel: {
      ...typography.body,
      color: colors.textSecondary,
    },
    meridiemLabelSelected: {
      fontFamily: typography.h3.fontFamily,
      color: colors.text,
    },
    choiceMark: {
      width: CHOICE_MARK,
      height: CHOICE_MARK,
      marginRight: spacing.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    choiceRing: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      borderRadius: CHOICE_MARK / 2,
      borderWidth: 1.5,
      borderColor: colors.markWaiting,
    },
    choiceFill: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      borderRadius: CHOICE_MARK / 2,
      backgroundColor: colors.brand,
    },
    actions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
      marginTop: spacing.lg,
    },
    action: {
      minHeight: layout.touchTarget,
      justifyContent: 'center',
      paddingHorizontal: spacing.lg,
      borderRadius: radii.md,
    },
    actionPressed: {
      opacity: motion.pressed.fade,
    },
    doneAction: {
      marginRight: -spacing.lg,
    },
    cancelLabel: {
      ...typography.body,
      color: colors.textSecondary,
    },
    doneLabel: {
      ...typography.button,
      color: colors.brand,
    },
  });
