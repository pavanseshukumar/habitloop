/**
 * Plus Jakarta Sans type system.
 *
 * Styles are semantic, not descriptive: reach for `typography.h2`, never a
 * loose fontSize. Weight is expressed only through `fontFamily` -- setting
 * `fontWeight` alongside a custom family makes Android synthesise a fake bold,
 * so no token here carries one.
 */

export const fontFamily = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
};

export const typography = {
  display: {
    fontFamily: fontFamily.bold,
    fontSize: 40,
    lineHeight: 46,
    letterSpacing: -0.8,
  },
  h1: {
    fontFamily: fontFamily.bold,
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: -0.5,
  },
  h2: {
    fontFamily: fontFamily.semibold,
    fontSize: 23,
    lineHeight: 30,
    letterSpacing: -0.3,
  },
  h3: {
    fontFamily: fontFamily.semibold,
    fontSize: 18,
    lineHeight: 24,
    letterSpacing: -0.2,
  },
  body: {
    fontFamily: fontFamily.regular,
    fontSize: 16,
    lineHeight: 25,
    letterSpacing: 0,
  },
  bodySmall: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 21,
    letterSpacing: 0,
  },
  label: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 1.1,
  },
  button: {
    fontFamily: fontFamily.semibold,
    fontSize: 16,
    lineHeight: 20,
    letterSpacing: 0.2,
  },
  // Today's greeting. Personal rather than a headline -- it sits under the
  // wordmark and must not out-shout the habit names further down the screen.
  greeting: {
    fontFamily: fontFamily.bold,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.45,
  },
  // A habit's name in the list: the strongest functional type in the app, and
  // the thing a returning user's eye should land on first.
  habitName: {
    fontFamily: fontFamily.semibold,
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.25,
  },
  // The wordmark lockup. Tracked tighter than the scale would give it so that
  // "habit lOOp" reads as one name rather than two words.
  wordmark: {
    fontFamily: fontFamily.semibold,
    fontSize: 20,
    lineHeight: 26,
    letterSpacing: -0.5,
  },
  // A habit's own name on its detail screen: the subject of the page, and the
  // largest thing on it. Semibold rather than bold, and a step under h1 -- this
  // is a name being stated, not a headline being announced.
  habitTitle: {
    fontFamily: fontFamily.semibold,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.5,
  },
  // The recognition sentence: "You have shown up 18 times." Sized between body
  // and h3 so it carries weight as a statement, and deliberately not a number
  // style -- the count belongs inside a sentence, not on a dial. The emphasis
  // within it comes from weight and colour, never from size.
  recognition: {
    fontFamily: fontFamily.regular,
    fontSize: 19,
    lineHeight: 28,
    letterSpacing: -0.1,
  },
};
