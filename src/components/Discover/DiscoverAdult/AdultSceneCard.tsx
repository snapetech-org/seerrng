import CachedImage from '@app/components/Common/CachedImage';
import MediaTypeBadge from '@app/components/Common/MediaTypeBadge';
import { encodeApiPathSegment } from '@app/utils/apiPath';
import defineMessages from '@app/utils/defineMessages';
import { MediaStatus } from '@server/constants/media';
import type { AdultResult } from '@server/models/Adult';
import Link from 'next/link';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.Discover.DiscoverAdult', {
  year: '({year})',
  studio: 'Studio: {studio}',
  service: 'Whisparr · {service}',
  available: 'In your library',
  processing: 'Being added',
  requested: 'Request in progress',
  morePerformers: '+{count} more',
});

interface AdultSceneCardProps {
  scene: AdultResult;
  returnQuery?: string;
  returnServerId?: string;
  returnPage?: string;
}

const AdultSceneCard = ({
  scene,
  returnQuery,
  returnServerId,
  returnPage,
}: AdultSceneCardProps) => {
  const intl = useIntl();
  const sceneStatus = scene.mediaInfo?.status;
  const statusLabel =
    sceneStatus === MediaStatus.AVAILABLE ||
    sceneStatus === MediaStatus.PARTIALLY_AVAILABLE
      ? messages.available
      : sceneStatus === MediaStatus.PROCESSING
        ? messages.processing
        : scene.mediaInfo?.requestStatus
          ? messages.requested
          : undefined;

  return (
    <Link
      href={{
        pathname: `/adult/${encodeApiPathSegment(scene.id)}`,
        query: {
          serverId: String(scene.serviceId),
          ...(returnQuery ? { fromQuery: returnQuery } : {}),
          ...(returnServerId ? { fromServerId: returnServerId } : {}),
          ...(returnPage ? { fromPage: returnPage } : {}),
        },
      }}
      className="app-card-main refreshed-card-surface group overflow-hidden rounded-lg border border-gray-700 transition hover:border-indigo-400 focus-visible:ring-2 focus-visible:ring-indigo-400"
    >
      <div className="relative aspect-[2/3] overflow-hidden bg-gray-900">
        <CachedImage
          src={scene.posterPath ?? '/images/seerr_poster_not_found.png'}
          fallbackSrc={
            scene.posterPath ? '/images/seerr_poster_not_found.png' : undefined
          }
          type="adult"
          alt={scene.title}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
          className="object-cover transition duration-300 group-hover:scale-[1.02]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-gray-950/90 via-transparent to-gray-950/10" />
        <div className="absolute start-3 top-3">
          <MediaTypeBadge mediaType="adult" variant="compact" />
        </div>
        {statusLabel && (
          <span className="absolute start-3 bottom-3 rounded-full border border-white/15 bg-gray-950/80 px-2.5 py-1 text-xs font-medium text-white shadow-lg">
            {intl.formatMessage(statusLabel)}
          </span>
        )}
      </div>
      <div className="space-y-2.5 p-4">
        <div className="flex items-start justify-between gap-2">
          <h2 className="line-clamp-2 text-base leading-snug font-semibold text-white">
            {scene.title}
          </h2>
          {scene.year && (
            <span className="refreshed-detail-text-muted shrink-0 text-sm">
              {intl.formatMessage(messages.year, { year: scene.year })}
            </span>
          )}
        </div>
        {scene.studio && (
          <p className="refreshed-detail-text truncate text-sm">
            {intl.formatMessage(messages.studio, { studio: scene.studio })}
          </p>
        )}
        {scene.performers.length > 0 && (
          <p className="refreshed-detail-text-muted line-clamp-1 text-sm">
            {scene.performers.slice(0, 3).join(' · ')}
            {scene.performers.length > 3 &&
              ` ${intl.formatMessage(messages.morePerformers, {
                count: scene.performers.length - 3,
              })}`}
          </p>
        )}
        {scene.overview && (
          <p className="refreshed-detail-text-muted line-clamp-2 text-sm leading-relaxed">
            {scene.overview}
          </p>
        )}
        <p className="refreshed-detail-text-muted truncate border-t border-gray-700/80 pt-2 text-xs">
          {intl.formatMessage(messages.service, { service: scene.serviceName })}
        </p>
      </div>
    </Link>
  );
};

export default AdultSceneCard;
