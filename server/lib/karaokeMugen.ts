import { createHash } from 'node:crypto';
import { WebSocket } from 'undici';

export interface KaraokeMugenStatus {
  configured: boolean;
  playerUrl?: string;
}

export interface KaraokeSong {
  id: string;
  title: string;
  artists: string[];
  language?: string;
  categories: string[];
  durationSeconds?: number;
  availability: 'ready' | 'downloading' | 'remote' | 'unknown';
  hasWarnings: boolean;
}

export interface KaraokeQueueItem {
  id: string;
  playlistContentId?: number;
  title: string;
  artists: string[];
  requester?: string;
  position?: number;
  durationSeconds?: number;
  playing: boolean;
  needsReview: boolean;
}

export interface KaraokeLyricLine {
  startSeconds: number;
  endSeconds: number;
  text: string;
}

export interface KaraokePlayerState {
  status: 'play' | 'pause' | 'stop' | 'unknown';
  playing: boolean;
  timeSeconds?: number;
  volume?: number;
  muted?: boolean;
  subtitlesVisible?: boolean;
  isOperating?: boolean;
  stoppingAfterCurrent?: boolean;
}

export interface KaraokeSession {
  name: string;
  waiting: KaraokeQueueItem[];
  upcoming: KaraokeQueueItem[];
  current?: KaraokeQueueItem;
  player?: KaraokePlayerState;
  lyrics: KaraokeLyricLine[];
}

export type KaraokePlayerCommand =
  | 'play'
  | 'pause'
  | 'skip'
  | 'prev'
  | 'stopAfter'
  | 'mute'
  | 'unmute'
  | 'showSubs'
  | 'hideSubs'
  | 'seek'
  | 'setVolume';

type JsonRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

const idText = (value: unknown): string | undefined =>
  typeof value === 'number' && Number.isFinite(value)
    ? String(value)
    : text(value);

const getConfig = () => {
  const baseUrl = process.env.SEERRNG_KARAOKE_MUGEN_URL?.trim();
  const username = process.env.SEERRNG_KARAOKE_MUGEN_USERNAME?.trim();
  const password = process.env.SEERRNG_KARAOKE_MUGEN_PASSWORD;

  if (!baseUrl || !username || !password) return undefined;

  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error('The Karaoke Mugen server URL is invalid.');
  }

  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error('The Karaoke Mugen server URL is invalid.');
  }

  url.pathname = url.pathname.replace(/\/+$/, '');
  return { url, username, password };
};

const safePlayerUrl = (): string | undefined => {
  const value = process.env.SEERRNG_KARAOKE_MUGEN_PLAYER_URL?.trim();
  if (!value) return undefined;

  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
      return undefined;
    }
    return url.toString();
  } catch {
    return undefined;
  }
};

const toSocketUrl = (url: URL): string => {
  const socketUrl = new URL(url.toString());
  socketUrl.protocol = socketUrl.protocol === 'https:' ? 'wss:' : 'ws:';
  socketUrl.pathname = socketUrl.pathname.replace(/\/+$/, '') + '/socket.io/';
  socketUrl.search = 'EIO=4&transport=websocket';
  return socketUrl.toString();
};

