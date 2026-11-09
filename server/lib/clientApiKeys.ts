import { getRepository } from '@server/datasource';
import { ClientApiKey, type ClientApiScope } from '@server/entity/ClientApiKey';
import { User } from '@server/entity/User';
import { getUserCredentialVersion } from '@server/lib/userSecurityMutation';
import { createHash } from 'node:crypto';

export const hashClientApiKey = (value: string): string =>
  createHash('sha256').update(value).digest('hex');
export const clientApiKeyAllows = (
  scopes: ClientApiScope[],
  method: string,
  path: string
): boolean => {
  if (method === 'GET' && path === '/auth/me') return true;
  if (scopes.includes('discover')) {
    if (method === 'POST' && /^\/resolve(?:\/image)?\/?$/.test(path))
      return true;
    if (
      method === 'GET' &&
      (/^\/(search|resolve\/capabilities)\/?$/.test(path) ||
        /^\/(movie|tv|anime|game)\/\d+\/?$/.test(path))
    )
      return true;
  }
  return (
    scopes.includes('request') &&
    method === 'POST' &&
    /^\/request\/?$/.test(path)
  );
};

export const authenticateClientApiKey = async (
  token: string,
  method: string,
  path: string
): Promise<User | null> => {
  if (!/^sngc_[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const key = await getRepository(ClientApiKey).findOne({
    where: { tokenHash: hashClientApiKey(token) },
    relations: { user: true },
  });
  if (
    !key ||
    key.expiresAt.getTime() <= Date.now() ||
    !clientApiKeyAllows(key.scopes, method, path)
  )
    return null;
  const actor = await getRepository(User).findOneBy({ id: key.user.id });
  return actor &&
    key.credentialVersion === String(getUserCredentialVersion(actor))
    ? actor
    : null;
};
