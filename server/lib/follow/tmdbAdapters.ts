import TheMovieDb from '@server/api/themoviedb';
import type { TmdbPersonCredit } from '@server/api/themoviedb/interfaces';
import { MediaType } from '@server/constants/media';
import type Follow from '@server/entity/Follow';
import { filterVideoItemsForUser } from '@server/lib/videoMaturityPolicy';
import {
  capIds,
  knownIds,
  refNumber,
  type FollowAdapter,
  type NewFollowEvent,
} from './types';

const DAY_MS = 24 * 60 * 60 * 1000;
const PAST_DAYS = 180;
const FUTURE_DAYS = 548;
const MAX_TMDB_ID = 1_000_000_000;
const MAX_ITEMS_PER_DATE_BUCKET = 20;
const MAX_INITIAL_UPCOMING_PER_MEDIA = 3;
const MAX_PENDING_RELEASES = 1000;
const MAX_DUE_MATURITY_CHECKS_PER_MEDIA = 50;
const TMDB_IMAGE = 'https://image.tmdb.org/t/p/w342';

type VideoMediaType = MediaType.MOVIE | MediaType.TV;

interface VideoCandidate {
  id: number;
  mediaType: VideoMediaType;
  title: string;
  releaseDate: string;
  posterPath?: string;
  adult: boolean;
}

interface PendingRelease {
  id: string;
  mediaType: VideoMediaType;
  title: string;
  releaseDate: string;
  posterPath?: string;
}

interface DateWindow {
  today: string;
  tomorrow: string;
  pastStart: string;
  futureEnd: string;
}

const dateOnly = (date: Date): string => date.toISOString().slice(0, 10);

const shiftDate = (date: Date, days: number): string =>
  dateOnly(new Date(date.getTime() + days * DAY_MS));

const getDateWindow = (now = new Date()): DateWindow => {
  const today = dateOnly(now);
  return {
    today,
    tomorrow: shiftDate(now, 1),
    pastStart: shiftDate(now, -PAST_DAYS),
    futureEnd: shiftDate(now, FUTURE_DAYS),
  };
};

const isDateOnly = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && dateOnly(parsed) === value;
};

const safePosterPath = (value: unknown): string | undefined => {
  if (
    typeof value !== 'string' ||
    value.length > 300 ||
    !/^\/[A-Za-z0-9._/-]+$/.test(value) ||
    value.startsWith('//') ||
    value.includes('..')
  ) {
    return undefined;
  }
  return value;
};

const imageUrl = (posterPath?: string): string | undefined => {
  const safePath = safePosterPath(posterPath);
  return safePath ? `${TMDB_IMAGE}${safePath}` : undefined;
};

const candidateKey = (candidate: Pick<VideoCandidate, 'id' | 'mediaType'>) =>
  `${candidate.mediaType}:${candidate.id}`;

const personCreditCandidate = (
  credit: TmdbPersonCredit
): VideoCandidate | undefined => {
  const mediaType =
    credit.media_type === 'movie'
      ? MediaType.MOVIE
      : credit.media_type === 'tv'
        ? MediaType.TV
        : undefined;
  const releaseDate =
    mediaType === MediaType.MOVIE
      ? credit.release_date
      : mediaType === MediaType.TV
        ? credit.first_air_date
        : undefined;
  const title =
    mediaType === MediaType.MOVIE
      ? credit.title
      : mediaType === MediaType.TV
        ? credit.name
        : undefined;

  if (
    !mediaType ||
    !Number.isSafeInteger(credit.id) ||
    credit.id <= 0 ||
    !title?.trim() ||
    !isDateOnly(releaseDate)
  ) {
    return undefined;
  }

  return {
    id: credit.id,
    mediaType,
    title: title.trim().slice(0, 255),
    releaseDate,
    posterPath: safePosterPath(credit.poster_path),
    adult: credit.adult === true,
  };
};

const selectBoundedCandidates = (
  candidates: VideoCandidate[],
  window: DateWindow
): VideoCandidate[] => {
  const unique = new Map<string, VideoCandidate>();
  for (const candidate of candidates) {
    if (
      candidate.adult ||
      !Number.isSafeInteger(candidate.id) ||
      candidate.id <= 0 ||
      candidate.id > MAX_TMDB_ID ||
      !candidate.title.trim() ||
      !isDateOnly(candidate.releaseDate) ||
      candidate.releaseDate < window.pastStart ||
      candidate.releaseDate > window.futureEnd
    ) {
      continue;
    }
    unique.set(candidateKey(candidate), {
      ...candidate,
      title: candidate.title.trim().slice(0, 255),
    });
  }

  const selected: VideoCandidate[] = [];
  for (const mediaType of [MediaType.MOVIE, MediaType.TV] as const) {
    const items = [...unique.values()].filter(
      (candidate) => candidate.mediaType === mediaType
    );
    const upcoming = items
      .filter((candidate) => candidate.releaseDate > window.today)
      .sort((a, b) => a.releaseDate.localeCompare(b.releaseDate))
      .slice(0, MAX_ITEMS_PER_DATE_BUCKET);
    const recent = items
      .filter((candidate) => candidate.releaseDate <= window.today)
      .sort((a, b) => b.releaseDate.localeCompare(a.releaseDate))
      .slice(0, MAX_ITEMS_PER_DATE_BUCKET);
    selected.push(...upcoming, ...recent);
  }
  return selected;
};

