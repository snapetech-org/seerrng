import BinderyAPI from '@server/api/bindery';
import type {
  ReadarrBookLookupResult,
  ReadarrMediaMoveAuthor,
  ReadarrMediaType,
} from '@server/api/servarr/readarr';
import ReadarrAPI from '@server/api/servarr/readarr';
import { getExternalRuntimeConfig } from '@server/lib/externalRuntimeConfig';
import { Permission } from '@server/lib/permissions';
import {
  runWithCurrentServarrService,
  runWithServarrServiceCollectionMutationAdmission,
} from '@server/lib/serviceAdmission';
import {
  allocateServarrServiceId,
  assertServarrServiceCanBeRemoved,
  assertServarrServiceCanChangeKind,
  getHistoricalServarrServiceIdMaximum,
} from '@server/lib/serviceId';
import type { ReadarrSettings } from '@server/lib/settings';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import { authorizedMutation } from '@server/middleware/authorizedMutation';
import {
  hydrateBookshelfLookupResult,
  isAddableBookshelfLookupResult,
} from '@server/utils/bookshelfLookup';
import {
  classifyBookshelfProvider,
  getBookshelfProviderNotice,
} from '@server/utils/bookshelfProvider';
import { mapWithConcurrency } from '@server/utils/concurrency';
import { getReadarrServiceFormats } from '@server/utils/readarrService';
import { parseNonNegativeRouteId } from '@server/utils/routeId';
import { REDACTED_SECRET, redactSecrets } from '@server/utils/security';
import {
  assertServarrInstanceCapacity,
  parseReadarrSettings,
  parseServarrConnectionSettings,
  preserveServarrApiKey,
  preserveServarrConnectionSecret,
  type ServarrConnectionSettings,
} from '@server/utils/servarrSettings';
import {
  parseOptionalBodyBoolean,
  parseOptionalBoundedString,
  parseOptionalNonNegativeInteger,
} from '@server/utils/validation';
import { Router } from 'express';

const readarrRoutes = Router();
const MAX_DIAGNOSTIC_TERM_LENGTH = 512;
const MAX_DIAGNOSTIC_PATH_LENGTH = 4096;
const MAX_DIAGNOSTIC_PROFILE_ID = 1_000_000;
export const MAX_DIAGNOSTIC_LOOKUP_RESULTS = 50;
export const DIAGNOSTIC_LOOKUP_HYDRATION_CONCURRENCY = 5;
export const MAX_BOOKSHELF_MEDIA_MOVE_AUTHORS = 1_000;
const MAX_BOOKSHELF_MEDIA_MOVE_DIRECTORY_RESULTS = 10_000;
const MAX_BOOKSHELF_MEDIA_MOVE_PATH_LENGTH = 4096;
const hasControlCharacters = (value: string): boolean =>
  Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code < 0x20 || code === 0x7f;
  });
type DiagnosticAuthor = NonNullable<ReadarrBookLookupResult['author']>;

type BookshelfMediaMoveRequest = {
  authorIds: number[];
  format: ReadarrMediaType;
  destinationRootPath: string;
  sourceRootPath?: string;
  previewToken?: string;
};

const normalizeProviderPath = (value: string): string => {
  const normalized = value.replaceAll('\\', '/').replace(/\/+$/, '') || '/';
  return /^[a-z]:\//i.test(normalized) ? normalized.toLowerCase() : normalized;
};

const parseBookshelfMediaMoveRequest = (
  value: unknown,
  requirePreviewToken: boolean
): { value: BookshelfMediaMoveRequest } | { error: string } => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return { error: 'Move details must be an object.' };
  const record = value as Record<string, unknown>;
  const { authorIds, format } = record;
  const destinationRootPath = record.destinationRootPath;
  const sourceRootPath = record.sourceRootPath;
  const previewToken = record.previewToken;
  if (format !== 'ebook' && format !== 'audiobook')
    return { error: 'Choose ebook or audiobook media.' };
  if (
    !Array.isArray(authorIds) ||
    authorIds.length < 1 ||
    authorIds.length > MAX_BOOKSHELF_MEDIA_MOVE_AUTHORS ||
    authorIds.some((id) => !Number.isSafeInteger(id) || Number(id) < 1) ||
    new Set(authorIds).size !== authorIds.length
  )
    return {
      error: `Select between 1 and ${MAX_BOOKSHELF_MEDIA_MOVE_AUTHORS} unique authors.`,
    };
  if (
    typeof destinationRootPath !== 'string' ||
    !destinationRootPath.trim() ||
    destinationRootPath.length > MAX_BOOKSHELF_MEDIA_MOVE_PATH_LENGTH ||
    hasControlCharacters(destinationRootPath)
  )
    return { error: 'Choose a valid destination root folder.' };
  if (
    sourceRootPath !== undefined &&
    (typeof sourceRootPath !== 'string' ||
      !sourceRootPath.trim() ||
      sourceRootPath.length > MAX_BOOKSHELF_MEDIA_MOVE_PATH_LENGTH ||
      hasControlCharacters(sourceRootPath))
  )
    return { error: 'Choose a valid source folder.' };
  if (
    requirePreviewToken &&
    (typeof previewToken !== 'string' ||
      !previewToken.trim() ||
      previewToken.length > 512)
  )
    return { error: 'Preview the move again before starting it.' };
  return {
    value: {
      authorIds: authorIds as number[],
      format,
      destinationRootPath: destinationRootPath.trim(),
      ...(typeof sourceRootPath === 'string'
        ? { sourceRootPath: sourceRootPath.trim() }
        : {}),
      ...(typeof previewToken === 'string'
        ? { previewToken: previewToken.trim() }
        : {}),
    },
  };
};

