import MusicRatings from '@app/components/MediaDetails/MusicRatings';
import OpenLibraryRating from '@app/components/MediaDetails/OpenLibraryRating';
import VideoRatings from '@app/components/MediaDetails/VideoRatings';
import defineMessages from '@app/utils/defineMessages';
import type { OpenLibraryWorkRatingResponse } from '@server/api/openlibrary';
import type { RatingResponse } from '@server/api/ratings';
import type { MusicRatingResponse } from '@server/models/Music';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.TitleCard.PosterRatingPopover', {
  label: 'Ratings for {title}',
  loading: 'Loading ratings…',
  unavailable: 'No ratings available',
});

type RatedMediaType = 'movie' | 'tv' | 'album' | 'book';

export default function PosterRatingPopover({
  anchorRef,
  id,
  mediaType,
  userScore,
  voteCount,
  bookRatingAverage,
  bookRatingCount,
  title,
  artist,
}: {
  anchorRef: RefObject<HTMLDivElement | null>;
  id: string | number;
  mediaType: RatedMediaType;
  userScore?: number;
  voteCount?: number;
  bookRatingAverage?: number;
  bookRatingCount?: number;
  title: string;
  artist?: string;
}) {
  const intl = useIntl();
  const [position, setPosition] = useState<{
    top: number;
    left: number;
    minWidth: number;
    maxWidth: number;
  }>();
  const popoverRef = useRef<HTMLDivElement>(null);
  const isVideo = mediaType === 'movie' || mediaType === 'tv';
  const ratingIdentity = `${mediaType}:${String(id)}`;
  const [readyRatingIdentity, setReadyRatingIdentity] = useState<string>();
  const videoRatingsReady = readyRatingIdentity === ratingIdentity;

  useEffect(() => {
    if (!isVideo) return;

    const timeout = window.setTimeout(() => {
      setReadyRatingIdentity(ratingIdentity);
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [isVideo, ratingIdentity]);

  const updatePosition = useCallback(() => {
    const card = anchorRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const viewportPadding = 8;
    const gap = 8;
    const maxWidth = window.innerWidth - viewportPadding * 2;
    const measuredPopover = popoverRef.current?.getBoundingClientRect();
    const width = Math.min(
      measuredPopover?.width ?? Math.max(rect.width, 220),
      maxWidth
    );
    const height = measuredPopover?.height ?? 40;
    const left = Math.max(
      viewportPadding,
      Math.min(rect.left, window.innerWidth - width - viewportPadding)
    );
    const fitsBelow = rect.bottom + gap + height <= window.innerHeight;
    const fitsAbove = rect.top - gap - height >= viewportPadding;
    const top =
      fitsBelow || !fitsAbove
        ? Math.min(
            rect.bottom + gap,
            window.innerHeight - height - viewportPadding
          )
        : rect.top - gap - height;
    setPosition({
      top: Math.max(viewportPadding, top),
      left,
      minWidth: Math.min(rect.width, maxWidth),
      maxWidth,
    });
  }, [anchorRef]);

  useEffect(() => {
    updatePosition();
    const resizeObserver =
      typeof ResizeObserver !== 'undefined' && popoverRef.current
        ? new ResizeObserver(updatePosition)
        : undefined;
    if (popoverRef.current) {
      resizeObserver?.observe(popoverRef.current);
    }
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [updatePosition]);

  const { data: movieRatings, isValidating: movieLoading } =
    useSWR<RatingResponse>(
      mediaType === 'movie' && videoRatingsReady
        ? '/api/v1/movie/' + id + '/ratingscombined'
        : null,
      { revalidateOnFocus: false }
    );
  const { data: tvRatings, isValidating: tvLoading } = useSWR<RatingResponse>(
    mediaType === 'tv' && videoRatingsReady
      ? '/api/v1/tv/' + id + '/ratingscombined'
      : null,
    { revalidateOnFocus: false }
  );
  const { data: musicRatings, isValidating: musicLoading } =
    useSWR<MusicRatingResponse>(
      mediaType === 'album'
        ? '/api/v1/music/' + encodeURIComponent(id) + '/rating'
        : null,
      { revalidateOnFocus: false }
    );
  const hasBookRating = bookRatingAverage !== undefined && !!bookRatingCount;
  const { data: bookRating, isValidating: bookLoading } =
    useSWR<OpenLibraryWorkRatingResponse>(
      mediaType === 'book' && !hasBookRating
        ? '/api/v1/book/' + encodeURIComponent(id) + '/ratings'
        : null,
      { revalidateOnFocus: false }
    );

  if (typeof document === 'undefined') return null;
  const albumRatings =
    musicRatings?.ratings ??
    (musicRatings?.rating ? [musicRatings.rating] : []);
  const bookAverage = hasBookRating ? bookRatingAverage : bookRating?.average;
  const bookCount = hasBookRating ? bookRatingCount : bookRating?.count;
  const loading =
    (mediaType === 'movie' && (movieLoading || !videoRatingsReady)) ||
    (mediaType === 'tv' && (tvLoading || !videoRatingsReady)) ||
    (mediaType === 'album' && musicLoading) ||
    (mediaType === 'book' && bookLoading);
  const hasRatings =
    isVideo ||
    albumRatings.length > 0 ||
    (bookAverage !== undefined && !!bookCount);

  return createPortal(
    <div
      ref={popoverRef}
      className="poster-rating-popover app-card-main refreshed-card-surface"
      style={
        position ?? {
          top: 0,
          left: 0,
          minWidth: 220,
          maxWidth: 'calc(100vw - 16px)',
          visibility: 'hidden',
        }
      }
      role="status"
      aria-label={intl.formatMessage(messages.label, { title })}
    >
      <div className="poster-rating-values">
        {(mediaType === 'movie' || mediaType === 'tv') && (
          <VideoRatings
            mediaType={mediaType}
            id={Number(id)}
            voteAverage={userScore}
            voteCount={voteCount}
            ratings={mediaType === 'movie' ? movieRatings : tvRatings}
            loading={mediaType === 'movie' ? movieLoading : tvLoading}
          />
        )}
        {albumRatings.length > 0 && (
          <MusicRatings
            ratings={albumRatings}
            albumId={String(id)}
            albumTitle={title}
            artist={artist}
          />
        )}
        {mediaType === 'book' && (
          <OpenLibraryRating
            average={bookAverage}
            count={bookCount}
            workId={String(id)}
            interactive={false}
          />
        )}
        {!hasRatings && (
          <span>
            {intl.formatMessage(
              loading ? messages.loading : messages.unavailable
            )}
          </span>
        )}
      </div>
    </div>,
    document.body
  );
}
