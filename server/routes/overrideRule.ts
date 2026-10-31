import TheMovieDb from '@server/api/themoviedb';
import { MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import { MediaRequest } from '@server/entity/MediaRequest';
import OverrideRule from '@server/entity/OverrideRule';
import { User } from '@server/entity/User';
import type { OverrideRuleResultsResponse } from '@server/interfaces/api/overrideRuleInterfaces';
import {
  getBookOverrideMetadata,
  getMusicOverrideMetadata,
} from '@server/lib/catalogOverrideMetadata';
import {
  isValidMusicBrainzResourceId,
  isValidOpenLibraryResourceId,
  normalizeMusicBrainzId,
  normalizeOpenLibraryWorkId,
} from '@server/lib/externalIds';
import { getExternalRuntimeConfig } from '@server/lib/externalRuntimeConfig';
import { runOverrideRuleMutation } from '@server/lib/overrideRuleMutation';
import {
  evaluateOverrideRules,
  evaluateRequesterOverrideRules,
  type OverrideRulesResult,
} from '@server/lib/overrideRules';
import { Permission } from '@server/lib/permissions';
import { runWithServarrServiceAdmission } from '@server/lib/serviceAdmission';
import { getSettings, type ReadarrSettings } from '@server/lib/settings';
import logger from '@server/logger';
import { isAuthenticated } from '@server/middleware/auth';
import {
  authorizedMutation,
  authorizedRouteAccess,
} from '@server/middleware/authorizedMutation';
import { parseBookshelfBookId } from '@server/utils/bookshelfCatalog';
import { readarrServiceSupportsFormat } from '@server/utils/readarrService';
import { parsePositiveRouteId } from '@server/utils/routeId';
import {
  parseBoundedString,
  parseOptionalNonNegativeInteger,
} from '@server/utils/validation';
import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';

const overrideRuleRoutes = Router();
const MAX_OVERRIDE_RULE_STRING_LENGTH = 500;
const MAX_OVERRIDE_RULE_ID = 1_000_000_000;
const MAX_OVERRIDE_RULE_LIST_ITEMS = 100;
const overrideRuleBodyFields = new Set<keyof OverrideRuleBody>([
  'users',
  'genre',
  'language',
  'keywords',
  'productionCountries',
  'profileId',
  'rootFolder',
  'tags',
  'radarrServiceId',
  'sonarrServiceId',
  'lidarrServiceId',
  'readarrServiceId',
]);

type OverrideRuleBody = {
  users?: string | null;
  genre?: string | null;
  language?: string | null;
  keywords?: string | null;
  productionCountries?: string | null;
  profileId?: number | null;
  rootFolder?: string | null;
  tags?: string | null;
  radarrServiceId?: number | null;
  sonarrServiceId?: number | null;
  lidarrServiceId?: number | null;
  readarrServiceId?: number | null;
};

type OverrideRulePatch = {
  users?: string | null;
  genre?: string | null;
  language?: string | null;
  keywords?: string | null;
  productionCountries?: string | null;
  profileId?: number | null;
  rootFolder?: string | null;
  tags?: string | null;
  radarrServiceId?: number | null;
  sonarrServiceId?: number | null;
  lidarrServiceId?: number | null;
  readarrServiceId?: number | null;
};

type OverrideRuleServiceSelection = Pick<
  OverrideRulePatch,
  'radarrServiceId' | 'sonarrServiceId' | 'lidarrServiceId' | 'readarrServiceId'
>;

const getOverrideRuleServiceReferences = (
  rules: OverrideRuleServiceSelection[]
) =>
  rules.flatMap((rule) => [
    ...(rule.radarrServiceId != null
      ? [{ serviceType: 'radarr' as const, serviceId: rule.radarrServiceId }]
      : []),
    ...(rule.sonarrServiceId != null
      ? [{ serviceType: 'sonarr' as const, serviceId: rule.sonarrServiceId }]
      : []),
    ...(rule.lidarrServiceId != null
      ? [{ serviceType: 'lidarr' as const, serviceId: rule.lidarrServiceId }]
      : []),
    ...(rule.readarrServiceId != null
      ? [{ serviceType: 'readarr' as const, serviceId: rule.readarrServiceId }]
      : []),
  ]);

const runWithOverrideRuleServiceAdmission = <Result>(
  rules: OverrideRuleServiceSelection[],
  callback: () => Promise<Result>
): Promise<Result> =>
  runWithServarrServiceAdmission(
    getOverrideRuleServiceReferences(rules),
    callback
  );

type OverrideRuleErrorResponse = { status: number; message: string };
type OverrideRuleResponse = OverrideRule | OverrideRuleErrorResponse;
type OverrideRuleRequest<P = Record<string, string>> = Request<
  P,
  OverrideRuleResponse,
  OverrideRuleBody
>;

const parseOverrideRuleRouteId = (id: unknown): number | undefined =>
  parsePositiveRouteId(id, MAX_OVERRIDE_RULE_ID);

const reportOverrideRuleError = (
  action: string,
  error: unknown,
  next: NextFunction
) => {
  logger.error(`Failed to ${action} override rule`, {
    label: 'Override Rule',
    errorMessage: error instanceof Error ? error.message : String(error),
  });
  next({ status: 500, message: 'Unable to process override rules.' });
};

const parseOptionalRuleString = (
  value: unknown,
  fieldName: string
): string | null | undefined | { error: string } => {
  if (value === undefined) {
    return undefined;
  }
  if (value === null || value === '') {
    return null;
  }

  const parsed = parseBoundedString(value, {
    fieldName,
    maxLength: MAX_OVERRIDE_RULE_STRING_LENGTH,
    required: false,
  });

  if ('error' in parsed) {
    return parsed;
  }

  return parsed.value || null;
};

const parseOptionalRuleInteger = (
  value: unknown,
  fieldName: string
): number | null | undefined | { error: string } => {
  if (value === undefined) {
    return undefined;
  }
  if (value === null || value === '') {
    return null;
  }

  const parsed = parseOptionalNonNegativeInteger(value, MAX_OVERRIDE_RULE_ID);
  return parsed === undefined
    ? { error: `${fieldName} must be a valid ID.` }
    : parsed;
};

const parseOptionalRuleIdList = (
  value: unknown,
  fieldName: string,
  options: { allowZero?: boolean } = {}
): string | null | undefined | { error: string } => {
  const parsed = parseOptionalRuleString(value, fieldName);
  if (parsed === undefined || parsed === null || typeof parsed === 'object') {
    return parsed;
  }

  const values = parsed.split(',').map((item) => item.trim());
  const minimum = options.allowZero ? 0 : 1;
  if (
    values.length === 0 ||
    values.length > MAX_OVERRIDE_RULE_LIST_ITEMS ||
    values.some((item) => !/^\d+$/.test(item))
  ) {
    return {
      error: `${fieldName} must contain at most ${MAX_OVERRIDE_RULE_LIST_ITEMS} numeric IDs.`,
    };
  }

  const ids = values.map(Number);
  if (
    ids.some(
      (id) =>
        !Number.isSafeInteger(id) || id < minimum || id > MAX_OVERRIDE_RULE_ID
    )
  ) {
    return { error: `${fieldName} contains an invalid ID.` };
  }

  return [...new Set(ids)].join(',');
};

const parseOptionalCatalogTerms = (
  value: unknown,
  fieldName: string
): string | null | undefined | { error: string } => {
  const parsed = parseOptionalRuleString(value, fieldName);
  if (parsed === undefined || parsed === null || typeof parsed === 'object') {
    return parsed;
  }
  const terms = parsed.split(',').map((term) => term.trim());
  if (
    terms.length > MAX_OVERRIDE_RULE_LIST_ITEMS ||
    terms.some((term) => !term || term.length > 100)
  ) {
    return { error: `${fieldName} must contain non-empty names.` };
  }
  return [...new Set(terms)].join(',');
};

const parseOptionalRuleLanguageList = (
  value: unknown
): string | null | undefined | { error: string } => {
  const parsed = parseOptionalRuleString(value, 'Language');
  if (parsed === undefined || parsed === null || typeof parsed === 'object') {
    return parsed;
  }

  const languages = parsed.split('|').map((language) => language.trim());
  if (
    languages.length === 0 ||
    languages.length > MAX_OVERRIDE_RULE_LIST_ITEMS ||
    languages.some((language) => !/^[a-z]{2}$/.test(language))
  ) {
    return {
      error: `Language must contain at most ${MAX_OVERRIDE_RULE_LIST_ITEMS} ISO 639-1 codes.`,
    };
  }

  return [...new Set(languages)].join('|');
};

const parseOptionalRuleCountryList = (
  value: unknown
): string | null | undefined | { error: string } => {
  const parsed = parseOptionalRuleString(value, 'Production countries');
  if (parsed === undefined || parsed === null || typeof parsed === 'object') {
    return parsed;
  }

  const countries = parsed
    .split('|')
    .map((country) => country.trim().toUpperCase());
  if (
    countries.length === 0 ||
    countries.length > MAX_OVERRIDE_RULE_LIST_ITEMS ||
    countries.some((country) => !/^[A-Z]{2}$/.test(country))
  ) {
    return {
      error: `Production countries must contain at most ${MAX_OVERRIDE_RULE_LIST_ITEMS} ISO 3166-1 alpha-2 codes.`,
    };
  }

  return [...new Set(countries)].join('|');
};

const hasRuleValue = (value: unknown): boolean =>
  typeof value === 'string' ? value.trim().length > 0 : value != null;

const validateOverrideRuleShape = (
  rule: OverrideRulePatch
): { error: string } | undefined => {
  const configuredServices = [
    rule.radarrServiceId,
    rule.sonarrServiceId,
    rule.lidarrServiceId,
    rule.readarrServiceId,
  ].filter((serviceId) => serviceId != null);

  if (configuredServices.length !== 1) {
    return { error: 'Override rules must target exactly one service.' };
  }

  const settings = getExternalRuntimeConfig();
  if (
    (rule.radarrServiceId != null &&
      !settings.radarr.some(({ id }) => id === rule.radarrServiceId)) ||
    (rule.sonarrServiceId != null &&
      !settings.sonarr.some(({ id }) => id === rule.sonarrServiceId)) ||
    (rule.lidarrServiceId != null &&
      !settings.lidarr.some(({ id }) => id === rule.lidarrServiceId)) ||
    (rule.readarrServiceId != null &&
      !settings.readarr.some(({ id }) => id === rule.readarrServiceId))
  ) {
    return { error: 'The selected override rule service does not exist.' };
  }

  if (
    ![
      rule.users,
      rule.genre,
      rule.language,
      rule.keywords,
      rule.productionCountries,
    ].some(hasRuleValue)
  ) {
    return { error: 'Override rules must define at least one condition.' };
  }

  if (![rule.profileId, rule.rootFolder, rule.tags].some(hasRuleValue)) {
    return { error: 'Override rules must define at least one setting.' };
  }

  if (rule.lidarrServiceId != null && hasRuleValue(rule.language)) {
    return { error: 'Album language is not available for Lidarr rules.' };
  }

  if (
    hasRuleValue(rule.productionCountries) &&
    rule.radarrServiceId == null &&
    rule.sonarrServiceId == null
  ) {
    return {
      error:
        'Production countries are only available for Radarr and Sonarr rules.',
    };
  }

  return undefined;
};

const parseOverrideRuleBody = (
  body: unknown,
  existingRule?: OverrideRule
): OverrideRulePatch | { error: string } => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Override rule body must be an object.' };
  }

  const unknownField = Object.keys(body).find(
    (field) => !overrideRuleBodyFields.has(field as keyof OverrideRuleBody)
  );
  if (unknownField) {
    return { error: `Unknown override rule field: ${unknownField}.` };
  }

  const bodyObject = body as Record<keyof OverrideRuleBody, unknown>;
  const isCatalogRule =
    (bodyObject.lidarrServiceId === undefined
      ? existingRule?.lidarrServiceId
      : bodyObject.lidarrServiceId) != null ||
    (bodyObject.readarrServiceId === undefined
      ? existingRule?.readarrServiceId
      : bodyObject.readarrServiceId) != null;

  const users = parseOptionalRuleIdList(bodyObject.users, 'Users');
  if (typeof users === 'object' && users && 'error' in users) return users;
  const genre = isCatalogRule
    ? parseOptionalCatalogTerms(bodyObject.genre, 'Genre')
    : parseOptionalRuleIdList(bodyObject.genre, 'Genre');
  if (typeof genre === 'object' && genre && 'error' in genre) return genre;
  const language = parseOptionalRuleLanguageList(bodyObject.language);
  if (typeof language === 'object' && language && 'error' in language) {
    return language;
  }
  const productionCountries = parseOptionalRuleCountryList(
    bodyObject.productionCountries
  );
  if (
    typeof productionCountries === 'object' &&
    productionCountries &&
    'error' in productionCountries
  ) {
    return productionCountries;
  }
  if (isCatalogRule && hasRuleValue(productionCountries)) {
    return {
      error:
        'Production countries are only available for Radarr and Sonarr rules.',
    };
  }
  const keywords = isCatalogRule
    ? parseOptionalCatalogTerms(bodyObject.keywords, 'Keywords')
    : parseOptionalRuleIdList(bodyObject.keywords, 'Keywords');
  if (typeof keywords === 'object' && keywords && 'error' in keywords) {
    return keywords;
  }
  const rootFolder = parseOptionalRuleString(
    bodyObject.rootFolder,
    'Root folder'
  );
  if (typeof rootFolder === 'object' && rootFolder && 'error' in rootFolder) {
    return rootFolder;
  }
  const tags = parseOptionalRuleIdList(bodyObject.tags, 'Tags', {
    allowZero: true,
  });
  if (typeof tags === 'object' && tags && 'error' in tags) return tags;

  const profileId = parseOptionalRuleInteger(
    bodyObject.profileId,
    'Profile ID'
  );
  if (typeof profileId === 'object' && profileId && 'error' in profileId) {
    return profileId;
  }
  const radarrServiceId = parseOptionalRuleInteger(
    bodyObject.radarrServiceId,
    'Radarr service ID'
  );
  if (
    typeof radarrServiceId === 'object' &&
    radarrServiceId &&
    'error' in radarrServiceId
  ) {
    return radarrServiceId;
  }
  const sonarrServiceId = parseOptionalRuleInteger(
    bodyObject.sonarrServiceId,
    'Sonarr service ID'
  );
  if (
    typeof sonarrServiceId === 'object' &&
    sonarrServiceId &&
    'error' in sonarrServiceId
  ) {
    return sonarrServiceId;
  }
  const lidarrServiceId = parseOptionalRuleInteger(
    bodyObject.lidarrServiceId,
    'Lidarr service ID'
  );
  if (
    typeof lidarrServiceId === 'object' &&
    lidarrServiceId &&
    'error' in lidarrServiceId
  ) {
    return lidarrServiceId;
  }
  const readarrServiceId = parseOptionalRuleInteger(
    bodyObject.readarrServiceId,
    'Bookshelf service ID'
  );
  if (
    typeof readarrServiceId === 'object' &&
    readarrServiceId &&
    'error' in readarrServiceId
  ) {
    return readarrServiceId;
  }

  const parsedRule: OverrideRulePatch = {
    users,
    genre,
    language,
    keywords,
    productionCountries,
    profileId,
    rootFolder,
    tags,
    radarrServiceId,
    sonarrServiceId,
    lidarrServiceId,
    readarrServiceId,
  };

  return Object.fromEntries(
    Object.entries(parsedRule).filter(([, value]) => value !== undefined)
  ) as OverrideRulePatch;
};

