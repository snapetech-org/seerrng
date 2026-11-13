// Answers from SeerrNG, kept so going back to a page or reopening Lumen doesn't ask for
// everything again. Every call counts against SeerrNG's per-account rate limit, and its
// first lookup of a title can take seconds.
//
// - Fresh (under FRESH_MS): used as is, nothing is asked.
// - Older (up to KEEP_MS): shown at once while a new answer loads in the background.
// - Saved per account in localStorage, so a reopened app starts from what it last showed.
//   Signing out or switching account drops it. Requests and other changes mark everything
//   stale, so nothing keeps showing a title as not requested.
// - SeerrNG allows each address 600 calls a minute, and behind a reverse proxy a whole
//   household can share one address. So identical calls in flight are shared, and even the
//   always-checked answers are reused for a few seconds (every poster asks for the server's
//   settings, for one).
import { onSessionReset, sessionUserId } from './sessionState';

export const FRESH_MS = 3 * 60_000;
const KEEP_MS = 24 * 60 * 60_000;
const MAX_SAVED = 150;
// browsers allow about 5MB per site (Firefox counts every *.example.org site together), and
// the whole copy is rewritten on each save: keep it small and leave out the big lists
const MAX_SAVED_CHARS = 1_000_000;
const MAX_ENTRY_CHARS = 100_000;
const SAVE_DELAY_MS = 400;
// how long an always-checked answer is reused before asking again
export const RECHECK_MS = 15_000;
// these change as people use the site: always asked again (still shown at once meanwhile)
const ALWAYS_CHECK = /^\/(request|auth|user\/\d+\/quota|settings\/public)/;
// These answers depend on current account category and maturity policies.
// Never serve cached person details or credits after those settings tighten.
const NEVER_CACHE = /^\/person\/\d+(?:\/combined_credits)?(?:\?|$)/;

type Entry = { at: number; data: unknown };
let entries = new Map<string, Entry>();
let loadedFor: number | null | undefined;
let generation = 0;
export const cacheGeneration = () => generation;
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
let pendingSave: (() => void) | undefined;
function save() {
  const id = sessionUserId();
  if (id == null || loadedFor !== id) return;
  clearTimeout(saveTimer);
  pendingSave = () => {
    pendingSave = undefined;
    if (sessionUserId() !== id) return;
    try {
      const parts: string[] = [];
      let chars = 2;
      // newest first (and the latest added first among answers saved the same moment)
      for (const item of [...entries]
        .reverse()
        .sort((a, b) => b[1].at - a[1].at)) {
        if (parts.length >= MAX_SAVED) break;
        const one = JSON.stringify(item);
        if (one.length > MAX_ENTRY_CHARS) continue; // kept in memory only
        if (chars + one.length + 1 > MAX_SAVED_CHARS) break;
        parts.push(one);
        chars += one.length + 1;
      }
      localStorage.setItem(storeKey(id), `[${parts.join(',')}]`);
    } catch {
      // full or blocked storage: keep it in memory only
    }
  };
  saveTimer = setTimeout(() => pendingSave?.(), SAVE_DELAY_MS);
}
function currentEntry(path: string) {
  ensureLoaded();
  if (NEVER_CACHE.test(path)) {
    if (entries.delete(path)) save();
    return undefined;
  }
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
  return (
    !!e && Date.now() - e.at < (ALWAYS_CHECK.test(path) ? RECHECK_MS : FRESH_MS)
  );
}

export function remember(
  path: string,
  data: unknown,
  expectedGeneration = generation
) {
  if (expectedGeneration !== generation) return;
  ensureLoaded();
  if (NEVER_CACHE.test(path)) {
    if (entries.delete(path)) save();
    return;
  }
  entries.set(path, { at: Date.now(), data });
  save();
}

export function forget(prefix: string) {
  ensureLoaded();
  generation += 1;
  inFlight.clear();
  for (const k of [...entries.keys()])
    if (k.startsWith(prefix)) entries.delete(k);
  save();
  flushSave();
}

// one call per path at a time: everyone asking while it's in flight gets the same answer
const inFlight = new Map<string, Promise<unknown>>();
export function shared<T>(path: string, load: () => Promise<T>): Promise<T> {
  const key = `${generation}|${sessionUserId() ?? ''}|${path}`;
  const running = inFlight.get(key);
  if (running) return running as Promise<T>;
  const p = load().finally(() => {
    if (inFlight.get(key) === p) inFlight.delete(key);
  });
  inFlight.set(key, p);
  return p;
}

// after a request or other change: keep showing what's there, but ask again next time
const staleListeners = new Set<() => void>();
// for things kept outside this cache that a change makes out of date too
export function onMarkStale(fn: () => void) {
  staleListeners.add(fn);
}
export function markAllStale() {
  for (const fn of staleListeners) fn();
  ensureLoaded();
  generation += 1;
  inFlight.clear(); // an answer already on its way may predate the change
  const stale = Date.now() - FRESH_MS - 1;
  for (const e of entries.values()) e.at = Math.min(e.at, stale);
  // written at once: a reload right after a request must not bring back fresh old answers
  save();
  flushSave();
}

// a save still waiting is written now, before the page goes away
function flushSave() {
  clearTimeout(saveTimer);
  pendingSave?.();
}
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushSave);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushSave();
  });
}

onSessionReset((previousUser) => {
  generation += 1;
  // the cache may never have been read for the previous account, so loadedFor can be unset
  for (const previous of new Set([loadedFor, previousUser]))
    if (previous != null && previous !== sessionUserId())
      try {
        localStorage.removeItem(storeKey(previous));
      } catch {
        // blocked storage: nothing was saved
      }
  clearTimeout(saveTimer);
  pendingSave = undefined;
  inFlight.clear();
  entries = new Map();
  loadedFor = undefined;
});
