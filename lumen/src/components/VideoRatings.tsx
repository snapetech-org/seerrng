import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';
import { Icon } from '../icons';

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
  active = true,
  delayMs = 0,
  className,
  showStatus = false,
}: {
  mediaType: 'movie' | 'tv';
  id: number;
  voteAverage?: number;
  voteCount?: number;
  active?: boolean;
  delayMs?: number;
  className?: string;
  showStatus?: boolean;
}) {
  const { t } = useLumenLocale();
  const [ready, setReady] = useState(delayMs === 0);
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (!active) {
      setReady(false);
      return;
    }
    if (delayMs === 0) {
      setReady(true);
      return;
    }
    setReady(false);
    const timeout = window.setTimeout(() => setReady(true), delayMs);
    return () => window.clearTimeout(timeout);
  }, [active, delayMs, id, mediaType]);
  const { data, error } = useApi<RatingResponse>(
    active && ready ? `/${mediaType}/${id}/ratingscombined` : null
  );
  useEffect(() => {
    if (!active || !ready) {
      setSettled(false);
      return;
    }
    if (data !== null || error !== null) setSettled(true);
  }, [active, data, error, ready]);
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
  if (!ratings.length) {
    if (!showStatus) return null;
    const message = !ready
      ? t('lumen.videoRating.loading', 'Loading ratings…')
      : error
        ? t('lumen.videoRating.loadFailed', 'Ratings could not be loaded.')
        : settled
          ? t('lumen.videoRating.unavailable', 'No ratings available')
          : t('lumen.videoRating.loading', 'Loading ratings…');
    return <span role="status">{message}</span>;
  }
  return (
    <ul
      className={className ? `chips ${className}` : 'chips'}
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

export function VideoRatingsPopover({
  mediaType,
  id,
  voteAverage,
  voteCount,
  title,
}: {
  mediaType: 'movie' | 'tv';
  id: number;
  voteAverage?: number;
  voteCount?: number;
  title: string;
}) {
  const { t } = useLumenLocale();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, maxWidth: 320 });
  const tmdbScore =
    voteCount && voteCount > 0 ? score(voteAverage, 10) : undefined;

  useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const padding = 12;
      const maxWidth = Math.min(340, window.innerWidth - padding * 2);
      const height = popoverRef.current?.offsetHeight ?? 180;
      const left = Math.max(
        padding,
        Math.min(rect.left, window.innerWidth - maxWidth - padding)
      );
      const below = rect.bottom + 8 + height <= window.innerHeight - padding;
      const top = below
        ? rect.bottom + 8
        : Math.max(padding, rect.top - height - 8);
      setPosition({ top, left, maxWidth });
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus({ preventScroll: true });
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        !triggerRef.current?.contains(target) &&
        !popoverRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };
    updatePosition();
    const observer =
      typeof ResizeObserver === 'undefined' || !popoverRef.current
        ? undefined
        : new ResizeObserver(updatePosition);
    if (popoverRef.current) observer?.observe(popoverRef.current);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  const label = t(
    'lumen.videoRating.showForTitle',
    'Show ratings for {title}',
    {
      title,
    }
  );
  const formattedScore =
    tmdbScore === undefined
      ? undefined
      : new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(
          tmdbScore
        );

  return (
    <>
      <button
        ref={triggerRef}
        className="rating-trigger"
        type="button"
        aria-label={label}
        aria-expanded={open}
        title={label}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name="star" size="sm" />
        {formattedScore ?? t('lumen.videoRating.heading', 'Ratings')}
      </button>
      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={popoverRef}
            className="video-rating-popover"
            role="dialog"
            aria-label={label}
            style={position}
          >
            <div className="video-rating-popover-heading">
              <strong>{t('lumen.videoRating.heading', 'Ratings')}</strong>
              <button
                className="icon-btn"
                type="button"
                aria-label={t('lumen.videoRating.close', 'Close ratings')}
                onClick={() => {
                  setOpen(false);
                  triggerRef.current?.focus({ preventScroll: true });
                }}
              >
                <Icon name="x" />
              </button>
            </div>
            <VideoRatings
              mediaType={mediaType}
              id={id}
              voteAverage={voteAverage}
              voteCount={voteCount}
              active={open}
              delayMs={300}
              className="wrap"
              showStatus
            />
          </div>,
          document.body
        )}
    </>
  );
}
