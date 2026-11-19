import {
  createSafeHttpRequestOptions,
  isSafeHttpUrl,
  isValidHttpUrl,
} from '@server/utils/security';
import axios from 'axios';

const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 5_000;
const MAX_REDIRECTS = 3;

export class UnsafeFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeFetchError';
  }
}

/**
 * The only place SeerrNG fetches a URL a person typed or shared. Public
 * hosts only, bounded size, short timeout, few redirects, and every redirect
 * target is re-checked against private and loopback addresses.
 */
export const fetchSharedPage = async (url: string): Promise<string> => {
  if (!isValidHttpUrl(url)) {
    throw new UnsafeFetchError('Only http and https links can be read.');
  }
  // Resolves the host and refuses loopback, private, and link-local targets,
  // including IP literals that skip DNS and so skip the request-time lookup.
  if (!(await isSafeHttpUrl(url))) {
    throw new UnsafeFetchError('That link points at a private address.');
  }
  try {
    const response = await axios.get<string>(url, {
      timeout: TIMEOUT_MS,
      maxRedirects: MAX_REDIRECTS,
      maxContentLength: MAX_BYTES,
      maxBodyLength: MAX_BYTES,
      responseType: 'text',
      transformResponse: (data) => data,
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/json;q=0.8',
        'User-Agent': 'SeerrNG-LinkReader/1.0',
      },
      validateStatus: (status) => status >= 200 && status < 300,
      ...createSafeHttpRequestOptions(false, true, true, true),
    });
    const contentType = String(response.headers['content-type'] ?? '');
    if (!/text\/|json|xml/i.test(contentType)) {
      throw new UnsafeFetchError('That link is not a readable page.');
    }
    return typeof response.data === 'string' ? response.data : '';
  } catch (error) {
    if (error instanceof UnsafeFetchError) throw error;
    throw new UnsafeFetchError('That link could not be read.');
  }
};

const decodeNumericEntity = (
  entity: string,
  digits: string,
  radix: number
): string => {
  const codePoint = Number.parseInt(digits, radix);
  if (
    !Number.isInteger(codePoint) ||
    codePoint < 1 ||
    codePoint > 0x10ffff ||
    (codePoint >= 0xd800 && codePoint <= 0xdfff)
  ) {
    return entity;
  }
  return String.fromCodePoint(codePoint);
};

const decodeEntities = (value: string) =>
  value
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#x([\da-f]+);/gi, (entity, digits: string) =>
      decodeNumericEntity(entity, digits, 16)
    )
    .replace(/&#(\d+);/g, (entity, digits: string) =>
      decodeNumericEntity(entity, digits, 10)
    )
    // Decode the escape character last so an encoded entity stays encoded.
    .replace(/&amp;/gi, '&');

export interface PageMetadata {
  title?: string;
  creator?: string;
  year?: number;
  isbn?: string;
  type?: string;
}

const metadataNames = new Set(['og:title', 'books:isbn', 'isbn']);

const readMetaContents = (html: string): Map<string, string> => {
  const contents = new Map<string, string>();
  for (const [, tag] of html.matchAll(/<meta(\s[^<>]*)>/gi)) {
    const attributes = new Map<string, string>();
    for (const [, name, doubleQuoted, singleQuoted] of tag.matchAll(
      /\s([^\s=/]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
    )) {
      const key = name.toLowerCase();
      if (!attributes.has(key)) {
        attributes.set(key, doubleQuoted ?? singleQuoted);
      }
    }
    const content = attributes.get('content');
    if (!content) continue;
    for (const attribute of ['property', 'name']) {
      const key = attributes.get(attribute)?.toLowerCase();
      if (key && metadataNames.has(key) && !contents.has(key)) {
        contents.set(key, decodeEntities(content).trim());
      }
    }
  }
  return contents;
};

const asArray = <T>(value: T | T[] | undefined): T[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];

const nameOf = (value: unknown): string | undefined => {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'name' in value) {
    const name = (value as { name?: unknown }).name;
    return typeof name === 'string' ? name : undefined;
  }
  return undefined;
};

const YEAR = /\b(18|19|20)\d{2}\b/;

/** Reads JSON-LD, Open Graph, and title tags from a fetched page. */
export const extractPageMetadata = (html: string): PageMetadata => {
  const result: PageMetadata = {};
  const scripts = html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  );
  for (const script of scripts) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(script[1]);
    } catch {
      continue;
    }
    const nodes = asArray(parsed as Record<string, unknown>).flatMap((node) =>
      node && typeof node === 'object' && '@graph' in node
        ? asArray((node as { '@graph': Record<string, unknown>[] })['@graph'])
        : [node]
    ) as Record<string, unknown>[];
    for (const node of nodes) {
      const types = asArray(node?.['@type'] as string | string[]).map(String);
      const type = types.find((entry) =>
        /^(Movie|TVSeries|TVSeason|Book|Audiobook|MusicAlbum|MusicRecording|VideoGame|SoftwareApplication)$/.test(
          entry
        )
      );
      if (!type) continue;
      result.type = type;
      result.title ??= typeof node.name === 'string' ? node.name : undefined;
      result.creator ??=
        nameOf(asArray(node.author as unknown)[0]) ??
        nameOf(asArray(node.director as unknown)[0]) ??
        nameOf(asArray(node.byArtist as unknown)[0]) ??
        nameOf(asArray(node.creator as unknown)[0]);
      const isbn = String(node.isbn ?? '').replace(/[^0-9Xx]/g, '');
      if (isbn) result.isbn ??= isbn;
      const date = String(
        node.datePublished ?? node.dateCreated ?? node.copyrightYear ?? ''
      );
      const year = date.match(YEAR)?.[0];
      if (year) result.year ??= Number(year);
    }
  }
  const meta = readMetaContents(html);
  const metadataTitle = meta.get('og:title');
  const pageTitle = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
  const ogTitle = metadataTitle ?? pageTitle;
  if (!result.title && ogTitle) {
    result.title =
      metadataTitle === undefined ? decodeEntities(ogTitle).trim() : ogTitle;
  }
  if (!result.isbn) {
    const isbn = meta.get('books:isbn') ?? meta.get('isbn');
    if (isbn) result.isbn = isbn.replace(/[^0-9Xx]/g, '');
  }
  if (!result.year && result.title) {
    const year = result.title.match(/\((\d{4})\)/)?.[1];
    if (year) result.year = Number(year);
  }
  return result;
};