class KaraokeMugenSocket {
  private readonly socket: WebSocket;
  private nextAckId = 0;
  private readonly pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }
  >();
  private readonly ready: Promise<void>;

  constructor(url: URL) {
    this.socket = new WebSocket(toSocketUrl(url));
    this.ready = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Karaoke Mugen connection timed out.')), 10000);
      this.socket.addEventListener('error', () => {
        clearTimeout(timer);
        reject(new Error('Unable to connect to Karaoke Mugen.'));
      });
      this.socket.addEventListener('close', () => {
        clearTimeout(timer);
        reject(new Error('Karaoke Mugen closed the connection.'));
        this.rejectPending(new Error('Karaoke Mugen closed the connection.'));
      });
      this.socket.addEventListener('message', (event) => {
        const packet = String(event.data);
        if (packet.startsWith('0')) {
          this.socket.send('40');
          return;
        }
        if (packet === '2') {
          this.socket.send('3');
          return;
        }
        if (packet.startsWith('40')) {
          clearTimeout(timer);
          resolve();
          return;
        }
        if (packet.startsWith('44')) {
          clearTimeout(timer);
          reject(new Error('Karaoke Mugen rejected the connection.'));
          return;
        }
        if (packet.startsWith('43')) this.resolveAck(packet.slice(2));
      });
    });
  }

  private rejectPending(error: Error) {
    for (const item of this.pending.values()) {
      clearTimeout(item.timer);
      item.reject(error);
    }
    this.pending.clear();
  }

  private resolveAck(packet: string) {
    const match = packet.match(/^(\d+)(.*)$/s);
    if (!match) return;
    const id = Number(match[1]);
    const pending = this.pending.get(id);
    if (!pending) return;
    this.pending.delete(id);
    clearTimeout(pending.timer);

    try {
      const values = JSON.parse(match[2]) as unknown;
      const value = Array.isArray(values) ? values[0] : values;
      if (isRecord(value) && value.err === true) {
        const errorData = isRecord(value.data) ? value.data : undefined;
        const errorMessage =
          errorData && isRecord(errorData.message)
            ? errorData.message
            : isRecord(value.message)
              ? value.message
              : undefined;
        const message =
          errorMessage && typeof errorMessage.code === 'string'
            ? errorMessage.code
            : 'The Karaoke Mugen request failed.';
        pending.reject(new Error(message));
        return;
      }
      pending.resolve(isRecord(value) && 'data' in value ? value.data : value);
    } catch {
      pending.reject(new Error('Karaoke Mugen returned an invalid response.'));
    }
  }

  async call(eventName: string, body: JsonRecord = {}, token?: string): Promise<unknown> {
    await this.ready;
    if (this.socket.readyState !== WebSocket.OPEN) {
      throw new Error('Karaoke Mugen is not connected.');
    }

    const id = this.nextAckId++;
    const envelope: JsonRecord = { body };
    if (token) envelope.authorization = token;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('Karaoke Mugen did not respond in time.'));
      }, 10000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send('42' + id + JSON.stringify([eventName, envelope]));
    });
  }

  close() {
    this.rejectPending(new Error('Karaoke Mugen connection closed.'));
    if (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING) {
      this.socket.close();
    }
  }
}

const asArray = (value: unknown): JsonRecord[] =>
  Array.isArray(value) ? value.filter(isRecord) : [];

const stringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .map((item) => (isRecord(item) ? text(item.name) : text(item)))
        .filter((item): item is string => !!item)
    : [];

const localizedTitle = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (!isRecord(value)) return '';
  return (
    text(value.eng) ??
    Object.values(value).find((item): item is string => typeof item === 'string') ??
    ''
  );
};

const songFromProvider = (value: JsonRecord): KaraokeSong | undefined => {
  const id = text(value.kid);
  const title = localizedTitle(value.titles) || text(value.title) || text(value.mediafile);
  if (!id || !title) return undefined;

  const tags = [...asArray(value.singers), ...asArray(value.songtypes), ...asArray(value.langs)];
  const downloadStatus = text(value.download_status);
  const availability =
    downloadStatus === 'DOWNLOADED'
      ? 'ready'
      : downloadStatus === 'DOWNLOADING'
        ? 'downloading'
        : downloadStatus === 'MISSING'
          ? 'remote'
          : 'unknown';

  return {
    id,
    title,
    artists: stringArray(value.singers),
    language: stringArray(value.langs)[0],
    categories: stringArray(value.songtypes),
    durationSeconds:
      typeof value.duration === 'number' && Number.isFinite(value.duration)
        ? value.duration
        : undefined,
    availability,
    hasWarnings: tags.some((tag) => tag.problematic === true),
  };
};

