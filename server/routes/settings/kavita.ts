import KavitaAPI, { KavitaLibraryType } from '@server/api/kavita';
import { refreshKavitaIndex } from '@server/lib/kavitaReader';
import { Permission } from '@server/lib/permissions';
import type { KavitaSettings } from '@server/lib/settings';
import { getSettings } from '@server/lib/settings';
import { authorizedMutation } from '@server/middleware/authorizedMutation';
import {
  REDACTED_SECRET,
  isValidHttpUrl,
  redactSecrets,
} from '@server/utils/security';
import { parseServarrConnectionSettings } from '@server/utils/servarrSettings';
import { trimTrailingSlashes } from '@server/utils/serviceUrl';
import { parseOptionalBoundedString } from '@server/utils/validation';
import { Router } from 'express';

const routes = Router();

/** Validates a Kavita connection. A redacted API key keeps the saved key. */
export const parseKavitaSettings = (
  body: unknown,
  current?: KavitaSettings | null
): { value: KavitaSettings } | { error: string } => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Settings must be an object.' };
  }
  const record = body as Record<string, unknown>;
  const connection = parseServarrConnectionSettings(
    current && record.apiKey === REDACTED_SECRET
      ? { ...record, apiKey: current.apiKey }
      : record
  );
  if ('error' in connection) return connection;

  const externalUrl = parseOptionalBoundedString(record.externalUrl, {
    fieldName: 'externalUrl',
    maxLength: 512,
  });
  if ('error' in externalUrl) return externalUrl;
  const external = externalUrl.value?.trim();
  if (external && !isValidHttpUrl(external)) {
    return { error: 'External URL must be a valid HTTP or HTTPS URL.' };
  }

  const { hostname, port, apiKey, useSsl, baseUrl } = connection.value;
  return {
    value: {
      hostname,
      port,
      apiKey,
      useSsl,
      ...(baseUrl ? { baseUrl } : {}),
      ...(external ? { externalUrl: trimTrailingSlashes(external) } : {}),
    },
  };
};

const READABLE_TYPES = new Set<number>([
  KavitaLibraryType.Manga,
  KavitaLibraryType.Comic,
  KavitaLibraryType.ComicVine,
]);

routes.get('/', (_req, res) => {
  res.status(200).json(redactSecrets(getSettings().kavita));
});

routes.post(
  '/test',
  authorizedMutation(Permission.ADMIN, async (req, res) => {
    const parsed = parseKavitaSettings(req.body, getSettings().kavita);
    if ('error' in parsed) {
      return res.status(400).json({ message: parsed.error });
    }
    try {
      const libraries = await new KavitaAPI(parsed.value).getLibraries();
      return res.status(200).json({
        libraries: libraries
          .filter((library) => READABLE_TYPES.has(library.type))
          .map(({ id, name, type }) => ({
            id,
            name,
            type: type === KavitaLibraryType.Manga ? 'manga' : 'comic',
          })),
      });
    } catch (error) {
      return res.status(502).json({
        message:
          error instanceof Error
            ? error.message
            : 'Could not connect to Kavita.',
      });
    }
  })
);

routes.put(
  '/',
  authorizedMutation(Permission.ADMIN, async (req, res) => {
    const parsed = parseKavitaSettings(req.body, getSettings().kavita);
    if ('error' in parsed) {
      return res.status(400).json({ message: parsed.error });
    }
    const saved = await getSettings().persistSection(
      'kavita',
      () => parsed.value
    );
    // match the comics against the new server without waiting for it
    void refreshKavitaIndex().catch(() => undefined);
    return res.status(200).json(redactSecrets(saved));
  })
);

routes.delete(
  '/',
  authorizedMutation(Permission.ADMIN, async (_req, res) => {
    await getSettings().persistSection('kavita', () => null);
    await refreshKavitaIndex();
    return res.status(204).end();
  })
);

export default routes;
