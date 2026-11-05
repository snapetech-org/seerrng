import AirDateBadge from '@app/components/AirDateBadge';
import Badge from '@app/components/Common/Badge';
import CachedImage from '@app/components/Common/CachedImage';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import defineMessages from '@app/utils/defineMessages';
import type { EpisodeAvailabilitySourceType } from '@server/entity/EpisodeAvailability';
import type { SeasonWithEpisodes } from '@server/models/Tv';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.TvDetails.Season', {
  sonarrAvailable: 'Available · Sonarr',
  sonarrAvailableAriaLabel: 'Available in Sonarr',
  sonarr4kAvailable: 'Available · Sonarr · 4K',
  sonarr4kAvailableAriaLabel: 'Available in 4K in Sonarr',
  plexAvailable: 'Available · Plex',
  plexAvailableAriaLabel: 'Available in Plex',
  plex4kAvailable: 'Available · Plex · 4K',
  plex4kAvailableAriaLabel: 'Available in 4K in Plex',
  jellyfinAvailable: 'Available · Jellyfin',
  jellyfinAvailableAriaLabel: 'Available in Jellyfin',
  jellyfin4kAvailable: 'Available · Jellyfin · 4K',
  jellyfin4kAvailableAriaLabel: 'Available in 4K in Jellyfin',
  embyAvailable: 'Available · Emby',
  embyAvailableAriaLabel: 'Available in Emby',
  emby4kAvailable: 'Available · Emby · 4K',
  emby4kAvailableAriaLabel: 'Available in 4K in Emby',
  somethingwentwrong: 'Something went wrong while retrieving season data.',
  noepisodes: 'Episode list unavailable.',
});

const getAvailabilityMessages = (
  source: EpisodeAvailabilitySourceType,
  is4k: boolean
) => {
  switch (source) {
    case 'sonarr':
      return is4k
        ? [messages.sonarr4kAvailable, messages.sonarr4kAvailableAriaLabel]
        : [messages.sonarrAvailable, messages.sonarrAvailableAriaLabel];
    case 'plex':
      return is4k
        ? [messages.plex4kAvailable, messages.plex4kAvailableAriaLabel]
        : [messages.plexAvailable, messages.plexAvailableAriaLabel];
    case 'jellyfin':
      return is4k
        ? [messages.jellyfin4kAvailable, messages.jellyfin4kAvailableAriaLabel]
        : [messages.jellyfinAvailable, messages.jellyfinAvailableAriaLabel];
    case 'emby':
      return is4k
        ? [messages.emby4kAvailable, messages.emby4kAvailableAriaLabel]
        : [messages.embyAvailable, messages.embyAvailableAriaLabel];
  }
};

type SeasonProps = {
  seasonNumber: number;
  tvId: number;
};

const Season = ({ seasonNumber, tvId }: SeasonProps) => {
  const intl = useIntl();
  const { data, error } = useSWR<SeasonWithEpisodes>(
    `/api/v1/tv/${tvId}/season/${seasonNumber}`
  );

  if (!data && !error) {
    return <LoadingSpinner />;
  }

  if (!data) {
    return <div>{intl.formatMessage(messages.somethingwentwrong)}</div>;
  }

  return (
    <div className="flex flex-col justify-center divide-y divide-gray-700">
      {data.episodes.length === 0 ? (
        <p>{intl.formatMessage(messages.noepisodes)}</p>
      ) : (
        data.episodes
          .slice()
          .reverse()
          .map((episode) => {
            return (
              <div
                className="flex flex-col space-y-4 py-4 xl:flex-row xl:space-y-4 xl:space-x-4"
                key={`season-${seasonNumber}-episode-${episode.episodeNumber}`}
              >
                <div className="flex-1">
                  <div className="flex flex-col space-y-2 xl:flex-row xl:items-center xl:space-y-0 xl:space-x-2">
                    <h3 className="text-lg">
                      {episode.episodeNumber} - {episode.name}
                    </h3>
                    {episode.airDate && (
                      <AirDateBadge airDate={episode.airDate} />
                    )}
                    {(episode.availabilitySources?.length
                      ? episode.availabilitySources
                      : episode.sonarrAvailability
                        ? [
                            {
                              sourceType: 'sonarr' as const,
                              ...episode.sonarrAvailability,
                            },
                          ]
                        : []
                    ).flatMap(({ sourceType, hd, fourK }) =>
                      ([false, true] as const)
                        .filter((is4k) => (is4k ? fourK : hd))
                        .map((is4k) => {
                          const [label, ariaLabel] = getAvailabilityMessages(
                            sourceType,
                            is4k
                          );
                          return (
                            <Badge
                              key={`${sourceType}-${is4k ? '4k' : 'hd'}`}
                              badgeType="success"
                              aria-label={intl.formatMessage(ariaLabel)}
                            >
                              {intl.formatMessage(label)}
                            </Badge>
                          );
                        })
                    )}
                  </div>
                  {episode.overview && <p>{episode.overview}</p>}
                </div>
                {episode.stillPath && (
                  <div className="relative aspect-video xl:h-32">
                    <CachedImage
                      type="tmdb"
                      className="rounded-lg object-contain"
                      src={episode.stillPath}
                      alt=""
                      fill
                    />
                  </div>
                )}
              </div>
            );
          })
      )}
    </div>
  );
};

export default Season;
