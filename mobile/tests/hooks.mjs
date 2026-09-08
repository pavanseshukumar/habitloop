/**
 * Lets Node import the app's source the way Metro does.
 *
 * Every module under src/ imports its neighbours without a file extension --
 * `from '../lib/completions'` -- which is what the React Native bundler expects
 * and what the whole codebase is written in. Node's ESM resolver requires the
 * extension, so this hook retries a failed relative resolve with `.js` appended
 * rather than asking the app to be written for the test runner.
 */
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (specifier.startsWith('.') && !specifier.endsWith('.js')) {
      return nextResolve(`${specifier}.js`, context);
    }

    throw error;
  }
}
