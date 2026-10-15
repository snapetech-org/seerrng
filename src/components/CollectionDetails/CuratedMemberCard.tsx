import CachedImage from '@app/components/Common/CachedImage';
import SelectionCircle from '@app/components/Common/SelectionCircle';
import AvailabilityValue from '@app/components/MediaDetails/AvailabilityValue';
import useSettings from '@app/hooks/useSettings';
import { memberHasQuality } from '@app/utils/curatedCollectionSelection';
import defineMessages from '@app/utils/defineMessages';
import { getTmdbPosterImageUrl } from '@app/utils/imageCache';
import { musicCollectionTypeLabel } from '@app/utils/musicCollectionFilters';
import { getViewerAvailabilityPresentation } from '@app/utils/viewerAvailabilityPresentation';
import { MediaStatus } from '@server/constants/media';
import type { CuratedCollectionMember } from '@server/models/CuratedCollection';
import type { MusicDetails } from '@server/models/Music';
import Link from 'next/link';
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';
import CuratedGenreLinks from './CuratedGenreLinks';

const messages = defineMessages('components.CuratedMemberCard', {
  selection: 'Select {title} for playback and collection creation',
  format: 'Media & Format',
  release: 'Release Date',
  runtime: 'Runtime',
  genres: 'Genres',
  creator: 'Created By',
  network: 'Network',
  artist: 'Artist',
  type: 'Album Type',
  series: 'Series',
  music: 'Music · Album',
  unavailable: 'Not Available',
  available: 'Available',
  availabilityHidden: 'Hidden',
  sharedAvailability: 'Shared: {status}',
  sharedFormat: '{quality} (shared)',
  minutes: '{minutes} minutes',
});

