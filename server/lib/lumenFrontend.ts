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
          : (requestDeepLink(req) ?? discoveryDeepLink(req) ?? '/lumen/')
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
