import axios from 'axios';
import rateLimit from 'axios-rate-limit';

import {
  DEFAULT_MUSIC_METADATA_SETTINGS,
  MAX_COVER_ART_ARCHIVE_CONCURRENT_REQUESTS,
  MAX_COVER_ART_ARCHIVE_REQUESTS_PER_SECOND,
  type CoverArtArchiveSettings,
} from '@server/lib/settings';

const MAX_PENDING_COVER_ART_REQUESTS = 256;

interface QueuedRequest<T> {
  request: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}

/** A process-wide semaphore shared by every Cover Art Archive client. */
export class CoverArtArchiveRequestGate {
  private maxConcurrentRequests =
    DEFAULT_MUSIC_METADATA_SETTINGS.coverArtArchive.maxConcurrentRequests;
  private activeRequests = 0;
  private queue: QueuedRequest<unknown>[] = [];

  public configure(maxConcurrentRequests: number): void {
    this.maxConcurrentRequests = maxConcurrentRequests;
    this.drain();
  }

  public run<T>(request: () => Promise<T>): Promise<T> {
    if (this.queue.length >= MAX_PENDING_COVER_ART_REQUESTS) {
      return Promise.reject(
        new Error('Cover Art Archive request queue is full.')
      );
    }

    return new Promise<T>((resolve, reject) => {
      this.queue.push({ request, resolve, reject } as QueuedRequest<unknown>);
      this.drain();
    });
  }

  private drain(): void {
    while (
      this.activeRequests < this.maxConcurrentRequests &&
      this.queue.length > 0
    ) {
      const task = this.queue.shift();
      if (!task) return;

      this.activeRequests += 1;
      void Promise.resolve()
        .then(task.request)
        .then(task.resolve, task.reject)
        .finally(() => {
          this.activeRequests -= 1;
          this.drain();
        });
    }
  }
}

export const coverArtArchiveRequestGate = new CoverArtArchiveRequestGate();

let configuredMaxConcurrentRequests =
  DEFAULT_MUSIC_METADATA_SETTINGS.coverArtArchive.maxConcurrentRequests;

/** The CAA RPS limit is shared across requests and provider instances. */
export const coverArtArchiveHttpClient = rateLimit(axios.create(), {
  maxRequests:
    DEFAULT_MUSIC_METADATA_SETTINGS.coverArtArchive.maxRequestsPerSecond,
  perMilliseconds: 1000,
});

export const configureCoverArtArchiveLimits = (
  settings: CoverArtArchiveSettings | undefined
): void => {
  const isBoundedInteger = (value: unknown, maximum: number): value is number =>
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 1 &&
    value <= maximum;
  const maxConcurrentRequests = settings?.maxConcurrentRequests;
  const maxRequestsPerSecond = settings?.maxRequestsPerSecond;
  const safeConcurrentRequests = isBoundedInteger(
    maxConcurrentRequests,
    MAX_COVER_ART_ARCHIVE_CONCURRENT_REQUESTS
  )
    ? maxConcurrentRequests
    : DEFAULT_MUSIC_METADATA_SETTINGS.coverArtArchive.maxConcurrentRequests;
  const safeRequestsPerSecond = isBoundedInteger(
    maxRequestsPerSecond,
    MAX_COVER_ART_ARCHIVE_REQUESTS_PER_SECOND
  )
    ? maxRequestsPerSecond
    : DEFAULT_MUSIC_METADATA_SETTINGS.coverArtArchive.maxRequestsPerSecond;

  if (configuredMaxConcurrentRequests !== safeConcurrentRequests) {
    configuredMaxConcurrentRequests = safeConcurrentRequests;
    coverArtArchiveRequestGate.configure(safeConcurrentRequests);
  }
  if (coverArtArchiveHttpClient.getMaxRPS() !== safeRequestsPerSecond) {
    coverArtArchiveHttpClient.setMaxRPS(safeRequestsPerSecond);
  }
};