const queueItemFromProvider = (value: JsonRecord): KaraokeQueueItem | undefined => {
  const rawPlaylistContentId =
    idText(value.playlistcontent_id) ?? idText(value.plcid);
  const playlistContentIdValue = rawPlaylistContentId
    ? Number(rawPlaylistContentId)
    : undefined;
  const playlistContentId =
    playlistContentIdValue !== undefined &&
    Number.isSafeInteger(playlistContentIdValue) &&
    playlistContentIdValue > 0
      ? playlistContentIdValue
      : undefined;
  const nested = isRecord(value.kara) ? value.kara : value;
  const id = idText(nested.kid) ?? idText(value.kid) ?? idText(playlistContentId);
  const title =
    localizedTitle(nested.titles) || text(nested.title) || text(value.mediafile);
  if (!id || !title) return undefined;

  return {
    id,
    ...(playlistContentId !== undefined ? { playlistContentId } : {}),
    title,
    artists: stringArray(nested.singers),
    requester: text(value.nickname) ?? text(value.requester),
    position: typeof value.pos === 'number' ? value.pos : undefined,
    durationSeconds:
      typeof nested.duration === 'number' && Number.isFinite(nested.duration)
        ? nested.duration
        : undefined,
    playing: value.flag_playing === true,
    needsReview: value.flag_accepted !== true && value.flag_refused !== true,
  };
};

const lyricLinesFromProvider = (value: unknown): KaraokeLyricLine[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((line) => ({
      startSeconds: line.start,
      endSeconds: line.end,
      text: text(line.text),
    }))
    .filter(
      (line): line is KaraokeLyricLine =>
        typeof line.startSeconds === 'number' &&
        Number.isFinite(line.startSeconds) &&
        typeof line.endSeconds === 'number' &&
        Number.isFinite(line.endSeconds) &&
        line.startSeconds >= 0 &&
        line.endSeconds >= line.startSeconds &&
        typeof line.text === 'string'
    );
};

const playerStateFromProvider = (value: unknown): KaraokePlayerState | undefined => {
  if (!isRecord(value)) return undefined;
  const rawStatus = text(value.playerStatus);
  const status =
    rawStatus === 'play' || rawStatus === 'pause' || rawStatus === 'stop'
      ? rawStatus
      : 'unknown';
  const timeSeconds =
    typeof value.timeposition === 'number' && Number.isFinite(value.timeposition)
      ? Math.max(0, value.timeposition)
      : undefined;
  const volume =
    typeof value.volume === 'number' && Number.isFinite(value.volume)
      ? Math.max(0, Math.min(100, value.volume))
      : undefined;
  return {
    status,
    playing: value.playing === true || status === 'play',
    ...(timeSeconds !== undefined ? { timeSeconds } : {}),
    ...(volume !== undefined ? { volume } : {}),
    ...(typeof value.mute === 'boolean' ? { muted: value.mute } : {}),
    ...(typeof value.showSubs === 'boolean'
      ? { subtitlesVisible: value.showSubs }
      : {}),
    ...(typeof value.isOperating === 'boolean'
      ? { isOperating: value.isOperating }
      : {}),
    ...(typeof value.stopping === 'boolean'
      ? { stoppingAfterCurrent: value.stopping }
      : {}),
  };
};

const unwrapArray = (value: unknown, property: string): JsonRecord[] => {
  if (Array.isArray(value)) return asArray(value);
  if (isRecord(value)) return asArray(value[property]);
  return [];
};

export class KaraokeMugenProvider {
  private readonly lyricsCache = new Map<
    string,
    { expiresAt: number; lines: KaraokeLyricLine[] }
  >();

  private async getLyrics(
    socket: KaraokeMugenSocket,
    token: string,
    songId: string
  ): Promise<KaraokeLyricLine[]> {
    const cached = this.lyricsCache.get(songId);
    if (cached && cached.expiresAt > Date.now()) return cached.lines;

    const lines = lyricLinesFromProvider(
      await socket.call('getKaraLyrics', { kid: songId }, token)
    );
    this.lyricsCache.delete(songId);
    this.lyricsCache.set(songId, {
      expiresAt: Date.now() + 5 * 60 * 1000,
      lines,
    });
    if (this.lyricsCache.size > 20) {
      const firstKey = this.lyricsCache.keys().next().value;
      if (firstKey) this.lyricsCache.delete(firstKey);
    }
    return lines;
  }

