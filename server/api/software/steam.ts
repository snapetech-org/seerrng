import { userAgentRequestInterceptor } from '@server/utils/userAgent';
import type { AxiosInstance } from 'axios';
import axios from 'axios';

export const STEAM_OPENID_ENDPOINT = 'https://steamcommunity.com/openid/login';
const STEAM_OWNED_GAMES_ENDPOINT =
  'https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/';

export const MAX_STEAM_GAMES_PER_SYNC = 10_000;

export interface SteamOwnedGame {
  appId: number;
  name: string;
  playtimeMinutes: number;
}

export class SteamLibraryUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SteamLibraryUnavailableError';
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

export class SteamAPI {
  private readonly client: AxiosInstance;

  constructor(
    private readonly apiKey: string,
    client: AxiosInstance = axios.create({
      timeout: 15_000,
      maxRedirects: 0,
      maxContentLength: 16 * 1024 * 1024,
    })
  ) {
    this.client = client;
    this.client.interceptors.request.use(userAgentRequestInterceptor);
  }

  public async verifyOpenIdAssertion(
    assertion: Record<string, string>
  ): Promise<boolean> {
    const body = new URLSearchParams();
    for (const [name, value] of Object.entries(assertion)) {
      if (name.startsWith('openid.') && name !== 'openid.mode') {
        body.set(name, value);
      }
    }
    body.set('openid.mode', 'check_authentication');

    const response = await this.client.post<string>(
      STEAM_OPENID_ENDPOINT,
      body,
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        responseType: 'text',
      }
    );
    return /(?:^|\r?\n)is_valid:true(?:\r?\n|$)/.test(response.data);
  }

  public async getOwnedGames(steamId: string): Promise<SteamOwnedGame[]> {
    if (!this.apiKey) {
      throw new SteamLibraryUnavailableError(
        'Steam library sync is not configured by an administrator.'
      );
    }

    const response = await this.client.get<unknown>(
      STEAM_OWNED_GAMES_ENDPOINT,
      {
        params: {
          key: this.apiKey,
          steamid: steamId,
          include_appinfo: 1,
          include_played_free_games: 1,
        },
      }
    );
    const payload = isRecord(response.data)
      ? response.data.response
      : undefined;
    if (
      !isRecord(payload) ||
      !Number.isSafeInteger(payload.game_count) ||
      !Array.isArray(payload.games)
    ) {
      throw new SteamLibraryUnavailableError(
        'Steam did not return a public game library. Set Steam Game Details to Public and try again.'
      );
    }

    const gameCount = payload.game_count as number;
    if (
      gameCount < 0 ||
      gameCount > MAX_STEAM_GAMES_PER_SYNC ||
      payload.games.length !== gameCount
    ) {
      throw new SteamLibraryUnavailableError(
        'Steam returned an incomplete or unusually large game library. No library changes were saved.'
      );
    }

    const games: SteamOwnedGame[] = [];
    const seen = new Set<number>();
    for (const entry of payload.games) {
      if (
        !isRecord(entry) ||
        !Number.isSafeInteger(entry.appid) ||
        (entry.appid as number) <= 0 ||
        typeof entry.name !== 'string' ||
        !entry.name.trim() ||
        !Number.isSafeInteger(entry.playtime_forever) ||
        (entry.playtime_forever as number) < 0
      ) {
        throw new SteamLibraryUnavailableError(
          'Steam returned an invalid game record. No library changes were saved.'
        );
      }
      const appId = entry.appid as number;
      if (seen.has(appId)) {
        throw new SteamLibraryUnavailableError(
          'Steam returned duplicate game records. No library changes were saved.'
        );
      }
      seen.add(appId);
      games.push({
        appId,
        name: entry.name.trim().slice(0, 512),
        playtimeMinutes: entry.playtime_forever as number,
      });
    }

    return games;
  }
}

export default SteamAPI;
