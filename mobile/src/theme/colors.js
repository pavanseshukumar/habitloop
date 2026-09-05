/**
 * Habit Loop palette.
 *
 * Warm, light, and low-contrast-by-default. Brand deep blue carries the
 * structure; coral is used sparingly as a single point of warmth.
 *
 * Only semantic names are exported. Never import a raw hex from here into a
 * component -- add a semantic token instead.
 */

// Raw ramp. Private to this file.
const palette = {
  blue900: '#0F2437',
  blue800: '#18324A', // brand
  blue600: '#2F5171',
  blue400: '#5F7385',
  blue200: '#93A2AE',

  coral500: '#F47B68', // accent
  coral300: '#F9AA9C',
  coral100: '#FDE7E1',

  paper: '#FBF8F5',
  paperDeep: '#F3EDE7',
  white: '#FFFFFF',

  sand300: '#E7DED5',
  sand500: '#D6C9BD',
};

export const colors = {
  // Surfaces
  background: palette.paper,
  surface: palette.white,
  surfaceMuted: palette.paperDeep,

  // Brand
  brand: palette.blue800,
  brandStrong: palette.blue900,
  brandSoft: palette.blue600,

  accent: palette.coral500,
  accentSoft: palette.coral300,
  accentSurface: palette.coral100,

  // Text
  text: palette.blue800,
  textSecondary: palette.blue400,
  textMuted: palette.blue200,
  textOnBrand: palette.paper,
  textOnAccent: palette.white,

  // Lines
  border: palette.sand300,
  borderStrong: palette.sand500,

  // Rhythm marks. The whole point of this scale is that a day still waiting to
  // be filled is *neutral* -- it is not a miss, not a warning, and must never
  // drift toward red or amber. Only a day that happened carries colour.
  markDone: palette.coral500,
  markWaiting: palette.sand500,
  markIdle: palette.sand300,

  // Effects
  shadow: palette.blue900,
};
