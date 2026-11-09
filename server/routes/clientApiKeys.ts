import { getRepository } from '@server/datasource';
import { ClientApiKey, type ClientApiScope } from '@server/entity/ClientApiKey';
import { hashClientApiKey } from '@server/lib/clientApiKeys';
import { Permission } from '@server/lib/permissions';
import {
  getUserCredentialVersion,
  runUserSecurityMutationWithActor,
} from '@server/lib/userSecurityMutation';
import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { MoreThan } from 'typeorm';

const routes = Router();
// Minting and revocation require the user's interactive session. A stolen
// integration key must never be exchangeable for a fresh or broader key.
routes.use((req, res, next) => {
  if (
    req.header('X-API-Key') !== undefined ||
    !req.user ||
    req.session?.userId !== req.user.id
  )
    return res
      .status(403)
      .json({ message: 'A signed-in browser session is required.' });
  next();
});
routes.get('/', async (req, res) => {
  const keys = await getRepository(ClientApiKey).find({
    where: { user: { id: req.user!.id } },
    order: { id: 'DESC' },
  });
  res.json(
    keys.map(({ id, name, scopes, createdAt, expiresAt }) => ({
      id,
      name,
      scopes,
      createdAt,
      expiresAt,
    }))
  );
});
routes.post('/', async (req, res) => {
  const { name, scopes = ['discover', 'request'], days = 30 } = req.body ?? {};
  if (
    typeof name !== 'string' ||
    !name.trim() ||
    name.length > 80 ||
    !Array.isArray(scopes) ||
    !scopes.length ||
    scopes.length > 2 ||
    scopes.some((scope) => scope !== 'discover' && scope !== 'request') ||
    !Number.isSafeInteger(days) ||
    days < 1 ||
    days > 90
  )
    return res.status(400).json({ message: 'Invalid client token settings.' });
  return runUserSecurityMutationWithActor(
    req.user!.id,
    req.user!.id,
    Permission.ADMIN,
    async (actor) => {
      const repository = getRepository(ClientApiKey);
      if (
        (await repository.count({
          where: { user: { id: actor.id }, expiresAt: MoreThan(new Date()) },
        })) >= 10
      )
        return res
          .status(409)
          .json({ message: 'Revoke an existing client token first.' });
      const token = `sngc_${randomBytes(32).toString('base64url')}`;
      const key = await repository.save(
        repository.create({
          name: name.trim(),
          user: actor,
          tokenHash: hashClientApiKey(token),
          scopes: [...new Set(scopes)] as ClientApiScope[],
          credentialVersion: String(getUserCredentialVersion(actor)),
          expiresAt: new Date(Date.now() + days * 86400000),
        })
      );
      return res.status(201).json({
        id: key.id,
        name: key.name,
        scopes: key.scopes,
        expiresAt: key.expiresAt,
        token,
      });
    }
  );
});
routes.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1)
    return res.status(400).json({ message: 'Invalid client token ID.' });
  return runUserSecurityMutationWithActor(
    req.user!.id,
    req.user!.id,
    Permission.ADMIN,
    async (actor) => {
      await getRepository(ClientApiKey).delete({ id, user: { id: actor.id } });
      return res.status(204).end();
    }
  );
});
export default routes;
