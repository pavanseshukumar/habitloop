import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { BackButton } from '../components/BackButton';
import { Screen } from '../components/Screen';
import { getPermissionStatus } from '../lib/notifications';
import { THEME_MODES, motion, spacing, typography, useTheme, useThemedStyles } from '../theme';

/**
 * How the app behaves, as opposed to what the user is building.
 *
 * These two settings used to sit at the bottom of the collection screen, where
 * they were the only things on it that were not habits. Moving them here is
 * the whole of this screen's reason to exist: "Your habits" can now mean
 * habits, and the two facts about the app -- which atmosphere it is in, and
 * whether the device will let reminders through -- have somewhere of their own
 * to be.
 *
 * Deliberately small, and deliberately not a dashboard. It holds the settings
 * the app actually has and nothing reserved for settings it might. Anything
 * belonging to a particular habit -- its schedule, its days, its reminder --
 * stays with that habit in Create and Edit, because a reminder is something a
 * habit has rather than something the app does.
 */
export function SettingsScreen({ navigation }) {
  const styles = useThemedStyles(makeStyles);

  // The same single entrance the other pushed screens use: the title settles
  // first and the body follows it in, so the page arrives as one movement.
  const entrance = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(entrance, {
      toValue: 1,
      duration: motion.duration.settle,
      easing: motion.easing.out,
      useNativeDriver: true,
    }).start();
  }, [entrance]);

  return (
    <Screen>
      <BackButton onPress={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Band entrance={entrance} band={BANDS.title}>
          <Text style={styles.title}>Settings</Text>
        </Band>

        <Band entrance={entrance} band={BANDS.body}>
          <AppearanceSetting />
          <NotificationStatus />
        </Band>
      </ScrollView>
    </Screen>
  );
}

/**
 * Which of the two atmospheres the app is in.
 *
 * Three options rather than a switch, because "System" is a real answer and
 * not the absence of one -- a toggle would force the user to pick a side and
 * then stop following their phone at sunset.
 *
 * Set in the same marks the rest of the app uses for a choice already made --
 * the ring that fills in, from the habit form's "How often?" -- so this reads
 * as one more question Habit Loop asks rather than a settings screen bolted on
 * the end. Nothing is confirmed and nothing is saved by hand: the choice is
 * the action, and the interface turns over underneath the finger that made it.
 *
 * The mode and its persistence both belong to ThemeProvider. This is a read
 * and a call, which is what keeps changing the theme from being able to touch
 * a habit or set off a reminder reconcile.
 */
function AppearanceSetting() {
  const styles = useThemedStyles(makeStyles);
  const { themeMode, setThemeMode } = useTheme();

  return (
    <Section label="Appearance">
      <View style={styles.appearanceRow} accessibilityRole="radiogroup">
        {THEME_MODES.map((mode) => (
          <ChoiceOption
            key={mode}
            label={MODE_LABELS[mode]}
            selected={themeMode === mode}
            onPress={() => setThemeMode(mode)}
          />
        ))}
      </View>
    </Section>
  );
}

const MODE_LABELS = { system: 'System', light: 'Light', dark: 'Dark' };

/**
 * Whether reminders can arrive at all.
 *
 * Deliberately a statement rather than a control: reminders belong to the
 * habit that wants one, and a global switch here would be a second place to
 * turn the same thing off. What this answers is the one question a per-habit
 * toggle cannot -- "I set a reminder, will it actually come?" -- which only
 * the system knows.
 *
 * It reads the standing answer and never asks for one. Opening this screen
 * prompts for nothing; the only tap in the app that can raise the system
 * prompt is still the one that turns a habit's reminder on.
 *
 * Re-read on focus, because the way to change the answer is to leave the app.
 */
