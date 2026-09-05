/**
 * Habit Loop palette.
 *
 * Three colours carry the whole product, and each one means something:
 *
 *   WARM PAPER   the environment. Everything is printed on it.
 *   DEEP BLUE    intent. What you chose, what is due, what commits.
 *   CORAL        what happened. Completion, progress, the additive action.
 *
 * Neutrals support the system rather than joining it, and they are split by
 * job rather than by shade: LINES are warm sand, because a rule on paper is
 * part of the paper; MARKS are cool blue-grey, because a mark is something
 * placed on it. That is why an unfilled rhythm dot and an unfilled completion
 * ring read as the same family while a field's underline does not.
 *
 * The one rule worth stating out loud: coral is never used for a state the
 * user merely selected. A day you chose is blue; a day you showed up for is
 * coral. Blurring those two is what turns a record into decoration.
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
  blue300: '#8090A0',
  blue200: '#8A99A6',
  blue150: '#C2CBD3',

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

  // Lines. Warm, because a rule belongs to the paper it is drawn on.
  border: palette.sand300,
  borderStrong: palette.sand500,

  // Marks. Cool, because a mark is placed on the paper rather than part of it.
  //
  // The whole point of this scale is that a day still waiting to be filled is
  // *neutral* -- it is not a miss, not a warning, and must never drift toward
  // red or amber. Only a day that happened carries warmth.
  //
  // markWaiting is one token on purpose. It draws Today's completion ring, the
  // rhythm grid's waiting dot and the form's unchosen frequency mark, so those
  // three read as the same idea in three sizes rather than three inventions. It
  // clears 3:1 against paper, which the old warm sand did not -- a control you
  // are meant to press has to be findable.
  markDone: palette.coral500,
  markWaiting: palette.blue300,
  markIdle: palette.blue150,

  // Effects
  shadow: palette.blue900,
};
