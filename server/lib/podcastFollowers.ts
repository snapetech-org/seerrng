import type AudiobookshelfPodcastsAPI from '@server/api/audiobookshelfPodcasts';
import type { AbsUserSummary } from '@server/api/audiobookshelfPodcasts';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';

/**
 * Who follows a podcast lives on the show itself, as Audiobookshelf tags
 * `follower:<Audiobookshelf user id>`, so Lumen and Shelf agree:
 * - a show with no follower tag is unclaimed: everyone sees it, nobody can
 *   unfollow it, and it is never removed on its own;
 * - a person sees the shows they follow plus the unclaimed ones;
 * - when an unfollow takes away the last follower, the show is removed.
 * Tags are always read again right before they are changed.
 */
export const FOLLOWER_TAG_PREFIX = 'follower:';
const ABS_USER_ID = /^[A-Za-z0-9_-]{1,64}$/;

export const followerTag = (absUserId: string) =>
  `${FOLLOWER_TAG_PREFIX}${absUserId}`;

export const followerIds = (
  tags: readonly string[] | null | undefined
): string[] =>
  (tags ?? [])
    .filter((tag) => tag.startsWith(FOLLOWER_TAG_PREFIX))
    .map((tag) => tag.slice(FOLLOWER_TAG_PREFIX.length))
    .filter(Boolean);

export const isAbsUserId = (value: unknown): value is string =>
  typeof value === 'string' && ABS_USER_ID.test(value);

const ABS_USERS_TTL_MS = 10 * 60 * 1000;
let absUsersCache: {
  at: number;
  key: string;
  users: Promise<AbsUserSummary[]>;
} | null = null;

const loadAbsUsers = (
  api: AudiobookshelfPodcastsAPI
): Promise<AbsUserSummary[]> => {
  const key = api.cacheKey();
  if (
    absUsersCache &&
    absUsersCache.key === key &&
    Date.now() - absUsersCache.at < ABS_USERS_TTL_MS
  ) {
    return absUsersCache.users;
  }
  const users = api.getUsers().catch((error: unknown) => {
    absUsersCache = null;
    throw error;
  });
  absUsersCache = { at: Date.now(), key, users };
  return users;
};

/** Forget the Audiobookshelf account list (tests, settings changes). */
export const clearAbsUserCache = () => {
  absUsersCache = null;
};

/**
 * The Audiobookshelf account a SeerrNG user follows shows as. Linked on its
 * own: the same email (Wizarr copies it onto the accounts it makes), or the
 * server owner's root account for the SeerrNG owner. A stored link wins.
 */
export const absUserIdFor = async (
  api: AudiobookshelfPodcastsAPI,
  user?: { id: number; email?: string | null } | null
): Promise<string | null> => {
  if (!user) return null;
  const stored = getSettings().podcastFollowers.links[String(user.id)];
  if (isAbsUserId(stored)) return stored;
  const users = await loadAbsUsers(api);
  const email = user.email?.trim().toLowerCase();
  const emailMatches = email
    ? users.filter((entry) => entry.email?.trim().toLowerCase() === email)
    : [];
  if (emailMatches.length > 1) {
    throw new Error('Audiobookshelf user email is ambiguous.');
  }
  const byEmail = emailMatches[0];
  if (byEmail) {
    if (!isAbsUserId(byEmail.id)) {
      throw new Error('Audiobookshelf returned an unsupported user ID.');
    }
    return byEmail.id;
  }
  if (user.id === 1) {
    const roots = users.filter((entry) => entry.type === 'root');
    if (roots.length > 1) {
      throw new Error('Audiobookshelf root user is ambiguous.');
    }
    const root = roots[0];
    if (root) {
      if (!isAbsUserId(root.id)) {
        throw new Error('Audiobookshelf returned an unsupported user ID.');
      }
      return root.id;
    }
  }
  return null;
};

/** Unlinked people see every show; linked people see theirs and unclaimed. */
export const showVisibleTo = (
  tags: readonly string[] | null | undefined,
  absUserId: string | null
): boolean => {
  if (!absUserId) return true;
  const ids = followerIds(tags);
  return ids.length === 0 || ids.includes(absUserId);
};

export const followShow = async (
  api: AudiobookshelfPodcastsAPI,
  itemId: string,
  absUserId: string
): Promise<string[] | null> => {
  const tags = await api.getItemTags(itemId);
  if (!tags) return null;
  const tag = followerTag(absUserId);
  if (tags.includes(tag)) return tags;
  const next = [...tags, tag];
  await api.setItemTags(itemId, next);
  return next;
};

export type UnfollowOutcome =
  | 'unfollowed'
  | 'removed'
  | 'kept'
  | 'notFollowing'
  | 'wouldRemove'
  | 'notFound';

