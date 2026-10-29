export type KaraokeAvailability = 'ready' | 'downloading' | 'remote' | 'unknown';

export interface KaraokeSongResponse {
  id: string;
  title: string;
  artists: string[];
  language?: string;
  categories: string[];
  durationSeconds?: number;
  availability: KaraokeAvailability;
  hasWarnings: boolean;
}

export interface KaraokeQueueItemResponse {
  id: string;
  playlistContentId?: number;
  title: string;
  artists: string[];
  requester?: string;
  position?: number;
  playing: boolean;
  needsReview: boolean;
}

export interface KaraokeSessionResponse {
  name: string;
  waiting: KaraokeQueueItemResponse[];
  upcoming: KaraokeQueueItemResponse[];
  current?: KaraokeQueueItemResponse;
}
