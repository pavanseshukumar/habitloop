/**
 * Example habits, for development only.
 *
 * NOT WIRED IN. Nothing imports this file, which is deliberate: it is the one
 * arrangement in which example data cannot reach a real user. A fresh install
 * starts with no habits at all, because a habit is something a person chooses,
 * and three of someone else's are not a starting point.
 *
 * To use it while working on the app, import it in store/habits.js and swap the
 * empty hydration branch for:
 *
 *     setHabits(createDevelopmentHabits());
 *
 * Then clear app storage so the branch is taken. Revert both lines before
 * committing -- and if this file ever stops being useful, delete it; nothing
 * else refers to it.
 */
const EXAMPLES = [
  {
    id: 'morning-walk',
    name: 'Morning walk',
    detail: 'Around the block is enough',
    frequency: 'daily',
    days: [],
  },
  {
    id: 'read-pages',
    name: 'Read 10 pages',
    detail: 'Any book counts',
    frequency: 'daily',
    days: [],
  },
  {
    id: 'water',
    name: 'Drink 2L of water',
    detail: 'Spread across the day',
    frequency: 'daily',
    days: [],
  },
];

/** A function, not a constant, so createdAt reflects when they were seeded. */
export function createDevelopmentHabits() {
  const createdAt = new Date().toISOString();
  return EXAMPLES.map((habit) => ({ ...habit, createdAt, archivedAt: null }));
}
