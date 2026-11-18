import { isTmdbPublicListId } from '@server/constants/discover';
import { Permission } from '@server/lib/permissions';
import { getSettings } from '@server/lib/settings';
import { buildContentSecurityPolicy } from '@server/middleware/securityHeaders';
import { parseBookshelfBookId } from '@server/utils/bookshelfCatalog';
import type { Express, Request, RequestHandler } from 'express';
import express from 'express';
import path from 'node:path';
import { isSportarrLeagueExternalId } from './sportarrIdentity';
import { normalizeStashDbId } from './stashdbIdentity';

const classicCookie = 'seerrng-frontend';
const passwordRecoveryPath = /^\/resetpassword(?:\/[^/]+)?\/?$/i;

function requestDeepLink(req: Request): string | undefined {
  if (!/^\/requests(?:\/status)?\/?$/i.test(req.path)) return;
  const key =
    'softwareRequestId' in req.query ? 'softwareRequestId' : 'requestId';
  const id = req.query[key];
  if (
    typeof id === 'string' &&
    /^\d+$/.test(id) &&
    Number.isSafeInteger(Number(id)) &&
    Number(id) > 0
  ) {
    return `/lumen/requests?${key}=${Number(id)}`;
  }
}

const discoveryFilters = [
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

function discoveryDeepLink(req: Request): string | undefined {
  const listId = /^\/discover\/list\/([1-9]\d{0,9})\/?$/.exec(req.path)?.[1];
  if (isTmdbPublicListId(listId)) {
    const page = req.query.page;
    const suffix =
      typeof page === 'string' && /^[1-9]\d{0,2}$/.test(page)
        ? `?page=${Math.min(Number(page), 500)}`
        : '';
    return `/lumen/list/${listId}${suffix}`;
  }

  const upcoming = /^\/discover\/(movies|tv)\/upcoming\/?$/.exec(req.path);
  if (upcoming)
    return `/lumen/soon?media=${upcoming[1] === 'movies' ? 'movie' : 'tv'}`;

  const route =
    /^\/discover\/(movies|tv)(?:\/(keyword|genre|language|network|studio)(?:\/([a-zA-Z0-9]+))?)?\/?$/.exec(
      req.path
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
  if (isSportarrLeagueExternalId(league)) return `/lumen/sportarr/${league}`;
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
    const separator = page === 'cast' || page === 'crew' ? '#' : '/';
    return `/lumen/${media}/${id}${separator}${page}`;
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
  ['/requests', '/requests'],
  ['/requests/status', '/requests'],
  ['/following', '/following'],
  ['/library', '/library'],
  ['/games', '/game-library'],
  ['/calendar', '/calendar'],
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
  ['/discover/comics', '/comics'],
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
  '/books': ['subject'],
  '/music': ['genre', 'sortBy'],
  '/audiobooks': ['subject'],
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
  if (userDestination && userWorkflow === 'requests') {
    const query = new URLSearchParams({ requestedBy: userId });
    for (const [source, target] of [
      ['filter', 'show'],
      ['mediaType', 'mediaType'],
    ]) {
      const value = req.query[source];
      if (
        typeof value === 'string' &&
        /^[a-z]+$/.test(value) &&
        value.length <= 20
      ) {
        query.set(target, value);
      }
    }
    return `/lumen/requests?${query}`;
  }

  const userWatchlist = userDestination && userWorkflow === 'watchlist';
  const destination = userWatchlist
    ? `/watchlist/user/${userId}`
    : workflowDestinations.get(nativePath);
  if (!destination) return;
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
    if (type === 'movie' || type === 'tv' || type === 'comic') {
      query.set('f', type);
    } else if (type === 'book') {
      query.set('f', format === 'audiobook' ? 'audio' : 'ebook');
    }
  }

  const suffix = query.toString();
  return `/lumen${destination}${suffix ? `?${suffix}` : ''}`;
}

export const redirectLockedNativeFrontend: RequestHandler = (
  req,
  res,
  next
) => {
  if (
    getSettings().main.defaultFrontend === 'lumen' &&
    getSettings().main.lockLumenForNonAdmins === true &&
    req.user &&
    !req.user.hasPermission(Permission.ADMIN) &&
    req.method === 'GET' &&
    !req.path.startsWith('/lumen') &&
    !req.path.startsWith('/_next') &&
    !req.path.startsWith('/api') &&
    (!path.extname(req.path) || magazineTitle(req.path))
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
  server.get(['/requests', '/requests/status'], (req, res, next) => {
    const target = requestDeepLink(req);
    if (
      !target ||
      !isInitialized() ||
      frontend() !== 'lumen' ||
      (!enforceFrontend() && req.cookies?.[classicCookie] === 'classic')
    ) {
      return next();
    }
    return res.set('Cache-Control', 'no-store').redirect(302, target);
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
  server.get(
    /^\/lumen\/settings(?:\/(main|users|jobs|logs|about|categories|network|discovery))?\/?$/,
    (req, res) => {
      const page = req.params[0];
      const destination =
        !page || page === 'main' || page === 'users' ? 'general' : page;
      return res
        .set('Cache-Control', 'no-store')
        .redirect(302, `/lumen/admin/${destination}`);
    }
  );
  server.post('/lumen/share-target', (_req, res) => {
    res
      .set('Cache-Control', 'no-store')
      .redirect(303, '/lumen/share#share=unavailable');
  });
  server.use(
    '/lumen',
    express.static(directory, { index: false, fallthrough: true }),
    (req, res, next) => {
      if (req.method !== 'GET') return next();
      if (!isInitialized()) return res.redirect(302, '/setup');
      // Missing assets must not become successful HTML responses.
      if (path.extname(req.path) && !magazineTitle(req.path))
        return res.sendStatus(404);
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
