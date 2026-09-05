import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { WEEKDAYS } from '../data/weekdays';
import { colors, motion, spacing, typography } from '../theme';

/**
 * The fields a habit is made of: what it is, an optional word of support, and
 * when it comes round.
 *
 * Shared by creating a habit and changing one so the two read as the same
 * screen asked in a different tense. Everything stateful lives in useHabitForm;
 * the only state here is which field is lit and how wide the day row came out,
 * both of which are purely how it looks.
 *
 * The form is written to read as a short conversation rather than a stack of
 * labelled controls -- a question, an answer in the user's own words, a second
 * question, a rhythm. The screens above supply the first question; this file
 * supplies everything after it.
 */
export function HabitFormFields({ form, autoFocus = false, namePlaceholder }) {
  const [focusedField, setFocusedField] = useState(null);

  const needsADay = form.frequency === 'selected' && form.days.length === 0;

  return (
    <View>
      {/* The answer, and the largest thing on the screen once it exists. The
          question above it is the anchor while the field is empty; from the
          first keystroke the user's own words take over, which is the whole
          point of writing something down. */}
      <TextInput
        value={form.name}
        onChangeText={form.changeName}
        // Multiline so long names wrap instead of scrolling sideways;
        // newlines are stripped so it still behaves as a single line.
        multiline
        placeholder={namePlaceholder ?? 'Morning walk'}
        placeholderTextColor={colors.textMuted}
        submitBehavior="blurAndSubmit"
        returnKeyType="done"
        autoFocus={autoFocus}
        onFocus={() => setFocusedField('name')}
        onBlur={() => setFocusedField(null)}
        selectionColor={colors.accent}
        cursorColor={colors.accent}
        style={styles.nameInput}
        accessibilityLabel="Habit name"
      />
      <FieldRule focused={focusedField === 'name'} strong />

      {/* Deliberately a fraction of the size above it, on a fainter rule. It is
          a word of support, and it should never look like a second thing being
          asked for. */}
      <TextInput
        value={form.detail}
        onChangeText={form.changeDetail}
        placeholder="Add a detail, optional"
        placeholderTextColor={colors.textMuted}
        returnKeyType="done"
        onFocus={() => setFocusedField('detail')}
        onBlur={() => setFocusedField(null)}
        selectionColor={colors.accent}
        cursorColor={colors.accent}
        style={styles.detailInput}
        accessibilityLabel="Supporting detail, optional"
      />
      <FieldRule focused={focusedField === 'detail'} />

      <Text style={styles.question}>How often?</Text>

      {/* The same mark the rest of the app uses for a choice that has been
          made: a quiet ring that fills coral. A segmented control would say
          "setting"; this says "chosen", in the language Today already speaks. */}
      <View style={styles.frequencyRow} accessibilityRole="radiogroup">
        <FrequencyOption
          label="Every day"
          selected={form.frequency === 'daily'}
          onPress={() => form.selectFrequency('daily')}
        />
        <FrequencyOption
          label="Selected days"
          selected={form.frequency === 'selected'}
          onPress={() => form.selectFrequency('selected')}
        />
      </View>

      {form.frequency === 'selected' ? (
        <>
          <WeekdayPicker days={form.days} onToggle={form.toggleDay} />

          {/* The only thing the form ever says back. It appears solely in the
              state where the save button is dead for a reason the screen has
              not otherwise given -- every seven days turned off -- and it is
              guidance, not an error: no red, no icon, no shape. */}
          {needsADay ? <Text style={styles.hint}>Pick at least one day.</Text> : null}
        </>
      ) : null}
    </View>
  );
}

/**
 * The line under a field, and the only thing that moves while typing.
 *
 * A hairline at rest; a coral rule that draws itself left to right on focus and
 * retracts the same way. Cheaper than it looks -- one native-driven scaleX --
 * and it makes the field feel like paper being written on rather than a control
 * changing its border colour.
 */
function FieldRule({ focused, strong = false }) {
  const lit = useRef(new Animated.Value(focused ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(lit, {
      toValue: focused ? 1 : 0,
      // Arriving is worth watching; leaving should simply be over.
      duration: focused ? motion.duration.base : motion.duration.quick,
      easing: motion.easing.out,
      useNativeDriver: true,
    }).start();
  }, [focused, lit]);

  return (
    <View style={[styles.rule, strong && styles.ruleStrong]}>
      <Animated.View style={[styles.ruleLit, { transform: [{ scaleX: lit }] }]} />
    </View>
  );
}

