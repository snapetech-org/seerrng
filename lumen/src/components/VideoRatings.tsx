import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';

type RatingResponse = {
  rt?: { criticsScore?: number; audienceScore?: number; url?: string };
  imdb?: { criticsScore?: number; url?: string };
  mdblist?: {
    imdbId?: string;
    imdbRating?: number;
    rtRating?: number;
    rtUserRating?: number;
    metacriticRating?: number;
    traktRating?: number;
  };
};
type Rating = {
  source: string;
  label: string;
  compactLabel: string;
  score?: number;
  scale: number;
  url?: string;
};

function safeUrl(value?: string) {
  try {
    const url = new URL(value ?? '');
    return url.protocol === 'https:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function score(value: unknown, max: number) {
  return typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= max
    ? value
    : undefined;
}

function preferredScore(primary: unknown, fallback: unknown, max: number) {
  return score(primary, max) ?? score(fallback, max);
}

export default function VideoRatings({
  mediaType,
  id,
  voteAverage,
  voteCount,
}: {
  mediaType: 'movie' | 'tv';
  id: number;
  voteAverage?: number;
  voteCount?: number;
}) {
  const { t } = useLumenLocale();
  const { data } = useApi<RatingResponse>(
    `/${mediaType}/${id}/ratingscombined`
  );
  const response = data ?? {};
  const imdbId = response.mdblist?.imdbId;
  const source = (key: string, fallback: string) =>
    t(`lumen.videoRating.${key}`, fallback);
  const ratings: Rating[] = [
    {
      source: 'critics',
      label: source('critics', 'Rotten Tomatoes critics'),
      compactLabel: `RT ${source('criticsShort', 'C')}`,
      score: preferredScore(
        response.rt?.criticsScore,
        response.mdblist?.rtRating,
        100
      ),
      scale: 100,
      url: response.rt?.url,
    },
    {
      source: 'audience',
      label: source('audience', 'Rotten Tomatoes audience'),
      compactLabel: `RT ${source('audienceShort', 'A')}`,
      score: preferredScore(
        response.rt?.audienceScore,
        response.mdblist?.rtUserRating,
        100
      ),
      scale: 100,
      url: response.rt?.url,
    },
    {
      source: 'imdb',
      label: source('imdb', 'IMDb'),
      compactLabel: source('imdb', 'IMDb'),
      score: preferredScore(
        response.imdb?.criticsScore,
        response.mdblist?.imdbRating,
        10
      ),
      scale: 10,
      url:
        response.imdb?.url ??
        (imdbId && /^tt\d{1,20}$/.test(imdbId)
          ? `https://www.imdb.com/title/${imdbId}`
          : undefined),
    },
    {
      source: 'metacritic',
      label: source('metacritic', 'Metacritic'),
      compactLabel: 'MC',
      score: score(response.mdblist?.metacriticRating, 100),
      scale: 100,
    },
    {
      source: 'trakt',
      label: source('trakt', 'Trakt'),
      compactLabel: source('trakt', 'Trakt'),
      score: score(response.mdblist?.traktRating, 10),
      scale: 10,
    },
    {
      source: 'tmdb',
      label: source('tmdb', 'TMDB'),
      compactLabel: source('tmdb', 'TMDB'),
      score: voteCount && voteCount > 0 ? score(voteAverage, 10) : undefined,
      scale: 10,
      url: `https://www.themoviedb.org/${mediaType}/${id}`,
    },
  ].filter((rating) => rating.score !== undefined);
  if (!ratings.length) return null;
  return (
    <ul
      className="chips"
      data-testid="video-ratings"
      aria-label={t('lumen.videoRating.heading', 'Ratings')}
      tabIndex={0}
    >
      {ratings.map((rating) => {
        const href = safeUrl(rating.url);
        const formattedScore = new Intl.NumberFormat(undefined, {
          maximumFractionDigits: rating.scale === 10 ? 1 : 0,
        }).format(rating.score!);
        const content = `${rating.label}: ${formattedScore}${rating.scale === 100 ? '%' : '/10'}`;
        const compactContent = `${rating.compactLabel}: ${formattedScore}${rating.scale === 100 ? '%' : ''}`;
        return (
          <li className="chip" key={rating.source}>
            {href ? (
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                aria-label={content}
                title={content}
              >
                {compactContent}
              </a>
            ) : (
              <span title={content}>{compactContent}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
