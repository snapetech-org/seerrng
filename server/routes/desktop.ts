import JellyfinAPI from '@server/api/jellyfin';
import { MediaServerType } from '@server/constants/server';
import { getRepository } from '@server/datasource';
import { DesktopAuthTicket } from '@server/entity/DesktopAuthTicket';
import { Session } from '@server/entity/Session';
import { User } from '@server/entity/User';
import { runWithConfigurationAdmission } from '@server/lib/configurationAdmission';
import { getJellyfinAuthAuthorityKey } from '@server/lib/mediaServerAuthority';
import { Permission } from '@server/lib/permissions';
import { getSettings } from '@server/lib/settings';
import {
  getUserCredentialVersion,
  runUserSecurityMutationWithActor,
  UserMutationActorUnauthorizedError,
} from '@server/lib/userSecurityMutation';
import { isAuthenticated } from '@server/middleware/auth';
import { requestUsesSecureTransport } from '@server/middleware/csrfProtection';
import { ApiError } from '@server/types/error';
import { getHostname } from '@server/utils/getHostname';
import { normalizeJellyfinGuid } from '@server/utils/jellyfin';
import { getRateLimitKey } from '@server/utils/security';
import { Router } from 'express';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { MoreThan } from 'typeorm';
import { z } from 'zod';

const router = Router();
const TICKET_LIFETIME_MS = 60_000;
const RATE_WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 10;
const MAX_RATE_LIMIT_KEYS = 4096;
const rateLimitWindows = new Map<string, { count: number; resetAt: number }>();

const issueTicketBody = z
  .object({
    challenge: z.string().regex(/^[a-f0-9]{64}$/),
    protocolVersion: z.literal(1),
  })
  .strict();

const redeemTicketBody = z
  .object({
    ticket: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    verifier: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    protocolVersion: z.literal(1),
  })
  .strict();

const digest = (value: string): string =>
  createHash('sha256').update(value, 'utf8').digest('hex');

const sameDigest = (left: string, right: string): boolean => {
  const leftBytes = Buffer.from(left, 'hex');
  const rightBytes = Buffer.from(right, 'hex');
  return (
    leftBytes.length === rightBytes.length &&
    leftBytes.length === 32 &&
    timingSafeEqual(leftBytes, rightBytes)
  );
};

