import AnilistAPI from '@server/api/anilist';
import SimklAPI from '@server/api/simkl';
import TheMovieDb from '@server/api/themoviedb';
import TraktAPI, {
  derivePkceChallenge,
  generatePkceVerifier,
} from '@server/api/trakt';
import { getRepository } from '@server/datasource';
import DiscoveryAccount from '@server/entity/DiscoveryAccount';
import ProviderTrackingAction from '@server/entity/ProviderTrackingAction';
import { runWithConfigurationAdmission } from '@server/lib/configurationAdmission';
import {
  DiscoveryIntegrationError,
  parseDiscoveryProvider,
  publicDiscoveryAccount,
  requireDiscoveryAccount,
  saveDiscoveryAccount,
} from '@server/lib/discoveryIntegrations/accounts';
import {
  exportCuratedIdentityPack,
  importCuratedIdentityMappingPack,
  listCuratedIdentityPacks,
  MAX_CURATED_IDENTITY_PACK_BYTES,
  parseCuratedIdentityMappingPack,
  removeCuratedIdentityPack,
} from '@server/lib/discoveryIntegrations/curatedIdentityPacks';
import {
  parseEpisodeWatchStateRequest,
  providerEpisodeWatchState,
} from '@server/lib/discoveryIntegrations/episodeWatchState';
import { discoveryFeed } from '@server/lib/discoveryIntegrations/feeds';
import {
  handleDiscoveryIntegration,
  requireDiscoveryBrowserSession,
  runPersonalDiscoveryMutation,
} from '@server/lib/discoveryIntegrations/http';
import {
  exportPersonalIdentityMappingPack,
  importPersonalIdentityMappingPack,
  parsePersonalIdentityMappingPack,
  parsePersonalIdentitySource,
  removePersonalIdentityMapping,
  saveExternalIdentityMappings,
  savePersonalIdentityMapping,
} from '@server/lib/discoveryIntegrations/identityMappings';
import {
  MAX_PROVIDER_LIBRARY_REPAIR_PAGES_PER_BATCH,
  personalProviderLibrary,
  resolvePersonalProviderLibraryMappings,
  type LibraryShelf,
} from '@server/lib/discoveryIntegrations/library';
import {
  getNativeLibraryConnection,
  MAX_NATIVE_LIBRARY_CURSOR,
  personalMediaServerLibrary,
  type NativeLibrarySource,
} from '@server/lib/discoveryIntegrations/mediaServerLibrary';
import {
  applyTrackingIntent,
  parseTrackingIntent,
  prepareTrackingAccount,
  publicTrackingAction,
} from '@server/lib/discoveryIntegrations/tracking';
import { Permission } from '@server/lib/permissions';
import { getSettings } from '@server/lib/settings';
import { isUserMediaCategoryEnabled } from '@server/lib/userMediaCategories';
import { isAuthenticated } from '@server/middleware/auth';
import {
  authorizedMutation,
  authorizedRouteAccess,
} from '@server/middleware/authorizedMutation';
import express, { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { randomBytes, timingSafeEqual } from 'node:crypto';

const TRAKT_CALLBACK_PATH = '/api/v1/integrations/discovery/trakt/callback';
const TRAKT_CALLBACK_COOKIE_PREFIX = 'trakt-discovery-oauth-callback-';
const TRAKT_AUTHORIZATION_TTL_MS = 10 * 60 * 1000;
const MAX_ACTIVE_TRAKT_CALLBACK_COOKIES = 8;
const traktCallbackRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () =>
    process.env.NODE_ENV === 'test' || process.env.E2E_TESTS === 'true',
});

const traktRedirectContext = (): {
  applicationUrl: string;
  redirectUri: string;
  callbackCookiePath: string;
} | null => {
  const configuredUrl = getSettings().main.applicationUrl?.trim();
  if (!configuredUrl) return null;
  try {
    const url = new URL(configuredUrl);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    const applicationUrl = `${url.origin}${url.pathname.replace(/\/+$/u, '')}`;
    return {
      applicationUrl,
      redirectUri: `${applicationUrl}${TRAKT_CALLBACK_PATH}`,
      callbackCookiePath: `${url.pathname.replace(/\/+$/u, '')}/api/v1/integrations/discovery`,
    };
  } catch {
    return null;
  }
};