const createReadarrApi = (settings: ReadarrSettings): ReadarrAPI => {
  if (settings.backend === 'bindery') {
    throw new Error('Bookshelf media tools are not available for Bindery.');
  }
  return new ReadarrAPI({
    apiKey: settings.apiKey,
    url: ReadarrAPI.buildUrl(settings, '/api/v1'),
    mediaType: settings.serviceType === 'audiobook' ? 'audiobook' : 'ebook',
  });
};

const selectMoveAuthors = (
  authors: ReadarrMediaMoveAuthor[],
  format: ReadarrMediaType,
  authorIds: number[],
  sourceRootPath?: string
): ReadarrMediaMoveAuthor[] | undefined => {
  const requested = new Set(authorIds);
  const selected = authors.filter((author) => requested.has(author.id));
  if (selected.length !== authorIds.length) return;
  if (!sourceRootPath) return selected;
  return selected.every((author) => {
    const currentPath =
      (format === 'ebook' ? author.ebookPath : author.audiobookPath) ||
      author.path;
    return (
      normalizeProviderPath(currentPath) ===
      normalizeProviderPath(sourceRootPath)
    );
  })
    ? selected
    : undefined;
};

const parseOptionalDiagnosticId = (
  value: unknown,
  fieldName: string
): { value: number | undefined } | { error: string } => {
  if (value === undefined || value === null || value === '') {
    return { value: undefined };
  }

  const numericValue =
    typeof value === 'string' && /^\d+$/.test(value.trim())
      ? Number(value)
      : value;
  const parsed = parseOptionalNonNegativeInteger(
    numericValue,
    MAX_DIAGNOSTIC_PROFILE_ID
  );

  return parsed === undefined
    ? { error: `${fieldName} is invalid.` }
    : { value: parsed };
};

const hydrateBookshelfResult = async (
  readarr: ReadarrAPI,
  result: ReadarrBookLookupResult,
  loadAuthor: (
    authorName: string
  ) => Promise<DiagnosticAuthor | undefined> = async (authorName) => {
    const [author] = await readarr.lookupAuthor(authorName);
    return author?.foreignAuthorId && author.authorName
      ? {
          foreignAuthorId: author.foreignAuthorId,
          authorName: author.authorName,
          id: author.id,
        }
      : undefined;
  }
): Promise<ReadarrBookLookupResult> => {
  return hydrateBookshelfLookupResult(readarr, result, undefined, loadAuthor);
};

readarrRoutes.get('/', (_req, res) => {
  const settings = getSettings();

  res.status(200).json(redactSecrets(settings.readarr));
});

