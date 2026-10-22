import type {
  OpenLibraryEdition,
  OpenLibrarySearchDoc,
} from '@server/api/openlibrary';
import { MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import MediaIdentifier, {
  MediaIdentifierProvider,
} from '@server/entity/MediaIdentifier';
import type { User } from '@server/entity/User';
import {
  isValidOpenLibraryResourceId,
  normalizeOpenLibraryEditionId,
  normalizeOpenLibraryWorkId,
} from '@server/lib/externalIds';
import { normalizeValidIsbn } from '@server/lib/isbn';
import { hydrateMediaSummaryRelations } from '@server/lib/mediaSummaryHydration';
import { parseBookshelfBookId } from '@server/utils/bookshelfCatalog';
import { Brackets, In } from 'typeorm';

type BookMediaLookupResult = {
  id: string;
  provider?: 'openlibrary' | 'bookshelf';
  isbn13?: string;
  isbnCandidates?: { isbn: string }[];
};

const MAX_IDENTIFIER_LOOKUPS = 200;
const MAX_ISBN_INPUT_LENGTH = 32;

type IdentifierLookup = {
  provider: MediaIdentifierProvider;
  value: string;
};

const getBookResultIdentifier = (
  book: BookMediaLookupResult
): IdentifierLookup | undefined => {
  const bookshelfId =
    book.provider === 'openlibrary' ? undefined : parseBookshelfBookId(book.id);

  if (book.provider === 'bookshelf') {
    return bookshelfId
      ? { provider: MediaIdentifierProvider.BOOKSHELF, value: book.id }
      : undefined;
  }

  if (bookshelfId) {
    return { provider: MediaIdentifierProvider.BOOKSHELF, value: book.id };
  }

  const workId = normalizeOpenLibraryWorkId(book.id);
  return isValidOpenLibraryResourceId(workId)
    ? { provider: MediaIdentifierProvider.OPENLIBRARY, value: workId }
    : undefined;
};

const getBookResultIsbns = (book: BookMediaLookupResult): string[] => {
  const candidates = [
    ...(book.isbn13 ? [book.isbn13] : []),
    ...(book.isbnCandidates ?? [])
      .slice(0, MAX_IDENTIFIER_LOOKUPS)
      .map((candidate) => candidate?.isbn),
  ].filter(
    (isbn): isbn is string =>
      typeof isbn === 'string' && isbn.length <= MAX_ISBN_INPUT_LENGTH
  );

  return [
    ...new Set(
      candidates
        .map((isbn) => normalizeValidIsbn(isbn))
        .filter((isbn): isbn is string => !!isbn)
    ),
  ];
};

const uniqIdentifierLookups = (
  lookups: IdentifierLookup[]
): IdentifierLookup[] => {
  const seen = new Set<string>();
  const unique: IdentifierLookup[] = [];

  for (const lookup of lookups) {
    const key = `${lookup.provider}:${lookup.value}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(lookup);

    if (unique.length >= MAX_IDENTIFIER_LOOKUPS) {
      break;
    }
  }

  return unique;
};

const getSearchDocIsbns = (doc: OpenLibrarySearchDoc): string[] => [
  ...new Set(
    (doc.isbn ?? [])
      .map((isbn) => normalizeValidIsbn(isbn))
      .filter((isbn): isbn is string => !!isbn)
  ),
];

const getEditionIsbns = (editions: OpenLibraryEdition[]): string[] => [
  ...new Set(
    editions
      .flatMap((edition) => [
        ...(edition.isbn_13 ?? []),
        ...(edition.isbn_10 ?? []),
      ])
      .map((isbn) => normalizeValidIsbn(isbn))
      .filter((isbn): isbn is string => !!isbn)
  ),
];

const findBookMediaByIdentifiers = async (
  lookups: IdentifierLookup[],
  user?: User,
  options: { includeIssues?: boolean } = {}
): Promise<Map<string, Media>> => {
  const uniqueLookups = uniqIdentifierLookups(lookups);

  if (!uniqueLookups.length) {
    return new Map();
  }

  const groupedLookups = uniqueLookups.reduce((acc, lookup) => {
    const values = acc.get(lookup.provider) ?? [];
    values.push(lookup.value);
    acc.set(lookup.provider, values);
    return acc;
  }, new Map<MediaIdentifierProvider, string[]>());

  // Resolve identifiers separately from relation hydration. Joining up to 200
  // identifiers directly through requests, watchlists, issues, and comments
  // multiplies all of those relation counts into one potentially enormous
  // intermediate result set.
  const identifiers = await getRepository(MediaIdentifier)
    .createQueryBuilder('identifier')
    .innerJoin('identifier.media', 'media')
    .select('identifier.provider', 'provider')
    .addSelect('identifier.value', 'value')
    .addSelect('media.id', 'mediaId')
    .where(
      new Brackets((query) => {
        [...groupedLookups.entries()].forEach(([provider, values], index) => {
          query.orWhere(
            `(identifier.provider = :provider${index} AND identifier.value IN (:...values${index}))`,
            {
              [`provider${index}`]: provider,
              [`values${index}`]: values,
            }
          );
        });
      })
    )
    .getRawMany<{
      provider: MediaIdentifierProvider;
      value: string;
      mediaId: number | string;
    }>();

  const mediaIds = [
    ...new Set(
      identifiers
        .map(({ mediaId }) => Number(mediaId))
        .filter((id) => Number.isSafeInteger(id) && id > 0)
    ),
  ];
  const media = mediaIds.length
    ? await getRepository(Media).find({
        where: { id: In(mediaIds), mediaType: MediaType.BOOK },
        relations: {
          ...(options.includeIssues
            ? {
                issues: {
                  createdBy: true,
                  modifiedBy: true,
                  comments: {
                    user: true,
                  },
                },
              }
            : {}),
        },
        // Separate relation queries prevent issues and comments from forming a
        // cartesian product for the same media row.
        relationLoadStrategy: 'query',
      })
    : [];
  await hydrateMediaSummaryRelations(media, user);
  const mediaById = new Map(media.map((item) => [item.id, item]));

  const mediaByIdentifier = new Map<string, Media>();

  identifiers
    .map((identifier) => ({
      identifier,
      media: mediaById.get(Number(identifier.mediaId)),
    }))
    .filter(
      (
        entry
      ): entry is { identifier: (typeof identifiers)[number]; media: Media } =>
        !!entry.media
    )
    .forEach((identifier) => {
      mediaByIdentifier.set(
        `${identifier.identifier.provider}:${identifier.identifier.value}`,
        identifier.media
      );
    });

  return mediaByIdentifier;
};

export const findBookMediaByOpenLibraryIds = async (
  ids: string[],
  user?: User
): Promise<Map<string, Media>> => {
  const normalizedIds = ids.map(normalizeOpenLibraryWorkId);
  const mediaByIdentifier = await findBookMediaByIdentifiers(
    normalizedIds.map((value) => ({
      provider: MediaIdentifierProvider.OPENLIBRARY,
      value,
    })),
    user
  );

  return new Map(
    normalizedIds.flatMap((value) => {
      const media = mediaByIdentifier.get(
        `${MediaIdentifierProvider.OPENLIBRARY}:${value}`
      );
      return media ? [[value, media] as const] : [];
    })
  );
};

export const findBookMediaForSearchDocs = async (
  docs: OpenLibrarySearchDoc[],
  user?: User
): Promise<Map<string, Media>> => {
  const lookups = docs.flatMap((doc) => {
    const workId = doc.key ? normalizeOpenLibraryWorkId(doc.key) : undefined;
    const isbnLookups = getSearchDocIsbns(doc).map((isbn) => ({
      provider: MediaIdentifierProvider.ISBN,
      value: isbn,
    }));

    return [
      ...(workId
        ? [{ provider: MediaIdentifierProvider.OPENLIBRARY, value: workId }]
        : []),
      ...isbnLookups,
    ];
  });
  const mediaByIdentifier = await findBookMediaByIdentifiers(lookups, user);
  const mediaByWorkId = new Map<string, Media>();

  docs.forEach((doc) => {
    const workId = doc.key ? normalizeOpenLibraryWorkId(doc.key) : undefined;
    const media =
      (workId
        ? mediaByIdentifier.get(
            `${MediaIdentifierProvider.OPENLIBRARY}:${workId}`
          )
        : undefined) ??
      getSearchDocIsbns(doc)
        .map((isbn) =>
          mediaByIdentifier.get(`${MediaIdentifierProvider.ISBN}:${isbn}`)
        )
        .find((matchedMedia): matchedMedia is Media => !!matchedMedia);

    if (workId && media) {
      mediaByWorkId.set(workId, media);
    }
  });

  return mediaByWorkId;
};

export const findBookMediaForBookResults = async (
  books: BookMediaLookupResult[],
  user?: User
): Promise<Map<string, Media>> => {
  const lookups = books.flatMap((book) => {
    const identifier = getBookResultIdentifier(book);
    if (!identifier) {
      return [];
    }

    return [
      identifier,
      ...getBookResultIsbns(book).map((isbn) => ({
        provider: MediaIdentifierProvider.ISBN,
        value: isbn,
      })),
    ];
  });
  const mediaByIdentifier = await findBookMediaByIdentifiers(lookups, user);
  const mediaByBookId = new Map<string, Media>();

  books.forEach((book) => {
    const identifier = getBookResultIdentifier(book);
    if (!identifier) {
      return;
    }

    const media =
      mediaByIdentifier.get(`${identifier.provider}:${identifier.value}`) ??
      getBookResultIsbns(book)
        .map((isbn) =>
          mediaByIdentifier.get(`${MediaIdentifierProvider.ISBN}:${isbn}`)
        )
        .find((matchedMedia): matchedMedia is Media => !!matchedMedia);

    if (media) {
      mediaByBookId.set(identifier.value, media);
    }
  });

  return mediaByBookId;
};

export const findBookMediaForWork = async (
  workId: string,
  editions: OpenLibraryEdition[],
  user?: User
): Promise<Media | undefined> => {
  const editionLookups = editions
    .map((edition) =>
      edition.key ? normalizeOpenLibraryEditionId(edition.key) : undefined
    )
    .filter((editionId): editionId is string => !!editionId)
    .map((editionId) => ({
      provider: MediaIdentifierProvider.OPENLIBRARY_EDITION,
      value: editionId,
    }));
  const isbnLookups = getEditionIsbns(editions).map((isbn) => ({
    provider: MediaIdentifierProvider.ISBN,
    value: isbn,
  }));
  const mediaByIdentifier = await findBookMediaByIdentifiers(
    [
      { provider: MediaIdentifierProvider.OPENLIBRARY, value: workId },
      ...editionLookups,
      ...isbnLookups,
    ],
    user,
    { includeIssues: true }
  );

  return (
    mediaByIdentifier.get(`${MediaIdentifierProvider.OPENLIBRARY}:${workId}`) ??
    editionLookups
      .map((lookup) =>
        mediaByIdentifier.get(`${lookup.provider}:${lookup.value}`)
      )
      .find((media): media is Media => !!media) ??
    isbnLookups
      .map((lookup) =>
        mediaByIdentifier.get(`${lookup.provider}:${lookup.value}`)
      )
      .find((media): media is Media => !!media)
  );
};
