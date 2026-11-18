import { isTmdbPublicListId } from '@server/constants/discover';
import { Permission } from '@server/lib/permissions';
import { getSettings } from '@server/lib/settings';
import { buildContentSecurityPolicy } from '@server/middleware/securityHeaders';
import { parseBookshelfBookId } from '@server/utils/bookshelfCatalog';
import { getRateLimitKey } from '@server/utils/security';
import type { Express, Request, RequestHandler } from 'express';
import express from 'express';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { isSportarrLeagueExternalId } from './sportarrIdentity';
import { normalizeStashDbId } from './stashdbIdentity';

const classicCookie = 'seerrng-frontend';
const passwordRecoveryPath = /^\/resetpassword(?:\/[^/]+)?\/?$/i;

function watchSessionDeepLink(pathname: string): string | undefined {
  const match = /^\/watch-sessions(?:\/(join|[1-9]\d{0,15}))?\/?$/i.exec(
    pathname
  );
  if (!match) return;
  const destination = match[1]?.toLowerCase();
  if (
    destination &&
    destination !== 'join' &&
    !Number.isSafeInteger(Number(destination))
  ) {
    return;
  }
  // An invite's fragment follows the redirect in the browser.
  return `/lumen/watch-sessions${destination ? `/${destination}` : ''}`;
}

function requestDeepLink(req: Request, userId?: string): string | undefined {
  if (!userId && !/^\/requests(?:\/status)?\/?$/i.test(req.path)) return;
  const query = new URLSearchParams();
  const requester = userId ?? req.query.userId ?? req.query.requestedBy;
  if (
    typeof requester === 'string' &&
    /^[1-9]\d{0,9}$/.test(requester) &&
    Number(requester) <= 1_000_000_000
  ) {
    query.set('requestedBy', requester);
  }
  for (const [source, target] of [
    ['filter', 'show'],
    ['mediaType', 'mediaType'],
  ]) {
    const value = req.query[source] ?? req.query[target];
    if (
      typeof value === 'string' &&
      /^[a-z]+$/.test(value) &&
      value.length <= 20
    ) {
      query.set(target, value);
    }
  }
  const mediaType = query.get('mediaType');
  if (mediaType === 'game' || mediaType === 'retro' || mediaType === 'modern') {
    const status = query.get('show');
    query.set('show', 'software');
    query.delete('mediaType');
    query.set('category', mediaType);
    if (
      status &&
      /^(active|pending|approved|searching|downloading|importing|available|attention|failed|declined|cancelled)$/.test(
        status
      )
    ) {
      query.set('softwareStatus', status);
    }
  }
  if (mediaType === 'audiobook') {
    query.set('mediaType', 'book');
    query.set('bookFormat', 'audiobook');
  }
  const { timeFrame, sort, sortDirection } = req.query;
  if (
    typeof timeFrame === 'string' &&
    /^(all|7d|14d|30d|1m|6m)$/.test(timeFrame)
  ) {
    query.set('timeFrame', timeFrame);
  }
  if (sort === 'added' && (sortDirection === 'asc' || sortDirection === 'desc'))
    query.set('order', sortDirection === 'asc' ? 'oldest' : 'newest');
  if (sort === 'modified' && sortDirection === 'desc')
    query.set('order', 'updated');
  if (sort === 'title' && (sortDirection === 'asc' || sortDirection === 'desc'))
    query.set('order', `title-${sortDirection}`);

  const key =
    'softwareRequestId' in req.query ? 'softwareRequestId' : 'requestId';
  if (!userId && key in req.query) {
    const id = req.query[key];
    if (
      typeof id !== 'string' ||
      !/^\d+$/.test(id) ||
      !Number.isSafeInteger(Number(id)) ||
      Number(id) <= 0
    ) {
      return;
    }
    query.set(key, String(Number(id)));
  }
  const suffix = query.toString();
  return `/lumen/requests${suffix ? `?${suffix}` : ''}`;
}

