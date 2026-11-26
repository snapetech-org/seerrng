import { useSyncExternalStore } from 'react';
import { readerServiceUrl, type MusicServiceSummary } from './api';
import { onSessionReset } from './sessionState';

// Lumen never plays a whole song itself: Play hands off to the music app the
// person picked (Aurral by default), and songs that are not downloaded yet get
// a 30-second preview here so people can check them before asking for them.

export type MusicPlayer = 'aurral' | 'plex' | 'shelf';
export const MUSIC_PLAYERS: readonly MusicPlayer[] = [
  'aurral',
  'plex',
  'shelf',
];
// Shelf (the phone app) has no links yet; it stays visible as "coming".
export const AVAILABLE_MUSIC_PLAYERS: readonly MusicPlayer[] = [
  'aurral',
  'plex',
];

export interface PlayableTrack {
  title: string;
  artistName?: string | null;
  albumTitle?: string | null;
  albumMbid?: string | null;
  artistMbid?: string | null;
  previewDeezerId?: string | null;
}

export interface PlayableAlbum {
  title: string;
  artistName?: string | null;
  mbid?: string | null;
}

export interface PlayableArtist {
  name: string;
  mbid?: string | null;
}

export type PlayTarget =
  | { kind: 'track'; track: PlayableTrack }
  | { kind: 'album'; album: PlayableAlbum }
  | { kind: 'artist'; artist: PlayableArtist };

// The Aurral web address SeerrNG knows about, without a trailing slash.
export const aurralBaseUrl = (
  services?: MusicServiceSummary[] | null
): string | null => {
  const list = Array.isArray(services) ? services : [];
  const aurral =
    list.find((s) => s?.backendType === 'aurral' && s.isDefault) ??
    list.find((s) => s?.backendType === 'aurral');
  if (!aurral) return null;
  const candidate =
    aurral.externalUrl ||
    (aurral.hostname
      ? /^https?:\/\//i.test(aurral.hostname)
        ? aurral.hostname
        : `${aurral.useSsl ? 'https' : 'http'}://${aurral.hostname}${aurral.port ? `:${aurral.port}` : ''}${aurral.urlBase ? `/${aurral.urlBase.replace(/^\/+|\/+$/g, '')}` : ''}`
      : '');
  if (!candidate) return null;
  const url = readerServiceUrl(candidate);
  if (!url) return null;
  url.search = '';
  url.hash = '';
  return url.href.replace(/\/+$/, '');
};

const query = (params: Record<string, string | null | undefined>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const text = (value ?? '').trim();
    if (text) search.set(key, text);
  }
  return search.toString();
};

// Aurral 3 resolves /go/album and /go/artist links by name, so a song opens on
// its album page even when we only know names.
export const aurralLink = (base: string, target: PlayTarget): string => {
  if (target.kind === 'artist') {
    const { artist } = target;
    return artist.mbid
      ? `${base}/artist/${encodeURIComponent(artist.mbid)}`
      : `${base}/go/artist?${query({ name: artist.name })}`;
  }
  if (target.kind === 'album') {
    const { album } = target;
    if (album.mbid) return `${base}/album/${encodeURIComponent(album.mbid)}`;
    return album.artistName
      ? `${base}/go/album?${query({ artist: album.artistName, name: album.title })}`
      : `${base}/search?${query({ q: album.title })}`;
  }
  const { track } = target;
  if (track.albumMbid)
    return `${base}/album/${encodeURIComponent(track.albumMbid)}`;
  if (track.artistName && track.albumTitle)
    return `${base}/go/album?${query({
      artist: track.artistName,
      name: track.albumTitle,
      track: track.title,
    })}`;
  return `${base}/search?${query({
    q: [track.artistName, track.title].filter(Boolean).join(' '),
  })}`;
};

const searchText = (target: PlayTarget) =>
  target.kind === 'artist'
    ? target.artist.name
    : target.kind === 'album'
      ? [target.album.artistName, target.album.title].filter(Boolean).join(' ')
      : [target.track.artistName, target.track.title].filter(Boolean).join(' ');

export const plexLink = (target: PlayTarget) =>
  `https://app.plex.tv/desktop/#!/search?${query({ query: searchText(target) })}`;

export const playLink = (
  player: MusicPlayer,
  target: PlayTarget,
  aurralBase: string | null
): string | null => {
  if (player === 'plex') return plexLink(target);
  if (player === 'aurral' && aurralBase) return aurralLink(aurralBase, target);
  // Shelf has no links yet: fall back to Aurral, or Plex without Aurral, so
  // Play still works
  return aurralBase ? aurralLink(aurralBase, target) : plexLink(target);
};

