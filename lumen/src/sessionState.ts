// Identity boundaries invalidate every account-derived client cache.
let generation = 0;
let userId: number | null = null;
const resets = new Set<() => void>();
export const sessionGeneration = () => generation;
export const sessionUserId = () => userId;
export const onSessionReset = (reset: () => void) => {
  resets.add(reset);
};
export function resetSessionState(nextUserId: number | null) {
  generation += 1;
  userId = nextUserId;
  for (const reset of resets) reset();
}
