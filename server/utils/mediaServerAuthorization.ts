import { MediaServerType } from '@server/constants/server';
import { getAppVersion } from '@server/utils/appVersion';

export const getMediaBrowserAuthorizationHeaders = ({
  mediaServerType,
  deviceId,
  token,
}: {
  mediaServerType: MediaServerType;
  deviceId: string;
  token?: string | null;
}): Record<string, string> => {
  const version =
    mediaServerType === MediaServerType.EMBY ? '1.0.0' : getAppVersion();
  const value = `MediaBrowser Client="Seerr", Device="Seerr", DeviceId="${deviceId}", Version="${version}"${
    token ? `, Token="${token}"` : ''
  }`;

  return mediaServerType === MediaServerType.EMBY
    ? { 'X-Emby-Authorization': value }
    : { Authorization: value };
};