  static status(): KaraokeMugenStatus {
    const configured = !!(
      process.env.SEERRNG_KARAOKE_MUGEN_URL?.trim() &&
      process.env.SEERRNG_KARAOKE_MUGEN_USERNAME?.trim() &&
      process.env.SEERRNG_KARAOKE_MUGEN_PASSWORD
    );
    const playerUrl = configured ? safePlayerUrl() : undefined;
    return { configured, ...(playerUrl ? { playerUrl } : {}) };
  }

  private async withAdmin<T>(
    operation: (socket: KaraokeMugenSocket, token: string) => Promise<T>
  ): Promise<T> {
    const config = getConfig();
    if (!config) throw new Error('Karaoke Mugen is not configured.');

    const socket = new KaraokeMugenSocket(config.url);
    try {
      const login = await socket.call('login', {
        username: config.username,
        password: config.password,
      });
      const token = isRecord(login) ? text(login.token) : undefined;
      if (!token) throw new Error('Karaoke Mugen sign-in failed.');
      return await operation(socket, token);
    } finally {
      socket.close();
    }
  }

  async search(query: string, limit: number): Promise<KaraokeSong[]> {
    return this.withAdmin(async (socket, token) => {
      const result = await socket.call(
        'getKaras',
        { filter: query, from: 0, size: limit, blacklist: true },
        token
      );
      return unwrapArray(result, 'content')
        .map(songFromProvider)
        .filter((item): item is KaraokeSong => !!item);
    });
  }

  async session(): Promise<KaraokeSession | undefined> {
    return this.withAdmin(async (socket, token) => {
      const [playlistResult, playerStatusResult] = await Promise.all([
        socket.call('getPlaylists', {}, token),
        socket.call('getPlayerStatus', {}, token),
      ]);
      const playlists = unwrapArray(playlistResult, 'playlists');
      const publicPlaylist = playlists.find((playlist) => playlist.flag_public === true);
      if (!publicPlaylist) return undefined;

      const currentPlaylist = playlists.find((playlist) => playlist.flag_current === true);
      const requestPlaylistId = idText(publicPlaylist.plaid);
      if (!requestPlaylistId) return undefined;

      const requestResult = await socket.call(
        'getPlaylistContents',
        {
          plaid: requestPlaylistId,
          filter: null,
          from: 0,
          size: 50,
          incomingSongs: true,
        },
        token
      );
      const waiting = unwrapArray(requestResult, 'contents')
        .map(queueItemFromProvider)
        .filter((item): item is KaraokeQueueItem => !!item)
        .filter((item) => item.needsReview);

      let current: KaraokeQueueItem | undefined;
      let upcoming: KaraokeQueueItem[] = [];
      const currentId = currentPlaylist ? idText(currentPlaylist.plaid) : undefined;
      if (currentId) {
        const currentResult = await socket.call(
          'getPlaylistContents',
          {
            plaid: currentId,
            filter: null,
            from: -1,
            size: 50,
            incomingSongs: false,
          },
          token
        );
        const currentItems = unwrapArray(currentResult, 'contents')
          .map(queueItemFromProvider)
          .filter((item): item is KaraokeQueueItem => !!item);
        const currentIndex = currentItems.findIndex((item) => item.playing);
        if (currentIndex >= 0) {
          current = currentItems[currentIndex];
          upcoming = currentItems
            .slice(currentIndex + 1)
            .filter((item) => !item.playing);
        } else {
          upcoming = currentItems.filter((item) => !item.playing);
        }
      }

      const playerRecord = isRecord(playerStatusResult) ? playerStatusResult : undefined;
      const statusSong =
        playerRecord && isRecord(playerRecord.currentSong)
          ? queueItemFromProvider(playerRecord.currentSong)
          : undefined;
      if (!current && statusSong) {
        current = {
          ...statusSong,
          playing: true,
          needsReview: false,
        };
      }
      const player = playerStateFromProvider(playerStatusResult);
      let lyrics: KaraokeLyricLine[] = [];
      if (current?.id) {
        try {
          lyrics = await this.getLyrics(socket, token, current.id);
        } catch (error) {
          if (!(error instanceof Error) || error.message !== 'LYRICS_VIEW_ERROR') {
            throw error;
          }
        }
      }

      return {
        name: text(publicPlaylist.name) ?? 'Karaoke session',
        waiting,
        upcoming,
        lyrics,
        ...(player ? { player } : {}),
        ...(current ? { current } : {}),
      };
    });
  }

