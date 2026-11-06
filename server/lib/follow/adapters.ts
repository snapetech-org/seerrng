import MusicBrainz from '@server/api/musicbrainz';
import OpenLibraryAPI from '@server/api/openlibrary';
import RanobeDbAPI from '@server/api/ranobedb';
import ROMarrNGAPI from '@server/api/software/romarrng';
import { getRepository } from '@server/datasource';
import type Follow from '@server/entity/Follow';
import MediaRelation from '@server/entity/MediaRelation';
import { compareBookEditions } from '@server/lib/editionCompare';
import { getQuestarrOrUndefined } from '@server/lib/gameDiscovery';
import { normalizeTitle } from '@server/lib/resolve/match';
import { getSettings } from '@server/lib/settings';
import { searchBookshelfCatalogs } from '@server/utils/bookshelfCatalog';
import { tmdbGenre, tmdbNetwork, tmdbPerson, tmdbStudio } from './tmdbAdapters';
import {
  capIds,
  knownIds,
  refNumber,
  refString,
  type AdapterResult,
  type FollowAdapter,
  type NewFollowEvent,
} from './types';

const today = () => {
  const now = new Date();
  return now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
};

/** Returns new events while recording a first-run baseline without history. */
const diff = (
  follow: Follow,
  current: { id: string; event: NewFollowEvent }[],
  extra: Record<string, unknown> = {}
): AdapterResult => {
  const known = knownIds(follow);
  const baseline = !follow.lastCheckedAt;
  const fresh = current.filter((entry) => !known.has(entry.id));
  return {
    events: baseline ? [] : fresh.map((entry) => entry.event),
    cursor: {
      ...extra,
      known: capIds([...known, ...current.map((entry) => entry.id)]),
    },
    baseline,
  };
};

const seriesLanguage: FollowAdapter = async (follow) => {
  const ranobedbId = refNumber(follow, 'ranobedbId');
  const language = follow.conditions?.language ?? 'en';
  if (!ranobedbId) return { events: [], cursor: follow.cursor ?? {} };
  const series = await new RanobeDbAPI().getSeries(ranobedbId);
  const now = today();
  const current = (series.books ?? [])
    .filter((book) => !book.book_type || book.book_type === 'main')
    .filter((book) => !!book.c_release_dates?.[language])
    .map((book) => {
      const date = book.c_release_dates?.[language] ?? 0;
      return {
        id: `${book.id}:${language}`,
        event: {
          dedupeKey: `book:${book.id}:${language}`,
          reasonKey: date > now ? 'nextVolumeAnnounced' : 'newVolumeReleased',
          reasonValues: {
            series: series.title,
            title: book.title,
            language,
            date: String(date),
          },
          title: book.title,
          target: { mediaType: 'search', id: book.title },
        } as NewFollowEvent,
      };
    });
  return diff(follow, current);
};

const narrator: FollowAdapter = async (follow) => {
  const name = follow.subjectLabel;
  const servers = getSettings().readarr.filter(
    (server) => server.serviceType === 'audiobook'
  );
  if (!servers.length) return { events: [], cursor: follow.cursor ?? {} };
  const books = await searchBookshelfCatalogs(servers, name, 'audiobook');
  const wanted = normalizeTitle(name);
  const current = books
    .filter((book) =>
      (book.narrators ?? []).some((entry) => normalizeTitle(entry) === wanted)
    )
    .map((book) => ({
      id: book.id,
      event: {
        dedupeKey: `book:${book.id}`,
        reasonKey: 'newBookByNarrator',
        reasonValues: { narrator: name, title: book.title },
        title: book.title,
        imageUrl: book.posterPath,
        target: { mediaType: 'book', id: book.id, variantKey: name },
      } as NewFollowEvent,
    }));
  return diff(follow, current);
};

