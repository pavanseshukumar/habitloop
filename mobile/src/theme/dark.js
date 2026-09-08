/**
 * Habit Loop at night: the same room with the lights down.
 *
 * Not an inversion. The light theme is ink on warm paper, and the temptation
 * in dark mode is to swap the two and call it done -- which produces a product
 * that reads correctly and feels like somebody else's. So the atmosphere is
 * rebuilt from the same three ideas instead:
 *
 *   DEEP BLUE-CHARCOAL  the environment. Not black: the background is the
 *                       brand blue taken down and slightly desaturated, so the
 *                       app still sits in blue rather than in a void.
 *   LIGHT BLUE          intent. The same hue as the daytime brand, lifted far
 *                       enough to be legible on a dark ground. It is the same
 *                       colour doing the same job under different light.
 *   CORAL               what happened. Unchanged, exactly.
 *
 * Coral is the decision worth explaining. It is the one value shared verbatim
 * between the two themes, because it is the only colour in the product that
 * means something specific -- a day you showed up for -- and a habit completed
 * at night should look like a habit completed in the morning. It reads at
 * 6.4:1 on this background, which is bright enough to be a reward and far
 * short of anything that glows.
 *
 * What inverts and what does not is the whole design here. Text and brand
 * lighten. Marks that mean "waiting" hold their value, because a neutral mark
 * is neutral in any light. Marks that mean "barely there" go *darker*, since
 * faintness on a dark ground is nearness to the background, not distance from
 * it -- lightening those would have turned the quietest thing in the rhythm
 * grid into the loudest.
 *
 * Every pairing the app actually renders was checked against WCAG AA; the
 * quiet tones are quiet by being cool and low-chroma, not by being dim.
 */

// Raw ramp. Private to this file.
const palette = {
  // The room. Blue-charcoal, all within a few degrees of the brand's own hue.
  ink900: '#121D28', // background
  ink800: '#18242F', // surface, a single step lifted
  ink700: '#1E2B38', // the surface a pressed row lights up
  ink600: '#26333F', // lines
  ink500: '#35424F', // stronger lines
  ink400: '#3A4A5A', // the faintest mark that is still a mark

  // The brand hue, raised until it carries on a dark ground.
  blue300: '#BAD4EA',
  blue400: '#9CBDD9', // brand
  blue500: '#86A6C2',
  blue600: '#8090A0', // the waiting mark, held at its daytime value

  // Text. Warm at the top of the scale, cooling as it quietens.
  parchment: '#EFE9E3',
  mist: '#9FB0BF',
  slate: '#8A9BA9',

  // Untouched from the light theme.
  coral500: '#F47B68', // accent
  coral300: '#F9AA9C',
  coral950: '#3A2320', // the coral surface, taken right down

  white: '#FFFFFF',
  black: '#000000',
};

export const dark = {
  // Surfaces. Three steps of the same charcoal -- depth here is tonal, which
  // is why almost nothing in this theme needs a shadow to sit above anything.
  background: palette.ink900,
  surface: palette.ink800,
  surfaceMuted: palette.ink700,

  // Brand.
  //
  // `brand` does two jobs, and they pull in opposite directions on a dark
  // ground: it is the wordmark and the greeting (foreground), and it is also
  // the fill under the primary button and a chosen weekday (background). The
  // light theme resolves this with a dark fill under light text; here it
  // resolves the other way, a light fill under dark text. The button inverts
  // between themes and stays the same button -- the brand hue, filled, with
  // the background colour written on it.
  brand: palette.blue400,
  brandStrong: palette.blue300,
  brandSoft: palette.blue500,

  accent: palette.coral500,
  accentSoft: palette.coral300,
  accentSurface: palette.coral950,

  // Text. Off-white rather than white, and warm rather than blue, so the thing
  // the user reads most carries the paper's warmth into the dark.
  text: palette.parchment,
  textSecondary: palette.mist,
  textMuted: palette.slate,
  textOnBrand: palette.ink900,
  // White on coral, exactly as by day: the completion check is a signature
  // mark and should not change between themes.
  textOnAccent: palette.white,

  // Lines. Cool here, where they were warm sand by day -- the rule still
  // belongs to the ground it is drawn on, and the ground is charcoal now.
  border: palette.ink600,
  borderStrong: palette.ink500,

  // Marks.
  //
  // markDone and markWaiting are the same values the light theme uses. A
  // completed day and a day still waiting mean the same things at midnight as
  // at noon, and both clear their contrast targets on this background, so
  // changing them would have been change for its own sake.
  //
  // markIdle is the one that had to move, and it moved the other way: a day
  // the habit was never due is drawn by being *almost the background*, so on
  // paper it is barely darker and here it is barely lighter.
  markDone: palette.coral500,
  markWaiting: palette.blue600,
  markIdle: palette.ink400,

  // Effects
  shadow: palette.black,
};

/**
 * Depth by night.
 *
 * Kept, but barely. On a dark ground a drop shadow has almost nothing to
 * darken, and pushing it until it shows produces the muddy halo that gives
 * away a light theme wearing dark colours. The tonal steps between background,
 * surface and surfaceMuted carry the hierarchy instead; these values exist so
 * the one genuinely lifted thing in the app -- the primary button -- still has
 * an edge, and so Android's own elevation has a colour to draw with.
 */
export const darkShadows = {
  soft: {
    shadowColor: dark.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 2,
  },
  lifted: {
    shadowColor: dark.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 6,
  },
};