const errorStatus = (error: unknown): number | undefined => {
  const status = (error as { response?: { status?: unknown } } | null)?.response
    ?.status;
  return typeof status === 'number' ? status : undefined;
};

const queueDelete = (itemId: string) => {
  const settings = getSettings();
  const followers = settings.podcastFollowers;
  settings.podcastFollowers = {
    ...followers,
    pendingDeletes: [...followers.pendingDeletes, itemId],
  };
  settings.save();
};

const dropQueuedDelete = (itemId: string) => {
  const settings = getSettings();
  const followers = settings.podcastFollowers;
  if (!followers.pendingDeletes.includes(itemId)) return;
  settings.podcastFollowers = {
    ...followers,
    pendingDeletes: followers.pendingDeletes.filter((id) => id !== itemId),
  };
  settings.save();
};

/**
 * Remove a show nobody follows any more. Audiobookshelf refusing (403) means
 * leave it; any other failure is tried again by the hourly job.
 */
const removeUnfollowedShow = async (
  api: AudiobookshelfPodcastsAPI,
  itemId: string
): Promise<'removed' | 'kept'> => {
  try {
    await api.deletePodcastItem(itemId);
    dropQueuedDelete(itemId);
    return 'removed';
  } catch (error) {
    const status = errorStatus(error);
    if (status === 404) {
      dropQueuedDelete(itemId);
      return 'removed';
    }
    if (status === 403) {
      dropQueuedDelete(itemId);
      return 'kept';
    }
    logger.warn('Could not remove a podcast nobody follows; will try again', {
      label: 'Podcast Followers',
      itemId,
      status,
    });
    queueDelete(itemId);
    return 'removed';
  }
};

/**
 * Stop following. When that would leave the show without followers it is
 * removed, but only when `allowRemove` says the person agreed to that.
 */
export const unfollowShow = async (
  api: AudiobookshelfPodcastsAPI,
  itemId: string,
  absUserId: string,
  allowRemove: boolean
): Promise<UnfollowOutcome> => {
  const tags = await api.getItemTags(itemId);
  if (!tags) return 'notFound';
  const tag = followerTag(absUserId);
  if (!tags.includes(tag)) return 'notFollowing';
  const next = tags.filter((value) => value !== tag);
  const lastFollower = followerIds(next).length === 0;
  if (lastFollower && !allowRemove) return 'wouldRemove';
  await api.setItemTags(itemId, next);
  if (!lastFollower) return 'unfollowed';
  // someone may have followed in between: read the tags once more
  const now = await api.getItemTags(itemId);
  if (!now) return 'removed';
  if (followerIds(now).length > 0) return 'unfollowed';
  return removeUnfollowedShow(api, itemId);
};

const SWEEP_PAGE = 100;
const SWEEP_MAX_PAGES = 20;

/**
 * Hourly: finish removals that failed, and give shows added outside Lumen
 * and Shelf (straight in Audiobookshelf) a follower, the server owner, so
 * they behave like every other show.
 */
export const sweepPodcastFollowers = async (
  api: AudiobookshelfPodcastsAPI
): Promise<{ tagged: number; removed: number }> => {
  const library = (await api.getLibraries()).find(
    (entry) => entry.mediaType === 'podcast'
  );
  if (!library) return { tagged: 0, removed: 0 };
  const owner = await absUserIdFor(api, { id: 1 });
  const pending = new Set(getSettings().podcastFollowers.pendingDeletes);
  let tagged = 0;
  let removed = 0;
  const seen = new Set<string>();
  for (let page = 0; page < SWEEP_MAX_PAGES; page += 1) {
    const result = await api.getPodcastLibraryItems(library.id, {
      page,
      limit: SWEEP_PAGE,
    });
    for (const item of result.results) {
      seen.add(item.id);
      const followers = followerIds(item.tags);
      if (pending.has(item.id)) {
        if (followers.length === 0) {
          const now = await api.getItemTags(item.id);
          if (now && followerIds(now).length === 0) {
            if ((await removeUnfollowedShow(api, item.id)) === 'removed') {
              removed += 1;
            }
            continue;
          }
        }
        dropQueuedDelete(item.id);
        continue;
      }
      if (followers.length === 0 && owner) {
        const now = await api.getItemTags(item.id);
        if (now && followerIds(now).length === 0) {
          await api.setItemTags(item.id, [...now, followerTag(owner)]);
          tagged += 1;
        }
      }
    }
    if (result.results.length < SWEEP_PAGE) break;
  }
  // queued removals of shows that are already gone
  for (const itemId of pending) {
    if (!seen.has(itemId)) dropQueuedDelete(itemId);
  }
  return { tagged, removed };
};