readarrRoutes.get(
  '/:id/media-move/configuration',
  authorizedMutation(Permission.ADMIN, async (req, res, next) => {
    const readarrId = parseNonNegativeRouteId(req.params.id);
    const format = req.query.format;
    if (readarrId === undefined)
      return next({ status: 404, message: 'Bookshelf service not found.' });
    if (format !== 'ebook' && format !== 'audiobook')
      return res.status(400).json({ message: 'Choose ebook or audiobook.' });

    try {
      const result = await runWithCurrentServarrService(
        'readarr',
        readarrId,
        async (service) => {
          const api = createReadarrApi(service);
          const [authors, rootFolders] = await Promise.all([
            api.getMediaMoveAuthors(),
            api.getRootFolders(),
          ]);
          return res.status(200).json({
            serviceId: service.id,
            serviceName: service.name,
            configuredFormat: service.serviceType ?? 'ebook',
            format,
            truncated:
              authors.length > MAX_BOOKSHELF_MEDIA_MOVE_DIRECTORY_RESULTS,
            authors: authors
              .slice(0, MAX_BOOKSHELF_MEDIA_MOVE_DIRECTORY_RESULTS)
              .map((author) => ({
                id: author.id,
                name: author.name,
                path: author.path,
                currentFormatPath:
                  (format === 'ebook'
                    ? author.ebookPath
                    : author.audiobookPath) || author.path,
                bookFileCount: author.bookFileCount,
              })),
            rootFolders: rootFolders.map(({ id, path, accessible }) => ({
              id,
              path,
              accessible: accessible !== false,
            })),
          });
        }
      );
      if (result === undefined)
        return next({ status: 404, message: 'Bookshelf service not found.' });
      return result;
    } catch (error) {
      const status = (error as { response?: { status?: number } })?.response
        ?.status;
      logger.warn('Failed to load Bookshelf media-move configuration.', {
        label: 'Readarr',
        serviceId: readarrId,
        providerStatus: status,
      });
      return res.status(status === 404 ? 409 : 502).json({
        message:
          status === 404
            ? 'This BookshelfNG instance does not expose the media-move API. Update BookshelfNG, then retry.'
            : 'Bookshelf library details could not be loaded.',
      });
    }
  })
);

readarrRoutes.post(
  '/:id/media-move/preview',
  authorizedMutation(Permission.ADMIN, async (req, res, next) => {
    const readarrId = parseNonNegativeRouteId(req.params.id);
    const parsed = parseBookshelfMediaMoveRequest(req.body, false);
    if (readarrId === undefined)
      return next({ status: 404, message: 'Bookshelf service not found.' });
    if ('error' in parsed)
      return res.status(400).json({ message: parsed.error });

    try {
      const result = await runWithCurrentServarrService(
        'readarr',
        readarrId,
        async (service) => {
          const api = createReadarrApi(service);
          const [authors, rootFolders] = await Promise.all([
            api.getMediaMoveAuthors(),
            api.getRootFolders(),
          ]);
          const selectedAuthors = selectMoveAuthors(
            authors,
            parsed.value.format,
            parsed.value.authorIds,
            parsed.value.sourceRootPath
          );
          if (!selectedAuthors)
            return res.status(400).json({
              message:
                'The selected authors no longer match this source folder. Reload the library and preview again.',
            });
          const destination = rootFolders.find(
            (folder) =>
              folder.accessible !== false &&
              normalizeProviderPath(folder.path) ===
                normalizeProviderPath(parsed.value.destinationRootPath)
          );
          if (!destination)
            return res.status(400).json({
              message:
                'Choose an accessible destination root folder from this BookshelfNG instance.',
            });
          const preview = await api.previewMediaMoveBatch({
            authorIds: parsed.value.authorIds,
            format: parsed.value.format,
            destinationRootPath: destination.path,
          });
          return res.status(200).json(preview);
        }
      );
      if (result === undefined)
        return next({ status: 404, message: 'Bookshelf service not found.' });
      return result;
    } catch (error) {
      const status = (error as { response?: { status?: number } })?.response
        ?.status;
      logger.warn('Bookshelf media-move preview failed.', {
        label: 'Readarr',
        serviceId: readarrId,
        providerStatus: status,
      });
      return res.status(status === 404 ? 409 : 502).json({
        message:
          status === 404
            ? 'This BookshelfNG instance does not support media moves. Update BookshelfNG, then retry.'
            : 'BookshelfNG could not preview this move. Reload the library and try again.',
      });
    }
  })
);

