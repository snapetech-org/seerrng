import { getArtistPoster } from '@server/api/artistArtwork';
import { getArtistOverview } from '@server/api/artistOverview';
import MusicBrainz from '@server/api/musicbrainz';
import TheMovieDb from '@server/api/themoviedb';
import Tvdb from '@server/api/tvdb';
import { getRepository } from '@server/datasource';
import MetadataAlbum from '@server/entity/MetadataAlbum';
import type { CuratedCollection } from '@server/models/CuratedCollection';
import { mapWithConcurrency } from '@server/utils/concurrency';
import { In } from 'typeorm';
import { getTvCollectionName } from './collectionName';

export const getCuratedCollection = async (
  kind: 'tv' | 'music',
  id: string
): Promise<CuratedCollection> => {
  if (kind === 'music') {
    const artist = await new MusicBrainz().getArtistAlbumCollection(id);
    const [biography, posterPath] = await Promise.all([
      getArtistOverview(id, artist.links),
      getArtistPoster(id),
    ]);
    const cached = artist.albums.length
      ? await getRepository(MetadataAlbum).find({
          where: { mbAlbumId: In(artist.albums.map((album) => album.id)) },
          select: { mbAlbumId: true, caaUrl: true },
        })
      : [];
    const covers = new Map(
      cached
        .filter((item) => item.caaUrl)
        .map((item) => [item.mbAlbumId, item.caaUrl as string])
    );
    return {
      id,
      kind,
      name: `${artist.name} Collection`,
      overview: biography?.text ?? `Albums credited to ${artist.name}.`,
      overviewSource: biography?.source,
      sourceUrl: `https://musicbrainz.org/artist/${id}`,
      posterPath,
      parts: artist.albums.map((album) => ({
        id: album.id,
        title: album.title,
        releaseDate: album['first-release-date'],
        posterPath: covers.get(album.id),
        network: artist.name,
        primaryType: album['primary-type'],
        secondaryTypes: album['secondary-types'] ?? [],
        subtitle: [
          album['primary-type'],
          ...(album['secondary-types'] ?? []),
        ].join(' · '),
        genres: (album.genres ?? [])
          .filter((genre) => genre.count > 0)
          .map((genre) => genre.name),
      })),
    };
  }
  const list = await (await Tvdb.getInstance()).getSeriesCollection(Number(id));
  const tmdb = new TheMovieDb();
  // Never silently omit an unmapped title and mistake an incomplete response for a full collection.
  const shows = await mapWithConcurrency(list.seriesIds, 4, (tvdbId) =>
    tmdb.getShowByTvdbId({ tvdbId })
  );
  if (shows.some((show) => !Number.isSafeInteger(show.id) || show.id <= 0))
    throw new Error('A collection title could not be mapped');
  return {
    id,
    kind,
    name: getTvCollectionName(list.name),
    overview: list.overview,
    backdropPath: shows[0]?.backdrop_path,
    sourceUrl: `https://thetvdb.com/lists/${id}`,
    parts: [...new Map(shows.map((show) => [show.id, show])).values()].map(
      (show) => ({
        id: String(show.id),
        title: show.name,
        releaseDate: show.first_air_date,
        status: show.status,
        originalLanguage: show.original_language,
        posterPath: show.poster_path,
        overview: show.overview,
        subtitle: show.created_by?.map((person) => person.name).join(', '),
        runtime: show.episode_run_time?.[0],
        network: show.networks?.map((network) => network.name).join(', '),
        voteAverage: show.vote_average,
        voteCount: show.vote_count,
        genres: show.genres.map((genre) => genre.name),
        genreIds: show.genres.map((genre) => genre.id),
      })
    ),
  };
};