export default function CuratedMemberCard({
  part: suppliedPart,
  kind,
  selected,
  toggle,
  ratings,
  selectionLabel,
}: {
  part: CuratedCollectionMember;
  kind: 'tv' | 'music';
  selected: boolean;
  toggle: () => void;
  ratings?: ReactNode;
  selectionLabel?: string;
}) {
  const intl = useIntl();
  const settings = useSettings();
  const card = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!card.current || kind !== 'music') return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    });
    observer.observe(card.current);
    return () => observer.disconnect();
  }, [kind]);
  const { data: details } = useSWR<MusicDetails>(
    kind === 'music' && visible ? `/api/v1/music/${suppliedPart.id}` : null,
    { revalidateOnFocus: false, dedupingInterval: 300000 }
  );
  const part = details
    ? {
        ...suppliedPart,
        runtime: Math.round(
          details.tracks.reduce((sum, track) => sum + track.length, 0) / 60000
        ),
        genres:
          details.tags?.releaseGroup.map((tag) => tag.tag) ??
          suppliedPart.genres,
        posterPath: suppliedPart.posterPath || details.posterPath,
      }
    : suppliedPart;
  const unavailable = intl.formatMessage(messages.unavailable);
  const href = `/${kind === 'music' ? 'music' : 'tv'}/${part.id}`;
  const qualities = kind === 'music' ? ['MP3', 'FLAC'] : ['HD', '4K'];
  const qualityAvailability = qualities.map((quality, index) => {
    const is4k = index === 1;
    const available = memberHasQuality(part, kind, is4k);
    const status = available ? MediaStatus.AVAILABLE : MediaStatus.UNKNOWN;
    const presentation = getViewerAvailabilityPresentation(
      status,
      settings.currentSettings.otherUsersAvailability,
      kind === 'tv'
        ? part.mediaInfo?.viewerRequestCoverage?.[is4k ? 'fourK' : 'standard']
        : undefined
    );

    return { quality, status, available, presentation };
  });
  const title =
    part.title + (part.releaseDate ? ` (${part.releaseDate.slice(0, 4)})` : '');
  const rows = [
    [
      kind === 'music' ? messages.artist : messages.creator,
      kind === 'music' ? part.network : part.subtitle,
    ],
    [
      kind === 'music' ? messages.type : messages.network,
      kind === 'music' ? musicCollectionTypeLabel(part) : part.network,
    ],
  ] as const;
  return (
    <article
      ref={card}
      className="app-card-sub detail-item-surface detail-summary-card movie-summary-card movie-summary-card-with-selection movie-summary-with-ratings"
    >
      <div className="movie-summary-selection">
        <SelectionCircle
          label={
            selectionLabel ?? intl.formatMessage(messages.selection, { title })
          }
          selected={selected}
          onClick={toggle}
        />
      </div>
      <Link
        href={href}
        className="collection-summary-poster"
        aria-label={title}
      >
        <CachedImage
          type={kind === 'music' ? 'music' : 'tmdb'}
          src={
            (kind === 'music'
              ? part.posterPath
              : getTmdbPosterImageUrl(part.posterPath)) ||
            '/images/seerr_poster_not_found.png'
          }
          alt=""
          fill
          sizes="80px"
          className="collection-summary-poster-image"
        />
      </Link>
      <div className="relative z-10 flex min-w-0 flex-col">
        <h3 className="movie-summary-title">
          <Link href={href}>{title}</Link>
        </h3>
        <div className="movie-summary-fields movie-summary-fields-with-ratings detail-card-heading-spacing grid min-w-0 flex-1">
          <div className="detail-paired-column-span min-w-0">
            <dl className="media-detail-rows detail-paired-columns grid min-w-0 content-start text-xs">
              <dt className="card:col-start-1 card:row-start-1 font-medium text-gray-100">
                {intl.formatMessage(messages.format)}:
              </dt>
              <dd className="card:col-start-3 card:row-start-1 m-0 truncate">
                {intl.formatMessage(
                  kind === 'music' ? messages.music : messages.series
                )}
                {qualityAvailability
                  .filter(
                    ({ available, presentation }) =>
                      available && !presentation.hidden
                  )
                  .map(({ quality, presentation }) =>
                    presentation.shared
                      ? intl.formatMessage(messages.sharedFormat, { quality })
                      : quality
                  )
                  .map((quality) => ` · ${quality}`)}
              </dd>
              <dt className="card:col-start-1 card:row-start-2 font-medium text-gray-100">
                {intl.formatMessage(messages.release)}:
              </dt>
              <dd className="card:col-start-3 card:row-start-2 m-0 truncate">
                {part.releaseDate || unavailable}
              </dd>
              <dt className="card:col-start-1 card:row-start-3 font-medium text-gray-100">
                {intl.formatMessage(messages.runtime)}:
              </dt>
              <dd className="card:col-start-3 card:row-start-3 m-0 truncate">
                {part.runtime
                  ? intl.formatMessage(messages.minutes, {
                      minutes: part.runtime,
                    })
                  : unavailable}
              </dd>
              <div className="media-detail-rows media-detail-column-divider card:col-start-5 card:row-span-3 card:row-start-1 col-span-2 grid min-w-0 grid-cols-[max-content_minmax(0,1fr)] content-start gap-x-3">
                {rows.map(([label, value]) => (
                  <Fragment key={label.id}>
                    <dt className="font-medium text-gray-100">
                      {intl.formatMessage(label)}:
                    </dt>
                    <dd className="m-0 truncate" title={value}>
                      {value || unavailable}
                    </dd>
                  </Fragment>
                ))}
              </div>
              <dt className="card:col-start-1 card:row-start-4 font-medium text-gray-100">
                {intl.formatMessage(messages.genres)}:
              </dt>
              <dd className="card:col-span-3 card:col-start-3 card:row-start-4 m-0 min-w-0 break-words">
                <CuratedGenreLinks
                  kind={kind}
                  parts={[part]}
                  fallback={unavailable}
                />
              </dd>
            </dl>
          </div>
          <dl className="media-detail-rows media-detail-column-divider grid min-w-0 grid-cols-[max-content_minmax(0,1fr)] content-start gap-x-3 text-xs">
            {qualityAvailability.map(
              ({ quality, status, available, presentation }) => (
                <Fragment key={quality}>
                  <dt className="font-medium text-gray-100">{quality}:</dt>
                  <dd className="m-0 truncate">
                    <AvailabilityValue
                      tone={presentation.shared ? 'shared' : undefined}
                      status={presentation.hidden ? undefined : status}
                    >
                      {presentation.hidden
                        ? intl.formatMessage(messages.availabilityHidden)
                        : presentation.shared
                          ? intl.formatMessage(messages.sharedAvailability, {
                              status: intl.formatMessage(messages.available),
                            })
                          : available
                            ? intl.formatMessage(messages.available)
                            : unavailable}
                    </AvailabilityValue>
                  </dd>
                </Fragment>
              )
            )}
          </dl>
          {ratings && (
            <div className="movie-summary-ratings-row">
              <div className="movie-summary-ratings-empty" aria-hidden />
              <div className="movie-summary-ratings-values">{ratings}</div>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
