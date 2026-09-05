import { useFonts } from 'expo-font';

// Imported per weight rather than from the package root: the root barrel
// requires all 14 files (including italics), which would ship ~1.3MB of fonts
// the type system never asks for.
import { PlusJakartaSans_400Regular } from '@expo-google-fonts/plus-jakarta-sans/400Regular';
import { PlusJakartaSans_500Medium } from '@expo-google-fonts/plus-jakarta-sans/500Medium';
import { PlusJakartaSans_600SemiBold } from '@expo-google-fonts/plus-jakarta-sans/600SemiBold';
import { PlusJakartaSans_700Bold } from '@expo-google-fonts/plus-jakarta-sans/700Bold';

/**
 * Loads the four Plus Jakarta Sans weights referenced by the type system.
 * The keys must match `fontFamily` in theme/typography.js exactly.
 *
 * Returns [loaded, error]; the app stays behind the splash until one is truthy.
 */
export function useAppFonts() {
  return useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
  });
}