const discoveryFilters = [
  'certification',
  'certificationCountry',
  'certificationGte',
  'certificationLte',
  'certificationMode',
  'country',
  'language',
  'keywords',
  'excludeKeywords',
  'excludeGenre',
  'primaryReleaseDateGte',
  'primaryReleaseDateLte',
  'firstAirDateGte',
  'firstAirDateLte',
  'withRuntimeGte',
  'withRuntimeLte',
  'voteAverageGte',
  'voteAverageLte',
  'voteCountGte',
  'voteCountLte',
  'watchProviders',
  'watchRegion',
  'watchProviderMode',
  'status',
  'excludeStatus',
  'studio',
  'excludeStudio',
  'network',
];

function discoveryDeepLink(
  req: Request,
  pathname = req.path
): string | undefined {
  const listId = /^\/discover\/list\/([1-9]\d{0,9})\/?$/.exec(pathname)?.[1];
  if (isTmdbPublicListId(listId)) {
    const page = req.query.page;
    const suffix =
      typeof page === 'string' && /^[1-9]\d{0,2}$/.test(page)
        ? `?page=${Math.min(Number(page), 500)}`
        : '';
    return `/lumen/list/${listId}${suffix}`;
  }

  const genres = /^\/discover\/(movies|tv)\/genres\/?$/.exec(pathname);
  if (genres)
    return `/lumen/${genres[1] === 'movies' ? 'movies' : 'series'}/genres`;

  const upcoming = /^\/discover\/(movies|tv)\/upcoming\/?$/.exec(pathname);
  if (upcoming)
    return `/lumen/soon?media=${upcoming[1] === 'movies' ? 'movie' : 'tv'}`;

  const route =
    /^\/discover\/(movies|tv)(?:\/(keyword|genre|language|network|studio)(?:\/([a-zA-Z0-9]+))?)?\/?$/.exec(
      pathname
    );
  if (!route) return;
  const [, kind, dimension, id] = route;
  const query = new URLSearchParams();
  for (const key of discoveryFilters) {
    const value = req.query[key];
    if (typeof value === 'string' && value.length <= 512) query.set(key, value);
  }
  const sort = req.query.sortBy;
  if (typeof sort === 'string' && /^[a-z_]+\.(asc|desc)$/.test(sort))
    query.set('sort', sort);
  const genre = dimension === 'genre' ? id : req.query.genre;
  if (
    typeof genre === 'string' &&
    /^\d{1,10}(?:[|,]\d{1,10})*$/.test(genre) &&
    genre.length <= 512
  ) {
    query.set('genre', genre.replace(/\|/g, ','));
    if (genre.includes(',')) query.set('match', 'all');
  }
  if (dimension && dimension !== 'keyword') {
    if (!id) return;
    if (dimension === 'language') {
      if (!/^[a-z]{2}$/.test(id)) return;
      query.set('language', id);
    } else {
      if (!/^[1-9]\d{0,9}$/.test(id) || Number(id) > 1_000_000_000) return;
      if (dimension === 'studio' && kind === 'movies') query.set('studio', id);
      if (dimension === 'network' && kind === 'tv') query.set('network', id);
    }
  }
  if (req.query.availability === 'hd' || req.query.availability === '4k') {
    query.set('show', 'have');
    if (req.query.availability === '4k') query.set('quality', '4k');
  } else if (req.query.libraryView === 'available') {
    query.set('show', 'have');
  } else if (req.query.libraryView === 'missing') {
    query.set('show', 'not');
  }
  const suffix = query.toString();
  return `/lumen/${kind === 'movies' ? 'movies' : 'series'}${suffix ? `?${suffix}` : ''}`;
}

function catalogSegment(pathname: string, kind: 'book' | 'magazine') {
  const prefix = `/${kind}/`;
  if (!pathname.startsWith(prefix)) return;
  const segment = pathname.slice(prefix.length).replace(/\/$/, '');
  if (!segment || segment.length > 3072 || segment.includes('/')) return;
  try {
    const value = decodeURIComponent(segment);
    if (
      value !== '.' &&
      value !== '..' &&
      !Array.from(value).some((char) => {
        const code = char.charCodeAt(0);
        return code < 32 || code === 127;
      })
    ) {
      return value;
    }
  } catch {
    // Malformed percent escapes are not catalog identities.
  }
}

function magazineTitle(pathname: string) {
  const title = catalogSegment(pathname, 'magazine');
  if (title?.trim() && title.length <= 256) return title;
}

