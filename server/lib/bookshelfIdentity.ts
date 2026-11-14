import ReadarrAPI, { type ChaptarrDialect } from '@server/api/servarr/readarr';
import { normalizeValidIsbn } from '@server/lib/isbn';
import type { ReadarrSettings } from '@server/lib/settings';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import {
  makeBookshelfBookId,
  parseBookshelfBookId,
} from '@server/utils/bookshelfCatalog';

/**
 * ChaptarrNG library reads used to mint catalog ids from the facade's bare
 * provider ids (bookshelf:<service>:459744); they are now qualified like
 * lookups (bookshelf:<service>:hc:459744). Media, request and bookmark rows
 * keep the old spelling, so book matching treats both spellings of one work
 * on one service as the same identity. Only the service's own dialect is
 * bridged: a bare Goodreads number never matches a Hardcover id.
 */

const BARE_PROVIDER_ID = /^[1-9]\d{0,19}$/;
const DIALECT_PROVIDER_ID: Record<ChaptarrDialect, RegExp> = {
  hc: /^(?:hc|hardcover|metadata-api):([1-9]\d{0,19})$/i,
  gr: /^(?:gr|goodreads):([1-9]\d{0,19})$/i,
};
const ALIASABLE_PROVIDER_ID =
  /^(?:(?:hc|hardcover|metadata-api|gr|goodreads):)?[1-9]\d{0,19}$/i;
const DETECTION_RETRY_MS = 60_000;

const pendingDetections = new Map<string, Promise<void>>();
const failedDetections = new Map<string, number>();

/** Every catalog id of one work on one service, for that service's dialect. */
export const getBookshelfBookIdAliases = (
  bookshelfId: string,
  dialect?: ChaptarrDialect | null
): string[] => {
  const parsed = parseBookshelfBookId(bookshelfId);
  if (!parsed || !dialect) return [bookshelfId];
  const value = parsed.foreignBookId.trim();
  const bare = BARE_PROVIDER_ID.test(value)
    ? normalizeValidIsbn(value)
      ? undefined
      : value
    : DIALECT_PROVIDER_ID[dialect].exec(value)?.[1];
  if (!bare) return [bookshelfId];
  return [
    ...new Set([
      bookshelfId,
      makeBookshelfBookId(parsed.serviceId, bare),
      makeBookshelfBookId(parsed.serviceId, `${dialect}:${bare}`),
    ]),
  ];
};

const isLibraryService = (server: ReadarrSettings): boolean =>
  server.backend !== 'bindery' && server.backend !== 'bookorbit';

/** The dialect a service's library ids carry, when this process has seen it. */
export const getKnownBookshelfServiceDialect = (
  server: ReadarrSettings
): ChaptarrDialect | undefined =>
  isLibraryService(server)
    ? (ReadarrAPI.getKnownLibraryIdDialect(
        ReadarrAPI.buildUrl(server, '/api/v1')
      ) ?? undefined)
    : undefined;

/** Like getKnownBookshelfServiceDialect, detecting the service once if needed. */
export const resolveBookshelfServiceDialect = async (
  server: ReadarrSettings
): Promise<ChaptarrDialect | undefined> => {
  if (!isLibraryService(server)) return undefined;
  const url = ReadarrAPI.buildUrl(server, '/api/v1');
  const known = ReadarrAPI.getKnownLibraryIdDialect(url);
  if (known !== undefined) return known ?? undefined;
  if ((failedDetections.get(url) ?? 0) > Date.now()) return undefined;

  let pending = pendingDetections.get(url);
  if (!pending) {
    pending = new ReadarrAPI({
      apiKey: server.apiKey,
      url,
      mediaType: server.serviceType === 'audiobook' ? 'audiobook' : 'ebook',
    })
      .ensureCapabilities()
      .catch((error) => {
        failedDetections.set(url, Date.now() + DETECTION_RETRY_MS);
        logger.debug('Bookshelf identity dialect detection failed.', {
          label: 'Bookshelf Identity',
          serviceId: server.id,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      })
      .finally(() => pendingDetections.delete(url));
    pendingDetections.set(url, pending);
  }
  await pending;
  return ReadarrAPI.getKnownLibraryIdDialect(url) ?? undefined;
};

/**
 * Maps each catalog id that has other spellings on its service to all of
 * them (the id itself first). Ids without aliases are omitted. Read paths
 * rely on the dialect this process already detected while reading the
 * catalog; `detect` lets a write path ask the service once when it has not.
 */
export const expandBookshelfBookIds = async (
  ids: string[],
  servers?: ReadarrSettings[],
  options: { detect?: boolean } = {}
): Promise<Map<string, string[]>> => {
  const expanded = new Map<string, string[]>();
  const candidates = [...new Set(ids)].flatMap((id) => {
    const parsed = parseBookshelfBookId(id);
    return parsed && ALIASABLE_PROVIDER_ID.test(parsed.foreignBookId.trim())
      ? [{ id, serviceId: parsed.serviceId }]
      : [];
  });
  if (!candidates.length) return expanded;

  let configured = servers;
  if (!configured) {
    try {
      configured = getSettings().readarr;
    } catch {
      return expanded;
    }
  }
  const dialects = new Map<number, Promise<ChaptarrDialect | undefined>>();
  for (const { serviceId } of candidates) {
    if (dialects.has(serviceId)) continue;
    const server = configured.find((entry) => entry.id === serviceId);
    dialects.set(
      serviceId,
      !server
        ? Promise.resolve(undefined)
        : options.detect
          ? resolveBookshelfServiceDialect(server).catch(() => undefined)
          : Promise.resolve(getKnownBookshelfServiceDialect(server))
    );
  }
  for (const { id, serviceId } of candidates) {
    const aliases = getBookshelfBookIdAliases(
      id,
      await dialects.get(serviceId)
    );
    if (aliases.length > 1) expanded.set(id, aliases);
  }
  return expanded;
};