const traktSettingsUrl = (
  applicationUrl: string,
  result: {
    traktComplete?: boolean;
    traktConnected?: boolean;
    traktError?: string;
  }
): string => {
  const appUrl = new URL(applicationUrl);
  const basePath = appUrl.pathname.replace(/\/+$/u, '');
  const destination = new URL(`${basePath}/settings/discovery`, appUrl.origin);
  if (result.traktComplete) destination.searchParams.set('traktComplete', '1');
  if (result.traktConnected)
    destination.searchParams.set('traktConnected', '1');
  if (result.traktError)
    destination.searchParams.set('traktError', result.traktError);
  return destination.toString();
};

const traktCallbackCookiePath = (applicationUrl: string): string => {
  const url = new URL(applicationUrl);
  return `${url.pathname.replace(/\/+$/u, '')}/api/v1/integrations/discovery`;
};

const getTraktCallbackCookieName = (state: string): string | undefined =>
  /^[a-f0-9]{64}$/u.test(state)
    ? `${TRAKT_CALLBACK_COOKIE_PREFIX}${state}`
    : undefined;

const clearTraktCallbackCookie = (
  res: express.Response,
  name: string,
  path: string
): void => {
  res.clearCookie(name, { path, sameSite: 'lax', secure: true });
};

const pruneTraktCallbackCookies = (
  req: express.Request,
  res: express.Response,
  path: string
): void => {
  const cookies = Object.entries(req.signedCookies as Record<string, unknown>)
    .filter(([name]) => name.startsWith(TRAKT_CALLBACK_COOKIE_PREFIX))
    .map(([name, value]) => ({
      name,
      expiresAt: parseTraktCallbackData(value)?.expiresAt ?? 0,
    }))
    .sort((left, right) => right.expiresAt - left.expiresAt);
  for (const { name } of cookies.slice(MAX_ACTIVE_TRAKT_CALLBACK_COOKIES - 1))
    clearTraktCallbackCookie(res, name, path);
};

const stateMatches = (provided: string, expected: string): boolean => {
  const providedBytes = Buffer.from(provided);
  const expectedBytes = Buffer.from(expected);
  return (
    providedBytes.length > 0 &&
    providedBytes.length === expectedBytes.length &&
    timingSafeEqual(providedBytes, expectedBytes)
  );
};

interface TraktCallbackData {
  code: string;
  state: string;
  expiresAt: number;
}

const parseTraktCallbackData = (
  value: unknown
): TraktCallbackData | undefined => {
  if (typeof value !== 'string') return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as Partial<TraktCallbackData>).code === 'string' &&
      (parsed as Partial<TraktCallbackData>).code!.length <= 4096 &&
      typeof (parsed as Partial<TraktCallbackData>).state === 'string' &&
      /^[a-f0-9]{64}$/u.test((parsed as Partial<TraktCallbackData>).state!) &&
      Number.isSafeInteger((parsed as Partial<TraktCallbackData>).expiresAt)
    ) {
      return parsed as TraktCallbackData;
    }
  } catch {
    // Invalid signed callback cookies are handled as expired authorizations.
  }
  return undefined;
};

const router = Router();
router.use((_req, res, next) => {
  res.set('Cache-Control', 'private, no-store');
  next();
});

// The provider returns here through a cross-site navigation. Keep this
// callback outside the authenticated router so it can hand off the one-time
// code through a short-lived, signed, HttpOnly cookie, then finish the link
// from the same-site settings page where the normal session and CSRF checks
// apply.
router.get('/trakt/callback', traktCallbackRateLimit, (req, res) => {
  const code =
    typeof req.query.code === 'string' && req.query.code.length <= 4096
      ? req.query.code.trim()
      : '';
  const state =
    typeof req.query.state === 'string' && req.query.state.length <= 128
      ? req.query.state
      : '';
  const providerError =
    typeof req.query.error === 'string' && req.query.error.length <= 128;
  const redirectContext = traktRedirectContext();
  res.set('Referrer-Policy', 'no-referrer');
  if (!redirectContext)
    return res
      .status(400)
      .send('Trakt authorization could not be completed. Return to SeerrNG.');
  const cookieName = getTraktCallbackCookieName(state);
  if (providerError || !code || !cookieName) {
    if (cookieName)
      clearTraktCallbackCookie(
        res,
        cookieName,
        redirectContext.callbackCookiePath
      );
    return res.redirect(
      303,
      traktSettingsUrl(redirectContext.applicationUrl, {
        traktError: providerError ? 'denied' : 'expired',
      })
    );
  }

  pruneTraktCallbackCookies(req, res, redirectContext.callbackCookiePath);

  res.cookie(
    cookieName,
    JSON.stringify({
      code,
      state,
      expiresAt: Date.now() + TRAKT_AUTHORIZATION_TTL_MS,
    } satisfies TraktCallbackData),
    {
      httpOnly: true,
      maxAge: TRAKT_AUTHORIZATION_TTL_MS,
      path: redirectContext.callbackCookiePath,
      sameSite: 'lax',
      secure: true,
      signed: true,
    }
  );
  return res.redirect(
    303,
    traktSettingsUrl(redirectContext.applicationUrl, { traktComplete: true })
  );
});

