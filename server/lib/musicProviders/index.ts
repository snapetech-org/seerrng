// SeerrNG music page providers; maintained by snapetech and SeerrNG contributors.
import AurralAPI from '@server/api/aurral';
import LidarrMusicProvider from '@server/lib/musicProviders/lidarr';
import { getSettings, type LidarrSettings } from '@server/lib/settings';
import { getDefaultAurralServer } from '@server/lib/soulseek/trackRequests';

/**
 * What the Lumen music pages ask of a music service. Aurral answers it
 * directly; LidarrMusicProvider answers the same calls for a Lidarr install.
 */
export type MusicProvider = Pick<
  AurralAPI,
  | 'getActivity'
  | 'getAlbumArtUrl'
  | 'getArtistDetails'
  | 'getArtistFollowStatus'
  | 'getArtistImageUrl'
  | 'getDeezerPreviewClip'
  | 'getDiscoverByTag'
  | 'getDiscoverPlaylist'
  | 'getDiscoverPlaylists'
  | 'getDiscoverRecommended'
  | 'getDiscoverTags'
  | 'getLibraryAlbumPage'
  | 'getLibraryAlbumsPage'
  | 'getLibraryArtistReleaseGroups'
  | 'getLibraryArtwork'
  | 'getLibraryPage'
  | 'getLibraryTrackPage'
  | 'getPreviewLink'
  | 'getSimilarArtists'
  | 'getTrending'
  | 'downloadPreview'
  | 'resolveLink'
  | 'searchAlbums'
  | 'searchLibrary'
  | 'searchUnified'
  | 'setArtistFollowing'
>;

export type MusicProviderKind = 'aurral' | 'lidarr';

/** The default Lidarr server with a library folder (not a 4K-only one). */
export const getDefaultLidarrServer = (
  servers: LidarrSettings[] | undefined = getSettings().lidarr
): LidarrSettings | undefined => {
  const usable = (servers ?? []).filter(
    (server) => server.hostname && server.apiKey && !server.is4k
  );
  return usable.find((server) => server.isDefault) ?? usable[0];
};

/**
 * The music service behind the Lumen music pages: Aurral when one is set up
 * (it does song downloads and has its own player), otherwise Lidarr.
 */
export const getMusicProvider = ():
  { kind: MusicProviderKind; provider: MusicProvider } | undefined => {
  const settings = getSettings();
  const aurral = getDefaultAurralServer(settings.aurral ?? []);
  if (aurral?.hostname && aurral.apiKey) {
    return {
      kind: 'aurral',
      provider: new AurralAPI({
        url: AurralAPI.buildUrl(aurral),
        apiKey: aurral.apiKey,
      }),
    };
  }
  const lidarr = getDefaultLidarrServer(settings.lidarr);
  if (lidarr) {
    return { kind: 'lidarr', provider: new LidarrMusicProvider(lidarr) };
  }
  return undefined;
};
