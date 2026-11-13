import BackIssueAPI, {
  BackIssuePermissionError,
} from '@server/api/comics/backissue';
import { getExternalRuntimeConfig } from '@server/lib/externalRuntimeConfig';
import { Permission } from '@server/lib/permissions';
import { runWithComicServiceCollectionMutationAdmission } from '@server/lib/serviceAdmission';
import {
  allocateServarrServiceId,
  assertServarrServiceCanBeRemoved,
  getHistoricalComicServiceIdMaximum,
} from '@server/lib/serviceId';
import type { BackIssueSettings } from '@server/lib/settings';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import { authorizedMutation } from '@server/middleware/authorizedMutation';
import { parseNonNegativeRouteId } from '@server/utils/routeId';
import { REDACTED_SECRET, redactSecrets } from '@server/utils/security';
import {
  assertServarrInstanceCapacity,
  parseBackIssueSettings,
  parseServarrConnectionSettings,
  preserveServarrApiKey,
  preserveServarrConnectionSecret,
  type ServarrConnectionSettings,
} from '@server/utils/servarrSettings';
import { Router } from 'express';

const backissueRoutes = Router();

backissueRoutes.get('/', (_req, res) =>
  res.status(200).json(redactSecrets(getSettings().backissue))
);

backissueRoutes.post(
  '/',
  authorizedMutation(Permission.ADMIN, async (req, res) => {
    const settings = getSettings();
    const parsed = parseBackIssueSettings(req.body);
    if ('error' in parsed) {
      return res.status(400).json({ message: parsed.error });
    }

    return runWithComicServiceCollectionMutationAdmission(async () => {
      const historicalMaximum = await getHistoricalComicServiceIdMaximum();
      const services = await settings.persistSection('backissue', (current) => {
        assertServarrInstanceCapacity(current);
        const created = {
          ...parsed.value,
          id: allocateServarrServiceId(
            [
              ...current.map(({ id }) => id),
              ...settings.mylar.map(({ id }) => id),
              ...settings.kapowarr.map(({ id }) => id),
            ],
            historicalMaximum
          ),
        };
        return [
          ...(created.isDefault
            ? current.map((service) => ({ ...service, isDefault: false }))
            : current),
          created,
        ];
      });
      const created = services[services.length - 1];
      if (created.isDefault) {
        await Promise.all([
          settings.persistSection('mylar', (current) =>
            current.map((service) => ({ ...service, isDefault: false }))
          ),
          settings.persistSection('kapowarr', (current) =>
            current.map((service) => ({ ...service, isDefault: false }))
          ),
        ]);
      }
      return res.status(201).json(redactSecrets(created));
    });
  })
);

backissueRoutes.post<
  undefined,
  Record<string, unknown>,
  ServarrConnectionSettings
>(
  '/test',
  authorizedMutation<
    undefined,
    Record<string, unknown>,
    ServarrConnectionSettings
  >(Permission.ADMIN, async (req, res, next) => {
    try {
      const parsed = parseServarrConnectionSettings(
        preserveServarrConnectionSecret(
          req.body,
          getExternalRuntimeConfig().backissue
        )
      );
      if ('error' in parsed) {
        return res.status(400).json({ message: parsed.error });
      }

      const client = new BackIssueAPI({
        url: BackIssueAPI.buildUrl(parsed.value),
        apiKey: parsed.value.apiKey,
      });
      const about = await client.getAbout();
      await client.testConnection();
      return res.status(200).json({ ...about });
    } catch (error) {
      if (error instanceof BackIssuePermissionError) {
        return res.status(400).json({ message: error.message });
      }
      logger.error('Failed to test BackIssue', {
        label: 'BackIssue',
        message: error instanceof Error ? error.message : String(error),
      });
      return next({ status: 500, message: 'Failed to connect to BackIssue' });
    }
  })
);

backissueRoutes.put<{ id: string }, BackIssueSettings, BackIssueSettings>(
  '/:id',
  authorizedMutation<{ id: string }, BackIssueSettings, BackIssueSettings>(
    Permission.ADMIN,
    async (req, res, next) => {
      const settings = getSettings();
      const id = parseNonNegativeRouteId(req.params.id);
      if (
        id === undefined ||
        !settings.backissue.some((item) => item.id === id)
      ) {
        return next({ status: 404, message: 'Settings instance not found' });
      }

      return runWithComicServiceCollectionMutationAdmission(async () => {
        const existing = settings.backissue.find((item) => item.id === id);
        if (!existing) {
          return next({ status: 404, message: 'Settings instance not found' });
        }
        const parsed = parseBackIssueSettings(
          preserveServarrApiKey(req.body, existing),
          existing
        );
        if ('error' in parsed) {
          return next({ status: 400, message: parsed.error });
        }
        const services = await settings.persistSection('backissue', (current) =>
          current.map((service) => {
            if (service.id === id) {
              return {
                ...parsed.value,
                apiKey:
                  (req.body as { apiKey?: unknown }).apiKey === REDACTED_SECRET
                    ? service.apiKey
                    : parsed.value.apiKey,
                id,
              };
            }
            return parsed.value.isDefault
              ? { ...service, isDefault: false }
              : service;
          })
        );
        if (parsed.value.isDefault) {
          await Promise.all([
            settings.persistSection('mylar', (current) =>
              current.map((service) => ({ ...service, isDefault: false }))
            ),
            settings.persistSection('kapowarr', (current) =>
              current.map((service) => ({ ...service, isDefault: false }))
            ),
          ]);
        }
        return res
          .status(200)
          .json(redactSecrets(services.find((service) => service.id === id)));
      });
    }
  )
);

backissueRoutes.delete<{ id: string }>(
  '/:id',
  authorizedMutation<{ id: string }>(
    Permission.ADMIN,
    async (req, res, next) => {
      const settings = getSettings();
      const id = parseNonNegativeRouteId(req.params.id);
      if (
        id === undefined ||
        !settings.backissue.some((item) => item.id === id)
      ) {
        return next({ status: 404, message: 'Settings instance not found' });
      }

      return runWithComicServiceCollectionMutationAdmission(async () => {
        const removed = settings.backissue.find((item) => item.id === id);
        if (!removed) {
          return next({ status: 404, message: 'Settings instance not found' });
        }
        await assertServarrServiceCanBeRemoved('backissue', id);
        await settings.persistSection('backissue', (current) =>
          current.filter((service) => service.id !== id)
        );
        return res.status(200).json(redactSecrets(removed));
      });
    }
  )
);

export default backissueRoutes;