const author: FollowAdapter = async (follow) => {
  const authorId = refString(follow, 'authorId');
  if (!authorId) return { events: [], cursor: follow.cursor ?? {} };
  if (!/^OL\d+A$/i.test(authorId)) {
    // Bookshelf-sourced authors have no Open Library id: match by name.
    const servers = getSettings().readarr;
    if (!servers.length) return { events: [], cursor: follow.cursor ?? {} };
    const wanted = normalizeTitle(follow.subjectLabel);
    const books = await searchBookshelfCatalogs(servers, follow.subjectLabel);
    return diff(
      follow,
      books
        .filter((book) => normalizeTitle(book.author ?? '') === wanted)
        .map((book) => ({
          id: book.id,
          event: {
            dedupeKey: `work:${book.id}`,
            reasonKey: 'newBookByAuthor',
            reasonValues: { author: follow.subjectLabel, title: book.title },
            title: book.title,
            imageUrl: book.posterPath,
            target: { mediaType: 'book', id: book.id },
          } as NewFollowEvent,
        }))
    );
  }
  const works = await new OpenLibraryAPI().getAuthorWorks(authorId, {
    limit: 50,
  });
  const current = (works.entries ?? []).map((work) => {
    const id = work.key.replace(/^\/works\//, '');
    return {
      id,
      event: {
        dedupeKey: `work:${id}`,
        reasonKey: 'newBookByAuthor',
        reasonValues: { author: follow.subjectLabel, title: work.title },
        title: work.title,
        target: { mediaType: 'book', id },
      } as NewFollowEvent,
    };
  });
  return diff(follow, current);
};

const edition: FollowAdapter = async (follow) => {
  const mediaId = refNumber(follow, 'mediaId');
  if (!mediaId) return { events: [], cursor: follow.cursor ?? {} };
  const comparison = await compareBookEditions({
    mediaId,
    format: 'audiobook',
  });
  const current = comparison.editions
    .filter((card) => !card.selected)
    .map((card) => ({
      id: card.id,
      event: {
        dedupeKey: `edition:${card.id}`,
        reasonKey:
          card.production === 'full-cast'
            ? 'fullCastProduction'
            : 'newNarrationAvailable',
        reasonValues: {
          title: follow.subjectLabel,
          narrators: card.narrators.join(', '),
        },
        title: follow.subjectLabel,
        imageUrl: card.imageUrl,
        target: { mediaType: 'book', id: String(mediaId), variantKey: card.id },
      } as NewFollowEvent,
    }));
  return diff(follow, current);
};

const expansion: FollowAdapter = async (follow) => {
  const igdbId = refNumber(follow, 'igdbId');
  const api = getQuestarrOrUndefined();
  if (!igdbId || !api) return { events: [], cursor: follow.cursor ?? {} };
  const editions = await api.getGameEditions(igdbId);
  const storyOnly = follow.conditions?.ref?.storyOnly === true;
  const current = editions.addons
    .filter((addon) => !storyOnly || addon.storyContent === true)
    .map((addon) => ({
      id: String(addon.igdbId),
      event: {
        dedupeKey: `addon:${addon.igdbId}`,
        reasonKey: 'newExpansion',
        reasonValues: { game: follow.subjectLabel, title: addon.title },
        title: addon.title,
        imageUrl: addon.coverUrl,
        target: { mediaType: 'game', id: String(igdbId) },
      } as NewFollowEvent,
    }));
  return diff(follow, current);
};

const REISSUE =
  /\b(deluxe|remaster(?:ed)?|reissue|anniversary|expanded|edition)\b/i;

const artistReleaseType: FollowAdapter = async (follow) => {
  const mbid = refString(follow, 'mbid');
  if (!mbid) return { events: [], cursor: follow.cursor ?? {} };
  const include = (follow.conditions?.includeTypes ?? ['Album']).map((value) =>
    value.toLowerCase()
  );
  const exclude = (follow.conditions?.excludeTypes ?? []).map((value) =>
    value.toLowerCase()
  );
  const albums = await new MusicBrainz().searchAlbum({
    query: `arid:${mbid}`,
    limit: 50,
  });
  const current = albums
    .filter((album) => {
      const primary = String(album['primary-type'] ?? '').toLowerCase();
      const secondary = (
        (album as { 'secondary-types'?: string[] })['secondary-types'] ?? []
      ).map((value) => value.toLowerCase());
      if (include.length && !include.includes(primary)) return false;
      if (
        exclude.some((type) => primary === type || secondary.includes(type))
      ) {
        return false;
      }
      return !(exclude.includes('reissue') && REISSUE.test(album.title));
    })
    .map((album) => ({
      id: album.id,
      event: {
        dedupeKey: `album:${album.id}`,
        reasonKey: 'newArtistRelease',
        reasonValues: { artist: follow.subjectLabel, title: album.title },
        title: album.title,
        imageUrl: album.posterPath,
        target: { mediaType: 'album', id: album.id },
      } as NewFollowEvent,
    }));
  return diff(follow, current);
};

const patchProject: FollowAdapter = async (follow) => {
  const projectId = refString(follow, 'projectId');
  const settings = getSettings().softwareAcquisition.romarr;
  if (!projectId || !settings.hostname || !settings.apiKey) {
    return { events: [], cursor: follow.cursor ?? {} };
  }
  const project = await new ROMarrNGAPI(settings).getPatchProject(projectId);
  const current = project.versions.map((version) => ({
    id: version.id,
    event: {
      dedupeKey: `patch:${project.id}:${version.id}`,
      reasonKey: 'newPatchVersion',
      reasonValues: {
        project: project.name,
        version: version.version,
        game: project.game.title,
      },
      title: `${project.name} ${version.version}`,
      imageUrl: project.coverUrl,
      target: {
        mediaType: 'patch',
        id: project.id,
        variantKey: version.id,
      },
    } as NewFollowEvent,
  }));
  return diff(follow, current);
};

const franchise: FollowAdapter = async (follow) => {
  const anchor = refString(follow, 'anchorId');
  const anchorType = refString(follow, 'anchorType') ?? 'anime';
  if (!anchor) return { events: [], cursor: follow.cursor ?? {} };
  const rows = await getRepository(MediaRelation).find({
    where: { fromType: anchorType, fromId: anchor, rejected: false },
  });
  const current = rows.map((row) => ({
    id: `${row.toType}:${row.toId}:${row.relation}`,
    event: {
      dedupeKey: `relation:${row.id}`,
      reasonKey: 'newFranchiseRelation',
      reasonValues: { franchise: follow.subjectLabel, relation: row.relation },
      title: follow.subjectLabel,
      target: { mediaType: row.toType, id: row.toId },
    } as NewFollowEvent,
  }));
  return diff(follow, current);
};

/** Saved discoveries write their own events; the follow only anchors them. */
const savedDiscovery: FollowAdapter = async (follow) => ({
  events: [],
  cursor: follow.cursor ?? {},
});

export const FOLLOW_ADAPTERS: Record<Follow['kind'], FollowAdapter> = {
  'series-language': seriesLanguage,
  narrator,
  author,
  edition,
  expansion,
  'artist-release-type': artistReleaseType,
  'patch-project': patchProject,
  franchise,
  'saved-discovery': savedDiscovery,
  'tmdb-person': tmdbPerson,
  'tmdb-studio': tmdbStudio,
  'tmdb-network': tmdbNetwork,
  'tmdb-genre': tmdbGenre,
};
