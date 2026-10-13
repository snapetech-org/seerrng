import { ANIME_KEYWORD_ID } from '@server/api/themoviedb/constants';
import type {
  TmdbKeyword,
  TmdbMovieDetails,
  TmdbTvDetails,
} from '@server/api/themoviedb/interfaces';
import { MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import OverrideRule from '@server/entity/OverrideRule';
import type { User } from '@server/entity/User';
import { getSettings } from '@server/lib/settings';
import { languageCodesMatch } from '@server/utils/preferredLanguage';

export const overrideRuleConditionFields = [
  'users',
  'genre',
  'language',
  'keywords',
] as const satisfies readonly (keyof OverrideRule)[];
export type OverrideRuleConditionField =
  (typeof overrideRuleConditionFields)[number];
const MAX_OVERRIDE_RULE_ROUTING_ID = 1_000_000_000;
const MAX_OVERRIDE_RULE_ROUTING_TAGS = 100;

const hasConditionValue = (value: unknown): boolean =>
  typeof value === 'string' && value.trim().length > 0;

export const getOverrideRuleSpecificity = (
  rule: OverrideRule,
  conditionFields: readonly OverrideRuleConditionField[] = overrideRuleConditionFields
): number =>
  conditionFields.reduce(
    (specificity, field) =>
      specificity + (hasConditionValue(rule[field]) ? 1 : 0),
    0
  );

/**
 * Chooses the most constrained matching rule without mutating the repository
 * result. Rule IDs provide a stable oldest-first tie break for configurations
 * whose conditions are equally specific.
 */
export const selectMostSpecificOverrideRule = (
  rules: OverrideRule[],
  conditionFields: readonly OverrideRuleConditionField[] = overrideRuleConditionFields
): OverrideRule | undefined =>
  [...rules].sort(
    (left, right) =>
      getOverrideRuleSpecificity(right, conditionFields) -
        getOverrideRuleSpecificity(left, conditionFields) ||
      (left.id ?? Number.MAX_SAFE_INTEGER) -
        (right.id ?? Number.MAX_SAFE_INTEGER)
  )[0];

export const overrideRuleMatchesUser = (
  rule: OverrideRule,
  userId: number
): boolean =>
  !hasConditionValue(rule.users) ||
  rule
    .users!.split(',')
    .map((value) => Number(value.trim()))
    .some((configuredUserId) => configuredUserId === userId);

export const getOverrideRuleProfileId = (
  rule: OverrideRule
): number | undefined =>
  Number.isSafeInteger(rule.profileId) &&
  rule.profileId! >= 0 &&
  rule.profileId! <= MAX_OVERRIDE_RULE_ROUTING_ID
    ? rule.profileId
    : undefined;

export const getOverrideRuleTagIds = (rule: OverrideRule): number[] => {
  if (!hasConditionValue(rule.tags)) {
    return [];
  }

  const tagIds = rule
    .tags!.split(',')
    .slice(0, MAX_OVERRIDE_RULE_ROUTING_TAGS)
    .map((value) => value.trim())
    .filter((value) => /^\d+$/.test(value))
    .map(Number)
    .filter(
      (value) =>
        Number.isSafeInteger(value) &&
        value >= 0 &&
        value <= MAX_OVERRIDE_RULE_ROUTING_ID
    );

  return [...new Set(tagIds)];
};

export type OverrideRulesResult = {
  rootFolder: string | null;
  profileId: number | null;
  tags: number[] | null;
};

export type CatalogRuleMetadata = {
  genres?: string[];
  keywords?: string[];
  languages?: string[];
};

const matchesCatalogTerms = (
  configured: string | undefined,
  available: string[] | undefined,
  separator = ','
): boolean =>
  !hasConditionValue(configured) ||
  (!!available?.length &&
    configured!
      .split(separator)
      .some((value) =>
        available.some(
          (candidate) =>
            candidate.trim().toLocaleLowerCase() ===
            value.trim().toLocaleLowerCase()
        )
      ));

export const catalogOverrideRuleMatches = (
  rule: OverrideRule,
  userId: number,
  metadata: CatalogRuleMetadata = {}
): boolean =>
  overrideRuleMatchesUser(rule, userId) &&
  matchesCatalogTerms(rule.genre, metadata.genres) &&
  matchesCatalogTerms(rule.keywords, metadata.keywords) &&
  (!hasConditionValue(rule.language) ||
    (!!metadata.languages?.length &&
      rule
        .language!.split('|')
        .some((language) =>
          metadata.languages!.some((candidateLanguage) =>
            languageCodesMatch(candidateLanguage, language)
          )
        )));

export const evaluateRequesterOverrideRules = async ({
  serviceField,
  serviceId,
  requestUser,
  tags,
  metadata,
}: {
  serviceField: 'lidarrServiceId' | 'readarrServiceId';
  serviceId: number | undefined;
  requestUser: User;
  tags?: number[] | null;
  metadata?: CatalogRuleMetadata;
}): Promise<OverrideRulesResult> => {
  const rules = serviceId
    ? await getRepository(OverrideRule).find({
        where: { [serviceField]: serviceId },
      })
    : [];
  const rule = selectMostSpecificOverrideRule(
    rules.filter((candidate) =>
      catalogOverrideRuleMatches(candidate, requestUser.id, metadata)
    )
  );
  const overrideTags = rule ? getOverrideRuleTagIds(rule) : [];

  return {
    rootFolder: rule?.rootFolder || null,
    profileId: rule ? (getOverrideRuleProfileId(rule) ?? null) : null,
    tags:
      overrideTags.length > 0
        ? [...new Set([...(tags ?? []), ...overrideTags])]
        : (tags ?? null),
  };
};

const hasTmdbKeyword = (media: TmdbMovieDetails | TmdbTvDetails): boolean => {
  const keywordList =
    'keywords' in media.keywords
      ? media.keywords.keywords
      : media.keywords.results;
  return keywordList.some((keyword) => keyword.id === ANIME_KEYWORD_ID);
};

export const evaluateOverrideRules = async ({
  mediaType,
  is4k,
  tmdbMedia,
  requestUser,
  tags,
  serviceId,
}: {
  mediaType: MediaType.MOVIE | MediaType.TV;
  is4k: boolean;
  tmdbMedia: TmdbMovieDetails | TmdbTvDetails;
  requestUser: User;
  tags?: number[] | null;
  serviceId?: number;
}): Promise<OverrideRulesResult> => {
  const settings = getSettings();
  const resolvedServiceId =
    serviceId ??
    (mediaType === MediaType.MOVIE
      ? settings.radarr.find(
          (server) => server.isDefault && server.is4k === is4k
        )?.id
      : settings.sonarr.find(
          (server) => server.isDefault && server.is4k === is4k
        )?.id);
  const serviceField =
    mediaType === MediaType.MOVIE ? 'radarrServiceId' : 'sonarrServiceId';
  const rules =
    resolvedServiceId != null
      ? await getRepository(OverrideRule).find({
          where: { [serviceField]: resolvedServiceId },
        })
      : [];
  const mediaKeywords: TmdbKeyword[] =
    'keywords' in tmdbMedia.keywords
      ? tmdbMedia.keywords.keywords
      : tmdbMedia.keywords.results;
  const isAnimeTv = mediaType === MediaType.TV && hasTmdbKeyword(tmdbMedia);
  const matchingRules = rules.filter((rule) => {
    if (
      isAnimeTv &&
      !rule.keywords?.split(',').map(Number).includes(ANIME_KEYWORD_ID)
    ) {
      return false;
    }
    if (!overrideRuleMatchesUser(rule, requestUser.id)) {
      return false;
    }
    if (
      rule.genre &&
      !rule.genre
        .split(',')
        .some((id) => tmdbMedia.genres.some((genre) => genre.id === Number(id)))
    ) {
      return false;
    }
    if (
      rule.language &&
      !rule.language.split('|').includes(tmdbMedia.original_language)
    ) {
      return false;
    }
    if (
      rule.keywords &&
      !rule.keywords
        .split(',')
        .some((id) =>
          mediaKeywords.some((keyword) => keyword.id === Number(id))
        )
    ) {
      return false;
    }
    return true;
  });
  const rule = selectMostSpecificOverrideRule(matchingRules);
  const profileId = rule ? getOverrideRuleProfileId(rule) : undefined;
  const overrideTags = rule ? getOverrideRuleTagIds(rule) : [];

  return {
    rootFolder: rule?.rootFolder || null,
    profileId: profileId ?? null,
    tags:
      overrideTags.length > 0
        ? [...new Set([...(tags ?? []), ...overrideTags])]
        : (tags ?? null),
  };
};