function legacyBookSeriesDeepLink(pathname: string): string | undefined {
  const id =
    /^\/series\/(bookshelf-series(?:%3A|:)\d{1,10}(?:%3A|:)[A-Za-z0-9_-]{1,2048}(?:(?:%3A|:)\d{1,10})?)\/?$/i.exec(
      pathname
    )?.[1];
  if (id) return `/lumen/book-series/${id}`;
}

function detailDeepLink(req: Request): string | undefined {
  const adult = /^\/adult\/([0-9a-f-]{36})\/?$/i.exec(req.path);
  const sceneId = normalizeStashDbId(adult?.[1]);
  if (sceneId) {
    const { serverId } = req.query;
    const server =
      typeof serverId === 'string' &&
      /^\d{1,10}$/.test(serverId) &&
      Number(serverId) <= 1_000_000_000
        ? `?serverId=${Number(serverId)}`
        : '';
    return `/lumen/adult/${sceneId}${server}`;
  }
  const league = /^\/sportarr\/(lg-\d{6,8})\/?$/.exec(req.path)?.[1];
  if (isSportarrLeagueExternalId(league)) {
    const { eventPage } = req.query;
    const page =
      typeof eventPage === 'string' && /^[1-9][0-9]{0,3}$/.test(eventPage)
        ? Math.min(Number(eventPage), 1000)
        : 1;
    return `/lumen/sportarr/${league}${page > 1 ? `?eventPage=${page}` : ''}`;
  }
  const magazine = magazineTitle(req.path);
  if (magazine) return `/lumen/magazine/${encodeURIComponent(magazine)}`;
  const book = catalogSegment(req.path, 'book');
  if (book && parseBookshelfBookId(book)) {
    const query = new URLSearchParams();
    if (req.query.f === 'audio' || req.query.format === 'audiobook')
      query.set('f', 'audio');
    const { lookupTitle } = req.query;
    if (typeof lookupTitle === 'string' && lookupTitle.length <= 512) {
      query.set('lookupTitle', lookupTitle);
    }
    const suffix = query.toString();
    return `/lumen/book/${encodeURIComponent(book)}${suffix ? `?${suffix}` : ''}`;
  }
  const franchise = /^\/franchise\/(tv|anime)\/(\d{1,10})\/?$/.exec(req.path);
  if (franchise) return `/lumen/franchise/${franchise[1]}/${franchise[2]}`;
  const association =
    /^\/associations\/(movie|tv|album|artist|book)\/([A-Za-z0-9_-]{1,128})\/?$/.exec(
      req.path
    );
  if (association) {
    const [, mediaType, id] = association;
    const query = new URLSearchParams();
    if (req.query.view === 'graph') query.set('view', 'graph');
    if (mediaType === 'book' && req.query.f === 'audio')
      query.set('f', 'audio');
    const type = req.query.type;
    if (
      type === 'similar' ||
      type === 'recommended' ||
      type === 'shared-person' ||
      type === 'shared-genre'
    ) {
      query.set('type', type);
    }
    const suffix = query.toString();
    return `/lumen/associations/${mediaType}/${id}${suffix ? `?${suffix}` : ''}`;
  }
  const subpage =
    /^\/(movie|tv)\/([1-9]\d{0,9})\/(cast|crew|recommendations|similar)\/?$/.exec(
      req.path
    );
  if (subpage && Number(subpage[2]) <= 1_000_000_000) {
    const [, media, id, page] = subpage;
    return `/lumen/${media}/${id}/${page}`;
  }
  const legacySeries = legacyBookSeriesDeepLink(req.path);
  if (legacySeries) return legacySeries;
  const bookGrouping =
    /^\/(author|book-series)\/(OL\d{1,18}A|bookshelf-(?:author|series)(?:%3A|:)\d{1,10}(?:%3A|:)[A-Za-z0-9_-]{1,2048}(?:(?:%3A|:)\d{1,10})?)\/?$/i.exec(
      req.path
    );
  if (bookGrouping) {
    return `/lumen/${bookGrouping[1].toLowerCase()}/${bookGrouping[2]}`;
  }
  const curated = /^\/collections\/(tv|music)\/([A-Za-z0-9_-]{1,128})\/?$/.exec(
    req.path
  );
  if (curated) {
    const [, kind, id] = curated;
    const query = new URLSearchParams();
    if (kind === 'music' && req.query.view === 'discography') {
      query.set('view', 'discography');
      if (
        typeof req.query.albumId === 'string' &&
        /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(req.query.albumId)
      )
        query.set('albumId', req.query.albumId);
    }
    const suffix = query.toString();
    return `/lumen/collections/${kind}/${id}${suffix ? `?${suffix}` : ''}`;
  }
  const catalog =
    /^\/(book|comic|music|artist)\/([A-Za-z0-9_-]{1,128})\/?$/.exec(req.path);
  if (catalog) {
    const [, media, id] = catalog;
    const audio =
      media === 'book' &&
      (req.query.f === 'audio' || req.query.format === 'audiobook');
    return `/lumen/${media}/${id}${audio ? '?f=audio' : ''}`;
  }
  const match = /^\/(movie|tv|collection|person)\/([1-9]\d{0,9})\/?$/.exec(
    req.path
  );
  if (!match || Number(match[2]) > 1_000_000_000) return;
  return `/lumen/${match[1]}/${match[2]}`;
}