router.use(isAuthenticated());
const handle = handleDiscoveryIntegration;
const personalMutation = runPersonalDiscoveryMutation;
const identityMappingRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `user:${req.user?.id ?? 'anonymous'}`,
  skip: () =>
    process.env.NODE_ENV === 'test' || process.env.E2E_TESTS === 'true',
});
const identityMappingPackRateLimit = rateLimit({
  windowMs: 5 * 60_000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `user:${req.user?.id ?? 'anonymous'}`,
  skip: () =>
    process.env.NODE_ENV === 'test' || process.env.E2E_TESTS === 'true',
});
const identityRepairRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => 'user:' + (req.user?.id ?? 'anonymous'),
  skip: () =>
    process.env.NODE_ENV === 'test' || process.env.E2E_TESTS === 'true',
});
const episodeWatchStateRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `user:${req.user?.id ?? 'anonymous'}`,
  skip: () =>
    process.env.NODE_ENV === 'test' || process.env.E2E_TESTS === 'true',
});
const curatedIdentityPackRateLimit = rateLimit({
  windowMs: 5 * 60_000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `user:${req.user?.id ?? 'anonymous'}`,
  skip: () =>
    process.env.NODE_ENV === 'test' || process.env.E2E_TESTS === 'true',
});

async function requireOwnedIdentity(
  userId: number,
  identity: string
): Promise<void> {
  const source = parsePersonalIdentitySource(identity);
  // AniList and MDBList catalogs are browsable without linking a personal
  // account. Their repairs remain private to this user, like library matches.
  if (source === 'anilist' || source === 'mdblist') return;
  if (source === 'trakt' || source === 'simkl') {
    await requireDiscoveryAccount(userId, source);
    return;
  }
  const connection = await getNativeLibraryConnection(userId);
  if (!connection?.connected || connection.provider !== source)
    throw new DiscoveryIntegrationError(
      409,
      'Connect this media server before matching its library titles.'
    );
}