  async requestSong(
    songId: string,
    requester: string,
    requesterId: number
  ): Promise<{ position?: number }> {
    return this.withAdmin(async (socket, adminToken) => {
      const suffix = createHash('sha256')
        .update(String(requesterId))
        .digest('hex')
        .slice(0, 16);
      const guestName = 'SeerrNG guest ' + suffix;
      const guestLogin = 'seerrng_guest_' + suffix;

      let guest: unknown;
      try {
        guest = await socket.call('login', { username: guestLogin, password: '' });
      } catch (error) {
        if (!(error instanceof Error) || error.message !== 'LOG_ERROR') throw error;
      }

      if (!isRecord(guest) || !text(guest.token)) {
        try {
          guest = await socket.call('loginGuest', { name: guestName });
        } catch (error) {
          if (!(error instanceof Error) || error.message !== 'USER_ALREADY_EXISTS') {
            throw error;
          }
          guest = await socket.call('login', { username: guestLogin, password: '' });
        }
      }

      const guestToken = isRecord(guest) ? text(guest.token) : undefined;
      const actualGuestLogin = isRecord(guest) ? text(guest.username) : undefined;
      if (!guestToken) throw new Error('Karaoke Mugen guest access is unavailable.');
      if (actualGuestLogin !== guestLogin) {
        throw new Error('KARAOKE_MUGEN_CUSTOM_TEMPORARY_GUESTS_REQUIRED');
      }

      const nickname =
        Array.from(requester).slice(0, 28).join('') + ' · ' + suffix;
      await socket.call('editUser', { login: guestLogin, nickname }, adminToken);

      const result = await socket.call(
        'addKaraToPublicPlaylist',
        { kids: [songId] },
        guestToken
      );
      const resultData = isRecord(result) && isRecord(result.data) ? result.data : result;
      const added =
        isRecord(resultData) && isRecord(resultData.plc) ? resultData.plc : undefined;
      return {
        ...(added && typeof added.pos === 'number' ? { position: added.pos } : {}),
      };
    });
  }

  async moderateRequest(
    playlistContentId: number,
    decision: 'accept' | 'reject'
  ): Promise<void> {
    await this.withAdmin(async (socket, token) => {
      const [playlistItem, playlistResult] = await Promise.all([
        socket.call('getPLC', { plc_id: playlistContentId }, token),
        socket.call('getPlaylists', {}, token),
      ]);
      const publicPlaylist = unwrapArray(playlistResult, 'playlists').find(
        (playlist) => playlist.flag_public === true
      );
      if (
        !isRecord(playlistItem) ||
        !publicPlaylist ||
        idText(playlistItem.plaid) !== idText(publicPlaylist.plaid)
      ) {
        throw new Error('KARAOKE_REQUEST_NOT_FOUND');
      }
      if (playlistItem.flag_accepted === true || playlistItem.flag_refused === true) {
        throw new Error('KARAOKE_REQUEST_ALREADY_REVIEWED');
      }
      await socket.call(
        'editPLC',
        {
          plc_ids: [playlistContentId],
          ...(decision === 'accept'
            ? { flag_accepted: true }
            : { flag_refused: true }),
        },
        token
      );
    });
  }

  async control(
    command: KaraokePlayerCommand,
    options?: number
  ): Promise<void> {
    await this.withAdmin(async (socket, token) => {
      await socket.call(
        'sendPlayerCommand',
        { command, options: options ?? null },
        token
      );
    });
  }
}

export const karaokeMugenProvider = new KaraokeMugenProvider();