const workflowDestinations = new Map([
  ['/following', '/following'],
  ['/library', '/library'],
  ['/games', '/game-library'],
  ['/software', '/software'],
  ['/calendar', '/calendar'],
  ['/swipe', '/swipe'],
  ['/recordings', '/recordings'],
  ['/coming-soon', '/soon'],
  ['/profile', '/me'],
  ['/users', '/admin/users'],
  ['/profile/settings', '/me/account'],
  ['/profile/settings/main', '/me/account'],
  ['/profile/settings/password', '/me/account#password'],
  ['/profile/settings/client-tokens', '/me/account/client-tokens'],
  ['/profile/settings/linked-accounts', '/me/account/linked-accounts'],
  ['/profile/settings/tv-request-access', '/me/account/tv-requests'],
  ['/profile/settings/episode-queue', '/me/account/tv-requests#episode-queue'],
  [
    '/profile/settings/notifications/email',
    '/me/account/notifications#notification-email',
  ],
  [
    '/profile/settings/notifications/telegram',
    '/me/account/notifications#notification-telegram',
  ],
  [
    '/profile/settings/notifications/discord',
    '/me/account/notifications#notification-discord',
  ],
  [
    '/profile/settings/notifications/pushbullet',
    '/me/account/notifications#notification-pushbullet',
  ],
  [
    '/profile/settings/notifications/pushover',
    '/me/account/notifications#notification-pushover',
  ],
  [
    '/profile/settings/notifications/webpush',
    '/me/account/notifications#notification-webpush',
  ],
  ['/profile/watchlist', '/watchlist'],
  ['/discover/watchlist', '/watchlist/discover'],
  ['/downloads', '/downloads'],
  ['/indexer-search', '/indexer-search'],
  ['/blocklist', '/blocklist'],
  ['/issues', '/issues'],
  ['/search', '/search'],
  ['/discover/trending', '/trending'],
  ['/discover/providers', '/providers'],
  ['/share', '/share'],
  ['/track-requests', '/track-requests'],
  ['/identify', '/identify'],
  ['/discover/adult', '/adult'],
  ['/discover/audiobooks', '/audiobooks'],
  ['/discover/books', '/books'],
  ['/discover/book-recommendations', '/books/recommendations'],
  ['/discover/comics', '/comics'],
  ['/discover/collectors', '/music/collectors'],
  ['/discover/games', '/games'],
  ['/discover/patches', '/patches'],
  ['/discover/magazines', '/magazines'],
  ['/discover/music', '/music'],
  ['/discover/sports', '/sports'],
]);