const pendingReleasesFromCursor = (follow: Follow): PendingRelease[] => {
  const rows = follow.cursor?.upcoming;
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return [];
    }
    const row = value as Record<string, unknown>;
    const mediaType =
      row.mediaType === MediaType.MOVIE || row.mediaType === MediaType.TV
        ? row.mediaType
        : undefined;
    const id = typeof row.id === 'string' ? row.id : '';
    const numericId = Number(id);
    const title = typeof row.title === 'string' ? row.title.trim() : '';
    if (
      !mediaType ||
      !/^\d+$/.test(id) ||
      !Number.isSafeInteger(numericId) ||
      numericId <= 0 ||
      numericId > MAX_TMDB_ID ||
      !title ||
      title.length > 255 ||
      !isDateOnly(row.releaseDate)
    ) {
      return [];
    }
    return [
      {
        id,
        mediaType,
        title,
        releaseDate: row.releaseDate,
        posterPath: safePosterPath(row.posterPath),
      },
    ];
  });
};

const applyMaturityPolicy = async (
  tmdb: TheMovieDb,
  follow: Follow,
  candidates: VideoCandidate[]
): Promise<VideoCandidate[]> => {
  if (!follow.user?.id || candidates.length === 0) return candidates;
  const allowed = await filterVideoItemsForUser(
    tmdb,
    follow.user.id,
    candidates.map(({ id, mediaType }) => ({ id, mediaType }))
  );
  const allowedKeys = new Set(
    allowed.map((item) => `${item.mediaType}:${item.id}`)
  );
  return candidates.filter((item) => allowedKeys.has(candidateKey(item)));
};

const makeEvent = (
  follow: Follow,
  subjectType: 'person' | 'studio' | 'network' | 'genre',
  candidate: PendingRelease,
  reasonKey: NewFollowEvent['reasonKey'],
  suffix: 'upcoming' | 'discovered' | 'release-date'
): NewFollowEvent => ({
  dedupeKey: `tmdb:${subjectType}:${follow.subjectKey}:${candidate.mediaType}:${candidate.id}:${suffix}`,
  reasonKey,
  reasonValues: {
    subject: follow.subjectLabel,
    title: candidate.title,
    date: candidate.releaseDate,
  },
  title: candidate.title,
  imageUrl: imageUrl(candidate.posterPath),
  target: {
    mediaType: candidate.mediaType,
    id: candidate.id,
  },
});

