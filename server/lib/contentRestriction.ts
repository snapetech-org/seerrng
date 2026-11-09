import {
  DEFAULT_AGE_GATE_SETTINGS,
  MOVIE_CERTIFICATIONS,
  TV_CERTIFICATIONS,
} from '@server/constants/ageGate';
import type { User } from '@server/entity/User';
import { Permission } from '@server/lib/permissions';
import { getSettings } from '@server/lib/settings';
import { AsyncLocalStorage } from 'node:async_hooks';

/** Genre/tag/subject names that flag adult material in non-video catalogs. */
const MATURE_TERM_PATTERN =
  /\b(erotica?|erotic|hentai|porn|pornographic|xxx|nsfw|bdsm|explicit|adult\s+content|smut|ecchi)\b/i;

const LIST_FIELDS = [
  'genres',
  'tags',
  'subjects',
  'categories',
  'keywords',
] as const;

export interface ContentRestriction {
  maxMovieCertification: string;
  maxTvCertification: string;
  certificationCountry: string;
}

export const contentRestrictionStorage = new AsyncLocalStorage<
  ContentRestriction | undefined
>();

export const currentContentRestriction = (): ContentRestriction | undefined =>
  contentRestrictionStorage.getStore();

/**
 * An explicit per-user flag wins; otherwise the instance default applies,
 * except for administrators.
 */
export const isContentRestricted = (
  user?: Pick<User, 'permissions' | 'hasPermission'> & {
    contentRestricted?: boolean | null;
  }
): boolean => {
  if (!user) {
    return false;
  }
  if (typeof user.contentRestricted === 'boolean') {
    return user.contentRestricted;
  }
  if (
    typeof user.hasPermission === 'function' &&
    user.hasPermission(Permission.ADMIN)
  ) {
    return false;
  }
  return getSettings().main.ageGate?.defaultRestricted === true;
};

export const getContentRestriction = (
  user?: Pick<User, 'permissions' | 'hasPermission'> & {
    contentRestricted?: boolean | null;
  }
): ContentRestriction | undefined => {
  if (!isContentRestricted(user)) {
    return undefined;
  }
  const gate = {
    ...DEFAULT_AGE_GATE_SETTINGS,
    ...getSettings().main.ageGate,
  };
  return {
    maxMovieCertification: gate.maxMovieCertification,
    maxTvCertification: gate.maxTvCertification,
    certificationCountry: gate.certificationCountry,
  };
};

const exceeds = (order: string[], value: unknown, max: string): boolean => {
  if (typeof value !== 'string') {
    return false;
  }
  const rank = order.indexOf(value.trim().toUpperCase());
  const maxRank = order.indexOf(max);
  // Unrated or unknown labels cannot be compared; allow them (best-effort).
  return rank !== -1 && maxRank !== -1 && rank > maxRank;
};

export const movieCertificationBlocked = (
  restriction: ContentRestriction,
  certification: unknown
): boolean =>
  exceeds(
    MOVIE_CERTIFICATIONS,
    certification,
    restriction.maxMovieCertification
  );

export const tvCertificationBlocked = (
  restriction: ContentRestriction,
  rating: unknown
): boolean =>
  exceeds(TV_CERTIFICATIONS, rating, restriction.maxTvCertification);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const listHasMatureTerm = (list: unknown): boolean =>
  Array.isArray(list) &&
  list.some((entry) => {
    const name = isRecord(entry)
      ? (entry.name ?? entry.title ?? entry.label)
      : entry;
    return typeof name === 'string' && MATURE_TERM_PATTERN.test(name);
  });

/** True when a detail payload's own ratings exceed the ceiling. */
const detailCertificationBlocked = (
  restriction: ContentRestriction,
  item: Record<string, unknown>
): boolean => {
  const releases = item.releases;
  if (isRecord(releases) && Array.isArray(releases.results)) {
    const entry = releases.results.find(
      (result) =>
        isRecord(result) &&
        result.iso_3166_1 === restriction.certificationCountry
    );
    if (isRecord(entry) && Array.isArray(entry.release_dates)) {
      return entry.release_dates.some(
        (date) =>
          isRecord(date) &&
          movieCertificationBlocked(restriction, date.certification)
      );
    }
  }
  const ratings = item.contentRatings;
  if (isRecord(ratings) && Array.isArray(ratings.results)) {
    const entry = ratings.results.find(
      (result) =>
        isRecord(result) &&
        result.iso_3166_1 === restriction.certificationCountry
    );
    return isRecord(entry) && tvCertificationBlocked(restriction, entry.rating);
  }
  return false;
};

/** Whether a single catalog item must be hidden from a restricted account. */
export const isRestrictedItem = (
  restriction: ContentRestriction,
  item: Record<string, unknown>
): boolean => {
  if (
    item.adult === true ||
    item.isAdult === true ||
    item.explicit === true ||
    item.isExplicit === true ||
    item.mediaType === 'adult' ||
    item.type === 'adult' ||
    (isRecord(item.media) && item.media.mediaType === 'adult')
  ) {
    return true;
  }
  if (
    typeof item.maturityRating === 'string' &&
    item.maturityRating.toUpperCase() === 'MATURE'
  ) {
    return true;
  }
  if (
    movieCertificationBlocked(restriction, item.certification) ||
    tvCertificationBlocked(restriction, item.certification) ||
    tvCertificationBlocked(restriction, item.contentRating)
  ) {
    return true;
  }
  if (LIST_FIELDS.some((field) => listHasMatureTerm(item[field]))) {
    return true;
  }
  return detailCertificationBlocked(restriction, item);
};

const MAX_FILTER_DEPTH = 8;

/**
 * Removes restricted items from every array in a response body. Returns
 * `blocked: true` when the payload itself is a restricted detail record, so
 * callers can answer 404 instead of leaking the title.
 */
export const filterRestrictedPayload = (
  restriction: ContentRestriction,
  payload: unknown
): { payload: unknown; blocked: boolean } => {
  if (isRecord(payload) && isRestrictedItem(restriction, payload)) {
    return { payload, blocked: true };
  }

  const walk = (value: unknown, depth: number): unknown => {
    if (depth > MAX_FILTER_DEPTH) {
      return value;
    }
    if (isRecord(value) && typeof value.toJSON === 'function')
      return walk(value.toJSON(), depth + 1);
    if (Array.isArray(value)) {
      return value
        .filter(
          (entry) => !(isRecord(entry) && isRestrictedItem(restriction, entry))
        )
        .map((entry) => walk(entry, depth + 1));
    }
    if (isRecord(value)) {
      const next: Record<string, unknown> = {};
      for (const [key, entry] of Object.entries(value)) {
        next[key] =
          isRecord(entry) && isRestrictedItem(restriction, entry)
            ? null
            : walk(entry, depth + 1);
      }
      return next;
    }
    return value;
  };

  return { payload: walk(payload, 0), blocked: false };
};

/** Apply policy to provider records before mapping away their rating fields. */
export const allowedByCurrentContentPolicy = (item: object): boolean => {
  const restriction = currentContentRestriction();
  return (
    !restriction ||
    !isRestrictedItem(restriction, item as Record<string, unknown>)
  );
};