const allowRequest = (key: string): boolean => {
  const now = Date.now();
  if (rateLimitWindows.size >= MAX_RATE_LIMIT_KEYS) {
    for (const [candidate, value] of rateLimitWindows) {
      if (value.resetAt <= now) rateLimitWindows.delete(candidate);
    }
    while (rateLimitWindows.size >= MAX_RATE_LIMIT_KEYS) {
      const oldest = rateLimitWindows.keys().next().value;
      if (!oldest) break;
      rateLimitWindows.delete(oldest);
    }
  }

  const current = rateLimitWindows.get(key);
  if (!current || current.resetAt <= now) {
    rateLimitWindows.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (current.count >= MAX_REQUESTS_PER_WINDOW) return false;
  current.count += 1;
  return true;
};

/** Test-only reset for the route's bounded in-memory rate limiter. */
export const resetDesktopRateLimitsForTests = (): void => {
  rateLimitWindows.clear();
};

router.use((_req, res, next) => {
  res.set({
    'Cache-Control': 'no-store',
    Pragma: 'no-cache',
  });
  next();
});

const findLinkedUser = (userId: number) =>
  getRepository(User)
    .createQueryBuilder('user')
    .addSelect([
      'user.jellyfinAuthToken',
      'user.jellyfinDeviceId',
      'user.jellyfinUserId',
    ])
    .where('user.id = :userId', { userId })
    .getOne();

type StoredSession = {
  userId?: unknown;
  credentialVersion?: unknown;
};

const getActiveStoredSession = async (
  sessionId: string
): Promise<StoredSession | undefined> => {
  const row = await getRepository(Session).findOne({
    where: { id: sessionId, expiredAt: MoreThan(Date.now()) },
  });
  if (!row) return undefined;

  try {
    const parsed: unknown = JSON.parse(row.json);
    if (!parsed || typeof parsed !== 'object') return undefined;
    return parsed as StoredSession;
  } catch {
    return undefined;
  }
};

const normalizedUrl = (value: string): string | undefined => {
  try {
    const url = new URL(value.trim());
    if (
      (url.protocol !== 'https:' && url.protocol !== 'http:') ||
      !url.hostname ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      return undefined;
    }
    const normalized = url.toString().replace(/\/$/, '');
    return normalized.length <= 2048 ? normalized : undefined;
  } catch {
    return undefined;
  }
};

const getJellyfinDesktopHosts = (): {
  serverUrl: string;
  fallbackServerUrl?: string;
} => {
  const settings = getSettings();
  const internal = normalizedUrl(getHostname(settings.jellyfin));
  const external = normalizedUrl(settings.jellyfin.externalHostname ?? '');

  if (internal && external && internal !== external) {
    return { serverUrl: internal, fallbackServerUrl: external };
  }
  const serverUrl = internal ?? external;
  if (!serverUrl) throw new Error('A valid Jellyfin server URL is required.');
  return { serverUrl };
};

router.post('/auth-tickets', isAuthenticated(), async (req, res, next) => {
  if (!requestUsesSecureTransport(req)) {
    return res.status(403).json({ code: 'https_required' });
  }

  const parsed = issueTicketBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ code: 'invalid_request' });
  }

  // API keys and other service credentials must not bootstrap a desktop user.
  if (
    req.header('X-API-Key') !== undefined ||
    !req.user ||
    req.session?.userId !== req.user.id ||
    !req.sessionID
  ) {
    return res.status(403).json({ code: 'session_required' });
  }

  const rateLimitKey = getRateLimitKey(req);
  if (
    !allowRequest(`issue:ip:${rateLimitKey}`) ||
    !allowRequest(`issue:session:${req.sessionID}`)
  ) {
    return res.status(429).json({ code: 'rate_limited' });
  }

  const settings = getSettings();
  const user = await findLinkedUser(req.user.id);
  if (
    settings.main.mediaServerType !== MediaServerType.JELLYFIN ||
    !user?.jellyfinUserId ||
    !user.jellyfinAuthToken ||
    !user.jellyfinDeviceId ||
    !normalizeJellyfinGuid(user.jellyfinUserId)
  ) {
    return res.status(409).json({ code: 'not_linked' });
  }
  if (
    user.jellyfinAuthToken.length > 8192 ||
    user.jellyfinUserId.length > 256 ||
    user.jellyfinDeviceId.length > 256
  ) {
    return res.status(409).json({ code: 'unsupported_credentials' });
  }

  try {
    await getRepository(DesktopAuthTicket)
      .createQueryBuilder()
      .delete()
      .where('"expiresAt" <= :now', { now: new Date() })
      .execute();

    const ticketValue = randomBytes(32).toString('base64url');
    const ticket = new DesktopAuthTicket({
      userId: user.id,
      sessionId: req.sessionID,
      credentialVersion: String(getUserCredentialVersion(user)),
      jellyfinUserId: user.jellyfinUserId,
      jellyfinAuthorityKey: getJellyfinAuthAuthorityKey(settings),
      ticketDigest: digest(ticketValue),
      challengeDigest: parsed.data.challenge,
      protocolVersion: 1,
      expiresAt: new Date(Date.now() + TICKET_LIFETIME_MS),
    });
    await getRepository(DesktopAuthTicket).save(ticket);

    return res
      .status(201)
      .json({ ticket: ticketValue, expiresIn: TICKET_LIFETIME_MS });
  } catch (error) {
    return next(error);
  }
});