// Every Play goes to the same named tab, so music keeps playing there while
// people keep browsing Lumen, and repeated Plays never pile up tabs.
export const PLAYER_WINDOW = 'lumen-music-player';

export function openPlayer(url: string) {
  stopPreview();
  const opened = window.open(url, PLAYER_WINDOW);
  if (opened) {
    try {
      // The player page does not need a handle back to Lumen.
      opened.opener = null;
    } catch {
      /* cross-origin windows may refuse; harmless */
    }
    opened.focus?.();
  } else {
    window.location.assign(url);
  }
}

// --- 30-second previews -----------------------------------------------------

export interface PreviewState {
  key: string | null;
  title: string;
  artistName: string;
  cover?: string | null;
  status: 'idle' | 'loading' | 'playing' | 'paused' | 'missing';
  position: number;
  duration: number;
  track: PlayableTrack | null;
}

const idle: PreviewState = {
  key: null,
  title: '',
  artistName: '',
  status: 'idle',
  position: 0,
  duration: 30,
  track: null,
};

let state: PreviewState = idle;
let audio: HTMLAudioElement | null = null;
const listeners = new Set<() => void>();

const emit = (next: Partial<PreviewState>) => {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
};

const isAbort = (error: unknown) =>
  error instanceof DOMException && error.name === 'AbortError';

export const previewKey = (track: PlayableTrack) =>
  [
    track.artistName ?? '',
    track.title,
    track.previewDeezerId || track.albumMbid || track.albumTitle || '',
  ]
    .join('::')
    .toLowerCase();

// SeerrNG's request validator refuses '+' for spaces, so API links use %20
// (encodeURIComponent), not URLSearchParams.
export const apiQuery = (params: Record<string, string | null | undefined>) =>
  Object.entries(params)
    .map(([key, value]) => [key, (value ?? '').trim()] as const)
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');

export const previewUrl = (track: PlayableTrack) =>
  track.previewDeezerId && /^\d{1,20}$/.test(track.previewDeezerId)
    ? `/api/v1/music/preview?${apiQuery({ deezerId: track.previewDeezerId })}`
    : `/api/v1/music/preview?${apiQuery({ artist: track.artistName || '', track: track.title })}`;

const player = () => {
  if (audio) return audio;
  audio = new Audio();
  audio.preload = 'none';
  audio.addEventListener('playing', () => emit({ status: 'playing' }));
  audio.addEventListener('pause', () => {
    if (state.status === 'playing') emit({ status: 'paused' });
  });
  audio.addEventListener('timeupdate', () =>
    emit({
      position: audio?.currentTime ?? 0,
      duration:
        audio && Number.isFinite(audio.duration) && audio.duration > 0
          ? audio.duration
          : 30,
    })
  );
  audio.addEventListener('ended', () =>
    emit({ status: 'paused', position: 0 })
  );
  audio.addEventListener('error', () => {
    if (state.key) emit({ status: 'missing' });
  });
  return audio;
};

export function togglePreview(track: PlayableTrack, cover?: string | null) {
  const el = player();
  const key = previewKey(track);
  if (state.key === key && state.status !== 'missing') {
    if (state.status === 'playing' || state.status === 'loading') {
      el.pause();
      emit({ status: 'paused' });
    } else
      void el.play().catch((error: unknown) => {
        if (!isAbort(error)) emit({ status: 'missing' });
      });
    return;
  }
  el.pause();
  el.src = previewUrl(track);
  emit({
    key,
    title: track.title,
    artistName: track.artistName ?? '',
    cover,
    status: 'loading',
    position: 0,
    duration: 30,
    track,
  });
  void el.play().catch((error: unknown) => {
    // a pause or a newer preview interrupting this one is not a missing clip
    if (state.key === key && !isAbort(error)) emit({ status: 'missing' });
  });
}

export function stopPreview() {
  if (audio) {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  }
  if (state.key) emit(idle);
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const usePreview = () =>
  useSyncExternalStore(
    subscribe,
    () => state,
    () => idle
  );

// A preview button only needs its own state, so it re-renders when that changes,
// not on every progress tick of whatever is playing.
export const usePreviewStatus = (key: string): PreviewState['status'] =>
  useSyncExternalStore(
    subscribe,
    () => (state.key === key ? state.status : 'idle'),
    () => 'idle'
  );

// signing out stops any preview that is still playing
onSessionReset(() => stopPreview());