const buildVideoEvents = async (
  follow: Follow,
  subjectType: 'person' | 'studio' | 'network' | 'genre',
  tmdb: TheMovieDb,
  rawCandidates: VideoCandidate[]
) => {
  const window = getDateWindow();
  const candidates = selectBoundedCandidates(rawCandidates, window);
  const known = knownIds(follow);
  const pending = new Map(
    pendingReleasesFromCursor(follow).map((release) => [
      `${release.mediaType}:${release.id}`,
      release,
    ])
  );
  const baseline = !follow.lastCheckedAt;

  const duePending = [...pending.entries()]
    .filter(([, release]) => release.releaseDate <= window.today)
    .sort((a, b) => a[1].releaseDate.localeCompare(b[1].releaseDate));
  const dueByMedia = new Map<VideoMediaType, [string, PendingRelease][]>();
  for (const entry of duePending) {
    const list = dueByMedia.get(entry[1].mediaType) ?? [];
    if (list.length < MAX_DUE_MATURITY_CHECKS_PER_MEDIA) {
      list.push(entry);
      dueByMedia.set(entry[1].mediaType, list);
    }
  }
  const pendingDueToCheck = [...dueByMedia.values()].flat();
  const checkedByKey = new Map<string, VideoCandidate>();
  for (const candidate of candidates) {
    checkedByKey.set(candidateKey(candidate), candidate);
  }
  for (const [key, release] of pendingDueToCheck) {
    if (!checkedByKey.has(key)) {
      checkedByKey.set(key, {
        id: Number(release.id),
        mediaType: release.mediaType,
        title: release.title,
        releaseDate: release.releaseDate,
        posterPath: release.posterPath,
        adult: false,
      });
    }
  }

  const allowedCandidates = await applyMaturityPolicy(tmdb, follow, [
    ...checkedByKey.values(),
  ]);
  const allowedKeys = new Set(allowedCandidates.map(candidateKey));
  const events: NewFollowEvent[] = [];
  const pendingKeys = new Set(pending.keys());
  const initialUpcomingCount = new Map<VideoMediaType, number>();
  const initialUpcomingKeys = new Set<string>();

  for (const [key, release] of pendingDueToCheck) {
    if (allowedKeys.has(key) && !baseline) {
      events.push(
        makeEvent(
          follow,
          subjectType,
          release,
          'videoReleaseDateReached',
          'release-date'
        )
      );
    }
    pending.delete(key);
  }

  const nextKnown: string[] = [];
  for (const candidate of candidates) {
    const key = candidateKey(candidate);
    if (!allowedKeys.has(key)) continue;
    const id = key;
    if (
      baseline &&
      candidate.releaseDate > window.today &&
      !known.has(id) &&
      !pendingKeys.has(id)
    ) {
      const count = initialUpcomingCount.get(candidate.mediaType) ?? 0;
      if (count < MAX_INITIAL_UPCOMING_PER_MEDIA) {
        const pendingRelease: PendingRelease = {
          id: String(candidate.id),
          mediaType: candidate.mediaType,
          title: candidate.title,
          releaseDate: candidate.releaseDate,
          posterPath: candidate.posterPath,
        };
        events.push(
          makeEvent(
            follow,
            subjectType,
            pendingRelease,
            'upcomingVideoTitle',
            'upcoming'
          )
        );
        initialUpcomingCount.set(candidate.mediaType, count + 1);
        initialUpcomingKeys.add(id);
      }
    } else if (!baseline && !known.has(id) && !pendingKeys.has(id)) {
      const pendingRelease: PendingRelease = {
        id: String(candidate.id),
        mediaType: candidate.mediaType,
        title: candidate.title,
        releaseDate: candidate.releaseDate,
        posterPath: candidate.posterPath,
      };
      events.push(
        makeEvent(
          follow,
          subjectType,
          pendingRelease,
          candidate.releaseDate > window.today
            ? 'upcomingVideoTitle'
            : 'newVideoTitle',
          candidate.releaseDate > window.today ? 'upcoming' : 'discovered'
        )
      );
    }
    if (
      candidate.releaseDate > window.today &&
      (!baseline || pendingKeys.has(id) || initialUpcomingKeys.has(id))
    ) {
      pending.set(key, {
        id: String(candidate.id),
        mediaType: candidate.mediaType,
        title: candidate.title,
        releaseDate: candidate.releaseDate,
        posterPath: candidate.posterPath,
      });
    } else {
      pending.delete(key);
    }
    nextKnown.push(id);
  }

  const upcoming = [...pending.values()]
    .sort((a, b) => a.releaseDate.localeCompare(b.releaseDate))
    .slice(0, MAX_PENDING_RELEASES);

  return {
    events,
    cursor: {
      known: capIds([...known, ...nextKnown], 2000),
      upcoming,
    },
    baseline,
  };
};

export const tmdbPerson: FollowAdapter = async (follow) => {
  const personId = refNumber(follow, 'tmdbId');
  if (!personId || !follow.user?.id) {
    return { events: [], cursor: follow.cursor ?? {} };
  }
  const tmdb = new TheMovieDb();
  const credits = await tmdb.getPersonCombinedCredits({ personId });
  const candidates = [...credits.cast, ...credits.crew]
    .map(personCreditCandidate)
    .filter((candidate): candidate is VideoCandidate => !!candidate);
  return buildVideoEvents(follow, 'person', tmdb, candidates);
};

export const tmdbStudio: FollowAdapter = async (follow) => {
  const studioId = refNumber(follow, 'tmdbId');
  if (!studioId || !follow.user?.id) {
    return { events: [], cursor: follow.cursor ?? {} };
  }
  const tmdb = new TheMovieDb();
  const window = getDateWindow();
  const [recentMovies, upcomingMovies, recentTv, upcomingTv] =
    await Promise.all([
      tmdb.getDiscoverMovies({
        studio: String(studioId),
        primaryReleaseDateGte: window.pastStart,
        primaryReleaseDateLte: window.today,
        sortBy: 'primary_release_date.desc',
        page: 1,
      }),
      tmdb.getDiscoverMovies({
        studio: String(studioId),
        primaryReleaseDateGte: window.tomorrow,
        primaryReleaseDateLte: window.futureEnd,
        sortBy: 'primary_release_date.asc',
        page: 1,
      }),
      tmdb.getDiscoverTv({
        studio: String(studioId),
        firstAirDateGte: window.pastStart,
        firstAirDateLte: window.today,
        sortBy: 'first_air_date.desc',
        page: 1,
      }),
      tmdb.getDiscoverTv({
        studio: String(studioId),
        firstAirDateGte: window.tomorrow,
        firstAirDateLte: window.futureEnd,
        sortBy: 'first_air_date.asc',
        page: 1,
      }),
    ]);

  const candidates: VideoCandidate[] = [
    ...recentMovies.results,
    ...upcomingMovies.results,
  ].map((item): VideoCandidate => ({
    id: item.id,
    mediaType: MediaType.MOVIE,
    title: item.title,
    releaseDate: item.release_date,
    posterPath: safePosterPath(item.poster_path),
    adult: item.adult === true,
  }));
  candidates.push(
    ...[...recentTv.results, ...upcomingTv.results].map(
      (item): VideoCandidate => ({
        id: item.id,
        mediaType: MediaType.TV,
        title: item.name,
        releaseDate: item.first_air_date,
        posterPath: safePosterPath(item.poster_path),
        adult: false,
      })
    )
  );

  return buildVideoEvents(follow, 'studio', tmdb, candidates);
};