readarrRoutes.post(
  '/:id/media-move/start',
  authorizedMutation(Permission.ADMIN, async (req, res, next) => {
    const readarrId = parseNonNegativeRouteId(req.params.id);
    const parsed = parseBookshelfMediaMoveRequest(req.body, true);
    if (readarrId === undefined)
      return next({ status: 404, message: 'Bookshelf service not found.' });
    if ('error' in parsed)
      return res.status(400).json({ message: parsed.error });

    try {
      const result = await runWithCurrentServarrService(
        'readarr',
        readarrId,
        async (service) => {
          const api = createReadarrApi(service);
          const [authors, rootFolders] = await Promise.all([
            api.getMediaMoveAuthors(),
            api.getRootFolders(),
          ]);
          if (
            !selectMoveAuthors(
              authors,
              parsed.value.format,
              parsed.value.authorIds,
              parsed.value.sourceRootPath
            )
          )
            return res.status(409).json({
              message:
                'The selected authors or source folder changed after preview. Preview the move again.',
            });
          const destination = rootFolders.find(
            (folder) =>
              folder.accessible !== false &&
              normalizeProviderPath(folder.path) ===
                normalizeProviderPath(parsed.value.destinationRootPath)
          );
          if (!destination)
            return res.status(409).json({
              message:
                'The destination root folder is no longer available. Preview the move again.',
            });
          const command = await api.startMediaMoveBatch({
            authorIds: parsed.value.authorIds,
            format: parsed.value.format,
            destinationRootPath: destination.path,
            previewToken: parsed.value.previewToken!,
          });
          return res.status(202).json({ command });
        }
      );
      if (result === undefined)
        return next({ status: 404, message: 'Bookshelf service not found.' });
      return result;
    } catch (error) {
      const status = (error as { response?: { status?: number } })?.response
        ?.status;
      logger.warn('Bookshelf media-move could not be queued.', {
        label: 'Readarr',
        serviceId: readarrId,
        providerStatus: status,
      });
      return res.status(status === 404 ? 409 : 502).json({
        message:
          status === 404
            ? 'This BookshelfNG instance does not support media moves. Update BookshelfNG, then retry.'
            : status === 409
              ? 'The library changed after preview. Preview the move again.'
              : 'BookshelfNG could not queue this move.',
      });
    }
  })
);

readarrRoutes.get(
  '/:id/media-move/commands/:commandId',
  authorizedMutation(Permission.ADMIN, async (req, res, next) => {
    const readarrId = parseNonNegativeRouteId(req.params.id);
    const commandId = parseNonNegativeRouteId(req.params.commandId);
    if (readarrId === undefined || commandId === undefined)
      return next({ status: 404, message: 'Media-move command not found.' });
    try {
      const result = await runWithCurrentServarrService(
        'readarr',
        readarrId,
        async (service) => {
          const command =
            await createReadarrApi(service).getMediaMoveCommand(commandId);
          return res.status(200).json({ command });
        }
      );
      if (result === undefined)
        return next({ status: 404, message: 'Bookshelf service not found.' });
      return result;
    } catch (error) {
      const status = (error as { response?: { status?: number } })?.response
        ?.status;
      logger.warn('Bookshelf media-move command lookup failed.', {
        label: 'Readarr',
        serviceId: readarrId,
        commandId,
        providerStatus: status,
      });
      return res.status(status === 404 ? 404 : 502).json({
        message:
          status === 404
            ? 'Media-move command not found.'
            : 'BookshelfNG command status could not be loaded.',
      });
    }
  })
);

readarrRoutes.post(
  '/',
  authorizedMutation(Permission.ADMIN, async (req, res) => {
    const settings = getSettings();

    const parsedReadarr = parseReadarrSettings(req.body);

    if ('error' in parsedReadarr) {
      return res.status(400).json({ message: parsedReadarr.error });
    }

    return runWithServarrServiceCollectionMutationAdmission(
      'readarr',
      async () => {
        const historicalServiceIdMaximum =
          await getHistoricalServarrServiceIdMaximum('readarr');
        const readarr = await settings.persistSection('readarr', (current) => {
          assertServarrInstanceCapacity(current);
          const newReadarr = {
            ...parsedReadarr.value,
            id: allocateServarrServiceId(
              current.map(({ id }) => id),
              historicalServiceIdMaximum
            ),
          };
          const newFormats = getReadarrServiceFormats(newReadarr);
          const existing = newReadarr.isDefault
            ? current.map((instance) => ({
                ...instance,
                isDefault: getReadarrServiceFormats(instance).some((format) =>
                  newFormats.includes(format)
                )
                  ? false
                  : instance.isDefault,
              }))
            : current;
          return [...existing, newReadarr];
        });
        const newReadarr = readarr[readarr.length - 1];

        return res.status(201).json(redactSecrets(newReadarr));
      }
    );
  })
);

readarrRoutes.post<
  undefined,
  Record<string, unknown>,
  ServarrConnectionSettings