const workflowQueryKeys: Readonly<Record<string, readonly string[]>> = {
  '/watchlist': ['search', 'mediaType', 'sortBy', 'page'],
  '/watchlist/discover': ['search', 'mediaType', 'sortBy', 'page'],
  '/trending': ['mediaType', 'timeWindow'],
  '/providers': ['feed', 'page', 'list', 'unmatched'],
  '/share': ['title', 'text', 'url'],
  '/identify': ['source'],
  '/books': [
    'subject',
    'search',
    'author',
    'firstPublishYear',
    'language',
    'minRating',
    'sortBy',
  ],
  '/music': [
    'genre',
    'sortBy',
    'search',
    'releaseType',
    'artist',
    'artistId',
    'availability',
    'primaryReleaseDateGte',
    'primaryReleaseDateLte',
  ],
  '/audiobooks': [
    'subject',
    'search',
    'author',
    'narrator',
    'firstPublishYear',
    'language',
    'minRating',
    'sortBy',
  ],
  '/adult': ['query', 'serverId'],
  '/sports': ['query'],
  '/magazines': ['query', 'catalog'],
  '/comics': ['query', 'publisher', 'startYear', 'minIssues', 'maxIssues'],
  '/software': ['category', 'q', 'game', 'catalogProvider'],
  '/patches': ['q', 'kind', 'language', 'completeOnly', 'cursor'],
  '/indexer-search': ['query', 'category'],
  '/issues': [
    'issue',
    'filter',
    'mediaType',
    'issueType',
    'timeFrame',
    'search',
    'page',
    'sort',
    'sortDirection',
    'releaseYear',
    'genre',
    'studio',
    'network',
    'albumType',
  ],
};

function managedUserSettingsPath(path: string): string | undefined {
  const match =
    /^\/users\/([1-9]\d{0,9})\/settings(?:\/(main|episode-queue|maturity|permissions|password|tv-request-access|linked-accounts|notifications(?:\/(?:email|discord|telegram|pushbullet|pushover|webpush))?))?\/?$/.exec(
      path
    );
  if (!match || Number(match[1]) > 1_000_000_000) return;
  const [panel, channel] = (match[2] ?? 'main').split('/');
  return `/lumen/admin/users/${match[1]}/${panel}${channel ? `#notification-${channel}` : ''}`;
}

