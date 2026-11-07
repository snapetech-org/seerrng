// Answers from SeerrNG, kept so going back to a page or reopening Lumen doesn't ask for
// everything again. Every call counts against SeerrNG's per-account rate limit, and its
// first lookup of a title can take seconds.
//
// - Fresh (under FRESH_MS): used as is, nothing is asked.
// - Older (up to KEEP_MS): shown at once while a new answer loads in the background.
// - Saved per account in localStorage, so a reopened app starts from what it last showed.
//   Signing out or switching account drops it. Requests and other changes mark everything
//   stale, so nothing keeps showing a title as not requested.
import { onSessionReset, sessionUserId } from './sessionState';

export const FRESH_MS = 3 * 60_000;
const KEEP_MS = 24 * 60 * 60_000;
const MAX_SAVED = 150;
// these change as people use the site: always asked again (still shown at once meanwhile)
const ALWAYS_CHECK = /^\/(request|auth|user\/\d+\/quota|settings\/public)/;

type Entry = { at: number; data: unknown };
let entries = new Map<string, Entry>();
let loadedFor: number | null | undefined;
const storeKey = (id: number) => `lumen-cache:${id}`;

function retained(e: Entry | undefined, now = Date.now()): e is Entry {
  return !!e && typeof e.at === 'number' && e.at <= now && now - e.at < KEEP_MS;
}

function ensureLoaded() {
  const id = sessionUserId();
  if (loadedFor === id) return;
  loadedFor = id;
  entries = new Map();
  if (id == null) return;
  try {
    const saved = JSON.parse(localStorage.getItem(storeKey(id)) || '[]');
    const now = Date.now();
    if (Array.isArray(saved))
      for (const item of saved) {
        if (!Array.isArray(item) || typeof item[0] !== 'string') continue;
        const e = item[1] as Entry | undefined;
        if (retained(e, now)) entries.set(item[0], e);
      }
  } catch {
    // unreadable or blocked storage: start empty
  }
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
function save() {
  const id = sessionUserId();
  if (id == null || loadedFor !== id) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (sessionUserId() !== id) return;
    try {
      const newest = [...entries]
        .sort((a, b) => b[1].at - a[1].at)
        .slice(0, MAX_SAVED);
      localStorage.setItem(storeKey(id), JSON.stringify(newest));
    } catch {
      // full or blocked storage: keep it in memory only
    }
  }, 400);
}

function currentEntry(path: string) {
  ensureLoaded();
  const e = entries.get(path);
  if (retained(e)) return e;
  entries.delete(path);
  return undefined;
}

export function cached<T>(path: string): T | undefined {
  return currentEntry(path)?.data as T | undefined;
}

export function isFresh(path: string) {
  const e = currentEntry(path);
  return !!e && !ALWAYS_CHECK.test(path) && Date.now() - e.at < FRESH_MS;
}

export function remember(path: string, data: unknown) {
  ensureLoaded();
  entries.set(path, { at: Date.now(), data });
  save();
}

export function forget(prefix: string) {
  ensureLoaded();
  for (const k of [...entries.keys()])
    if (k.startsWith(prefix)) entries.delete(k);
  save();
}

// after a request or other change: keep showing what's there, but ask again next time
export function markAllStale() {
  ensureLoaded();
  const stale = Date.now() - FRESH_MS - 1;
  for (const e of entries.values()) e.at = Math.min(e.at, stale);
  save();
}

onSessionReset(() => {
  const previous = loadedFor;
  if (previous != null && previous !== sessionUserId())
    try {
      localStorage.removeItem(storeKey(previous));
    } catch {
      // blocked storage: nothing was saved
    }
  clearTimeout(saveTimer);
  entries = new Map();
  loadedFor = undefined;
});
