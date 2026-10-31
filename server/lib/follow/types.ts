import type Follow from '@server/entity/Follow';
import type { FollowEventTarget } from '@server/entity/FollowEvent';

export interface NewFollowEvent {
  dedupeKey: string;
  /** Stable translation key; the UI formats the sentence. */
  reasonKey: FollowReasonKey;
  reasonValues?: Record<string, string>;
  title: string;
  imageUrl?: string;
  target?: FollowEventTarget;
}

export type FollowReasonKey =
  | 'nextVolumeAnnounced'
  | 'newVolumeReleased'
  | 'newNarrationAvailable'
  | 'fullCastProduction'
  | 'newBookByNarrator'
  | 'newBookByAuthor'
  | 'newExpansion'
  | 'newPatchVersion'
  | 'newArtistRelease'
  | 'newFranchiseRelation'
  | 'savedDiscoveryMatch'
  | 'collectorsAreSharing'
  | 'newVideoTitle'
  | 'upcomingVideoTitle'
  | 'videoReleaseDateReached';

export interface AdapterResult {
  events: NewFollowEvent[];
  /** Replaces the follow's cursor so nothing is reported twice. */
  cursor: Record<string, unknown>;
  /** First evaluation records a baseline and can surface a bounded upcoming set. */
  baseline?: boolean;
}

export type FollowAdapter = (follow: Follow) => Promise<AdapterResult>;

export const refString = (follow: Follow, key: string): string | undefined => {
  const value = follow.conditions?.ref?.[key];
  return value === undefined ? undefined : String(value);
};

export const refNumber = (follow: Follow, key: string): number | undefined => {
  const value = Number(follow.conditions?.ref?.[key]);
  return Number.isSafeInteger(value) && value > 0 ? value : undefined;
};

export const knownIds = (follow: Follow, key = 'known'): Set<string> =>
  new Set(
    Array.isArray(follow.cursor?.[key])
      ? (follow.cursor?.[key] as unknown[]).map(String)
      : []
  );

export const capIds = (ids: Iterable<string>, max = 1000): string[] =>
  [...new Set(ids)].slice(-max);
