import { onSessionReset, sessionUserId } from './sessionState';

// Search keeps its own list; the music page keeps a longer one of its own.
type Scope = 'music';
const limit = (scope?: Scope) => (scope === 'music' ? 8 : 6);
const prefix = (scope?: Scope) =>
  scope ? `lumen-${scope}-recent-searches` : 'lumen-recent-searches';
const key = (scope?: Scope, userId = sessionUserId()) =>
  userId === null ? null : `${prefix(scope)}:${userId}`;

export function readRecentSearches(scope?: Scope): string[] {
  try {
    // The legacy browser-wide list has no trustworthy account owner.
    localStorage.removeItem(prefix(scope));
    const accountKey = key(scope);
    if (!accountKey) return [];
    const stored: unknown = JSON.parse(
      localStorage.getItem(accountKey) || '[]'
    );
    return Array.isArray(stored)
      ? stored
          .filter((term): term is string => typeof term === 'string')
          .slice(0, limit(scope))
      : [];
  } catch {
    return [];
  }
}

export function saveRecentSearches(terms: string[], scope?: Scope) {
  try {
    const accountKey = key(scope);
    if (accountKey)
      localStorage.setItem(
        accountKey,
        JSON.stringify(terms.slice(0, limit(scope)))
      );
  } catch {
    // Optional history must not prevent searching when storage is unavailable.
  }
}

export function clearRecentSearches(scope?: Scope) {
  try {
    const accountKey = key(scope);
    if (accountKey) localStorage.removeItem(accountKey);
  } catch {
    // The in-memory list can still be cleared when storage is unavailable.
  }
}

// Music searches leave with the person who made them (shared tablets).
onSessionReset((previousUserId) => {
  const previousKey = key('music', previousUserId);
  if (!previousKey) return;
  try {
    localStorage.removeItem(previousKey);
  } catch {
    // storage blocked: there is nothing kept to clear
  }
});