router.put(
  '/mappings',
  identityMappingRateLimit,
  handle(async (req, res) => {
    requireDiscoveryBrowserSession(req);
    const body = req.body;
    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      Object.keys(body).some(
        (key) => !['identity', 'tmdbId', 'mediaType'].includes(key)
      ) ||
      typeof body.identity !== 'string' ||
      !Number.isSafeInteger(body.tmdbId) ||
      (body.mediaType !== 'movie' && body.mediaType !== 'tv')
    )
      throw new DiscoveryIntegrationError(400, 'Choose a valid catalog match.');

    await requireOwnedIdentity(req.user!.id, body.identity);
    if (!isUserMediaCategoryEnabled(req.user, body.mediaType))
      throw new DiscoveryIntegrationError(
        403,
        'This media category is disabled.'
      );
    try {
      const tmdb = new TheMovieDb();
      const target =
        body.mediaType === 'movie'
          ? await tmdb.getMovie({ movieId: body.tmdbId })
          : await tmdb.getTvShow({ tvId: body.tmdbId });
      if (target.id !== body.tmdbId)
        throw new Error('TMDB returned a different title.');
    } catch {
      throw new DiscoveryIntegrationError(
        502,
        'The catalog could not confirm this match. Search again or try later.'
      );
    }

    res.json(
      await personalMutation(req, () =>
        savePersonalIdentityMapping(
          req.user!.id,
          body.identity,
          body.tmdbId,
          body.mediaType
        )
      )
    );
  })
);
router.delete(
  '/mappings/:identity',
  identityMappingRateLimit,
  handle(async (req, res) => {
    requireDiscoveryBrowserSession(req);
    const identity = String(req.params.identity);
    await requireOwnedIdentity(req.user!.id, identity);
    res.json(
      await personalMutation(req, () =>
        removePersonalIdentityMapping(req.user!.id, identity)
      )
    );
  })
);
router.get(
  '/mappings/pack',
  handle(async (req, res) => {
    requireDiscoveryBrowserSession(req);
    res.json(await exportPersonalIdentityMappingPack(req.user!.id));
  })
);
router.post(
  '/mappings/pack',
  identityMappingPackRateLimit,
  express.text({ type: 'text/plain', limit: '5mb' }),
  handle(async (req, res) => {
    requireDiscoveryBrowserSession(req);
    if (typeof req.body !== 'string')
      throw new DiscoveryIntegrationError(
        400,
        'Select a valid title-match file.'
      );
    let pack: unknown;
    try {
      pack = JSON.parse(req.body);
    } catch {
      throw new DiscoveryIntegrationError(
        400,
        'This title-match file is not valid JSON.'
      );
    }
    const validatedPack = parsePersonalIdentityMappingPack(pack);
    res.json(
      await personalMutation(req, () =>
        importPersonalIdentityMappingPack(req.user!.id, validatedPack)
      )
    );
  })
);
router.get(
  '/mappings/packs',
  isAuthenticated(Permission.ADMIN),
  authorizedRouteAccess(Permission.ADMIN),
  handle(async (_req, res) => {
    res.json({ packs: await listCuratedIdentityPacks() });
  })
);
router.get(
  '/mappings/packs/:packId',
  isAuthenticated(Permission.ADMIN),
  authorizedRouteAccess(Permission.ADMIN),
  handle(async (req, res) => {
    res.json(await exportCuratedIdentityPack(req.params.packId));
  })
);
router.post(
  '/mappings/packs',
  curatedIdentityPackRateLimit,
  isAuthenticated(Permission.ADMIN),
  express.text({
    type: 'text/plain',
    limit: MAX_CURATED_IDENTITY_PACK_BYTES,
  }),
  authorizedMutation(
    Permission.ADMIN,
    handle(async (req, res) => {
      requireDiscoveryBrowserSession(req);
      if (typeof req.body !== 'string')
        throw new DiscoveryIntegrationError(
          400,
          'Select a valid shared title-match file.'
        );
      let value: unknown;
      try {
        value = JSON.parse(req.body);
      } catch {
        throw new DiscoveryIntegrationError(
          400,
          'This shared title-match file is not valid JSON.'
        );
      }
      const pack = parseCuratedIdentityMappingPack(value);
      res.json(await importCuratedIdentityMappingPack(pack));
    })
  )
);
router.delete(
  '/mappings/packs/:packId',
  curatedIdentityPackRateLimit,
  isAuthenticated(Permission.ADMIN),
  authorizedMutation(
    Permission.ADMIN,
    handle(async (req, res) => {
      requireDiscoveryBrowserSession(req);
      res.json(await removeCuratedIdentityPack(req.params.packId));
    })
  )
);
function publicConfiguration() {
  const config = getSettings().discoveryIntegrations;
  return {
    trakt: {
      clientId: config.trakt.clientId,
      configured: !!config.trakt.clientId,
    },
    anilist: {
      clientId: config.anilist.clientId,
      configured: !!(config.anilist.clientId && config.anilist.clientSecret),
    },
    simkl: {
      clientId: config.simkl.clientId,
      configured: !!config.simkl.clientId,
    },
    mdblist: { configured: !!config.mdblist.apiKey },
  };
}
router.get('/configuration', (_req, res) => res.json(publicConfiguration()));
router.put(
  '/configuration',
  authorizedMutation(
    Permission.ADMIN,
    handle(async (req, res) => {
      const body = req.body;
      if (!body || typeof body !== 'object' || Array.isArray(body))
        throw new DiscoveryIntegrationError(
          400,
          'Invalid integration settings.'
        );
      const allowed = {
        trakt: ['clientId'],
        anilist: ['clientId', 'clientSecret'],
        simkl: ['clientId'],
        mdblist: ['apiKey'],
      };
      for (const [provider, fields] of Object.entries(body)) {
        if (
          !(provider in allowed) ||
          !fields ||
          typeof fields !== 'object' ||
          Array.isArray(fields)
        )
          throw new DiscoveryIntegrationError(
            400,
            'Unknown integration setting.'
          );
        for (const [key, value] of Object.entries(fields)) {
          if (
            !(allowed[provider as keyof typeof allowed] as string[]).includes(
              key
            ) ||
            typeof value !== 'string' ||
            value.length > 4096
          )
            throw new DiscoveryIntegrationError(
              400,
              'Invalid integration credential.'
            );
        }
      }
      await runWithConfigurationAdmission('discoveryIntegrations', () =>
        getSettings().persistSection('discoveryIntegrations', (current) => ({
          // Project the Trakt settings onto the supported fields so legacy
          // clientSecret values are removed when existing installations save
          // their integration settings.
          trakt: {
            clientId: body.trakt?.clientId ?? current.trakt.clientId,
          },
          anilist: { ...current.anilist, ...body.anilist },
          simkl: { ...current.simkl, ...body.simkl },
          mdblist: { ...current.mdblist, ...body.mdblist },
        }))
      );
      res.json(publicConfiguration());
    })
  )
);
router.get(
  '/accounts',
  handle(async (req, res) => {
    const accounts = await getRepository(DiscoveryAccount).findBy({
      userId: req.user!.id,
    });
    res.json({
      accounts: accounts
        .filter(
          (account) =>
            account.clientId ===
            getSettings().discoveryIntegrations[account.provider].clientId
        )
        .map(publicDiscoveryAccount),
      mediaServer: await getNativeLibraryConnection(req.user!.id),
    });
  })
);
router.delete(
  '/accounts/:provider',
  handle(async (req, res) => {
    const provider = parseDiscoveryProvider(req.params.provider);
    await personalMutation(req, () =>
      getRepository(DiscoveryAccount).delete({ userId: req.user!.id, provider })
    );
    if (provider !== 'anilist' && req.session.discoveryAuth)
      delete req.session.discoveryAuth[provider];
    res.status(204).end();
  })
);
router.put(
  '/accounts/:provider/preferences',
  handle(async (req, res) => {
    const provider = parseDiscoveryProvider(req.params.provider);
    if (typeof req.body?.allowWrites !== 'boolean')
      throw new DiscoveryIntegrationError(
        400,
        'Choose whether tracking writes are allowed.'
      );
    await personalMutation(req, async () => {
      const result = await getRepository(DiscoveryAccount).update(
        { userId: req.user!.id, provider },
        { allowWrites: req.body.allowWrites }
      );
      if (!result.affected)
        throw new DiscoveryIntegrationError(404, 'Account is not connected.');
    });
    res.status(204).end();
  })
);
router.post(
  '/accounts/:provider/connect',
  handle(async (req, res) => {
    const provider = parseDiscoveryProvider(req.params.provider);
    await personalMutation(req, () =>
      runWithConfigurationAdmission('discoveryIntegrations', async () => {
        const config = getSettings().discoveryIntegrations[provider];
        if (!config.clientId)
          throw new DiscoveryIntegrationError(
            409,
            'Ask your administrator to configure this integration first.'
          );
        if (provider === 'anilist')
          return res.json({
            verificationUrl: AnilistAPI.buildAuthorizeUrl(config.clientId),
          });
        if (provider === 'trakt') {
          const redirectContext = traktRedirectContext();
          if (!redirectContext)
            throw new DiscoveryIntegrationError(
              409,
              'Set a public HTTPS application URL in Settings → General before connecting Trakt.'
            );
          const codeVerifier = generatePkceVerifier();
          const codeChallenge = derivePkceChallenge(codeVerifier);
          const state = randomBytes(32).toString('hex');
          const previousState = req.session.discoveryAuth?.trakt?.state;
          const previousCookieName = previousState
            ? getTraktCallbackCookieName(previousState)
            : undefined;
          if (previousCookieName)
            clearTraktCallbackCookie(
              res,
              previousCookieName,
              redirectContext.callbackCookiePath
            );
          req.session.discoveryAuth ??= {};
          req.session.discoveryAuth.trakt = {
            codeVerifier,
            state,
            clientId: config.clientId,
            userId: req.user!.id,
            applicationUrl: redirectContext.applicationUrl,
            redirectUri: redirectContext.redirectUri,
            expiresAt: Date.now() + TRAKT_AUTHORIZATION_TTL_MS,
          };
          const authorizeUrl = new TraktAPI(config).buildAuthorizeUrl(
            redirectContext.redirectUri,
            codeChallenge,
            state
          );
          return res.json({ authorizeUrl });
        }
        const pending = req.session.discoveryAuth?.simkl;
        if (
          pending &&
          pending.expiresAt > Date.now() &&
          pending.clientId === config.clientId
        ) {
          return res.json({
            userCode: pending.userCode,
            verificationUrl: 'https://simkl.com/pin/',
            interval: pending.interval,
            expiresIn: Math.ceil((pending.expiresAt - Date.now()) / 1000),
          });
        }
        const result = await new SimklAPI({
          clientId: config.clientId,
        }).requestPinCode();
        const userCode = result.user_code;
        if (!userCode)
          throw new DiscoveryIntegrationError(
            502,
            'Provider returned an invalid connection code.'
          );
        const interval = Math.max(5, Math.min(60, result.interval ?? 5));
        const expiresIn = Math.max(
          30,
          Math.min(1800, result.expires_in ?? 600)
        );
        req.session.discoveryAuth ??= {};
        req.session.discoveryAuth.simkl = {
          userCode,
          clientId: config.clientId,
          interval,
          expiresAt: Date.now() + expiresIn * 1000,
          nextPollAt: Date.now() + interval * 1000,
        };
        res.json({
          userCode,
          verificationUrl: 'https://simkl.com/pin/',
          interval,
          expiresIn,
        });
      })
    );
  })
);
router.post(
  '/accounts/:provider/complete',
  handle(async (req, res) => {
    const provider = parseDiscoveryProvider(req.params.provider);
    await personalMutation(req, () =>
      runWithConfigurationAdmission('discoveryIntegrations', async () => {
        const config = getSettings().discoveryIntegrations[provider];
        if (provider === 'anilist') {
          if (
            typeof req.body?.code !== 'string' ||
            !req.body.code.trim() ||
            req.body.code.length > 4096
          )
            throw new DiscoveryIntegrationError(
              400,
              'Enter the authorization code provided by AniList.'
            );
          const credentials = getSettings().discoveryIntegrations.anilist;
          if (!credentials.clientId || !credentials.clientSecret)
            throw new DiscoveryIntegrationError(
              409,
              'AniList is not configured.'
            );
          const tokens = await AnilistAPI.exchangePinCode(
            credentials.clientId,
            credentials.clientSecret,
            req.body.code.trim()
          );
          const viewer = await new AnilistAPI(tokens).getViewer();
          const account = await saveDiscoveryAccount(
            req.user!.id,
            provider,
            tokens,
            { username: viewer.name, providerUserId: String(viewer.id) }
          );
          return res.json({
            status: 'authorized',
            account: publicDiscoveryAccount(account),
          });
        }
        if (provider === 'trakt') {
          const pending = req.session.discoveryAuth?.trakt;
          const currentRedirectContext = traktRedirectContext();
          const callbackCookieName = pending
            ? getTraktCallbackCookieName(pending.state)
            : undefined;
          const callbackData = callbackCookieName
            ? parseTraktCallbackData(req.signedCookies?.[callbackCookieName])
            : undefined;
          const cookiePaths = new Set(
            [
              currentRedirectContext?.callbackCookiePath,
              pending
                ? traktCallbackCookiePath(pending.applicationUrl)
                : undefined,
            ].filter((path): path is string => Boolean(path))
          );
          if (callbackCookieName) {
            for (const cookiePath of cookiePaths)
              clearTraktCallbackCookie(res, callbackCookieName, cookiePath);
          }
          if (
            !pending ||
            !callbackData ||
            callbackData.expiresAt <= Date.now() ||
            pending.expiresAt <= Date.now() ||
            !stateMatches(callbackData.state, pending.state) ||
            pending.userId !== req.user!.id ||
            pending.clientId !== config.clientId ||
            pending.applicationUrl !== currentRedirectContext?.applicationUrl ||
            pending.redirectUri !== currentRedirectContext?.redirectUri
          ) {
            if (req.session.discoveryAuth)
              delete req.session.discoveryAuth.trakt;
            if (cookiePaths.size > 0) {
              for (const name of Object.keys(
                req.signedCookies as Record<string, unknown>
              ).filter((value) =>
                value.startsWith(TRAKT_CALLBACK_COOKIE_PREFIX)
              )) {
                for (const cookiePath of cookiePaths)
                  clearTraktCallbackCookie(res, name, cookiePath);
              }
            }
            throw new DiscoveryIntegrationError(
              409,
              'Connection expired. Start again.'
            );
          }
          delete req.session.discoveryAuth!.trakt;
          const tokens = await new TraktAPI(config).exchangeCodeForTokens(
            callbackData.code,
            pending.codeVerifier,
            pending.redirectUri
          );
          const identity = await new TraktAPI({
            ...config,
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            expiresAt: tokens.expiresAt,
          }).getUserSettings();
          const account = await saveDiscoveryAccount(
            req.user!.id,
            'trakt',
            {
              accessToken: tokens.access_token,
              refreshToken: tokens.refresh_token,
              expiresAt: tokens.expiresAt,
            },
            {
              username: identity.username,
              providerUserId: String(identity.traktUserId),
            }
          );
          return res.json({
            status: 'authorized',
            account: publicDiscoveryAccount(account),
          });
        }
        const pending = req.session.discoveryAuth?.[provider];
        if (
          !pending ||
          pending.expiresAt <= Date.now() ||
          pending.clientId !== config.clientId
        ) {
          if (req.session.discoveryAuth)
            delete req.session.discoveryAuth[provider];
          throw new DiscoveryIntegrationError(
            409,
            'Connection expired. Start again.'
          );
        }
        if (pending.nextPollAt > Date.now())
          return res
            .status(202)
            .json({ status: 'pending', interval: pending.interval });
        pending.nextPollAt = Date.now() + pending.interval * 1000;
        const result = await new SimklAPI({
          clientId: config.clientId,
        }).pollPinToken(pending.userCode);
        const accessToken = result.access_token ?? result.token;
        if (!accessToken)
          return res
            .status(202)
            .json({ status: 'pending', interval: pending.interval });
        const identity = await new SimklAPI({
          clientId: config.clientId,
          accessToken,
        }).getUserSettings();
        const account = await saveDiscoveryAccount(
          req.user!.id,
          provider,
          { accessToken },
          {
            username: identity.user?.username ?? identity.user?.name ?? '',
            providerUserId: String(
              identity.user?.id ?? identity.account?.id ?? ''
            ),
          }
        );
        delete req.session.discoveryAuth![provider];
        return res.json({
          status: 'authorized',
          account: publicDiscoveryAccount(account),
        });
      })
    );
  })
);
router.get(
  '/feeds/:provider/:feed',
  handle(async (req, res) => {
    const page = req.query.page === undefined ? 1 : Number(req.query.page);
    if (req.query.list !== undefined && typeof req.query.list !== 'string')
      throw new DiscoveryIntegrationError(400, 'Invalid list reference.');
    res.json(
      await discoveryFeed(
        req.user!.id,
        String(req.params.provider),
        String(req.params.feed),
        page,
        req.query.list as string | undefined
      )
    );
  })
);
router.get(
  '/library/:provider',
  handle(async (req, res) => {
    requireDiscoveryBrowserSession(req);
    const source = String(req.params.provider);
    if (source === 'plex' || source === 'jellyfin' || source === 'emby') {
      const shelf = req.query.shelf ?? 'all';
      const rawPage = req.query.page;
      const page =
        rawPage === undefined
          ? 1
          : typeof rawPage === 'number' && Number.isSafeInteger(rawPage)
            ? rawPage
            : typeof rawPage === 'string' && /^[1-9]\d{0,2}$/.test(rawPage)
              ? Number(rawPage)
              : NaN;
      const rawCursor = req.query.cursor;
      const cursor =
        rawCursor === undefined
          ? undefined
          : typeof rawCursor === 'number' && Number.isSafeInteger(rawCursor)
            ? rawCursor
            : typeof rawCursor === 'string' && /^\d{1,6}$/.test(rawCursor)
              ? Number(rawCursor)
              : NaN;
      const libraryId = req.query.libraryId;
      if (
        typeof shelf !== 'string' ||
        !['all', 'watched', 'unwatched', 'in-progress'].includes(shelf) ||
        !Number.isSafeInteger(page) ||
        page > 500 ||
        (cursor !== undefined &&
          (!Number.isSafeInteger(cursor) ||
            cursor < 0 ||
            cursor > MAX_NATIVE_LIBRARY_CURSOR)) ||
        (libraryId !== undefined && typeof libraryId !== 'string') ||
        req.query.mediaType !== undefined
      )
        throw new DiscoveryIntegrationError(
          400,
          'Choose a valid media server library and shelf.'
        );
      res.json(
        await personalMediaServerLibrary(
          req.user!.id,
          source as NativeLibrarySource,
          shelf as LibraryShelf,
          page,
          libraryId as string | undefined,
          cursor
        )
      );
      return;
    }
    const provider = parseDiscoveryProvider(req.params.provider);
    const shelf = req.query.shelf ?? (provider === 'trakt' ? 'watched' : 'all');
    const rawPage = req.query.page;
    const page =
      rawPage === undefined
        ? 1
        : typeof rawPage === 'number' && Number.isSafeInteger(rawPage)
          ? rawPage
          : typeof rawPage === 'string' && /^[1-9]\d{0,2}$/.test(rawPage)
            ? Number(rawPage)
            : NaN;
    const mediaType = req.query.mediaType;
    if (
      typeof shelf !== 'string' ||
      ![
        'all',
        'watchlist',
        'watched',
        'in-progress',
        'completed',
        'rated',
      ].includes(shelf) ||
      !Number.isSafeInteger(page) ||
      page > 500 ||
      (mediaType !== undefined && mediaType !== 'movie' && mediaType !== 'tv')
    )
      throw new DiscoveryIntegrationError(
        400,
        'Choose a valid library shelf and media type.'
      );
    res.json(
      await personalProviderLibrary(
        req.user!.id,
        provider,
        shelf as LibraryShelf,
        page,
        mediaType as 'movie' | 'tv' | undefined
      )
    );
  })
);
router.post(
  '/library/:provider/repair',
  identityRepairRateLimit,
  handle(async (req, res) => {
    requireDiscoveryBrowserSession(req);
    const provider = parseDiscoveryProvider(req.params.provider);
    if (provider !== 'trakt' && provider !== 'anilist' && provider !== 'simkl')
      throw new DiscoveryIntegrationError(
        400,
        'Choose Trakt, AniList, or Simkl to scan a provider library.'
      );

    const body = req.body;
    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      Object.keys(body).some(
        (key) => !['shelf', 'startPage', 'pageCount', 'mediaType'].includes(key)
      ) ||
      ![
        'all',
        'watchlist',
        'watched',
        'in-progress',
        'completed',
        'rated',
      ].includes(body.shelf) ||
      !Number.isSafeInteger(body.startPage) ||
      body.startPage < 1 ||
      body.startPage > 500 ||
      !Number.isSafeInteger(body.pageCount) ||
      body.pageCount < 1 ||
      body.pageCount > MAX_PROVIDER_LIBRARY_REPAIR_PAGES_PER_BATCH ||
      (body.mediaType !== undefined &&
        body.mediaType !== 'movie' &&
        body.mediaType !== 'tv')
    )
      throw new DiscoveryIntegrationError(
        400,
        'Choose a valid provider library scan range.'
      );

    const result = await resolvePersonalProviderLibraryMappings(
      req.user!.id,
      provider,
      body.shelf as LibraryShelf,
      body.startPage,
      body.pageCount,
      body.mediaType as 'movie' | 'tv' | undefined
    );
    const { matches, ...scan } = result;
    const saved = await personalMutation(req, () =>
      saveExternalIdentityMappings(req.user!.id, provider, matches)
    );
    res.json({
      ...scan,
      matched: matches.length,
      saved: saved.saved,
      limitReached: saved.limitReached,
    });
  })
);
router.get(
  '/tracking/:provider/episodes',
  episodeWatchStateRateLimit,
  handle(async (req, res) => {
    requireDiscoveryBrowserSession(req);
    const provider = String(req.params.provider);
    if (provider !== 'trakt' && provider !== 'simkl')
      throw new DiscoveryIntegrationError(
        400,
        'Choose Trakt or Simkl for episode watch status.'
      );
    const request = parseEpisodeWatchStateRequest({
      sourceId: req.query.sourceId,
      tmdbId:
        typeof req.query.tmdbId === 'string' ||
        typeof req.query.tmdbId === 'number'
          ? Number(req.query.tmdbId)
          : req.query.tmdbId,
      season:
        typeof req.query.season === 'string' ||
        typeof req.query.season === 'number'
          ? Number(req.query.season)
          : req.query.season,
    });
    res.json(await providerEpisodeWatchState(req.user!.id, provider, request));
  })
);
router.post(
  '/tracking/:provider',
  handle(async (req, res) => {
    requireDiscoveryBrowserSession(req);
    const provider = parseDiscoveryProvider(req.params.provider);
    const intent = parseTrackingIntent(provider, req.body);
    const prepared = await prepareTrackingAccount(req.user!.id, provider);
    const result = await personalMutation(req, () =>
      applyTrackingIntent(req.user!.id, provider, intent, prepared.accessToken)
    );
    res.json(result);
  })
);
router.get(
  '/tracking/actions/:requestId',
  handle(async (req, res) => {
    requireDiscoveryBrowserSession(req);
    const action = await getRepository(ProviderTrackingAction).findOneBy({
      userId: req.user!.id,
      requestId: String(req.params.requestId),
    });
    if (!action)
      throw new DiscoveryIntegrationError(404, 'Tracking action not found.');
    res.json(publicTrackingAction(action));
  })
);
export default router;