>(
  '/test',
  authorizedMutation<
    undefined,
    Record<string, unknown>,
    ServarrConnectionSettings
  >(Permission.ADMIN, async (req, res, next) => {
    try {
      const parsedReadarr = parseServarrConnectionSettings(
        preserveServarrConnectionSecret(
          req.body,
          getExternalRuntimeConfig().readarr
        )
      );

      if ('error' in parsedReadarr) {
        return res.status(400).json({ message: parsedReadarr.error });
      }

      if (parsedReadarr.value.backend === 'bindery') {
        const bindery = new BinderyAPI({
          ...parsedReadarr.value,
          id: 0,
          name: 'Bindery',
          activeProfileId: 0,
          activeProfileName: 'Bindery managed',
          activeDirectory: '/',
          tags: [],
          is4k: false,
          isDefault: false,
          syncEnabled: false,
          preventSearch: true,
          tagRequests: false,
          overrideRule: [],
        } as ReadarrSettings);
        const status = await bindery.getSystemStatus();
        const requestsForUser = bindery.supportsForUserRequests(status);
        const requesterAccounts = requestsForUser
          ? (await bindery.getUsers()).length
          : undefined;
        return res.status(200).json({
          backend: 'bindery',
          system: {
            version: status.version,
            commit: status.commit,
            buildDate: status.buildDate,
          },
          features: {
            requestsForUser,
          },
          ...(requesterAccounts === undefined ? {} : { requesterAccounts }),
        });
      }

      const readarr = new ReadarrAPI({
        apiKey: parsedReadarr.value.apiKey,
        url: ReadarrAPI.buildUrl(parsedReadarr.value, '/api/v1'),
        mediaType:
          parsedReadarr.value.serviceType === 'audiobook'
            ? 'audiobook'
            : 'ebook',
      });

      const [urlBase, development] = await Promise.all([
        readarr
          .getSystemStatus()
          .then((value) => value.urlBase)
          .catch(() => parsedReadarr.value.baseUrl),
        readarr.getDevelopmentConfig().catch(() => undefined),
      ]);
      const profiles = await readarr.getProfiles();
      const metadataProfiles = await readarr.getMetadataProfiles();
      const folders = await readarr.getRootFolders();
      const provider = classifyBookshelfProvider(development?.metadataSource);

      return res.status(200).json({
        profiles,
        metadataProfiles,
        rootFolders: folders.map((folder) => ({
          id: folder.id,
          path: folder.path,
        })),
        tags: [],
        urlBase,
        provider,
        providerNotice: getBookshelfProviderNotice(provider),
        legacyWarning: getBookshelfProviderNotice(provider),
        metadataSource: development?.metadataSource,
      });
    } catch (e) {
      logger.error('Failed to test Readarr', {
        label: 'Readarr',
        message: e.message,
      });
      next({ status: 500, message: 'Failed to connect to Bookshelf' });
    }
  })
);

readarrRoutes.post<
  undefined,
  Record<string, unknown>,
  Partial<ReadarrSettings> & {
    term?: unknown;
    testAdd?: unknown;
  }
