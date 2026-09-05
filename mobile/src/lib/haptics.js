import * as Haptics from 'expo-haptics';

// Haptics are an enhancement, never a dependency of the interaction: emulators,
// devices with the motor disabled, and web all fail here in different ways.
// Swallow everything -- a missing buzz must never reach the user as an error.
function safely(run) {
  try {
    const result = run();
    if (result && typeof result.catch === 'function') result.catch(() => {});
  } catch {
    // no haptic engine available
  }
}

/** A single soft tap: "noted". Deliberately not a success notification buzz. */
export function completionFeedback() {
  safely(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

/** Undoing is not an achievement -- give it the lighter selection tick. */
export function undoFeedback() {
  safely(() => Haptics.selectionAsync());
}
