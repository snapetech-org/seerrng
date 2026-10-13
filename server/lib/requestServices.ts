import type { User } from '@server/entity/User';
import { Permission } from '@server/lib/permissions';

export type RequestServiceType = 'radarr' | 'sonarr';

export const getRequestServiceKey = (
  serviceType: RequestServiceType,
  serverId: number
): string => `${serviceType}:${serverId}`;

export const parseRequestServiceKey = (
  value: unknown
): { serviceType: RequestServiceType; serverId: number } | undefined => {
  if (typeof value !== 'string') return undefined;
  const match = /^(radarr|sonarr):([0-9]{1,10})$/.exec(value);
  if (!match) return undefined;
  const serverId = Number(match[2]);
  if (!Number.isSafeInteger(serverId) || serverId < 0) return undefined;
  return { serviceType: match[1] as RequestServiceType, serverId };
};

export const canRequestFromService = (
  user: User,
  serviceType: RequestServiceType,
  serverId: number
): boolean =>
  user.hasPermission(
    [Permission.ADMIN, Permission.MANAGE_REQUESTS, Permission.REQUEST_ADVANCED],
    { type: 'or' }
  ) ||
  (user.requestServices ?? []).includes(
    getRequestServiceKey(serviceType, serverId)
  );