>(
  '/diagnose',
  authorizedMutation<
    undefined,
    Record<string, unknown>,
    Partial<ReadarrSettings> & { term?: unknown; testAdd?: unknown }
  >(Permission.ADMIN, async (req, res) => {
    const parsedReadarr = parseServarrConnectionSettings(
      preserveServarrConnectionSecret(
        req.body,
        getExternalRuntimeConfig().readarr
      )
    );

    if ('error' in parsedReadarr) {
      return res.status(400).json({
        ok: false,
        category: 'backend_unreachable',
        message: parsedReadarr.error,
        messageOrigin: 'app',
      });
    }

    if (parsedReadarr.value.backend === 'bindery') {
      return res.status(400).json({
        ok: false,
        category: 'unsupported_operation',
        message: 'Readarr diagnostics are not available for Bindery.',
        messageOrigin: 'app',
      });
    }

    const term = parseOptionalBoundedString(req.body.term, {
      fieldName: 'term',
      maxLength: MAX_DIAGNOSTIC_TERM_LENGTH,
    });
    const testAdd = parseOptionalBodyBoolean(req.body.testAdd, 'testAdd');
    const activeDirectory = parseOptionalBoundedString(
      req.body.activeDirectory,
      {
        fieldName: 'activeDirectory',
        maxLength: MAX_DIAGNOSTIC_PATH_LENGTH,
      }
    );
    const activeProfileId = parseOptionalDiagnosticId(
      req.body.activeProfileId,
      'activeProfileId'
    );
    const activeMetadataProfileId = parseOptionalDiagnosticId(
      req.body.activeMetadataProfileId,
      'activeMetadataProfileId'
    );
    if (
      'error' in term ||
      'error' in testAdd ||
      'error' in activeDirectory ||
      'error' in activeProfileId ||
      'error' in activeMetadataProfileId
    ) {
      const message =
        ('error' in term && term.error) ||
        ('error' in testAdd && testAdd.error) ||
        ('error' in activeDirectory && activeDirectory.error) ||
        ('error' in activeProfileId && activeProfileId.error) ||
        ('error' in activeMetadataProfileId && activeMetadataProfileId.error) ||
        'Invalid diagnostic request.';
      return res.status(400).json({
        ok: false,
        category: 'invalid_request',
        message,
      });
    }

    const lookupTerm = term.value || 'isbn:9780547928227';
    const readarr = new ReadarrAPI({
      apiKey: parsedReadarr.value.apiKey,
      url: ReadarrAPI.buildUrl(parsedReadarr.value, '/api/v1'),
      mediaType:
        parsedReadarr.value.serviceType === 'audiobook' ? 'audiobook' : 'ebook',
    });

    try {
      const [status, development, profiles, metadataProfiles, folders] =
        await Promise.all([
          readarr.getSystemStatus(),
          readarr.getDevelopmentConfig().catch(() => undefined),
          readarr.getProfiles(),
          readarr.getMetadataProfiles(),
          readarr.getRootFolders(),
        ]);
      const provider = classifyBookshelfProvider(development?.metadataSource);
      const providerNotice = getBookshelfProviderNotice(provider);
      let lookup: ReadarrBookLookupResult[];
      try {
        lookup = await readarr.lookupBook(lookupTerm);
      } catch (error) {
        logger.warn(
          'Bookshelf metadata provider lookup failed during diagnosis.',
          {
            label: 'Readarr',
            provider,
            metadataSource: development?.metadataSource,
            term: lookupTerm,
            errorMessage:
              error instanceof Error ? error.message : String(error),
          }
        );
        return res.status(200).json({
          ok: false,
          category: 'provider_failed',
          message:
            'The configured metadata provider failed this lookup. Check the Bookshelf provider logs and try again.',
          messageOrigin: 'app',
          term: lookupTerm,
          provider,
          providerNotice,
          legacyWarning: providerNotice,
          metadataSource: development?.metadataSource,
          lookupCount: 0,
        });
      }

      if (!lookup.length) {
        return res.status(200).json({
          ok: false,
          category: 'lookup_empty',
          message: 'Bookshelf lookup returned no results.',
          messageOrigin: 'app',
          term: lookupTerm,
          system: {
            appName: status.appName,
            version: status.version,
            urlBase: status.urlBase,
          },
          provider,
          providerNotice,
          legacyWarning: providerNotice,
          metadataSource: development?.metadataSource,
          profiles: profiles.map((profile) => ({
            id: profile.id,
            name: profile.name,
          })),
          metadataProfiles: metadataProfiles.map((profile) => ({
            id: profile.id,
            name: profile.name,
          })),
          rootFolders: folders.map((folder) => ({
            id: folder.id,
            path: folder.path,
            accessible: folder.accessible,
          })),
          lookupCount: 0,
        });
      }

      const authorCache = new Map<
        string,
        Promise<DiagnosticAuthor | undefined>
      >();
      let authorLookupFailed = false;
      const loadAuthor = (authorName: string) => {
        let pending = authorCache.get(authorName);
        if (!pending) {
          pending = readarr
            .lookupAuthor(authorName)
            .then((authors) => {
              const normalizeName = (value: string) =>
                value
                  .toLocaleLowerCase()
                  .normalize('NFKD')
                  .replace(/[\u0300-\u036f]/g, '')
                  .replace(/[^\p{L}\p{N}]+/gu, ' ')
                  .trim();
              const complete = authors.filter(
                (author) =>
                  !!author.foreignAuthorId?.trim() &&
                  !!author.authorName?.trim()
              );
              const author =
                complete.find(
                  (candidate) =>
                    normalizeName(candidate.authorName) ===
                    normalizeName(authorName)
                ) ?? complete[0];
              return author
                ? {
                    foreignAuthorId: author.foreignAuthorId,
                    authorName: author.authorName,
                    id: author.id,
                  }
                : undefined;
            })
            .catch((error) => {
              authorLookupFailed = true;
              throw error;
            });
          authorCache.set(authorName, pending);
        }
        return pending;
      };
      const hydratedLookup = await mapWithConcurrency(
        lookup.slice(0, MAX_DIAGNOSTIC_LOOKUP_RESULTS),
        DIAGNOSTIC_LOOKUP_HYDRATION_CONCURRENCY,
        (result) => hydrateBookshelfResult(readarr, result, loadAuthor)
      );
      const addableResult = hydratedLookup.find(isAddableBookshelfLookupResult);

      if (!addableResult) {
        return res.status(200).json({
          ok: false,
          category: 'lookup_incomplete',
          message: authorLookupFailed
            ? 'Bookshelf found book results, but the metadata provider failed to resolve an author. Check provider logs and retry.'
            : 'Bookshelf lookup returned results, but none had usable author and edition metadata.',
          messageOrigin: 'app',
          term: lookupTerm,
          provider,
          providerNotice,
          legacyWarning: providerNotice,
          metadataSource: development?.metadataSource,
          lookupCount: lookup.length,
          sample: lookup.slice(0, 3).map((result) => ({
            title: result.title,
            foreignBookId: result.foreignBookId,
            foreignEditionId: result.foreignEditionId,
            authorPresent: !!result.author,
            editionCount: result.editions?.length ?? 0,
          })),
        });
      }

      if (testAdd.value === true) {
        try {
          const requestedRootFolder = activeDirectory.value;
          const rootFolder = requestedRootFolder || folders[0]?.path;
          const qualityProfileId = activeProfileId.value ?? profiles[0]?.id;
          const metadataProfileId =
            activeMetadataProfileId.value ?? metadataProfiles[0]?.id;

          if (
            !rootFolder ||
            !folders.some(
              (folder) =>
                folder.path === rootFolder && folder.accessible !== false
            ) ||
            qualityProfileId === undefined ||
            !profiles.some((profile) => profile.id === qualityProfileId) ||
            metadataProfileId === undefined ||
            !metadataProfiles.some(
              (profile) => profile.id === metadataProfileId
            )
          ) {
            return res.status(400).json({
              ok: false,
              category: 'invalid_request',
              message:
                'Test add selections must match accessible Bookshelf profiles and root folders.',
              messageOrigin: 'app',
            });
          }

          const added = await readarr.addBook({
            ...addableResult,
            monitored: true,
            qualityProfileId,
            metadataProfileId,
            rootFolderPath: rootFolder,
            tags: [],
            author: {
              ...addableResult.author,
              rootFolderPath: rootFolder,
              qualityProfileId,
              metadataProfileId,
              monitored: true,
              addOptions: {
                monitor: 'none',
                searchForMissingBooks: false,
              },
              manualAdd: true,
            },
            editions: addableResult.editions ?? [],
            addOptions: {
              searchForNewBook: false,
            },
          });

          if (added.pending) {
            return res.status(200).json({
              ok: false,
              category: 'backend_add_pending',
              message:
                'The import remains queued because Chaptarr may share it with an active SeerrNG request. Check its status in Chaptarr and cancel it only when no request needs it.',
              messageOrigin: 'app',
              detailMessage:
                added.message ??
                'Chaptarr accepted the diagnostic add while preparing author metadata.',
              detailMessageOrigin: added.message ? 'opaque' : 'app',
              term: lookupTerm,
              provider,
              providerNotice,
              legacyWarning: providerNotice,
              lookupCount: lookup.length,
              pendingId: added.pendingId,
            });
          }

          if (added.id !== undefined && added.id !== null) {
            try {
              await readarr.removeBook(added.id, {
                deleteFiles: false,
                addImportListExclusion: false,
              });
            } catch (cleanupError) {
              return res.status(200).json({
                ok: false,
                category: 'backend_cleanup_failed',
                message:
                  cleanupError instanceof Error
                    ? cleanupError.message
                    : String(cleanupError),
                messageOrigin: 'opaque',
                term: lookupTerm,
                provider,
                providerNotice,
                legacyWarning: providerNotice,
                lookupCount: lookup.length,
                addedBookId: added.id,
              });
            }
          }
        } catch (e) {
          return res.status(200).json({
            ok: false,
            category: 'backend_add_rejected',
            message: e instanceof Error ? e.message : String(e),
            messageOrigin: 'opaque',
            term: lookupTerm,
            provider,
            providerNotice,
            legacyWarning: providerNotice,
            lookupCount: lookup.length,
          });
        }
      }

      return res.status(200).json({
        ok: true,
        category: 'ok',
        message: 'Bookshelf lookup returned usable metadata.',
        messageOrigin: 'app',
        term: lookupTerm,
        provider,
        providerNotice,
        legacyWarning: providerNotice,
        metadataSource: development?.metadataSource,
        lookupCount: lookup.length,
        sample: {
          title: addableResult.title,
          foreignBookId: addableResult.foreignBookId,
          authorName: addableResult.author?.authorName,
          editionCount: addableResult.editions?.length ?? 0,
        },
      });
    } catch (e) {
      logger.error('Failed to diagnose Bookshelf', {
        label: 'Readarr',
        message: e instanceof Error ? e.message : String(e),
      });

      return res.status(200).json({
        ok: false,
        category: 'backend_unreachable',
        message: e instanceof Error ? e.message : String(e),
        messageOrigin: 'opaque',
        term: lookupTerm,
      });
    }
  })
);

