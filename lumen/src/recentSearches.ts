import { sessionUserId } from './sessionState';

const key = () => {
  const userId = sessionUserId();
  return userId === null ? null : `lumen-recent-searches:${userId}`;
};

export function readRecentSearches(): string[] {
  try {
    // The legacy browser-wide list has no trustworthy account owner.
    localStorage.removeItem('lumen-recent-searches');
    const accountKey = key();
    if (!accountKey) return [];
    const stored: unknown = JSON.parse(
      localStorage.getItem(accountKey) || '[]'
    );
    return Array.isArray(stored)
      ? stored
          .filter((term): term is string => typeof term === 'string')
          .slice(0, 6)
      : [];
  } catch {
    return [];
  }
}

export function saveRecentSearches(terms: string[]) {
  try {
    const accountKey = key();
    if (accountKey)
      localStorage.setItem(accountKey, JSON.stringify(terms.slice(0, 6)));
  } catch {
    // Optional history must not prevent searching when storage is unavailable.
  }
}

export function clearRecentSearches() {
  try {
    const accountKey = key();
    if (accountKey) localStorage.removeItem(accountKey);
  } catch {
    // The in-memory list can still be cleared when storage is unavailable.
  }
}
