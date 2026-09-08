import { useEffect, useRef, useState } from 'react';
import { Animated, Modal, Pressable, StyleSheet, View } from 'react-native';

import { layout, motion, radii, spacing, useThemedStyles } from '../theme';

/**
 * The one way this app interrupts you.
 *
 * Both things that stop the screen -- confirming something you cannot easily
 * undo, and setting a reminder's time -- are the same object underneath: a
 * dimmed room, a small panel of paper in the middle of it, and a way out that
 * costs nothing. Building that once is what keeps them recognisably the same
 * interruption rather than two dialogs that happen to coexist.
 *
 * It exists because the platform's own dialog cannot do this. An Alert and the
 * Android time picker are drawn by the operating system in the *device's*
 * theme, so an app set to Dark on a Light phone hands the user a white box in
 * the middle of a dark screen. Everything here is painted from the app's own
 * resolved palette, which is the entire point.
 *
 * Nothing about what is inside is decided here: this owns the ground, the
 * paper, the motion and the ways out, and the caller owns the content.
 */
export function ModalSheet({ visible, onDismiss, children, accessibilityLabel }) {
  const styles = useThemedStyles(makeStyles);

  // The native Modal has to outlive `visible` by the length of the exit, or
  // the panel would be unmounted before it could animate away. This is what is
  // actually mounted; `visible` only starts the two animations below.
  const [mounted, setMounted] = useState(visible);
  const entrance = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.timing(entrance, {
        toValue: 1,
        duration: motion.duration.base,
        easing: motion.easing.out,
        useNativeDriver: true,
      }).start();
      return;
    }

    // Leaving is quicker than arriving, the same way undo is quicker than
    // doing -- the app should never make you wait to be let go.
    Animated.timing(entrance, {
      toValue: 0,
      duration: motion.duration.quick,
      easing: motion.easing.out,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setMounted(false);
    });
  }, [visible, entrance]);

  if (!mounted) return null;

  // Six points, and no scale: the panel settles into place rather than
  // arriving from somewhere. A dialog that grows at you is a dialog making an
  // entrance, which is the wrong note for one that is usually asking whether
  // you are sure.
  const lift = entrance.interpolate({ inputRange: [0, 1], outputRange: [6, 0] });

  // Dimmed, not blacked out: the screen you were on stays legible behind the
  // question being asked about it.
  const dim = entrance.interpolate({ inputRange: [0, 1], outputRange: [0, 0.45] });

  return (
    <Modal
      visible
      transparent
      // The fade is ours; the platform's would run against it.
      animationType="none"
      statusBarTranslucent
      // Android's back button. Dismissing is always the safe half of whatever
      // is being asked, so hardware back behaves like Cancel.
      onRequestClose={onDismiss}>
      <View style={styles.root}>
        {/* Tapping outside dismisses, which is the same as cancelling -- never
            the same as confirming. It is a plain Pressable rather than an
            overlay over the panel, so nothing can swallow a tap meant for the
            buttons inside. */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onDismiss}
          accessibilityElementsHidden
          importantForAccessibility="no"
          // Not a button to a screen reader: it is the way out, and the panel
          // already carries one in words.
          accessibilityRole="none">
          <Animated.View style={[styles.backdrop, { opacity: dim }]} />
        </Pressable>

        <Animated.View
          style={[styles.sheet, { opacity: entrance, transform: [{ translateY: lift }] }]}
          accessibilityViewIsModal
          accessibilityRole="alert"
          accessibilityLabel={accessibilityLabel}>
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

const makeStyles = (colors, shadows) =>
  StyleSheet.create({
    root: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.xl,
    },
    // The room the panel is in. Painted from the theme's own ink so it dims
    // warm paper warmly and the dark background darkly, rather than dropping a
    // neutral grey over both.
    backdrop: {
      flex: 1,
      backgroundColor: colors.shadow,
    },
    // Paper, lifted -- the same `lifted` elevation the design system already
    // defines, and nothing more. No border, no gradient, no glass.
    sheet: {
      width: '100%',
      maxWidth: layout.contentMaxWidth,
      alignSelf: 'center',
      backgroundColor: colors.surface,
      borderRadius: radii.xl,
      paddingVertical: spacing.xl,
      paddingHorizontal: spacing.xl,
      ...shadows.lifted,
    },
  });
