// Identity boundaries invalidate every account-derived client cache.
let generation = 0;
let userId: number | null = null;
// listeners get the account that was signed in before the reset
const resets = new Set<(previousUserId: number | null) => void>();
export const sessionGeneration = () => generation;
export const sessionUserId = () => userId;
export const onSessionReset = (
  reset: (previousUserId: number | null) => void
) => {
  resets.add(reset);
};
export function resetSessionState(nextUserId: number | null) {
  generation += 1;
  const previous = userId;
  userId = nextUserId;
  for (const reset of resets) reset(previous);
}