readarrRoutes.put<{ id: string }, ReadarrSettings, ReadarrSettings>(
  '/:id',
  authorizedMutation<{ id: string }, ReadarrSettings, ReadarrSettings>(
    Permission.ADMIN,
    async (req, res, next) => {
      const settings = getSettings();
      const readarrId = parseNonNegativeRouteId(req.params.id);
      if (readarrId === undefined) {
        return next({ status: 404, message: 'Settings instance not found' });
      }

      const readarrIndex = settings.readarr.findIndex(
        (r) => r.id === readarrId
      );

      if (readarrIndex === -1) {
        return next({ status: 404, message: 'Settings instance not found' });
      }

      return runWithServarrServiceCollectionMutationAdmission(
        'readarr',
        async () => {
          const currentReadarr = settings.readarr.find(
            (instance) => instance.id === readarrId
          );
          if (!currentReadarr) {
            return next({
              status: 404,
              message: 'Settings instance not found',
            });
          }
          const admittedReadarr = parseReadarrSettings(
            preserveServarrApiKey(req.body, currentReadarr),
            currentReadarr
          );
          if ('error' in admittedReadarr) {
            return next({ status: 400, message: admittedReadarr.error });
          }
          if (
            currentReadarr.serviceType !== admittedReadarr.value.serviceType ||
            currentReadarr.backend !== admittedReadarr.value.backend
          ) {
            await assertServarrServiceCanChangeKind('readarr', readarrId);
          }
          const readarr = await settings.persistSection(
            'readarr',
            (current) => {
              const newFormats = getReadarrServiceFormats(
                admittedReadarr.value
              );
              const oldFormats = getReadarrServiceFormats(currentReadarr);
              const updated = current.map((instance) => {
                if (instance.id === readarrId) {
                  return {
                    ...admittedReadarr.value,
                    apiKey:
                      (req.body as { apiKey?: unknown }).apiKey ===
                      REDACTED_SECRET
                        ? instance.apiKey
                        : admittedReadarr.value.apiKey,
                    id: readarrId,
                  } as ReadarrSettings;
                }
                return admittedReadarr.value.isDefault &&
                  getReadarrServiceFormats(instance).some((format) =>
                    newFormats.includes(format)
                  )
                  ? { ...instance, isDefault: false }
                  : instance;
              });

              // Preserve coverage when a default stops handling one of its
              // formats, including when a shared Bindery connection changes.
              const formatsToPromote = currentReadarr.isDefault
                ? oldFormats.filter((format) => !newFormats.includes(format))
                : [];
              for (const format of formatsToPromote) {
                if (
                  updated.some(
                    (instance) =>
                      instance.id !== readarrId &&
                      instance.isDefault &&
                      getReadarrServiceFormats(instance).includes(format)
                  )
                ) {
                  continue;
                }
                const promote = updated.find(
                  (instance) =>
                    instance.id !== readarrId &&
                    getReadarrServiceFormats(instance).includes(format)
                );
                if (promote) promote.isDefault = true;
              }

              return updated;
            }
          );

          return res
            .status(200)
            .json(redactSecrets(readarr.find(({ id }) => id === readarrId)));
        }
      );
    }
  )
);