function FrequencyOption({ label, selected, onPress }) {
  const fill = useRef(new Animated.Value(selected ? 1 : 0)).current;
  const press = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fill, {
      toValue: selected ? 1 : 0,
      duration: motion.duration.base,
      easing: motion.easing.out,
      useNativeDriver: true,
    }).start();
  }, [selected, fill]);

  const animatePress = (toValue) => {
    Animated.timing(press, {
      toValue,
      duration: motion.duration.press,
      easing: motion.easing.press,
      useNativeDriver: true,
    }).start();
  };

  // The ring gives way just before the coral arrives, so the fill grows into
  // the space rather than landing on top of an outline still sitting there.
  const ringOpacity = fill.interpolate({
    inputRange: [0, 0.4],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  const fillScale = fill.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });
  const pressScale = press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.94] });

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => animatePress(1)}
      onPressOut={() => animatePress(0)}
      style={styles.frequencyOption}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}>
      <Animated.View style={[styles.frequencyMark, { transform: [{ scale: pressScale }] }]}>
        <Animated.View style={[styles.frequencyRing, { opacity: ringOpacity }]} />
        <Animated.View
          style={[styles.frequencyFill, { opacity: fill, transform: [{ scale: fillScale }] }]}
        />
      </Animated.View>
      <Text style={[styles.frequencyLabel, selected && styles.frequencyLabelSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Seven days, on the same seven columns the rhythm grid uses.
 *
 * That is the point of measuring rather than fixing a width: what the user
 * picks here lines up with the record they will read later, so choosing a
 * rhythm and seeing it are visibly the same shape. It also means the row can
 * never overflow a narrow screen -- the circles shrink, they do not clip.
 */
function WeekdayPicker({ days, onToggle }) {
  const [size, setSize] = useState(DAY_MAX);

  const onLayout = (event) => {
    const cell = event.nativeEvent.layout.width / WEEKDAYS.length;
    const next = Math.round(Math.min(DAY_MAX, Math.max(DAY_MIN, cell - DAY_GUTTER)));
    setSize((current) => (current === next ? current : next));
  };

  return (
    <View style={styles.dayRow} onLayout={onLayout}>
      {WEEKDAYS.map((weekday) => (
        <DayToggle
          key={weekday.id}
          weekday={weekday}
          size={size}
          selected={days.includes(weekday.id)}
          onPress={() => onToggle(weekday.id)}
        />
      ))}
    </View>
  );
}

function DayToggle({ weekday, size, selected, onPress }) {
  const press = useRef(new Animated.Value(0)).current;

  const animatePress = (toValue) => {
    Animated.timing(press, {
      toValue,
      duration: motion.duration.press,
      easing: motion.easing.press,
      useNativeDriver: true,
    }).start();
  };

  const scale = press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.88] });

  return (
    // The target is the whole column, not the circle drawn in it, so every day
    // clears the minimum tap size however small the circles have had to get.
    <Pressable
      onPress={onPress}
      onPressIn={() => animatePress(1)}
      onPressOut={() => animatePress(0)}
      style={styles.dayTarget}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={weekday.label}>
      <Animated.View
        style={[
          styles.day,
          { width: size, height: size, borderRadius: size / 2 },
          selected && styles.daySelected,
          { transform: [{ scale }] },
        ]}>
        {/* Fill, border and weight all change together, so a chosen day is
            still a chosen day without colour vision. */}
        <Text style={[styles.dayText, selected && styles.dayTextSelected]}>{weekday.short}</Text>
      </Animated.View>
    </Pressable>
  );
}

const RULE_HEIGHT = 2;
const MARK_SIZE = 22;

// The day circle at its most generous and at its smallest, with a guaranteed
// gutter so seven of them never crowd or clip.
const DAY_MAX = 44;
const DAY_MIN = 34;
const DAY_GUTTER = 8;
const DAY_TARGET = 48;

const styles = StyleSheet.create({
  // Given room to breathe above the rule: the name is the one thing on this
  // screen the user writes themselves, and it should feel like it has a page.
  nameInput: {
    ...typography.h1,
    color: colors.text,
    padding: 0,
    paddingBottom: spacing.md,
  },
  detailInput: {
    ...typography.body,
    color: colors.textSecondary,
    padding: 0,
    paddingBottom: spacing.md,
    marginTop: spacing.xl,
  },
  rule: {
    height: RULE_HEIGHT,
    justifyContent: 'flex-end',
    // The resting hairline. The coral above it is what moves.
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  ruleStrong: {
    borderBottomColor: colors.borderStrong,
  },
  ruleLit: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: RULE_HEIGHT,
    backgroundColor: colors.accent,
    // Drawn from the left edge, the way a line is written.
    transformOrigin: 'left',
  },
  // The second question, and a clear step down from the first: the screen asks
  // one big thing and one small one.
  question: {
    ...typography.h3,
    color: colors.text,
    marginTop: spacing.xxxl,
    marginBottom: spacing.lg,
  },
  frequencyRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  frequencyOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    marginRight: spacing.xl,
  },
  frequencyMark: {
    width: MARK_SIZE,
    height: MARK_SIZE,
    marginRight: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  frequencyRing: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: MARK_SIZE / 2,
    borderWidth: 1.5,
    borderColor: colors.markWaiting,
  },
  frequencyFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: MARK_SIZE / 2,
    backgroundColor: colors.accent,
  },
  frequencyLabel: {
    ...typography.body,
    color: colors.textSecondary,
  },
  frequencyLabelSelected: {
    fontFamily: typography.h3.fontFamily,
    color: colors.text,
  },
  dayRow: {
    flexDirection: 'row',
    marginTop: spacing.lg,
  },
  dayTarget: {
    flex: 1,
    height: DAY_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  day: {
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Brand blue rather than coral on purpose: coral means a day that happened,
  // and these are days that are merely due. Borrowing it here would say the
  // week was already completed.
  daySelected: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  dayText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  dayTextSelected: {
    fontFamily: typography.h3.fontFamily,
    color: colors.textOnBrand,
  },
  hint: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
});
