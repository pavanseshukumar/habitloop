import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, layout } from '../theme';

/**
 * Standard screen shell: brand background, safe-area insets, and the shared
 * horizontal gutter. Screens supply their own vertical rhythm.
 */
export function Screen({ children, style, edges = ['top', 'bottom'] }) {
  return (
    <SafeAreaView style={styles.safeArea} edges={edges}>
      <View style={[styles.content, style]}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    width: '100%',
    maxWidth: layout.contentMaxWidth,
    alignSelf: 'center',
    paddingHorizontal: layout.screenPaddingX,
    paddingVertical: layout.screenPaddingY,
  },
});