function workflowDeepLink(
  req: Request,
  pathname = req.path
): string | undefined {
  const nativePath = pathname.replace(/\/$/, '');
  const watchSession = watchSessionDeepLink(nativePath);
  if (watchSession) return watchSession;
  if (nativePath === '/book-series/requests')
    return '/lumen/book-series/requests';
  const localBookSeries = /^\/book-series\/([1-9]\d{0,15})$/.exec(nativePath);
  if (localBookSeries && Number.isSafeInteger(Number(localBookSeries[1])))
    return `/lumen${nativePath}`;
  if (nativePath === '/book-series') {
    const query = new URLSearchParams();
    if (typeof req.query.query === 'string')
      query.set('query', req.query.query);
    if (req.query.format === 'ebook' || req.query.format === 'audiobook')
      query.set('format', req.query.format);
    const suffix = query.toString();
    return `/lumen/book-series${suffix ? `?${suffix}` : ''}`;
  }
  if (nativePath === '/book-series/catalog') {
    const query = new URLSearchParams();
    for (const key of ['serverId', 'scope', 'providerId']) {
      const value = req.query[key];
      if (typeof value === 'string') query.set(key, value);
    }
    const suffix = query.toString();
    return `/lumen/book-series/catalog${suffix ? `?${suffix}` : ''}`;
  }
  const issue = /^\/issues\/([1-9]\d{0,15})$/.exec(nativePath)?.[1];
  if (issue && Number.isSafeInteger(Number(issue))) {
    return `/lumen/issues/${issue}`;
  }

  if (nativePath === '/discover/trending') {
    if (req.query.mediaType === 'music') return '/lumen/music';
    if (req.query.mediaType === 'book') return '/lumen/books';
    if (req.query.mediaType === 'audiobook') return '/lumen/audiobooks';
  }

  const [, userId, userWorkflow] =
    /^\/users\/([1-9]\d{0,9})\/(watchlist|requests)$/.exec(nativePath) ?? [];
  const userDestination = userId && Number(userId) <= 1_000_000_000;
  const profile = /^\/users\/([1-9]\d{0,9})$/.exec(nativePath)?.[1];
  if (profile && Number(profile) <= 1_000_000_000)
    return `/lumen/household/${profile}`;
  if (
    nativePath === '/requests' ||
    nativePath === '/requests/status' ||
    (userDestination && userWorkflow === 'requests')
  ) {
    return requestDeepLink(req, userId) ?? '/lumen/requests';
  }

  const userWatchlist = userDestination && userWorkflow === 'watchlist';
  let destination = userWatchlist
    ? `/watchlist/user/${userId}`
    : workflowDestinations.get(nativePath);
  if (!destination) return;
  if (destination === '/books' || destination === '/audiobooks') {
    if (req.query.format === 'audiobook') destination = '/audiobooks';
    if (req.query.format === 'ebook') destination = '/books';
  }
  const query = new URLSearchParams();

  for (const key of workflowQueryKeys[
    userWatchlist ? '/watchlist' : destination
  ] ?? []) {
    const value = req.query[key];
    if (typeof value !== 'string') continue;
    if (destination === '/share') {
      query.set(key, value.slice(0, 4000));
      continue;
    }
    const limit =
      key === 'list' || key === 'source'
        ? 2048
        : key === 'subject' || key === 'genre'
          ? 512
          : 256;
    if (value.length <= limit) query.set(key, value);
  }

  if (destination === '/share' && req.query.image === '1') {
    query.set('image', '1');
  }

  if (
    destination === '/game-library' &&
    (req.query.steam === 'connected' || req.query.steam === 'error')
  ) {
    query.set('steam', req.query.steam);
  }

  if (destination === '/search') {
    const { query: term, type, format } = req.query;
    if (typeof term === 'string' && term.length <= 256) query.set('q', term);
    if (type === 'software') {
      for (const key of ['category', 'game', 'catalogProvider']) {
        const value = req.query[key];
        if (typeof value === 'string' && value.length <= 256)
          query.set(key, value);
      }
      return `/lumen/software${query.size ? '?' + query.toString() : ''}`;
    }
    if (
      type === 'movie' ||
      type === 'tv' ||
      type === 'comic' ||
      type === 'author' ||
      type === 'magazine' ||
      type === 'sports'
    ) {
      query.set('f', type);
      if (type === 'movie' || type === 'tv') {
        for (const key of [
          ...discoveryFilters,
          'availability',
          'genre',
          'sortBy',
        ]) {
          const value = req.query[key];
          if (typeof value === 'string' && value.length <= 512)
            query.set(key, value);
        }
      }
    } else if (type === 'music' || type === 'album') {
      query.set('f', 'music');
      for (const key of [
        'artist',
        'artistId',
        'genre',
        'releaseType',
        'primaryReleaseDateGte',
        'primaryReleaseDateLte',
      ]) {
        const value = req.query[key];
        if (typeof value === 'string' && value.length <= 512)
          query.set(key, value);
      }
    } else if (type === 'book') {
      query.set('f', format === 'audiobook' ? 'audio' : 'ebook');
    }
    const page = req.query.page;
    if (
      (query.has('q') || query.size > 1) &&
      typeof page === 'string' &&
      /^[1-9]\d{0,2}$/.test(page)
    )
      query.set('page', String(Math.min(Number(page), 500)));
  }

  const suffix = query.toString();
  return `/lumen${destination}${suffix ? `?${suffix}` : ''}`;
}

export function shouldCheckLumenLock(req: Request): boolean {
  const { defaultFrontend, lockLumenForNonAdmins } = getSettings().main;
  return (
    defaultFrontend === 'lumen' &&
    lockLumenForNonAdmins === true &&
    req.method === 'GET' &&
    !req.path.startsWith('/lumen') &&
    !req.path.startsWith('/_next') &&
    !req.path.startsWith('/api') &&
    (!path.extname(req.path) || Boolean(magazineTitle(req.path)))
  );
}

export const redirectLockedNativeFrontend: RequestHandler = (
  req,
  res,
  next
) => {
  if (
    shouldCheckLumenLock(req) &&
    req.user &&
    !req.user.hasPermission(Permission.ADMIN)
  ) {
    res
      .set('Cache-Control', 'no-store')
      .redirect(
        302,
        passwordRecoveryPath.test(req.path)
          ? `/lumen${req.path}`
          : (requestDeepLink(req) ??
              discoveryDeepLink(req) ??
              detailDeepLink(req) ??
              workflowDeepLink(req) ??
              managedUserSettingsPath(req.path) ??
              '/lumen/')
      );
    return;
  }
  next();
};

