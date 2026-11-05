import type { DownloadClientSettings } from '@server/lib/settings';
import { buildServiceUrl } from '@server/utils/serviceUrl';
import type { AxiosRequestConfig } from 'axios';

export type LiveTorrentState =
  | 'downloading'
  | 'stalled'
  | 'queued'
  | 'paused'
  | 'checking'
  | 'metadata'
  | 'seeding'
  | 'completed'
  | 'error'
  | 'unknown';

export interface LiveTorrentStatus {
  /** Lowercase hexadecimal info hash. */
  hash: string;
  state: LiveTorrentState;
  /** Selected payload size in bytes. */
  size: number;
  sizeLeft: number;
  /** Completion from 0 to 1. */
  progress: number;
  /** Bytes per second. */
  downloadRate: number;
  uploadRate: number;
  /** Seconds remaining, or null when the client cannot estimate it. */
  etaSeconds: number | null;
  seeds: number | null;
  peers: number | null;
  message?: string;
}

export interface DownloadClientTestResult {
  version?: string;
}

/**
 * Read-only view of a torrent client. Adapters never add, change, or remove
 * torrents; SeerrNG only observes downloads that an *arr service started.
 */
export interface DownloadClientAdapter {
  testConnection(): Promise<DownloadClientTestResult>;
  getTorrents(hashes: string[]): Promise<LiveTorrentStatus[]>;
}

export const DOWNLOAD_CLIENT_TIMEOUT_MS = 10_000;
export const DOWNLOAD_CLIENT_MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

export const baseRequestConfig: AxiosRequestConfig = {
  timeout: DOWNLOAD_CLIENT_TIMEOUT_MS,
  maxContentLength: DOWNLOAD_CLIENT_MAX_RESPONSE_BYTES,
  maxBodyLength: 1024 * 1024,
  maxRedirects: 0,
  validateStatus: () => true,
};

const INFO_HASH_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

/** SABnzbd queue IDs; SABnzbd builds them as `SABnzbd_nzo_{id}`. */
export const SABNZBD_NZO_PATTERN = /^SABnzbd_nzo_[A-Za-z0-9]{1,64}$/;

/** True for a SABnzbd queue ID. These are Usenet jobs, never torrents. */
export const isUsenetDownloadKey = (key: string): boolean =>
  SABNZBD_NZO_PATTERN.test(key);

/** Returns a lowercase info hash, or undefined for non-torrent download IDs. */
export const normalizeInfoHash = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const hash = value.trim().toLowerCase();
  return INFO_HASH_PATTERN.test(hash) ? hash : undefined;
};

/**
 * Returns the key used for live progress: a lowercase torrent info hash or a
 * SABnzbd queue ID. Anything else is not a live-progress download.
 */
export const normalizeDownloadKey = (value: unknown): string | undefined => {
  const hash = normalizeInfoHash(value);
  if (hash) return hash;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return SABNZBD_NZO_PATTERN.test(trimmed) ? trimmed : undefined;
};

/** Keys a client can answer for: SABnzbd takes queue IDs, the rest take hashes. */
export const keysForClientType = (
  type: string,
  keys: readonly string[]
): string[] =>
  keys.filter((key) =>
    type === 'sabnzbd' ? isUsenetDownloadKey(key) : !isUsenetDownloadKey(key)
  );

export const clientUrl = (
  settings: Pick<
    DownloadClientSettings,
    'useSsl' | 'hostname' | 'port' | 'baseUrl'
  >,
  path: string
): string =>
  buildServiceUrl({
    useSsl: settings.useSsl,
    hostname: settings.hostname,
    port: settings.port,
    urlBase: settings.baseUrl,
    path,
  });

export const finiteNumber = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

export const nonNegative = (value: unknown): number =>
  Math.max(0, finiteNumber(value));

export const optionalCount = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : null;

export const clampProgress = (value: number): number =>
  Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));

export const estimateEta = (
  sizeLeft: number,
  downloadRate: number
): number | null =>
  sizeLeft <= 0
    ? 0
    : downloadRate > 0
      ? Math.round(sizeLeft / downloadRate)
      : null;

/** Keeps short, single-line client messages; drops anything else. */
export const safeMessage = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.replace(/[\r\n\0]+/g, ' ').trim();
  return trimmed ? trimmed.slice(0, 200) : undefined;
};

export class DownloadClientError extends Error {
  constructor(
    message: string,
    public readonly kind: 'auth' | 'connection' | 'protocol',
    public readonly messageOrigin: 'app' | 'opaque' = 'app'
  ) {
    super(message);
    this.name = 'DownloadClientError';
  }
}

export const readSetCookie = (
  headers: Record<string, unknown>,
  name: string | RegExp
): string | undefined => {
  const raw = headers['set-cookie'];
  const values = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
      ? [raw]
      : [];
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const [pair] = value.split(';');
    const separator = pair.indexOf('=');
    const cookieName = pair.slice(0, separator).trim();
    if (
      separator > 0 &&
      (typeof name === 'string' ? cookieName === name : name.test(cookieName))
    ) {
      return `${cookieName}=${pair.slice(separator + 1).trim()}`;
    }
  }
  return undefined;
};
