import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ModalSheet } from './ModalSheet';
import { layout, motion, radii, spacing, typography, useThemedStyles } from '../theme';

/**
 * "Are you sure?", asked in Habit Loop's voice.
 *
 * It replaces Alert.alert for the two questions this app asks about its own
 * data -- archiving a habit, and walking away from something unsaved. The
 * platform alert answered both perfectly well and looked like neither: drawn
 * by Android, in Android's theme, so an app the user had set to Dark asked
 * them a white question. This is the same question in the app's own paper,
 * type and spacing.
 *
 * Deliberately small and entirely controlled: it holds no state, decides
 * nothing, and does not know what it is confirming. The screen owns whether it
 * is open and what happens on either answer.
 *
 * The two answers are set as words rather than filled buttons, which is how
 * every other secondary action in the app is set -- Edit, All habits, Continue.
 * Cancel comes first in reading order and confirm sits to the right, weighted
 * one step heavier because it is the answer that does something.
 */
export function ConfirmationModal({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}) {
  const styles = useThemedStyles(makeStyles);

  return (
    // Backdrop and Android back both land on cancel: the safe half of the
    // question is the only thing an accident should ever be able to choose.
    <ModalSheet visible={visible} onDismiss={onCancel} accessibilityLabel={title}>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>

      {message ? <Text style={styles.message}>{message}</Text> : null}

      <View style={styles.actions}>
        <Pressable
          onPress={onCancel}
          hitSlop={8}
          style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
          accessibilityRole="button"
          accessibilityLabel={cancelLabel}>
          <Text style={styles.cancelLabel}>{cancelLabel}</Text>
        </Pressable>

        <Pressable
          onPress={onConfirm}
          hitSlop={8}
          style={({ pressed }) => [
            styles.action,
            destructive && styles.destructiveAction,
            pressed && styles.actionPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={confirmLabel}>
          {/* Coral when the answer takes something away, brand blue when it
              does not -- coral is this app's word for something that happened,
              so it marks the answer that changes the record.
              It is carried by the soft coral surface rather than by coral
              lettering: full-strength coral text clears only 2.7:1 on warm
              paper, and an answer you are being asked to read has to be
              readable. The result is still calm -- a pale wash the colour of a
              completed day, not a red button. */}
          <Text style={[styles.confirmLabel, destructive && styles.destructiveLabel]}>
            {confirmLabel}
          </Text>
        </Pressable>
      </View>
    </ModalSheet>
  );
}

const makeStyles = (colors, shadows) =>
  StyleSheet.create({
    // The question itself, in the type Habit Detail gives a habit's name: the
    // subject of the panel, stated rather than announced.
    title: {
      ...typography.h3,
      color: colors.text,
    },
    message: {
      ...typography.body,
      color: colors.textSecondary,
      marginTop: spacing.sm,
    },
    actions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
      marginTop: spacing.xl,
    },
    // A full-height target with the words sitting inside it, so the two
    // answers are comfortably far apart and neither is a small target.
    action: {
      minHeight: layout.touchTarget,
      justifyContent: 'center',
      paddingHorizontal: spacing.lg,
      // The app's one button shape, at the app's one button size.
      borderRadius: radii.pill,
    },
    actionPressed: {
      opacity: motion.pressed.fade,
    },
    destructiveAction: {
      backgroundColor: colors.accentSurface,
    },
    cancelLabel: {
      ...typography.body,
      color: colors.textSecondary,
    },
    confirmLabel: {
      ...typography.button,
      color: colors.brand,
    },
    destructiveLabel: {
      color: colors.text,
    },
  });
