import { isTmdbPublicListId } from '@server/constants/discover';
import { Permission } from '@server/lib/permissions';
import { getSettings } from '@server/lib/settings';
import { buildContentSecurityPolicy } from '@server/middleware/securityHeaders';
import type { Express, Request, RequestHandler } from 'express';
import express from 'express';
import path from 'node:path';

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

function detailDeepLink(req: Request): string | undefined {
  const association =
    /^\/associations\/(movie|tv|album|artist|book)\/([A-Za-z0-9_-]{1,128})\/?$/.exec(
      req.path
    );
  if (association)
    return `/lumen/associations/${association[1]}/${association[2]}`;
  const subpage =
    /^\/(movie|tv)\/([1-9]\d{0,9})\/(cast|crew|recommendations|similar)\/?$/.exec(
      req.path
    );
  if (subpage && Number(subpage[2]) <= 1_000_000_000) {
    const [, media, id, page] = subpage;
    const separator = page === 'cast' || page === 'crew' ? '#' : '/';
    return `/lumen/${media}/${id}${separator}${page}`;
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
  ['/profile/settings', '/me/account'],
  ['/profile/settings/main', '/me/account'],
  ['/profile/settings/password', '/me/account'],
  ['/profile/settings/client-tokens', '/me/account/client-tokens'],
  ['/profile/settings/linked-accounts', '/me/account/linked-accounts'],
  ['/profile/settings/tv-request-access', '/me/account/tv-requests'],
  ['/profile/settings/episode-queue', '/me/account/tv-requests'],
  ['/profile/settings/notifications/email', '/me/account/notifications'],
  ['/profile/settings/notifications/telegram', '/me/account/notifications'],
  ['/profile/settings/notifications/discord', '/me/account/notifications'],
  ['/profile/settings/notifications/pushbullet', '/me/account/notifications'],
  ['/profile/settings/notifications/pushover', '/me/account/notifications'],
  ['/profile/settings/notifications/webpush', '/me/account/notifications'],
  ['/profile/watchlist', '/watchlist'],
  ['/discover/watchlist', '/watchlist/discover'],
  ['/downloads', '/downloads'],
  ['/indexer-search', '/indexer-search'],
  ['/blocklist', '/blocklist'],
  ['/issues', '/issues'],
  ['/search', '/search'],
  ['/discover/trending', '/trending'],
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
  '/books': ['subject'],
  '/music': ['genre', 'sortBy'],
  '/audiobooks': ['subject'],
  '/patches': ['q', 'kind', 'language', 'completeOnly', 'cursor'],
  '/indexer-search': ['query', 'category'],
  '/issues': ['issue'],
};

function workflowDeepLink(req: Request): string | undefined {
  const nativePath = req.path.replace(/\/$/, '');
  const issue = /^\/issues\/([1-9]\d{0,15})$/.exec(nativePath)?.[1];
  if (issue && Number.isSafeInteger(Number(issue))) {
    return `/lumen/issues/${issue}`;
  }

  if (nativePath === '/discover/trending') {
    if (req.query.mediaType === 'music') return '/lumen/music';
    if (req.query.mediaType === 'book') return '/lumen/books';
    if (req.query.mediaType === 'audiobook') return '/lumen/audiobooks';
  }

  const destination = workflowDestinations.get(nativePath);
  if (!destination) return;
  const query = new URLSearchParams();

  for (const key of workflowQueryKeys[destination] ?? []) {
    const value = req.query[key];
    if (
      typeof value === 'string' &&
      value.length <= (key === 'subject' || key === 'genre' ? 512 : 256)
    )
      query.set(key, value);
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
    !path.extname(req.path)
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
  server.use(
    '/lumen',
    express.static(directory, { index: false, fallthrough: true }),
    (req, res, next) => {
      if (req.method !== 'GET') return next();
      if (!isInitialized()) return res.redirect(302, '/setup');
      // Missing assets must not become successful HTML responses.
      if (path.extname(req.path)) return res.sendStatus(404);
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
