import { useEffect } from 'react';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';
import { Section } from './cards';

type RatingSource = 'musicbrainz' | 'lidarr' | 'theaudiodb' | 'discogs';
type Rating = {
  score: number;
  votes: number;
  url: string;
  source: RatingSource;
  scale?: 5 | 10;
};
type RatingResponse = {
  ratings?: Rating[];
  failedSources?: RatingSource[];
};

const SOURCES: { id: RatingSource; label: string; fallback: string }[] = [
  { id: 'musicbrainz', label: 'MusicBrainz', fallback: 'MusicBrainz' },
  { id: 'lidarr', label: 'Lidarr', fallback: 'Lidarr' },
  { id: 'theaudiodb', label: 'TheAudioDB', fallback: 'TheAudioDB' },
  { id: 'discogs', label: 'Discogs', fallback: 'Discogs' },
];

function safeRatingUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export default function MusicRatings({ albumId }: { albumId: string }) {
  const { t } = useLumenLocale();
  const { data, error, revalidate } = useApi<RatingResponse>(
    `/music/${encodeURIComponent(albumId)}/rating`
  );
  useEffect(() => {
    if (!data?.failedSources?.length) return;
    const timer = window.setInterval(revalidate, 60_000);
    return () => window.clearInterval(timer);
  }, [data?.failedSources?.length, revalidate]);
  if (!data && !error) return null;
  const ratings = new Map(
    (data?.ratings ?? []).map((rating) => [rating.source, rating])
  );
  const failed = new Set(data?.failedSources ?? []);
  if (error) {
    return (
      <Section id="music-ratings" title={t('lumen.music.ratings', 'Ratings')}>
        <p className="note" role="status">
          {t('lumen.music.ratingsFailed', 'Ratings could not be loaded.')}
        </p>
      </Section>
    );
  }
  return (
    <Section id="music-ratings" title={t('lumen.music.ratings', 'Ratings')}>
      <ul className="toolbar" data-testid="music-ratings">
        {SOURCES.map(({ id, label, fallback }) => {
          const rating = ratings.get(id);
          const text = failed.has(id)
            ? t(
                'lumen.music.ratingUnavailable',
                '{source}: temporarily unavailable',
                { source: label }
              )
            : rating &&
                Number.isFinite(rating.score) &&
                rating.score >= 0 &&
                rating.score <= (rating.scale ?? 10)
              ? t(
                  'lumen.music.ratingScore',
                  '{source}: {score}/{scale} from {votes} votes',
                  {
                    source: label,
                    score: new Intl.NumberFormat(undefined, {
                      maximumFractionDigits: 1,
                    }).format(rating.score),
                    scale: rating.scale ?? 10,
                    votes: new Intl.NumberFormat().format(rating.votes),
                  }
                )
              : t('lumen.music.noRating', '{source}: no rating available', {
                  source: fallback,
                });
          const href = rating ? safeRatingUrl(rating.url) : undefined;
          return (
            <li className="chip" key={id}>
              {href ? (
                <a href={href} target="_blank" rel="noreferrer">
                  {text}
                </a>
              ) : (
                text
              )}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