router.post('/auth-tickets/redeem', async (req, res, next) => {
  if (!requestUsesSecureTransport(req)) {
    return res.status(403).json({ code: 'https_required' });
  }

  // A browser can choose its own PKCE verifier. Accept redemption only from
  // the native HTTP client, which has the verifier created by the host and
  // cannot be reached by browser JavaScript (Origin is browser-controlled).
  if (req.header('Origin') !== undefined) {
    return res.status(403).json({ code: 'native_client_required' });
  }

  const parsed = redeemTicketBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ code: 'invalid_request' });
  }
  if (!allowRequest(`redeem:ip:${getRateLimitKey(req)}`)) {
    return res.status(429).json({ code: 'rate_limited' });
  }

  const { ticket: ticketValue, verifier } = parsed.data;
  const repository = getRepository(DesktopAuthTicket);
  const ticket = await repository
    .createQueryBuilder('ticket')
    .addSelect('ticket.sessionId')
    .where('ticket.ticketDigest = :ticketDigest', {
      ticketDigest: digest(ticketValue),
    })
    .andWhere('ticket.protocolVersion = :protocolVersion', {
      protocolVersion: 1,
    })
    .getOne();

  if (!ticket) return res.status(401).json({ code: 'ticket_expired' });
  if (ticket.consumedAt) return res.status(409).json({ code: 'ticket_used' });
  if (ticket.expiresAt.getTime() <= Date.now()) {
    return res.status(401).json({ code: 'ticket_expired' });
  }
  if (!sameDigest(ticket.challengeDigest, digest(verifier))) {
    return res.status(401).json({ code: 'invalid_verifier' });
  }

  const session = await getActiveStoredSession(ticket.sessionId);
  const sessionCredentialVersion = Number(session?.credentialVersion ?? 0);
  if (
    session?.userId !== ticket.userId ||
    !Number.isSafeInteger(sessionCredentialVersion) ||
    String(sessionCredentialVersion) !== ticket.credentialVersion
  ) {
    return res.status(401).json({ code: 'session_expired' });
  }

  try {
    const settings = getSettings();
    const user = await findLinkedUser(ticket.userId);
    const currentCredentialVersion = user
      ? String(getUserCredentialVersion(user))
      : undefined;
    if (
      settings.main.mediaServerType !== MediaServerType.JELLYFIN ||
      getJellyfinAuthAuthorityKey(settings) !== ticket.jellyfinAuthorityKey
    ) {
      return res.status(409).json({ code: 'unsupported_media_server' });
    }
    const normalizedTicketUserId = normalizeJellyfinGuid(ticket.jellyfinUserId);
    const normalizedUserId = user?.jellyfinUserId
      ? normalizeJellyfinGuid(user.jellyfinUserId)
      : null;
    if (
      !user?.jellyfinUserId ||
      !user.jellyfinAuthToken ||
      !user.jellyfinDeviceId ||
      !normalizedTicketUserId ||
      !normalizedUserId ||
      normalizedUserId !== normalizedTicketUserId ||
      currentCredentialVersion !== ticket.credentialVersion
    ) {
      return res.status(401).json({ code: 'session_expired' });
    }

    const hosts = getJellyfinDesktopHosts();
    const candidates = [hosts.serverUrl, hosts.fallbackServerUrl].filter(
      (candidate): candidate is string => Boolean(candidate)
    );
    let linkedIdentity: Awaited<ReturnType<JellyfinAPI['getUser']>> | undefined;
    let lastFailure: 'token_invalid' | 'server_unreachable' =
      'server_unreachable';

    for (const candidate of candidates) {
      try {
        linkedIdentity = await new JellyfinAPI(
          candidate,
          user.jellyfinAuthToken,
          user.jellyfinDeviceId
        ).getUser();
        break;
      } catch (error) {
        const status = error instanceof ApiError ? error.statusCode : undefined;
        if (status === 401 || status === 403) lastFailure = 'token_invalid';
      }
    }

    if (!linkedIdentity) {
      return res
        .status(lastFailure === 'token_invalid' ? 401 : 503)
        .json({ code: lastFailure });
    }
    const verifiedJellyfinUserId = normalizeJellyfinGuid(linkedIdentity.Id);
    if (
      !verifiedJellyfinUserId ||
      verifiedJellyfinUserId !== normalizedUserId ||
      !linkedIdentity.ServerId ||
      linkedIdentity.ServerId.length > 256 ||
      user.jellyfinUserId.length > 256 ||
      user.jellyfinDeviceId.length > 256 ||
      user.jellyfinAuthToken.length > 8192
    ) {
      return res.status(401).json({ code: 'token_invalid' });
    }

    const verifiedServerId = linkedIdentity.ServerId;
    // Network validation runs outside locks. Re-admit all local authority and
    // consume the ticket under the same locks as credential/config mutations.
    return await runUserSecurityMutationWithActor(
      ticket.userId,
      ticket.userId,
      Permission.ADMIN,
      (actor) =>
        runWithConfigurationAdmission('jellyfin', async () => {
          const activeSession = await getActiveStoredSession(ticket.sessionId);
          if (
            activeSession?.userId !== ticket.userId ||
            String(activeSession.credentialVersion ?? 0) !==
              ticket.credentialVersion ||
            actor.jellyfinAuthToken !== user.jellyfinAuthToken ||
            actor.jellyfinDeviceId !== user.jellyfinDeviceId ||
            normalizeJellyfinGuid(actor.jellyfinUserId) !== normalizedUserId ||
            getSettings().main.mediaServerType !== MediaServerType.JELLYFIN ||
            getJellyfinAuthAuthorityKey(getSettings()) !==
              ticket.jellyfinAuthorityKey
          )
            return res.status(401).json({ code: 'session_expired' });
          const consumed = await repository
            .createQueryBuilder()
            .update(DesktopAuthTicket)
            .set({ consumedAt: new Date() })
            .where('id = :id AND "consumedAt" IS NULL AND "expiresAt" > :now', {
              id: ticket.id,
              now: new Date(),
            })
            .execute();
          if (consumed.affected !== 1) {
            return res.status(409).json({ code: 'ticket_used' });
          }

          return res.status(200).json({
            serverUrl: hosts.serverUrl,
            fallbackServerUrl: hosts.fallbackServerUrl,
            serverId: verifiedServerId,
            userId: actor.jellyfinUserId,
            deviceId: actor.jellyfinDeviceId,
            accessToken: actor.jellyfinAuthToken,
            bootstrapGeneration: randomBytes(12).toString('hex'),
          });
        }),
      {
        expectedCredentialVersion: Number(ticket.credentialVersion),
        includeMediaServerCredentials: true,
      }
    );
  } catch (error) {
    if (error instanceof UserMutationActorUnauthorizedError)
      return res.status(401).json({ code: 'session_expired' });
    return next(error);
  }
});

export default router;
