import { getSettings } from '@server/lib/settings';
import { buildContentSecurityPolicy } from '@server/middleware/securityHeaders';
import type { Express } from 'express';
import express from 'express';
import path from 'node:path';

const classicCookie = 'seerrng-frontend';

export const mountLumenFrontend = (
  server: Express,
  {
    directory = path.resolve('public/lumen'),
    isInitialized = () => getSettings().public.initialized,
    frontend = () => getSettings().main.defaultFrontend,
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
    res.set('Cache-Control', 'no-store').redirect(302, '/');
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
      (!useDefault && req.cookies?.[classicCookie] === 'classic')
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
