/**
 * Single entry point for the design system.
 *
 * Colours are the one part of it that changes while the app is running, so
 * they arrive through a hook rather than an import:
 *
 *   const { colors } = useTheme();
 *   const styles = useThemedStyles(makeStyles);   // makeStyles = (colors) => ...
 *
 * Everything else -- type, spacing, radii, layout, motion -- is the same in
 * both themes and is still imported directly. There is deliberately no
 * exported `colors` object: a static one would silently capture whichever
 * palette loaded first, so the absence of it is what stops a component
 * accidentally freezing itself into light mode.
 */
export { ThemeProvider, useTheme, useThemedStyles } from './ThemeProvider';
export {
  DEFAULT_THEME_MODE,
  THEME_MODES,
  isThemeMode,
  normalizeThemeMode,
  resolveScheme,
  themeFor,
  themes,
} from './colors';

export { typography, fontFamily } from './typography';
export { spacing } from './spacing';
export { radii } from './radii';
export { layout } from './layout';
export { motion } from './motion';
