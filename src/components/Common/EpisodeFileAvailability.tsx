import Badge from '@app/components/Common/Badge';
import defineMessages from '@app/utils/defineMessages';
import type { EpisodeAvailabilitySourceType } from '@server/entity/EpisodeAvailability';
import { useIntl } from 'react-intl';

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

export type EpisodeFileSource = NonNullable<
  Episode['availabilitySources']
>[number];
const EpisodeFileAvailability = ({
  sources,
}: {
  sources: EpisodeFileSource[];
}) => {
  const intl = useIntl();
  return (
    <span className="card-body-text">
      {sources.flatMap(({ sourceType, hd, fourK }) =>
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
    </span>
  );
};
export default EpisodeFileAvailability;