export const mountLumenFrontend = (
  server: Express,
  {
    directory = path.resolve('public/lumen'),
    isInitialized = () => getSettings().public.initialized,
    frontend = () => getSettings().main.defaultFrontend,
    enforceFrontend = () => getSettings().main.enforceDefaultFrontend === true,
    companionUrl = () => getSettings().main.lumenPublicUrl,
  } = {}
): void => {
  server.get('/seerrng', (_req, res) => {
    res.cookie(classicCookie, 'classic', {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 365 * 24 * 60 * 60 * 1000,
      path: '/',
    });
    res
      .set('Cache-Control', 'no-store')
      .redirect(302, enforceFrontend() ? '/?interface=classic' : '/');
  });
  server.get('/', (req, res, next) => {
    if (req.query.interface === 'classic') {
      res.cookie(classicCookie, 'classic', {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 365 * 24 * 60 * 60 * 1000,
      });
      res.set('Cache-Control', 'no-store');
      return next();
    }
    const useDefault = req.query.interface === 'default';
    if (useDefault) res.clearCookie(classicCookie, { path: '/' });
    if (
      !isInitialized() ||
      (!useDefault &&
        !enforceFrontend() &&
        req.cookies?.[classicCookie] === 'classic')
    ) {
      return next();
    }
    res.set('Cache-Control', 'no-store');
    if (frontend() === 'lumen') return res.redirect(302, '/lumen/');
    if (frontend() === 'external') {
      try {
        const url = new URL(companionUrl());
        // Administrator-selected browser navigation only; never proxy this URL.
        // A companion cannot be this server's own root or it would loop.
        if (
          ['http:', 'https:'].includes(url.protocol) &&
          !url.username &&
          !url.password &&
          !url.search &&
          !url.hash &&
          (url.host !== req.get('host') || url.pathname !== '/')
        )
          return res.redirect(302, url.href);
      } catch {
        /* An invalid saved choice must leave native access usable. */
      }
    }
    return next();
  });
  server.get(['/resetpassword', '/resetpassword/:guid'], (req, res, next) => {
    if (
      !isInitialized() ||
      frontend() !== 'lumen' ||
      (!enforceFrontend() && req.cookies?.[classicCookie] === 'classic')
    ) {
      return next();
    }
    return res
      .set('Cache-Control', 'no-store')
      .redirect(302, `/lumen${req.path}`);
  });
  server.get(
    ['/requests', '/requests/status', '/watch-sessions', '/watch-sessions/:id'],
    (req, res, next) => {
      const target = requestDeepLink(req) ?? watchSessionDeepLink(req.path);
      if (
        !target ||
        !isInitialized() ||
        frontend() !== 'lumen' ||
        (!enforceFrontend() && req.cookies?.[classicCookie] === 'classic')
      ) {
        return next();
      }
      return res.set('Cache-Control', 'no-store').redirect(302, target);
    }
  );
  server.get(
    /^\/(?:discover|movie|tv|person|collection|collections|book|book-series|series|author|comic|magazine|adult|music|artist|sportarr|associations|franchise|profile|users|following|library|games|software|calendar|swipe|recordings|coming-soon|downloads|indexer-search|blocklist|issues|search|share|track-requests|identify)(?:\/|$)/,
    (req, res, next) => {
      if (
        !isInitialized() ||
        frontend() !== 'lumen' ||
        (!enforceFrontend() && req.cookies?.[classicCookie] === 'classic')
      ) {
        return next();
      }
      const destination =
        discoveryDeepLink(req) ??
        detailDeepLink(req) ??
        workflowDeepLink(req) ??
        managedUserSettingsPath(req.path);
      if (!destination) return next();
      return res.set('Cache-Control', 'no-store').redirect(302, destination);
    }
  );
  server.get(/^\/lumen\/series\//i, (req, res, next) => {
    const destination = legacyBookSeriesDeepLink(
      req.path.slice('/lumen'.length)
    );
    if (!destination) return next();
    return res.set('Cache-Control', 'no-store').redirect(302, destination);
  });
  server.get(/^\/lumen\/discover(?:\/|$)/, (req, res, next) => {
    const pathname = req.path.slice('/lumen'.length);
    const destination =
      discoveryDeepLink(req, pathname) ?? workflowDeepLink(req, pathname);
    if (!destination) return next();
    return res.set('Cache-Control', 'no-store').redirect(302, destination);
  });
  server.get(/^\/lumen\/users\//, (req, res, next) => {
    const pathname = req.path.slice('/lumen'.length);
    const destination =
      managedUserSettingsPath(pathname) ?? workflowDeepLink(req, pathname);
    if (!destination) return next();
    return res.set('Cache-Control', 'no-store').redirect(302, destination);
  });
  server.get(/^\/lumen\/(?:profile(?:\/|$)|users\/?$)/, (req, res, next) => {
    const destination = workflowDeepLink(req, req.path.slice('/lumen'.length));
    if (!destination) return next();
    return res.set('Cache-Control', 'no-store').redirect(302, destination);
  });
  server.get(/^\/(?:lumen\/)?settings(?:\/|$)/, (req, res, next) => {
    const prefixed = req.path.startsWith('/lumen/');
    if (
      !prefixed &&
      (!isInitialized() ||
        frontend() !== 'lumen' ||
        (!enforceFrontend() && req.cookies?.[classicCookie] === 'classic'))
    ) {
      return next();
    }
    const pathname = prefixed ? req.path.slice('/lumen'.length) : req.path;
    const section = pathname.replace(/^\/settings\/?|\/$/g, '');
    let destination: string;
    if (
      /^notifications(?:\/(email|telegram|pushbullet|pushover|gotify|ntfy|apprise|discord|slack|webhook|webpush))?$/.test(
        section
      )
    ) {
      destination = `/admin/${section}`;
    } else if (section === 'plex' || section === 'jellyfin') {
      destination = '/admin/media-libraries';
    } else if (section === 'services') {
      const target = req.query.settingsSearchTarget;
      const targets = [
        [/^prowlarr(?:-|$)/, 'prowlarr'],
        [/^download-clients-/, 'download-clients'],
        [/^slskdn-/, 'soulseek'],
        [/^tunerr-/, 'tunerr'],
        [/^reader-/, 'reader-delivery'],
        [/^readmeabook-/, 'readmeabook'],
        [/^steamApiKey$/, 'software-acquisition'],
      ] as const;
      const service =
        typeof target === 'string'
          ? targets.find(([pattern]) => pattern.test(target))?.[1]
          : undefined;
      destination = service ? `/admin/${service}` : '/admin';
    } else if (section === 'users') {
      destination = '/admin/general#default-request-quotas';
    } else if (!section || section === 'main') {
      const target = req.query.settingsSearchTarget;
      destination =
        section === 'main' &&
        (target === 'spotifyClientId' ||
          target === 'apiKey' ||
          target === 'enable4k')
          ? `/admin/general#${target}`
          : '/admin/general';
    } else if (
      /^(jobs|logs|about|categories|network|discovery|metadata|library-migration|prowlarr)$/.test(
        section
      )
    ) {
      destination = `/admin/${section}`;
    } else {
      return next();
    }
    return res
      .set('Cache-Control', 'no-store')
      .redirect(302, `/lumen${destination}`);
  });
  server.post('/lumen/share-target', (_req, res) => {
    res
      .set('Cache-Control', 'no-store')
      .redirect(303, '/lumen/share#share=unavailable');
  });
  server.use(
    '/lumen',
    express.static(directory, { index: false, fallthrough: true })
  );
  server.get(
    /^\/lumen(?:\/|$)/i,
    (req, res, next) => {
      if (req.method !== 'GET') return next('route');
      const pathname = req.path.slice('/lumen'.length);
      // Missing assets must not become successful HTML responses or consume the shell budget.
      if (path.extname(pathname) && !magazineTitle(pathname))
        return res.sendStatus(404);
      if (!isInitialized() && !/^\/setup\/?$/.test(pathname))
        return res
          .set('Cache-Control', 'no-store')
          .redirect(302, '/lumen/setup');
      return next();
    },
    rateLimit({
      windowMs: 60 * 1000,
      limit: 600,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: getRateLimitKey,
    }),
    (_req, res) => {
      res.clearCookie(classicCookie, { path: '/' });
      res.set('Cache-Control', 'no-store');
      res.set(
        'Content-Security-Policy',
        buildContentSecurityPolicy(process.env.NODE_ENV, 'lumen')
      );
      return res.sendFile(path.join(directory, 'index.html'));
    }
  );
};