function NotificationStatus() {
  const styles = useThemedStyles(makeStyles);
  const [status, setStatus] = useState(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getPermissionStatus().then((next) => {
        if (!cancelled) setStatus(next);
      });
      return () => {
        cancelled = true;
      };
    }, [])
  );

  const granted = status === 'granted';

  return (
    <Section label="Notifications" style={styles.notificationsSection}>
      {/* Nothing is claimed until the system has answered. The section keeps
          its place either way, so the screen does not reflow around a fact
          that takes a moment to arrive. */}
      {status === null ? null : (
        <Text style={styles.notificationsLine}>
          {granted
            ? 'Reminders can arrive on this device.'
            : 'Reminders are turned off for Habit Loop.'}
        </Text>
      )}

      {status === null || granted ? null : (
        <Pressable
          onPress={() => Linking.openSettings().catch(() => {})}
          hitSlop={8}
          style={({ pressed }) => [styles.settingsAction, pressed && styles.settingsPressed]}
          accessibilityRole="button"
          accessibilityLabel="Open system settings"
          accessibilityHint="Opens Habit Loop's notification settings on this device">
          <Text style={styles.settingsLabel}>Open system settings</Text>
        </Pressable>
      )}
    </Section>
  );
}

/**
 * The app's mark for a chosen thing: a quiet ring that fills with brand blue.
 *
 * The same construction the habit form uses, kept deliberately identical --
 * blue rather than coral, because coral means a day that happened and this is
 * only a preference being selected.
 */
function ChoiceOption({ label, selected, onPress }) {
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
      style={({ pressed }) => [styles.choiceOption, pressed && styles.choicePressed]}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}>
      <View style={styles.choiceMark}>
        <Animated.View style={[styles.choiceRing, { opacity: ringOpacity }]} />
        <Animated.View
          style={[styles.choiceFill, { opacity: fill, transform: [{ scale: fillScale }] }]}
        />
      </View>
      <Text style={[styles.choiceLabel, selected && styles.choiceLabelSelected]}>{label}</Text>
    </Pressable>
  );
}

/**
 * Where each part of the screen sits in the single entrance animation, in the
 * same shape Habit Detail and Habit Management use -- `at` is the slice of the
 * shared 0..1 value the band fades across, `lift` the distance it travels.
 */
const BANDS = {
  title: { at: [0, 0.6], lift: 10 },
  body: { at: [0.15, 1], lift: 14 },
};

function Band({ entrance, band, style, children }) {
  const opacity = entrance.interpolate({
    inputRange: band.at,
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const translateY = entrance.interpolate({
    inputRange: band.at,
    outputRange: [band.lift, 0],
    extrapolate: 'clamp',
  });

  return (
    <Animated.View style={[style, { opacity, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
}

/**
 * A labelled band of the screen, in the app's smallest type -- the same voice
 * the collection's section labels and the rhythm grid's weekday letters use.
 * It names a section and then gets out of the way of what is inside it.
 */
function Section({ label, style, children }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={[styles.section, style]}>
      <Text style={styles.sectionLabel}>{label}</Text>
      {children}
    </View>
  );
}

// The same mark the habit form draws for a chosen frequency, at the same size.
const CHOICE_MARK = 22;

const makeStyles = (colors, shadows) =>
  StyleSheet.create({
    content: {
      flexGrow: 1,
      paddingTop: spacing.xl,
      paddingBottom: spacing.xxl,
    },
    // The subject of the page, in the same type Habit Management gives the
    // collection and Habit Detail gives a habit's name.
    title: {
      ...typography.habitTitle,
      color: colors.brand,
    },
    section: {
      marginTop: spacing.xxl,
    },
    // Uppercased by the style rather than in the string, exactly as the
    // collection screen does it.
    sectionLabel: {
      ...typography.label,
      textTransform: 'uppercase',
      color: colors.textMuted,
      marginBottom: spacing.md,
    },
    appearanceRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    // A wider break than the one between sections: appearance is something the
    // user chooses, and this is something the device has already decided.
    notificationsSection: {
      marginTop: spacing.xxxl,
    },
    notificationsLine: {
      ...typography.bodySmall,
      color: colors.textSecondary,
    },
    settingsAction: {
      marginTop: spacing.md,
      paddingVertical: spacing.sm,
      alignSelf: 'flex-start',
    },
    settingsPressed: {
      opacity: motion.pressed.fade,
    },
    settingsLabel: {
      ...typography.body,
      color: colors.textSecondary,
    },
    choiceOption: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.sm,
      marginRight: spacing.xl,
    },
    choicePressed: {
      opacity: motion.pressed.fade,
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
    choiceLabel: {
      ...typography.body,
      color: colors.textSecondary,
    },
    choiceLabelSelected: {
      fontFamily: typography.h3.fontFamily,
      color: colors.text,
    },
  });
