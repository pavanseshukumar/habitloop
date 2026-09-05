import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { WEEKDAYS } from '../data/weekdays';
import { colors, spacing, typography } from '../theme';

/**
 * The fields a habit is made of: what it is, an optional word of support, and
 * when it comes round.
 *
 * Shared by creating a habit and changing one so the two read as the same
 * screen asked in a different tense. Everything stateful lives in useHabitForm;
 * the only state here is which field is lit, which is purely how it looks.
 */
export function HabitFormFields({ form, autoFocus = false, namePlaceholder }) {
  const [focusedField, setFocusedField] = useState(null);

  return (
    <View>
      <TextInput
        value={form.name}
        onChangeText={form.changeName}
        // Multiline so long names wrap instead of scrolling sideways;
        // newlines are stripped so it still behaves as a single line.
        multiline
        placeholder={namePlaceholder ?? 'What do you want to do?'}
        placeholderTextColor={colors.textMuted}
        submitBehavior="blurAndSubmit"
        returnKeyType="done"
        autoFocus={autoFocus}
        onFocus={() => setFocusedField('name')}
        onBlur={() => setFocusedField(null)}
        style={[styles.nameInput, focusedField === 'name' && styles.inputFocused]}
        accessibilityLabel="Habit name"
      />

      <TextInput
        value={form.detail}
        onChangeText={form.changeDetail}
        placeholder="Add a detail, optional"
        placeholderTextColor={colors.textMuted}
        returnKeyType="done"
        onFocus={() => setFocusedField('detail')}
        onBlur={() => setFocusedField(null)}
        style={[styles.detailInput, focusedField === 'detail' && styles.inputFocused]}
        accessibilityLabel="Supporting detail, optional"
      />

      <Text style={styles.sectionLabel}>HOW OFTEN</Text>
      <View style={styles.frequencyRow}>
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
        <View style={styles.dayRow}>
          {WEEKDAYS.map((weekday) => {
            const selected = form.days.includes(weekday.id);
            return (
              <Pressable
                key={weekday.id}
                onPress={() => form.toggleDay(weekday.id)}
                hitSlop={{ top: 8, bottom: 8, left: 2, right: 2 }}
                style={[styles.day, selected && styles.daySelected]}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={weekday.label}>
                <Text style={[styles.dayText, selected && styles.dayTextSelected]}>
                  {weekday.short}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function FrequencyOption({ label, selected, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={styles.frequencyOption}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}>
      <Text style={[styles.frequencyLabel, selected && styles.frequencyLabelSelected]}>
        {label}
      </Text>
      <View style={[styles.frequencyRule, selected && styles.frequencyRuleSelected]} />
    </Pressable>
  );
}

const DAY_SIZE = 40;

const styles = StyleSheet.create({
  nameInput: {
    ...typography.h1,
    color: colors.text,
    padding: 0,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  detailInput: {
    ...typography.body,
    color: colors.textSecondary,
    padding: 0,
    paddingBottom: spacing.md,
    marginTop: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  inputFocused: {
    borderBottomColor: colors.accent,
  },
  sectionLabel: {
    ...typography.label,
    color: colors.textMuted,
    marginTop: spacing.xxxl,
    marginBottom: spacing.lg,
  },
  frequencyRow: {
    flexDirection: 'row',
  },
  frequencyOption: {
    marginRight: spacing.xl,
  },
  frequencyLabel: {
    ...typography.h3,
    color: colors.textMuted,
    paddingVertical: spacing.sm,
  },
  frequencyLabelSelected: {
    color: colors.text,
  },
  // A short coral underline marks the choice -- no pill, no box.
  frequencyRule: {
    height: 2,
    borderRadius: 1,
    backgroundColor: 'transparent',
  },
  frequencyRuleSelected: {
    backgroundColor: colors.accent,
  },
  dayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
  },
  day: {
    width: DAY_SIZE,
    height: DAY_SIZE,
    borderRadius: DAY_SIZE / 2,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  daySelected: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  dayText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  dayTextSelected: {
    color: colors.textOnBrand,
  },
});
