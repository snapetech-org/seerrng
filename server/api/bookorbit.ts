import ExternalAPI from '@server/api/externalapi';
import type { ReadarrSettings } from '@server/lib/settings';
import { getHttpErrorDetails } from '@server/utils/httpError';
import { isLocalOrPrivateAddress } from '@server/utils/security';
import {
  buildServiceUrl,
  parseBookOrbitServerAddress,
} from '@server/utils/serviceUrl';
import axios from 'axios';

export type BookOrbitFormat = 'ebook' | 'audiobook';
export type BookOrbitRequestStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'searching'
  | 'grabbed'
  | 'downloading'
  | 'importing'
  | 'needs_review'
  | 'available'
  | 'failed';

export interface BookOrbitRequest {
  id: number;
  userId: number;
  mediaKind: BookOrbitFormat;
  status: BookOrbitRequestStatus;
  matchedBookId: number | null;
  alreadySubscribed?: boolean;
  subscribers?: { userId: number }[];
  download?: { status?: string; progressPercent?: number | null } | null;
}

export interface BookOrbitLibraryBook {
  id: number;
  title: string;
  authors: string[];
  isbn13?: string | null;
  hardcoverId?: string | null;
  providerIds?: Record<string, string | null>;
  files: { id: number; format: string | null; role: string }[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const validId = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const statuses = new Set<BookOrbitRequestStatus>([
  'pending',
  'approved',
  'rejected',
  'cancelled',
  'searching',
  'grabbed',
  'downloading',
  'importing',
  'needs_review',
  'available',
  'failed',
]);
const AUDIO = new Set(['m4b', 'mp3', 'm4a', 'opus', 'ogg', 'flac']);
const EBOOK = new Set([
  'epub',
  'kepub',
  'pdf',
  'mobi',
  'azw',
  'azw3',
  'fb2',
  'djvu',
  'cbz',
  'cbr',
  'cb7',
]);

export class BookOrbitConnectionError extends Error {
  constructor(
    message: string,
    public readonly step: 'login' | 'account' | 'library',
    cause?: unknown
  ) {
    super(message, { cause });
  }
}

/** BookOrbit owns acquisition and file storage. Never transfer its credentials to clients. */
export default class BookOrbitAPI extends ExternalAPI {
  private token?: string;

  constructor(private readonly settings: ReadarrSettings) {
    if (settings.backend !== 'bookorbit' || !settings.bookorbitUsername) {
      throw new Error('BookOrbit connection needs an account and password.');
    }
    const address = parseBookOrbitServerAddress(settings.hostname);
    if (!address) {
      throw new BookOrbitConnectionError(
        'Enter a valid BookOrbit hostname or HTTP address.',
        'login'
      );
    }
    super(
      buildServiceUrl({
        useSsl: address.useSsl ?? settings.useSsl,
        hostname: address.hostname,
        port: address.port ?? settings.port,
        urlBase: address.baseUrl ?? settings.baseUrl,
      }),
      {},
      {
        allowPrivateAddresses: true,
        requireDirectConnection: isLocalOrPrivateAddress(address.hostname),
        timeout: 15_000,
        maxContentLength: 16 * 1024 * 1024,
        maxBodyLength: 256 * 1024,
      }
    );
  }

  private async login(): Promise<string> {
    const response = await this.request<unknown>(
      'POST',
      '/api/v1/auth/login',
      {
        username: this.settings.bookorbitUsername,
        password: this.settings.apiKey,
        clientKind: 'native',
        deviceLabel: 'SeerrNG',
      },
      { maxRedirects: 0 }
    );
    const token = isRecord(response.data)
      ? response.data.accessToken
      : undefined;
    if (typeof token !== 'string' || !token) {
      throw new BookOrbitConnectionError(
        'The BookOrbit API did not return a session token. Verify that the address points to BookOrbit and includes the correct URL base.',
        'login'
      );
    }
    this.token = token;
    return token;
  }

  private async call<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: unknown
  ): Promise<T> {
    const execute = async (token: string) =>
      this.request<T>(method, path, body, {
        headers: { Authorization: `Bearer ${token}` },
        maxRedirects: 0,
      });
    const token = this.token ?? (await this.login());
    try {
      return (await execute(token)).data;
    } catch (error) {
      if (!axios.isAxiosError(error) || error.response?.status !== 401)
        throw error;
      this.token = undefined;
      return (await execute(await this.login())).data;
    }
  }

  public async testConnection(): Promise<{ version?: string; userId: number }> {
    try {
      if (!this.token) await this.login();
    } catch (cause) {
      if (cause instanceof BookOrbitConnectionError) throw cause;
      const { status, errorCode } = getHttpErrorDetails(cause);
      let message: string;
      switch (status) {
        case 401:
          message =
            'BookOrbit rejected the account sign-in. Check the username and password or whether the account is locked.';
          break;
        case 403:
          message =
            'The BookOrbit address denied API sign-in. Check local password sign-in and whether an access proxy is protecting this address.';
          break;
        case 429:
          message =
            'BookOrbit is limiting sign-in attempts. Wait before testing again.';
          break;
        default:
          if (status && status >= 300 && status < 400) {
            message =
              'The BookOrbit address redirected the API sign-in. Use the final BookOrbit address and check its SSL and URL base.';
          } else if (errorCode === 'ECONNREFUSED') {
            message =
              'The BookOrbit address refused the connection from SeerrNG. Check the listening port and whether the SeerrNG host or container can reach it.';
          } else if (
            errorCode === 'ECONNABORTED' ||
            errorCode === 'ETIMEDOUT'
          ) {
            message =
              'The connection to BookOrbit timed out from SeerrNG. Check whether the SeerrNG host or container can reach the configured address.';
          } else {
            message =
              'SeerrNG could not sign in to the BookOrbit API. Check the hostname, port, SSL and URL base from the SeerrNG server.';
          }
      }
      throw new BookOrbitConnectionError(message, 'login', cause);
    }
    const me = await this.call<unknown>('GET', '/api/v1/auth/me').catch(
      (cause) => {
        throw new BookOrbitConnectionError(
          'BookOrbit signed in but could not verify the account. Check its account settings in BookOrbit.',
          'account',
          cause
        );
      }
    );
    if (!isRecord(me) || !validId(me.id))
      throw new BookOrbitConnectionError(
        'BookOrbit account is invalid.',
        'account'
      );
    const permissions = Array.isArray(me.permissions) ? me.permissions : [];
    if (
      !permissions.includes('*') &&
      !permissions.includes('book_request_access')
    )
      throw new BookOrbitConnectionError(
        'BookOrbit account needs the Request books permission.',
        'account'
      );
    const library = await this.call<unknown>('POST', '/api/v1/books/query', {
      pagination: { page: 0, size: 1 },
    }).catch((cause) => {
      throw new BookOrbitConnectionError(
        'BookOrbit signed in but the library could not be read. Check library access for this account.',
        'library',
        cause
      );
    });
    if (
      !isRecord(library) ||
      !Array.isArray(library.items) ||
      !Number.isSafeInteger(library.total)
    )
      throw new BookOrbitConnectionError(
        'BookOrbit returned an unexpected library response. Check the URL base and BookOrbit version.',
        'library'
      );
    const info = await this.call<unknown>('GET', '/api/v1/app-info').catch(
      () => undefined
    );
    return {
      version:
        isRecord(info) && typeof info.version === 'string'
          ? info.version
          : undefined,
      userId: me.id,
    };
  }

  public async submit(input: {
    title: string;
    authors: string[];
    mediaKind: BookOrbitFormat;
    isbn13?: string;
    language?: string;
    providerKey?: string;
    providerId?: string;
  }): Promise<{ request: BookOrbitRequest; subscribed: boolean }> {
    const result = await this.call<unknown>(
      'POST',
      '/api/v1/book-requests',
      input
    );
    if (!isRecord(result))
      throw new Error('BookOrbit returned an invalid request.');
    return {
      request: this.parseRequest(result.request),
      subscribed: result.subscribed === true,
    };
  }

  public async submitPair(input: {
    title: string;
    authors: string[];
    isbn13?: string;
    language?: string;
    providerKey?: string;
    providerId?: string;
  }): Promise<Record<BookOrbitFormat, BookOrbitRequest>> {
    const result = await this.call<unknown>(
      'POST',
      '/api/v1/book-requests/pairs',
      input
    );
    if (
      !isRecord(result) ||
      !isRecord(result.ebook) ||
      !isRecord(result.audiobook)
    )
      throw new Error('BookOrbit returned an invalid request pair.');
    return {
      ebook: this.parseRequest(result.ebook.request),
      audiobook: this.parseRequest(result.audiobook.request),
    };
  }

  public async getRequest(id: number): Promise<BookOrbitRequest> {
    if (!validId(id)) throw new Error('BookOrbit request ID is invalid.');
    return this.parseRequest(
      await this.call('GET', `/api/v1/book-requests/${id}`)
    );
  }

  public async unsubscribe(id: number): Promise<void> {
    if (!validId(id)) throw new Error('BookOrbit request ID is invalid.');
    await this.call('DELETE', `/api/v1/book-requests/${id}/subscription`);
  }

  public async cancel(id: number): Promise<void> {
    if (!validId(id)) throw new Error('BookOrbit request ID is invalid.');
    await this.call('POST', `/api/v1/book-requests/${id}/cancel`);
  }

  private parseRequest(raw: unknown): BookOrbitRequest {
    if (
      !isRecord(raw) ||
      !validId(raw.id) ||
      !validId(raw.userId) ||
      !statuses.has(raw.status as BookOrbitRequestStatus) ||
      (raw.mediaKind !== 'ebook' && raw.mediaKind !== 'audiobook')
    ) {
      throw new Error('BookOrbit returned an invalid request.');
    }
    return {
      id: raw.id,
      userId: raw.userId,
      mediaKind: raw.mediaKind,
      status: raw.status as BookOrbitRequestStatus,
      matchedBookId: validId(raw.matchedBookId) ? raw.matchedBookId : null,
      subscribers: Array.isArray(raw.subscribers)
        ? raw.subscribers
            .filter(isRecord)
            .filter((item) => validId(item.userId))
            .map((item) => ({ userId: item.userId as number }))
        : undefined,
      download: isRecord(raw.download)
        ? {
            status:
              typeof raw.download.status === 'string'
                ? raw.download.status
                : undefined,
            progressPercent:
              typeof raw.download.progressPercent === 'number'
                ? raw.download.progressPercent
                : undefined,
          }
        : null,
    };
  }

  public async getBook(id: number): Promise<BookOrbitLibraryBook> {
    const book = await this.call<unknown>('GET', `/api/v1/books/${id}`);
    return this.parseBook(book);
  }

  private parseBook(raw: unknown): BookOrbitLibraryBook {
    if (!isRecord(raw) || !validId(raw.id) || !Array.isArray(raw.files)) {
      throw new Error('BookOrbit returned an invalid book.');
    }
    return {
      id: raw.id,
      title: typeof raw.title === 'string' ? raw.title : '',
      authors: Array.isArray(raw.authors)
        ? raw.authors
            .map((a) =>
              typeof a === 'string'
                ? a
                : isRecord(a) && typeof a.name === 'string'
                  ? a.name
                  : ''
            )
            .filter(Boolean)
        : [],
      isbn13: typeof raw.isbn13 === 'string' ? raw.isbn13 : null,
      hardcoverId: typeof raw.hardcoverId === 'string' ? raw.hardcoverId : null,
      providerIds: isRecord(raw.providerIds)
        ? (Object.fromEntries(
            Object.entries(raw.providerIds).filter(
              ([, value]) => typeof value === 'string' || value === null
            )
          ) as Record<string, string | null>)
        : undefined,
      files: raw.files
        .filter(isRecord)
        .filter((f) => validId(f.id))
        .map((f) => ({
          id: f.id as number,
          format: typeof f.format === 'string' ? f.format : null,
          role: typeof f.role === 'string' ? f.role : '',
        })),
    };
  }

  public static hasFormat(
    book: BookOrbitLibraryBook,
    format: BookOrbitFormat
  ): boolean {
    const formats = format === 'audiobook' ? AUDIO : EBOOK;
    return book.files.some(
      (file) =>
        (file.role === 'content' || file.role === 'primary') &&
        file.format !== null &&
        formats.has(file.format.toLowerCase())
    );
  }

  public async getImportedBooks(
    format: BookOrbitFormat
  ): Promise<BookOrbitLibraryBook[]> {
    const results: BookOrbitLibraryBook[] = [];
    const seen = new Set<number>();
    for (let page = 0; page < 500; page++) {
      const response = await this.call<unknown>('POST', '/api/v1/books/query', {
        sort: [{ field: 'title', dir: 'asc' }],
        pagination: { page, size: 100 },
      });
      if (
        !isRecord(response) ||
        !Array.isArray(response.items) ||
        !Number.isSafeInteger(response.total) ||
        (response.total as number) > 50_000 ||
        response.items.length > 100
      )
        throw new Error(
          'BookOrbit library page is invalid or exceeds the scan limit.'
        );
      for (const item of response.items) {
        const book = this.parseBook(item);
        if (seen.has(book.id))
          throw new Error('BookOrbit repeated a library book.');
        seen.add(book.id);
        if (BookOrbitAPI.hasFormat(book, format)) results.push(book);
      }
      if (seen.size >= (response.total as number)) return results;
      if (response.items.length === 0)
        throw new Error('BookOrbit library page is incomplete.');
    }
    throw new Error('BookOrbit library exceeds the safe scan limit.');
  }
}