overrideRuleRoutes.get(
  '/',
  isAuthenticated(Permission.ADMIN),
  authorizedRouteAccess(Permission.ADMIN),
  async (req, res, next) => {
    const overrideRuleRepository = getRepository(OverrideRule);

    try {
      const rules = await overrideRuleRepository.find({});

      return res.status(200).json(rules as OverrideRuleResultsResponse);
    } catch (e) {
      reportOverrideRuleError('retrieve', e, next);
    }
  }
);

overrideRuleRoutes.post(
  '/',
  isAuthenticated(Permission.ADMIN),
  authorizedMutation(
    Permission.ADMIN,
    async (
      req: OverrideRuleRequest,
      res: Response<OverrideRuleResponse>,
      next: NextFunction
    ) => {
      const overrideRuleRepository = getRepository(OverrideRule);
      const parsedBody = parseOverrideRuleBody(req.body);
      if ('error' in parsedBody) {
        return res.status(400).json({ status: 400, message: parsedBody.error });
      }

      try {
        return await runWithOverrideRuleServiceAdmission(
          [parsedBody],
          async () => {
            const shapeError = validateOverrideRuleShape(parsedBody);
            if (shapeError) {
              return res
                .status(400)
                .json({ status: 400, message: shapeError.error });
            }

            const rule = new OverrideRule();
            // nosemgrep: javascript.express.security.express-data-exfiltration.express-data-exfiltration -- assigns an allow-listed, validated object to an entity; nothing is sent back to the client
            Object.assign(rule, parsedBody);

            const newRule = await overrideRuleRepository.save(rule);

            return res.status(200).json(newRule);
          }
        );
      } catch (e) {
        reportOverrideRuleError('create', e, next);
      }
    }
  )
);