readarrRoutes.delete<{ id: string }>(
  '/:id',
  authorizedMutation<{ id: string }>(
    Permission.ADMIN,
    async (req, res, next) => {
      const settings = getSettings();
      const readarrId = parseNonNegativeRouteId(req.params.id);
      if (readarrId === undefined) {
        return next({ status: 404, message: 'Settings instance not found' });
      }

      const readarrIndex = settings.readarr.findIndex(
        (r) => r.id === readarrId
      );

      if (readarrIndex === -1) {
        return next({ status: 404, message: 'Settings instance not found' });
      }

      return runWithServarrServiceCollectionMutationAdmission(
        'readarr',
        async () => {
          const removed = settings.readarr.find(
            (instance) => instance.id === readarrId
          );
          if (!removed) {
            return next({
              status: 404,
              message: 'Settings instance not found',
            });
          }
          await assertServarrServiceCanBeRemoved('readarr', readarrId);
          await settings.persistSection('readarr', (current) => {
            const remaining = current.filter(({ id }) => id !== readarrId);
            if (!removed.isDefault) {
              return remaining;
            }
            const updated = [...remaining];
            for (const format of getReadarrServiceFormats(removed)) {
              if (
                updated.some(
                  (instance) =>
                    instance.isDefault &&
                    getReadarrServiceFormats(instance).includes(format)
                )
              ) {
                continue;
              }
              const promote = updated.find((instance) =>
                getReadarrServiceFormats(instance).includes(format)
              );
              if (promote) promote.isDefault = true;
            }
            return updated;
          });

          return res.status(200).json(redactSecrets(removed));
        }
      );
    }
  )
);

export default readarrRoutes;
