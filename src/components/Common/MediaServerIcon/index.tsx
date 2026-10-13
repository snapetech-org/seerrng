import EmbyIcon from '@app/assets/services/emby-icon-only.svg';
import JellyfinIcon from '@app/assets/services/jellyfin-icon.svg';
import PlexIcon from '@app/assets/services/plex.svg';
import { MediaServerType, ServerType } from '@server/constants/server';

interface MediaServerIconProps {
  mediaServerType: MediaServerType;
  className?: string;
}

export const getMediaServerName = (
  mediaServerType: MediaServerType
): string | undefined => {
  switch (mediaServerType) {
    case MediaServerType.PLEX:
      return ServerType.PLEX;
    case MediaServerType.JELLYFIN:
      return ServerType.JELLYFIN;
    case MediaServerType.EMBY:
      return ServerType.EMBY;
    default:
      return undefined;
  }
};

const MediaServerIcon = ({
  mediaServerType,
  className = 'h-4 w-4',
}: MediaServerIconProps) => {
  switch (mediaServerType) {
    case MediaServerType.PLEX:
      return <PlexIcon className={className} />;
    case MediaServerType.JELLYFIN:
      return <JellyfinIcon className={className} />;
    case MediaServerType.EMBY:
      return <EmbyIcon className={className} />;
    default:
      return null;
  }
};

export default MediaServerIcon;