overrideRuleRoutes.post<
  Record<string, string>,
  OverrideRulesResult | OverrideRuleErrorResponse,
  {
    mediaType: MediaType;
    is4k: boolean;
    tmdbId?: number;
    bookFormat?: 'ebook' | 'audiobook';
    musicId?: string;
    bookId?: string;
    requestUser?: number;
    requestId?: number | null;
    tags?: number[] | null;
    serviceId?: number;
  }
>(
  '/advancedRequest',
  isAuthenticated([Permission.REQUEST_ADVANCED, Permission.MANAGE_REQUESTS], {
    type: 'or',
  }),
  async (req, res, next) => {
    const userId = req.user?.id;
    const mediaType = req.body.mediaType;
    const tmdbId = parsePositiveRouteId(req.body.tmdbId);
    const requestId =
      req.body.requestId == null
        ? undefined
        : parsePositiveRouteId(req.body.requestId);
    const requestedUserId =
      req.body.requestUser == null
        ? undefined
        : parsePositiveRouteId(req.body.requestUser);
    const serviceId =
      req.body.serviceId == null
        ? undefined
        : parsePositiveRouteId(req.body.serviceId);

    if (
      !userId ||
      ((mediaType === MediaType.MOVIE || mediaType === MediaType.TV) &&
        !tmdbId) ||
      (req.body.requestId != null && !requestId) ||
      (req.body.requestUser != null && !requestedUserId) ||
      (req.body.serviceId != null && !serviceId) ||
      typeof req.body.is4k !== 'boolean' ||
      (req.body.tags != null &&
        (!Array.isArray(req.body.tags) ||
          req.body.tags.length > MAX_OVERRIDE_RULE_LIST_ITEMS ||
          req.body.tags.some(
            (tag) =>
              !Number.isSafeInteger(tag) ||
              tag < 0 ||
              tag > MAX_OVERRIDE_RULE_ID
          )))
    ) {
      return res
        .status(400)
        .json({ status: 400, message: 'Invalid advanced request options.' });
    }
    if (
      mediaType !== MediaType.MOVIE &&
      mediaType !== MediaType.TV &&
      mediaType !== MediaType.MUSIC &&
      mediaType !== MediaType.BOOK
    ) {
      return res
        .status(400)
        .json({ status: 400, message: 'Invalid advanced request media type.' });
    }
    if (
      mediaType === MediaType.BOOK &&
      req.body.bookFormat !== 'ebook' &&
      req.body.bookFormat !== 'audiobook'
    ) {
      return res
        .status(400)
        .json({ status: 400, message: 'Invalid book format.' });
    }
    if (
      (mediaType === MediaType.MUSIC &&
        req.body.musicId != null &&
        (typeof req.body.musicId !== 'string' ||
          !isValidMusicBrainzResourceId(
            normalizeMusicBrainzId(req.body.musicId)
          ))) ||
      (mediaType === MediaType.BOOK &&
        req.body.bookId != null &&
        (typeof req.body.bookId !== 'string' ||
          (!parseBookshelfBookId(req.body.bookId) &&
            !isValidOpenLibraryResourceId(
              normalizeOpenLibraryWorkId(req.body.bookId)
            ))))
    ) {
      return res.status(400).json({
        status: 400,
        message: 'Invalid catalog item identifier.',
      });
    }

    const canManageRequests = req.user?.hasPermission(
      Permission.MANAGE_REQUESTS
    );
    const canManageUsers = req.user?.hasPermission(Permission.MANAGE_USERS);
    const userRepository = getRepository(User);
    const requestRepository = getRepository(MediaRequest);
    let requestUser: User | null | undefined = req.user;

    try {
      if (requestId) {
        const request = await requestRepository.findOne({
          where: { id: requestId },
          relations: { requestedBy: true },
        });
        if (!request) {
          return res
            .status(404)
            .json({ status: 404, message: 'Request not found.' });
        }
        if (request.requestedBy.id !== userId && !canManageRequests) {
          return res.status(403).json({
            status: 403,
            message: 'You do not have permission to modify this request.',
          });
        }
        if (
          request.requestedBy.id === userId &&
          !canManageRequests &&
          !req.user?.hasPermission(Permission.REQUEST_ADVANCED)
        ) {
          return res.status(403).json({
            status: 403,
            message: 'You do not have permission to modify this request.',
          });
        }
        if (
          requestedUserId != null &&
          requestedUserId !== request.requestedBy.id &&
          !canManageRequests &&
          !canManageUsers
        ) {
          return res.status(403).json({
            status: 403,
            message: 'You do not have permission to modify the request user.',
          });
        }
        requestUser =
          requestedUserId != null && requestedUserId !== request.requestedBy.id
            ? await userRepository.findOne({ where: { id: requestedUserId } })
            : request.requestedBy;
      } else if (requestedUserId != null && requestedUserId !== userId) {
        if (!canManageRequests && !canManageUsers) {
          return res.status(403).json({
            status: 403,
            message: 'You do not have permission to modify the request user.',
          });
        }
        requestUser = await userRepository.findOne({
          where: { id: requestedUserId },
        });
      }

      if (!requestUser) {
        return res
          .status(404)
          .json({ status: 404, message: 'User not found.' });
      }

      if (canManageRequests) {
        return res.status(200).json({
          rootFolder: null,
          profileId: null,
          tags: req.body.tags ?? null,
        });
      }

      if (mediaType === MediaType.MUSIC || mediaType === MediaType.BOOK) {
        const settings = getSettings();
        const services =
          mediaType === MediaType.MUSIC ? settings.lidarr : settings.readarr;
        const selectedService = serviceId
          ? services.find((service) => service.id === serviceId)
          : services.find(
              (service) =>
                service.isDefault &&
                (mediaType !== MediaType.BOOK ||
                  readarrServiceSupportsFormat(
                    service as ReadarrSettings,
                    req.body.bookFormat === 'audiobook' ? 'audiobook' : 'ebook'
                  ))
            );
        if (!selectedService) {
          return res.status(400).json({
            status: 400,
            message: 'Selected request service is not configured.',
          });
        }
        if (
          mediaType === MediaType.BOOK &&
          !readarrServiceSupportsFormat(
            selectedService as ReadarrSettings,
            req.body.bookFormat === 'audiobook' ? 'audiobook' : 'ebook'
          )
        ) {
          return res.status(400).json({
            status: 400,
            message: 'Selected Bookshelf service does not match the format.',
          });
        }
        const metadata =
          mediaType === MediaType.MUSIC
            ? req.body.musicId
              ? await getMusicOverrideMetadata(req.body.musicId)
              : {}
            : req.body.bookId
              ? await getBookOverrideMetadata(req.body.bookId, settings.readarr)
              : {};
        const result = await evaluateRequesterOverrideRules({
          serviceField:
            mediaType === MediaType.MUSIC
              ? 'lidarrServiceId'
              : 'readarrServiceId',
          serviceId: selectedService.id,
          requestUser,
          tags: req.body.tags,
          metadata,
        });
        return res.status(200).json(result);
      }

      const tmdb = new TheMovieDb();
      const tmdbMedia =
        req.body.mediaType === MediaType.MOVIE
          ? await tmdb.getMovie({ movieId: tmdbId! })
          : await tmdb.getTvShow({ tvId: tmdbId! });
      const result = await evaluateOverrideRules({
        mediaType,
        is4k: req.body.is4k,
        tmdbMedia,
        requestUser,
        tags: req.body.tags,
        serviceId,
      });

      return res.status(200).json(result);
    } catch (error) {
      reportOverrideRuleError('evaluate', error, next);
    }
  }
);

