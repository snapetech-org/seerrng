import { createContext, useContext, type ReactNode } from 'react';
import { MediaStatus, type MediaInfo } from './api';
import { usePublicSettings, type PublicSettings } from './hooks';

type AvailabilityMode = PublicSettings['otherUsersAvailability'];
const AvailabilityContext = createContext<AvailabilityMode>(undefined);

export function VideoAvailabilityProvider({
  children,
}: {
  children: ReactNode;
}) {
  const mode = usePublicSettings()?.otherUsersAvailability;
  return (
    <AvailabilityContext.Provider value={mode}>
      {children}
    </AvailabilityContext.Provider>
  );
}

export const useVideoAvailability = () => useContext(AvailabilityContext);

export function isSharedVideoSeason(
  coverage: MediaInfo['viewerRequestCoverage'],
  seasonNumber: number,
  is4k: boolean,
  mode: AvailabilityMode
) {
  if ((mode !== 'hide' && mode !== 'distinguish') || !coverage?.seasons) {
    return false;
  }
  const quality = is4k ? 'fourK' : 'standard';
  return (
    !coverage[quality] &&
    !coverage.seasons.some(
      (season) => season.seasonNumber === seasonNumber && season[quality]
    )
  );
}

export function isSharedVideoCopy(
  media: MediaInfo | undefined,
  is4k: boolean,
  mode: AvailabilityMode
) {
  const status = is4k ? media?.status4k : media?.status;
  return (
    (mode === 'hide' || mode === 'distinguish') &&
    (status === MediaStatus.AVAILABLE || status === MediaStatus.PARTIAL) &&
    media?.viewerRequestCoverage?.[is4k ? 'fourK' : 'standard'] === false
  );
}

export function videoPlaybackMedia(
  media: MediaInfo | undefined,
  mode: AvailabilityMode
) {
  const sharedHD = isSharedVideoCopy(media, false, mode);
  const shared4K = isSharedVideoCopy(media, true, mode);
  if (!media || (!sharedHD && !shared4K)) return media;
  return {
    ...media,
    mediaUrl: sharedHD ? undefined : media.mediaUrl,
    iOSPlexUrl: sharedHD ? undefined : media.iOSPlexUrl,
    mediaUrl4k: shared4K ? undefined : media.mediaUrl4k,
    iOSPlexUrl4k: shared4K ? undefined : media.iOSPlexUrl4k,
  };
}

export type { AvailabilityMode };