export const tmdbNetwork: FollowAdapter = async (follow) => {
  const networkId = refNumber(follow, 'tmdbId');
  if (!networkId || !follow.user?.id) {
    return { events: [], cursor: follow.cursor ?? {} };
  }
  const tmdb = new TheMovieDb();
  const window = getDateWindow();
  const [recent, upcoming] = await Promise.all([
    tmdb.getDiscoverTv({
      network: networkId,
      firstAirDateGte: window.pastStart,
      firstAirDateLte: window.today,
      sortBy: 'first_air_date.desc',
      page: 1,
    }),
    tmdb.getDiscoverTv({
      network: networkId,
      firstAirDateGte: window.tomorrow,
      firstAirDateLte: window.futureEnd,
      sortBy: 'first_air_date.asc',
      page: 1,
    }),
  ]);
  const candidates: VideoCandidate[] = [
    ...recent.results,
    ...upcoming.results,
  ].map((item): VideoCandidate => ({
    id: item.id,
    mediaType: MediaType.TV,
    title: item.name,
    releaseDate: item.first_air_date,
    posterPath: safePosterPath(item.poster_path),
    adult: false,
  }));
  return buildVideoEvents(follow, 'network', tmdb, candidates);
};

export const tmdbGenre: FollowAdapter = async (follow) => {
  const genreId = refNumber(follow, 'genreId');
  const rawMediaType = follow.conditions?.ref?.mediaType;
  if (
    !genreId ||
    !follow.user?.id ||
    (rawMediaType !== MediaType.MOVIE && rawMediaType !== MediaType.TV)
  ) {
    return { events: [], cursor: follow.cursor ?? {} };
  }
  const tmdb = new TheMovieDb();
  const window = getDateWindow();
  if (rawMediaType === MediaType.MOVIE) {
    const [recent, upcoming] = await Promise.all([
      tmdb.getDiscoverMovies({
        genre: String(genreId),
        primaryReleaseDateGte: window.pastStart,
        primaryReleaseDateLte: window.today,
        sortBy: 'primary_release_date.desc',
        page: 1,
      }),
      tmdb.getDiscoverMovies({
        genre: String(genreId),
        primaryReleaseDateGte: window.tomorrow,
        primaryReleaseDateLte: window.futureEnd,
        sortBy: 'primary_release_date.asc',
        page: 1,
      }),
    ]);
    const candidates: VideoCandidate[] = [
      ...recent.results,
      ...upcoming.results,
    ].map((item): VideoCandidate => ({
      id: item.id,
      mediaType: MediaType.MOVIE,
      title: item.title,
      releaseDate: item.release_date,
      posterPath: safePosterPath(item.poster_path),
      adult: item.adult === true,
    }));
    return buildVideoEvents(follow, 'genre', tmdb, candidates);
  }

  const [recent, upcoming] = await Promise.all([
    tmdb.getDiscoverTv({
      genre: String(genreId),
      firstAirDateGte: window.pastStart,
      firstAirDateLte: window.today,
      sortBy: 'first_air_date.desc',
      page: 1,
    }),
    tmdb.getDiscoverTv({
      genre: String(genreId),
      firstAirDateGte: window.tomorrow,
      firstAirDateLte: window.futureEnd,
      sortBy: 'first_air_date.asc',
      page: 1,
    }),
  ]);
  const candidates: VideoCandidate[] = [
    ...recent.results,
    ...upcoming.results,
  ].map((item): VideoCandidate => ({
    id: item.id,
    mediaType: MediaType.TV,
    title: item.name,
    releaseDate: item.first_air_date,
    posterPath: safePosterPath(item.poster_path),
    adult: false,
  }));
  return buildVideoEvents(follow, 'genre', tmdb, candidates);
};
