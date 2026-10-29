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

export type KaraokeSearchOrder = 'requested' | 'recent' | 'played' | 'history';

export interface KaraokeSearchResponse {
  results: KaraokeSongResponse[];
  from: number;
  total?: number;
  hasMore: boolean;
}

export interface KaraokeQueueItemResponse {
  id: string;
  playlistContentId?: number;
  title: string;
  artists: string[];
  requester?: string;
  position?: number;
  durationSeconds?: number;
  playing: boolean;
  needsReview: boolean;
  canCancel?: boolean;
}

export interface KaraokeLyricLineResponse {
  startSeconds: number;
  endSeconds: number;
  text: string;
}

export interface KaraokePlayerStatusResponse {
  status: 'play' | 'pause' | 'stop' | 'unknown';
  playing: boolean;
  timeSeconds?: number;
  volume?: number;
  muted?: boolean;
  subtitlesVisible?: boolean;
  isOperating?: boolean;
  stoppingAfterCurrent?: boolean;
}

export interface KaraokeSessionResponse {
  name: string;
  waiting: KaraokeQueueItemResponse[];
  upcoming: KaraokeQueueItemResponse[];
  current?: KaraokeQueueItemResponse;
  player?: KaraokePlayerStatusResponse;
  lyrics: KaraokeLyricLineResponse[];
}
