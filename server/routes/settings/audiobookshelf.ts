import AudiobookshelfAPI from '@server/api/audiobookshelf';
import { MediaStatus, MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import MediaIdentifier, {
  MediaIdentifierProvider,
} from '@server/entity/MediaIdentifier';
import { Permission } from '@server/lib/permissions';
import type { AudiobookshelfSettings } from '@server/lib/settings';
import { getSettings } from '@server/lib/settings';
import { authorizedMutation } from '@server/middleware/authorizedMutation';
import {
  REDACTED_SECRET,
  isValidHttpUrl,
  redactSecrets,
} from '@server/utils/security';
import { parseServarrConnectionSettings } from '@server/utils/servarrSettings';
import {
  parseBoundedString,
  parseOptionalBoundedString,
} from '@server/utils/validation';
import { Router } from 'express';

const routes = Router();

const parseConnection = (
  body: unknown,
  current?: AudiobookshelfSettings | null
): { value: AudiobookshelfSettings } | { error: string } => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Settings must be an object.' };
  }
  const record = body as Record<string, unknown>;
  const bodyWithSecret =
    current && record.apiKey === REDACTED_SECRET
      ? { ...record, apiKey: current.apiKey }
      : body;
  const connection = parseServarrConnectionSettings(bodyWithSecret);
  if ('error' in connection) return connection;

  const name = parseBoundedString(record.name, {
    fieldName: 'name',
    maxLength: 128,
  });
  if ('error' in name) return name;
  const libraryId = parseBoundedString(record.libraryId, {
    fieldName: 'libraryId',
    maxLength: 256,
  });
  if ('error' in libraryId) return libraryId;
  const libraryName = parseBoundedString(record.libraryName, {
    fieldName: 'libraryName',
    maxLength: 256,
  });
  if ('error' in libraryName) return libraryName;
  const externalUrl = parseOptionalBoundedString(record.externalUrl, {
    fieldName: 'externalUrl',
    maxLength: 512,
  });
  if ('error' in externalUrl) return externalUrl;
  if (externalUrl.value && !isValidHttpUrl(externalUrl.value)) {
    return { error: 'External URL must be a valid HTTP or HTTPS URL.' };
  }
  const proxyUrl = parseOptionalBoundedString(record.proxyUrl, {
    fieldName: 'proxyUrl',
    maxLength: 512,
  });
  if ('error' in proxyUrl) return proxyUrl;
  if (proxyUrl.value?.trim() && !isValidHttpUrl(proxyUrl.value.trim())) {
    return { error: 'Proxy URL must be a valid HTTP or HTTPS URL.' };
  }
  if (
    record.syncEnabled !== undefined &&
    typeof record.syncEnabled !== 'boolean'
  ) {
    return { error: 'Sync enabled must be a boolean.' };
  }

  return {
    value: {
      ...connection.value,
      id: current?.id ?? 1,
      name: name.value.trim(),
      libraryId: libraryId.value.trim(),
      libraryName: libraryName.value.trim(),
      externalUrl: externalUrl.value?.trim() || undefined,
      proxyUrl: proxyUrl.value?.trim().replace(/\/+$/, '') || undefined,
      syncEnabled: record.syncEnabled !== false,
    },
  };
};

routes.get('/', (_req, res) => {
  res.status(200).json(redactSecrets(getSettings().audiobookshelf));
});

routes.post(
  '/test',
  authorizedMutation(Permission.ADMIN, async (req, res) => {
    const current = getSettings().audiobookshelf;
    const body =
      req.body && typeof req.body === 'object' && !Array.isArray(req.body)
        ? (req.body as Record<string, unknown>)
        : req.body;
    const parsed = parseServarrConnectionSettings(
      current &&
        body &&
        typeof body === 'object' &&
        (body as Record<string, unknown>).apiKey === REDACTED_SECRET
        ? { ...(body as Record<string, unknown>), apiKey: current.apiKey }
        : body
    );
    if ('error' in parsed) {
      return res.status(400).json({ message: parsed.error });
    }

    try {
      const libraries = await new AudiobookshelfAPI({
        ...parsed.value,
        id: getSettings().audiobookshelf?.id ?? 1,
        name: 'Audiobookshelf',
        libraryId: '',
        libraryName: '',
        syncEnabled: false,
      }).getLibraries();
      return res.status(200).json({
        libraries: libraries
          .filter((library) => library.mediaType === 'book')
          .map(({ id, name, numBooks }) => ({ id, name, numBooks })),
      });
    } catch (error) {
      return res.status(502).json({
        message:
          error instanceof Error
            ? error.message
            : 'Could not connect to Audiobookshelf.',
      });
    }
  })
);

routes.put(
  '/',
  authorizedMutation(Permission.ADMIN, async (req, res) => {
    const current = getSettings().audiobookshelf;
    const parsed = parseConnection(req.body, current);
    if ('error' in parsed) {
      return res.status(400).json({ message: parsed.error });
    }
    const saved = await getSettings().persistSection(
      'audiobookshelf',
      () => parsed.value
    );
    return res.status(200).json(redactSecrets(saved));
  })
);

routes.delete(
  '/',
  authorizedMutation(Permission.ADMIN, async (_req, res) => {
    const current = getSettings().audiobookshelf;
    if (!current) return res.status(204).end();

    const repository = getRepository(Media);
    const identifierRepository = getRepository(MediaIdentifier);
    const tracked = await repository.find({
      where: {
        mediaType: MediaType.BOOK,
        audiobookLibraryServiceId: current.id,
      },
      relations: { identifiers: true },
    });
    for (const media of tracked) {
      const sourceIdentifier = media.identifiers?.find(
        (identifier) =>
          identifier.provider === MediaIdentifierProvider.AUDIOBOOKSHELF &&
          identifier.value === media.audiobookLibraryItemId
      );
      media.audiobookLibraryServiceId = null;
      media.audiobookLibraryItemId = null;
      if (
        media.status === MediaStatus.AVAILABLE &&
        media.externalServiceId == null &&
        media.audiobookExternalServiceId == null
      ) {
        media.status = MediaStatus.UNKNOWN;
      }
      await repository.save(media);
      if (sourceIdentifier) await identifierRepository.remove(sourceIdentifier);
    }

    await getSettings().persistSection('audiobookshelf', () => null);
    return res.status(204).end();
  })
);

export default routes;
