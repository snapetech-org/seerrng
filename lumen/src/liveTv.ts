import { useEffect } from 'react';
import { useApi } from './hooks';

export interface LiveTvStatus {
  configured: boolean;
  guideReady: boolean;
  canRequest: boolean;
}

export function useLiveTvStatus() {
  const status = useApi<LiveTvStatus>('/live-tv/status', {
    keepDuringRefresh: true,
  });
  const refresh = status.refresh;
  useEffect(() => {
    window.addEventListener('lumen-livetv-updated', refresh);
    return () => window.removeEventListener('lumen-livetv-updated', refresh);
  }, [refresh]);
  return status;
}
