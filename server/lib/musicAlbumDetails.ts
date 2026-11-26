import type ListenBrainzAPI from '@server/api/listenbrainz';
import type { LbAlbumDetails } from '@server/api/listenbrainz/interfaces';
import type MusicBrainz from '@server/api/musicbrainz';
import type { MbAlbumDetails } from '@server/api/musicbrainz/interfaces';
import logger from '@server/logger';

/**
 * An album's details from ListenBrainz, or from MusicBrainz when ListenBrainz
 * has no data for it (new and less-known albums answer 404 there). Shared by
 * the album page, notifications, the watchlist and the association graph.
 */
export class AlbumDetailsNotFoundError extends Error {
  constructor(message = 'Album not found') {
    super(message);
  }
}

const withTimeout = <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  let timer: NodeJS.Timeout | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error('Album lookup timed out.')),
        timeoutMs
      );
      timer.unref?.();
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
};

export const mapMusicBrainzReleaseGroupToListenBrainzAlbum = (
  album: MbAlbumDetails
): LbAlbumDetails => {
  const primaryArtist = album['artist-credit']?.[0]?.artist;
  const firstReleaseId = album.releases?.[0]?.id ?? '';

  return {
    caa_id: 0,
    caa_release_mbid: firstReleaseId,
    listening_stats: {
      artist_mbids: primaryArtist?.id ? [primaryArtist.id] : [],
      artist_name:
        album['artist-credit']?.[0]?.name ?? primaryArtist?.name ?? '',
      caa_id: 0,
      caa_release_mbid: firstReleaseId,
      from_ts: 0,
      last_updated: 0,
      listeners: [],
      release_group_mbid: album.id,
      release_group_name: album.title,
      stats_range: '',
      to_ts: 0,
      total_listen_count: 0,
      total_user_count: 0,
    },
    mediums: [],
    recordings_release_mbid: '',
    release_group_mbid: album.id,
    release_group_metadata: {
      artist: {
        artist_credit_id: 0,
        name: album['artist-credit']?.[0]?.name ?? primaryArtist?.name ?? '',
        artists: primaryArtist
          ? [
              {
                area: '',
                artist_mbid: primaryArtist.id,
                begin_year: 0,
                join_phrase: '',
                name: primaryArtist.name,
                rels: {},
                type: '',
              },
            ]
          : [],
      },
      release: {
        caa_id: 0,
        caa_release_mbid: firstReleaseId,
        date: album['first-release-date'] ?? '',
        name: album.title,
        rels: [],
        type: album['primary-type'] ?? 'Album',
      },
      release_group: {
        caa_id: 0,
        caa_release_mbid: '',
        date: album['first-release-date'] ?? '',
        name: album.title,
        rels: [],
        type: album['primary-type'] ?? 'Album',
      },
      tag: {
        artist: [],
        release_group: (album.tags ?? []).map((tag) => ({
          count: tag.count,
          genre_mbid: '',
          tag: tag.name,
        })),
      },
    },
    type: album['primary-type'] ?? 'Album',
    secondaryTypes: album['secondary-types'] ?? [],
  };
};

export const getAlbumDetails = async (
  mbId: string,
  listenbrainz: ListenBrainzAPI,
  musicbrainz: MusicBrainz,
  {
    // The album page asks both providers at once: the MusicBrainz answer is
    // needed either way (the taxonomy below, or the fallback), and waiting for
    // ListenBrainz first only adds its round trip to every cold album page.
    // Other callers only need a name and art, so they ask MusicBrainz (one call
    // a second) only when ListenBrainz does not know the album.
    askMusicBrainzAlongside = true,
    // the album's songs from MusicBrainz when ListenBrainz has none (the album
    // page lists them; callers that only need the artist skip the lookup)
    withSongs = true,
  }: { askMusicBrainzAlongside?: boolean; withSongs?: boolean } = {}
) => {
  let lookup: Promise<MbAlbumDetails> | undefined;
  const releaseGroupLookup = () =>
    (lookup ??= musicbrainz.getReleaseGroupDetails({ releaseGroupId: mbId }));
  if (askMusicBrainzAlongside) {
    // read below on both paths; never an unhandled rejection meanwhile
    releaseGroupLookup().catch(() => undefined);
  }
  try {
    const details = await listenbrainz.getAlbum(mbId);
    if (!askMusicBrainzAlongside) return details;
    // ListenBrainz's type alone omits release-group secondary types.
    // Keep the richer track data, but use the same taxonomy as collections.
    const releaseGroup = await releaseGroupLookup().catch(() => null);
    return releaseGroup
      ? {
          ...details,
          type: releaseGroup['primary-type'] ?? details.type,
          secondaryTypes: releaseGroup['secondary-types'] ?? [],
        }
      : details;
  } catch (error) {
    logger.warn('ListenBrainz album details unavailable; using MusicBrainz', {
      label: 'Music API',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      mbId,
    });

    let album: MbAlbumDetails;
    try {
      album = await releaseGroupLookup();
    } catch (musicBrainzError) {
      const errorMessage =
        musicBrainzError instanceof Error
          ? musicBrainzError.message
          : 'Unknown error';

      if (errorMessage.includes('status code 404')) {
        throw new AlbumDetailsNotFoundError();
      }

      throw musicBrainzError;
    }

    // ListenBrainz has no data for new or less-known albums: the songs come
    // from one of the album's MusicBrainz releases, or the page has none
    const mapped = mapMusicBrainzReleaseGroupToListenBrainzAlbum(album);
    if (withSongs && mapped.caa_release_mbid) {
      const mediums = await withTimeout(
        musicbrainz.getReleaseMediums({ releaseId: mapped.caa_release_mbid }),
        ALBUM_FALLBACK_TRACKS_TIMEOUT_MS
      ).catch(() => []);
      if (mediums.length) {
        mapped.mediums = mediums;
        mapped.recordings_release_mbid = mapped.caa_release_mbid;
      }
    }
    return mapped;
  }
};

// MusicBrainz allows about one call a second: a busy minute must not hold the
// album page; it then shows without its song list
const ALBUM_FALLBACK_TRACKS_TIMEOUT_MS = 4_000;
