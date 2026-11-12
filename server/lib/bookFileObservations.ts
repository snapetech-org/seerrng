import { MediaStatus, MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import MediaIdentifier, {
  MediaIdentifierProvider,
} from '@server/entity/MediaIdentifier';
import { hasBookFileEvidence } from '@server/lib/bookAvailability';
import { In } from 'typeorm';

// Older scans can leave a catalog identity and its file observation on different
// media rows. Join observations only through an exact, service-scoped provider
// book ID, never by title or a bare provider ID. This is a read projection: do not
// merge/delete persisted media, requests, identifiers, or user-owned relations.
const keys = (media: Media): string[] => [
  ...(media.serviceId != null && media.externalServiceId != null
    ? [`ebook:${media.serviceId}:${media.externalServiceId}`]
    : []),
  ...(media.audiobookServiceId != null &&
  media.audiobookExternalServiceId != null
    ? [
        `audiobook:${media.audiobookServiceId}:${media.audiobookExternalServiceId}`,
      ]
    : []),
];

export async function projectBookFileObservations(
  items: Media[]
): Promise<Map<number, Media>> {
  const found = new Map(
    items.filter((m) => m.mediaType === MediaType.BOOK).map((m) => [m.id, m])
  );
  const foreignIds = new Map<number, string[]>();
  const scopedKeys = (media: Media): string[] => [
    ...keys(media),
    ...(foreignIds.get(media.id) ?? []).flatMap((value) => [
      ...(media.serviceId != null
        ? [`foreign-ebook:${media.serviceId}:${encodeURIComponent(value)}`]
        : []),
      ...(media.audiobookServiceId != null
        ? [
            `foreign-audiobook:${media.audiobookServiceId}:${encodeURIComponent(value)}`,
          ]
        : []),
    ]),
  ];
  const queried = new Set<string>();
  for (let depth = 0; depth < 8; depth++) {
    const unknown = [...found.keys()].filter((id) => !foreignIds.has(id));
    for (let offset = 0; offset < unknown.length; offset += 100) {
      const batch = unknown.slice(offset, offset + 100);
      batch.forEach((id) => foreignIds.set(id, []));
      const identifiers = await getRepository(MediaIdentifier).find({
        where: {
          media: { id: In(batch) },
          provider: MediaIdentifierProvider.READARR,
        },
        relations: { media: true },
      });
      for (const identifier of identifiers)
        if (identifier.media && identifier.value)
          foreignIds.get(identifier.media.id)?.push(identifier.value);
    }
    const pending = [
      ...new Set([...found.values()].flatMap(scopedKeys)),
    ].filter((key) => !queried.has(key));
    if (!pending.length) break;
    for (let offset = 0; offset < pending.length; offset += 100) {
      const batch = pending.slice(offset, offset + 100);
      batch.forEach((key) => queried.add(key));
      const matches = await getRepository(Media).find({
        where: batch.map((key) => {
          const [format, service, external] = key.split(':');
          if (format.startsWith('foreign-')) {
            return {
              mediaType: MediaType.BOOK,
              ...(format === 'foreign-ebook'
                ? { serviceId: Number(service) }
                : { audiobookServiceId: Number(service) }),
              identifiers: {
                provider: MediaIdentifierProvider.READARR,
                value: decodeURIComponent(external),
              },
            };
          }
          return format === 'ebook'
            ? {
                mediaType: MediaType.BOOK,
                serviceId: Number(service),
                externalServiceId: Number(external),
              }
            : {
                mediaType: MediaType.BOOK,
                audiobookServiceId: Number(service),
                audiobookExternalServiceId: Number(external),
              };
        }),
        take: 5000,
      });
      for (const match of matches)
        if (!found.has(match.id)) found.set(match.id, match);
    }
  }
  const byKey = new Map<string, Media[]>();
  for (const media of found.values())
    for (const key of scopedKeys(media))
      byKey.set(key, [...(byKey.get(key) ?? []), media]);
  return new Map(
    items.map((item) => {
      if (
        item.mediaType !== MediaType.BOOK ||
        [MediaStatus.BLOCKLISTED, MediaStatus.DELETED].includes(item.status)
      )
        return [item.id, item];
      const related = new Map<number, Media>([[item.id, item]]);
      const queue = [item];
      for (let i = 0; i < queue.length; i++)
        for (const key of scopedKeys(queue[i]))
          for (const candidate of byKey.get(key) ?? []) {
            if (!related.has(candidate.id)) {
              related.set(candidate.id, candidate);
              queue.push(candidate);
            }
          }
      if (related.size === 1) return [item.id, item];
      const confirmed = [...related.values()]
        .filter((m) =>
          [MediaStatus.AVAILABLE, MediaStatus.PARTIALLY_AVAILABLE].includes(
            m.status
          )
        )
        .sort((a, b) => a.id - b.id);
      const result = new Media({ ...item });
      // A pending row may retain stale player references. They cannot become
      // evidence merely because another format has confirmed files.
      result.audiobookLibraryServiceId = null;
      result.audiobookLibraryItemId = null;
      result.hasPlexAudiobookFile = false;
      result.ratingKey = null;
      result.availableEbookServiceIds = [
        ...new Set(confirmed.flatMap((m) => m.availableEbookServiceIds ?? [])),
      ];
      result.availableAudiobookServiceIds = [
        ...new Set(
          confirmed.flatMap((m) => m.availableAudiobookServiceIds ?? [])
        ),
      ];
      const abs = confirmed.find(
        (m) => m.audiobookLibraryServiceId != null && !!m.audiobookLibraryItemId
      );
      if (abs) {
        result.audiobookLibraryServiceId = abs.audiobookLibraryServiceId;
        result.audiobookLibraryItemId = abs.audiobookLibraryItemId;
      }
      const plex = confirmed.find((m) => m.hasPlexAudiobookFile || m.ratingKey);
      if (plex) {
        result.hasPlexAudiobookFile =
          plex.hasPlexAudiobookFile === true || !!plex.ratingKey;
        result.ratingKey = plex.ratingKey;
      }
      if (
        hasBookFileEvidence(result, 'ebook') ||
        hasBookFileEvidence(result, 'audiobook')
      )
        result.status = MediaStatus.AVAILABLE;
      return [item.id, result];
    })
  );
}
