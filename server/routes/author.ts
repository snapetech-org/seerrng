import { DEFAULT_EXTERNAL_API_TIMEOUT_MS } from '@server/api/externalapi';
import OpenLibraryAPI, {
  type OpenLibraryAuthorWork,
} from '@server/api/openlibrary';
import ReadarrAPI from '@server/api/servarr/readarr';
import type { User } from '@server/entity/User';
import { findBookMediaByOpenLibraryIds } from '@server/lib/bookMediaMatcher';
import {
  isValidOpenLibraryResourceId,
  normalizeOpenLibraryAuthorId,
  normalizeOpenLibraryWorkId,
} from '@server/lib/externalIds';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import {
  mapOpenLibraryAuthorWork,
  type AuthorDetails,
} from '@server/models/Book';
import {
  getBookshelfAuthorDetails,
  parseBookshelfAuthorId,
} from '@server/utils/bookshelfCatalog';
import { settlePromisesWithin } from '@server/utils/concurrency';
import {
  MAX_PAGINATION_OFFSET,
  parseNonNegativeInt,
  parsePositiveInt,
} from '@server/utils/pagination';
import { getRateLimitKey } from '@server/utils/security';
import { parseBoundedString } from '@server/utils/validation';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';

const authorRoutes = Router();
const MAX_OPENLIBRARY_AUTHOR_ID_LENGTH = 128;
const authorRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  skip: () => process.env.NODE_ENV === 'test',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getRateLimitKey,
});
// Must stay above DEFAULT_EXTERNAL_API_TIMEOUT_MS, the underlying HTTP
// client's own timeout for Open Library requests — otherwise this race
// cuts off in-flight requests before the client itself would give up.
const OPENLIBRARY_AUTHOR_REQUEST_TIMEOUT_MS =
  DEFAULT_EXTERNAL_API_TIMEOUT_MS + 2_000;

authorRoutes.use(authorRateLimit);

const ISO_639_1_TO_OPENLIBRARY: Record<string, string> = {
  ar: 'ara',
  ca: 'cat',
  cs: 'cze',
  da: 'dan',
  de: 'ger',
  el: 'gre',
  en: 'eng',
  es: 'spa',
  et: 'est',
  eu: 'baq',
  fi: 'fin',
  fr: 'fre',
  he: 'heb',
  hi: 'hin',
  hr: 'hrv',
  hu: 'hun',
  it: 'ita',
  ja: 'jpn',
  ko: 'kor',
  lt: 'lit',
  nl: 'dut',
  no: 'nor',
  pl: 'pol',
  pt: 'por',
  ro: 'rum',
  ru: 'rus',
  sk: 'slo',
  sl: 'slv',
  sq: 'alb',
  sr: 'srp',
  sv: 'swe',
  tr: 'tur',
  uk: 'ukr',
  vi: 'vie',
  zh: 'chi',
};

const parseOpenLibraryAuthorId = (value: unknown) => {
  const parsed = parseBoundedString(value, {
    fieldName: 'Author ID',
    maxLength: MAX_OPENLIBRARY_AUTHOR_ID_LENGTH,
  });
  if ('error' in parsed) {
    return parsed;
  }

  const normalized = normalizeOpenLibraryAuthorId(parsed.value);
  return isValidOpenLibraryResourceId(normalized)
    ? { value: normalized }
    : { error: 'Author ID is invalid.' };
};

const normalizeTitleForDedupe = (title: string) =>
  title
    .toLocaleLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const getPreferredOpenLibraryLanguage = () => {
  const settings = getSettings();
  const language = (
    settings.main.originalLanguage ||
    settings.main.locale ||
    ''
  )
    .split(/[-_]/)[0]
    ?.toLowerCase();

  return language ? ISO_639_1_TO_OPENLIBRARY[language] : undefined;
};

