import { DefaultTheme } from '@react-navigation/native';

import { colors, fontFamily } from '../theme';

/**
 * Maps the design system onto React Navigation's theme so anything the
 * navigator renders itself (headers, card backgrounds) matches the app.
 *
 * fontWeight stays 'normal' throughout -- weight comes from the family.
 */
const navigationFont = (family) => ({ fontFamily: family, fontWeight: 'normal' });

export const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.brand,
    background: colors.background,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    notification: colors.accent,
  },
  fonts: {
    regular: navigationFont(fontFamily.regular),
    medium: navigationFont(fontFamily.medium),
    bold: navigationFont(fontFamily.semibold),
    heavy: navigationFont(fontFamily.bold),
  },
};