overrideRuleRoutes.put(
  '/:ruleId',
  isAuthenticated(Permission.ADMIN),
  authorizedMutation(
    Permission.ADMIN,
    async (
      req: OverrideRuleRequest<{ ruleId: string }>,
      res: Response<OverrideRuleResponse>,
      next: NextFunction
    ) => {
      const overrideRuleRepository = getRepository(OverrideRule);
      const ruleId = parseOverrideRuleRouteId(req.params.ruleId);
      if (!ruleId) {
        return next({ status: 404, message: 'Override Rule not found.' });
      }

      try {
        return await runOverrideRuleMutation(ruleId, async () => {
          const rule = await overrideRuleRepository.findOne({
            where: {
              id: ruleId,
            },
          });

          if (!rule) {
            return next({ status: 404, message: 'Override Rule not found.' });
          }

          const parsedBody = parseOverrideRuleBody(req.body, rule);
          if ('error' in parsedBody) {
            return res
              .status(400)
              .json({ status: 400, message: parsedBody.error });
          }

          const updatedRule = { ...rule, ...parsedBody };
          return runWithOverrideRuleServiceAdmission(
            [rule, updatedRule],
            async () => {
              const shapeError = validateOverrideRuleShape(updatedRule);
              if (shapeError) {
                return res
                  .status(400)
                  .json({ status: 400, message: shapeError.error });
              }

              Object.assign(rule, updatedRule);

              const newRule = await overrideRuleRepository.save(rule);

              return res.status(200).json(newRule);
            }
          );
        });
      } catch (e) {
        reportOverrideRuleError('update', e, next);
      }
    }
  )
);

overrideRuleRoutes.delete<
  { ruleId: string },
  OverrideRule | { status: number; message: string }
>(
  '/:ruleId',
  isAuthenticated(Permission.ADMIN),
  authorizedMutation<
    { ruleId: string },
    OverrideRule | { status: number; message: string }
  >(Permission.ADMIN, async (req, res, next) => {
    const overrideRuleRepository = getRepository(OverrideRule);
    const ruleId = parseOverrideRuleRouteId(req.params.ruleId);
    if (!ruleId) {
      return next({ status: 404, message: 'Override Rule not found.' });
    }

    try {
      return await runOverrideRuleMutation(ruleId, async () => {
        const rule = await overrideRuleRepository.findOne({
          where: {
            id: ruleId,
          },
        });

        if (!rule) {
          return next({ status: 404, message: 'Override Rule not found.' });
        }

        return runWithOverrideRuleServiceAdmission([rule], async () => {
          await overrideRuleRepository.remove(rule);

          return res.status(200).json(rule);
        });
      });
    } catch (e) {
      reportOverrideRuleError('delete', e, next);
    }
  })
);

export default overrideRuleRoutes;