const workMatchesPreferredLanguage = (
  work: OpenLibraryAuthorWork,
  preferredLanguage?: string
) => {
  if (!preferredLanguage || !work.languages?.length) {
    return true;
  }

  return work.languages.some(
    (language) =>
      language.key.replace('/languages/', '').toLowerCase() ===
      preferredLanguage
  );
};

const filterAuthorWorks = (
  works: OpenLibraryAuthorWork[],
  preferredLanguage?: string
) => {
  const seenTitles = new Set<string>();

  return works.filter((work) => {
    if (!workMatchesPreferredLanguage(work, preferredLanguage)) {
      return false;
    }

    const titleKey = normalizeTitleForDedupe(work.title);

    if (seenTitles.has(titleKey)) {
      return false;
    }

    seenTitles.add(titleKey);
    return true;
  });
};

const getAuthorWorksPayload = async (
  authorId: string,
  limit: number,
  offset: number,
  user?: User
) => {
  const openLibrary = new OpenLibraryAPI();
  const works = await openLibrary.getAuthorWorks(authorId, { limit, offset });
  const preferredLanguage = getPreferredOpenLibraryLanguage();
  const filteredWorks = filterAuthorWorks(works.entries, preferredLanguage);
  const ids = filteredWorks.map((work) => normalizeOpenLibraryWorkId(work.key));
  const mediaByOpenLibraryId = await findBookMediaByOpenLibraryIds(ids, user);

  return {
    works: filteredWorks.map((work) =>
      mapOpenLibraryAuthorWork(
        work,
        mediaByOpenLibraryId.get(normalizeOpenLibraryWorkId(work.key)),
        undefined,
        authorId.replace(/^\/?authors\//, '')
      )
    ),
    pagination: {
      limit,
      offset,
      totalItems: works.size,
      nextOffset: offset + works.entries.length,
    },
  };
};

const normalizeAuthorName = (name: string) =>
  name
    .toLocaleLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

const findBookshelfAuthorCover = async (
  authorName: string
): Promise<{ serviceId: number; authorId: number } | undefined> => {
  const services = getSettings()
    .readarr.filter(
      (service) =>
        service.isDefault &&
        service.backend !== 'bindery' &&
        service.backend !== 'bookorbit'
    )
    .slice(0, 4);
  const normalizedName = normalizeAuthorName(authorName);

  for (const service of services) {
    const readarr = new ReadarrAPI({
      apiKey: service.apiKey,
      url: ReadarrAPI.buildUrl(service, '/api/v1'),
      mediaType: service.serviceType === 'audiobook' ? 'audiobook' : 'ebook',
    });
    try {
      const matches = await readarr.lookupAuthor(authorName);
      const author = matches.find(
        (match) =>
          !!match.id && normalizeAuthorName(match.authorName) === normalizedName
      );
      if (author?.id) {
        return { serviceId: service.id, authorId: author.id };
      }
    } catch (error) {
      logger.warn('Bookshelf author image lookup failed.', {
        label: 'Author',
        serviceId: service.id,
        errorMessage:
          error instanceof Error ? error.message : 'Unknown provider error',
      });
    }
  }

  return undefined;
};

type AuthorWorksPayload = Awaited<ReturnType<typeof getAuthorWorksPayload>>;
type AuthorResponse = Awaited<ReturnType<OpenLibraryAPI['getAuthor']>>;

const emptyAuthorWorksPayload = (
  limit: number,
  offset: number
): AuthorWorksPayload => ({
  works: [],
  pagination: {
    limit,
    offset,
    totalItems: 0,
    nextOffset: offset,
  },
});

authorRoutes.get<
  { id: string },
  AuthorDetails | { status: number; message: string }
>('/:id', async (req, res, next) => {
  if (parseBookshelfAuthorId(req.params.id)) {
    const limit = parsePositiveInt(req.query.limit, 20, 100);
    const offset = parseNonNegativeInt(
      req.query.offset,
      0,
      MAX_PAGINATION_OFFSET
    );
    const author = await getBookshelfAuthorDetails(
      getSettings().readarr,
      req.params.id,
      limit,
      offset
    );
    return author
      ? res.status(200).json(author)
      : res.status(404).json({ status: 404, message: 'Author not found' });
  }
  const parsedAuthorId = parseOpenLibraryAuthorId(req.params.id);
  if ('error' in parsedAuthorId) {
    return res.status(404).json({ status: 404, message: 'Author not found' });
  }

  const authorId = parsedAuthorId.value;
  const limit = parsePositiveInt(req.query.limit, 20, 100);
  const offset = parseNonNegativeInt(
    req.query.offset,
    0,
    MAX_PAGINATION_OFFSET
  );
  const openLibrary = new OpenLibraryAPI();

  try {
    const authorRequests = await settlePromisesWithin<
      AuthorResponse | AuthorWorksPayload
    >(
      [
        openLibrary.getAuthor(authorId),
        getAuthorWorksPayload(authorId, limit, offset, req.user),
      ],
      OPENLIBRARY_AUTHOR_REQUEST_TIMEOUT_MS
    );
    const authorResult = authorRequests.results[0] as
      PromiseSettledResult<AuthorResponse> | undefined;
    const worksResult = authorRequests.results[1] as
      PromiseSettledResult<AuthorWorksPayload> | undefined;

    if (authorRequests.timedOut) {
      logger.warn('Author details request timed out', {
        label: 'Author',
        authorId,
        completedRequests: authorRequests.results.length,
      });
    }

    if (!authorResult) {
      throw new Error('Open Library author request timed out.');
    }
    if (authorResult.status === 'rejected') {
      throw authorResult.reason;
    }

    let worksPayload = emptyAuthorWorksPayload(limit, offset);
    if (worksResult?.status === 'fulfilled') {
      worksPayload = worksResult.value;
    } else if (worksResult?.status === 'rejected') {
      throw worksResult.reason;
    }

    const author = authorResult.value;
    const biography =
      typeof author.bio === 'string' ? author.bio : author.bio?.value;
    const normalizedAuthorId = author.key.replace('/authors/', '');
    const bookshelfCover = author.photos?.[0]
      ? undefined
      : await findBookshelfAuthorCover(author.name).catch(() => undefined);

    return res.status(200).json({
      id: normalizedAuthorId,
      name: author.name,
      biography,
      birthDate: author.birth_date,
      deathDate: author.death_date,
      posterPath: author.photos?.[0]
        ? `https://covers.openlibrary.org/a/id/${author.photos[0]}-L.jpg`
        : bookshelfCover
          ? `/api/v1/author/${encodeURIComponent(normalizedAuthorId)}/cover?serviceId=${bookshelfCover.serviceId}&bookshelfAuthorId=${bookshelfCover.authorId}`
          : undefined,
      works: worksPayload.works.map((work) => ({
        ...work,
        author: author.name,
        authorId: normalizedAuthorId,
      })),
      pagination: worksPayload.pagination,
    });
  } catch (e) {
    logger.error('Failed to retrieve author details', {
      label: 'Author',
      errorMessage: e instanceof Error ? e.message : 'Unknown error',
      authorId,
    });
    return next({
      status: 500,
      message: 'Unable to retrieve author details.',
    });
  }
});

authorRoutes.get<{ id: string }>('/:id/works', async (req, res, next) => {
  if (parseBookshelfAuthorId(req.params.id)) {
    const limit = parsePositiveInt(req.query.limit, 20, 100);
    const offset = parseNonNegativeInt(
      req.query.offset,
      0,
      MAX_PAGINATION_OFFSET
    );
    const author = await getBookshelfAuthorDetails(
      getSettings().readarr,
      req.params.id,
      limit,
      offset
    );
    return author
      ? res.status(200).json({
          works: author.works,
          pagination: {
            ...author.pagination,
            nextOffset: offset + author.works.length,
          },
        })
      : res.status(404).json({ status: 404, message: 'Author not found' });
  }

  const parsedAuthorId = parseOpenLibraryAuthorId(req.params.id);
  if ('error' in parsedAuthorId) {
    return res.status(404).json({ status: 404, message: 'Author not found' });
  }

  const authorId = parsedAuthorId.value;
  const limit = parsePositiveInt(req.query.limit, 20, 100);
  const offset = parseNonNegativeInt(
    req.query.offset,
    0,
    MAX_PAGINATION_OFFSET
  );

  try {
    const authorRequests = await settlePromisesWithin<
      AuthorResponse | AuthorWorksPayload | undefined
    >(
      [
        new OpenLibraryAPI().getAuthor(authorId).catch(() => undefined),
        getAuthorWorksPayload(authorId, limit, offset, req.user),
      ],
      OPENLIBRARY_AUTHOR_REQUEST_TIMEOUT_MS
    );
    const authorResult = authorRequests.results[0] as
      PromiseSettledResult<AuthorResponse | undefined> | undefined;
    const worksResult = authorRequests.results[1] as
      PromiseSettledResult<AuthorWorksPayload> | undefined;

    if (authorRequests.timedOut) {
      logger.warn('Author works request timed out', {
        label: 'Author',
        authorId,
        completedRequests: authorRequests.results.length,
      });
    }

    const author =
      authorResult?.status === 'fulfilled' ? authorResult.value : undefined;
    if (!worksResult) {
      const worksPayload = emptyAuthorWorksPayload(limit, offset);
      return res.status(200).json({
        ...worksPayload,
        works: worksPayload.works.map((work) => ({
          ...work,
          author: author?.name,
          authorId: authorId.replace(/^\/?authors\//, ''),
        })),
      });
    }
    if (worksResult.status === 'rejected') {
      throw worksResult.reason;
    }
    const worksPayload = worksResult.value;

    return res.status(200).json({
      ...worksPayload,
      works: worksPayload.works.map((work) => ({
        ...work,
        author: author?.name ?? work.author,
        authorId: authorId.replace(/^\/?authors\//, ''),
      })),
    });
  } catch (e) {
    logger.error('Failed to retrieve author works', {
      label: 'Author',
      errorMessage: e instanceof Error ? e.message : 'Unknown error',
      authorId,
    });
    return next({ status: 500, message: 'Unable to retrieve author works.' });
  }
});

authorRoutes.get<{ id: string }>('/:id/cover', async (req, res) => {
  const parsedAuthorId = parseOpenLibraryAuthorId(req.params.id);
  const serviceId = parseNonNegativeInt(req.query.serviceId, -1, 100_000);
  const bookshelfAuthorId = parsePositiveInt(
    req.query.bookshelfAuthorId,
    0,
    100_000_000
  );
  if ('error' in parsedAuthorId || serviceId < 0 || !bookshelfAuthorId) {
    return res.status(404).send('Author cover not found');
  }

  const service = getSettings().readarr.find(
    (candidate) =>
      candidate.id === serviceId &&
      candidate.backend !== 'bindery' &&
      candidate.backend !== 'bookorbit'
  );
  if (!service) {
    return res.status(404).send('Author cover not found');
  }

  try {
    const readarr = new ReadarrAPI({
      apiKey: service.apiKey,
      url: ReadarrAPI.buildUrl(service, '/api/v1'),
      mediaType: service.serviceType === 'audiobook' ? 'audiobook' : 'ebook',
    });
    const cover = await readarr.getAuthorCover(bookshelfAuthorId);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('Content-Type', cover.contentType);
    res.setHeader('Content-Length', cover.imageBuffer.length);
    return res.status(200).send(cover.imageBuffer);
  } catch (error) {
    logger.debug('Failed to retrieve Bookshelf author cover fallback.', {
      label: 'Author',
      serviceId,
      authorId: parsedAuthorId.value,
      bookshelfAuthorId,
      errorMessage:
        error instanceof Error ? error.message : 'Unknown cover error',
    });
    return res.status(404).send('Author cover not found');
  }
});

export default authorRoutes;
