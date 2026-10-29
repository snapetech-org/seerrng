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
  title: string;
  artists: string[];
  requester?: string;
  position?: number;
  playing: boolean;
}

export interface KaraokeSession {
  name: string;
  waiting: KaraokeQueueItem[];
  current?: KaraokeQueueItem;
}

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
        const message =
          isRecord(value.message) && typeof value.message.code === 'string'
            ? value.message.code
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
  const id = idText(value.kid) ?? idText(value.playlistcontent_id);
  const nested = isRecord(value.kara) ? value.kara : value;
  const title =
    localizedTitle(nested.titles) || text(nested.title) || text(value.mediafile);
  if (!id || !title) return undefined;

  return {
    id,
    title,
    artists: stringArray(nested.singers),
    requester: text(value.nickname) ?? text(value.requester),
    position: typeof value.pos === 'number' ? value.pos : undefined,
    playing: value.flag_playing === true,
  };
};

const unwrapArray = (value: unknown, property: string): JsonRecord[] => {
  if (Array.isArray(value)) return asArray(value);
  if (isRecord(value)) return asArray(value[property]);
  return [];
};

export class KaraokeMugenProvider {
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
      const playlists = unwrapArray(await socket.call('getPlaylists', {}, token), 'playlists');
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
        .filter((item): item is KaraokeQueueItem => !!item);

      let current: KaraokeQueueItem | undefined;
      const currentId = currentPlaylist ? idText(currentPlaylist.plaid) : undefined;
      if (currentId) {
        const currentResult = await socket.call(
          'getPlaylistContents',
          {
            plaid: currentId,
            filter: null,
            from: -1,
            size: 5,
            incomingSongs: false,
          },
          token
        );
        const currentItems = unwrapArray(currentResult, 'contents')
          .map(queueItemFromProvider)
          .filter((item): item is KaraokeQueueItem => !!item);
        current = currentItems.find((item) => item.playing);
      }

      return {
        name: text(publicPlaylist.name) ?? 'Karaoke session',
        waiting,
        ...(current ? { current } : {}),
      };
    });
  }

  async requestSong(songId: string, requester: string): Promise<{ position?: number }> {
    return this.withAdmin(async (socket) => {
      const guest = await socket.call('loginGuest', { name: requester });
      const guestToken = isRecord(guest) ? text(guest.token) : undefined;
      if (!guestToken) throw new Error('Karaoke Mugen guest access is unavailable.');

      const playlists = unwrapArray(await socket.call('getPlaylists', {}, guestToken), 'playlists');
      const publicPlaylist = playlists.find((playlist) => playlist.flag_public === true);
      const playlistId = publicPlaylist ? idText(publicPlaylist.plaid) : undefined;
      if (!playlistId) throw new Error('No public karaoke request queue is available.');

      const result = await socket.call(
        'addKaraToPlaylist',
        { plaid: playlistId, requester, kids: [songId] },
        guestToken
      );
      const added = isRecord(result) && isRecord(result.plc) ? result.plc : undefined;
      return {
        ...(added && typeof added.pos === 'number' ? { position: added.pos } : {}),
      };
    });
  }

  async control(command: 'play' | 'pause' | 'skip'): Promise<void> {
    await this.withAdmin(async (socket, token) => {
      await socket.call('sendPlayerCommand', { command, options: null }, token);
    });
  }
}

export const karaokeMugenProvider = new KaraokeMugenProvider();
