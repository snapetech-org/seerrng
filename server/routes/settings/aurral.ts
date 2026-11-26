import AurralAPI from '@server/api/aurral';
import { getExternalRuntimeConfig } from '@server/lib/externalRuntimeConfig';
import { Permission } from '@server/lib/permissions';
import { runWithMusicServiceCollectionMutationAdmission } from '@server/lib/serviceAdmission';
import {
  allocateServarrServiceId,
  assertServarrServiceCanBeRemoved,
  getHistoricalMusicServiceIdMaximum,
} from '@server/lib/serviceId';
import type { AurralSettings } from '@server/lib/settings';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import { authorizedMutation } from '@server/middleware/authorizedMutation';
import { parseNonNegativeRouteId } from '@server/utils/routeId';
import { REDACTED_SECRET, redactSecrets } from '@server/utils/security';
import {
  assertServarrInstanceCapacity,
  parseAurralConnectionSettings,
  parseAurralSettings,
  preserveServarrApiKey,
  preserveServarrConnectionSecret,
  type AurralConnectionSettings,
} from '@server/utils/servarrSettings';
import { Router } from 'express';

const aurralRoutes = Router();

aurralRoutes.get('/', (_req, res) => {
  const settings = getSettings();

  res.status(200).json(redactSecrets(settings.aurral));
});

aurralRoutes.post(
  '/',
  authorizedMutation(Permission.ADMIN, async (req, res) => {
    const settings = getSettings();

    const parsedAurral = parseAurralSettings(req.body);

    if ('error' in parsedAurral) {
      return res.status(400).json({ message: parsedAurral.error });
    }

    return runWithMusicServiceCollectionMutationAdmission(async () => {
      const historicalServiceIdMaximum =
        await getHistoricalMusicServiceIdMaximum();
      const aurral = await settings.persistSection('aurral', (current) => {
        assertServarrInstanceCapacity(current);
        const currentMusicIds = [
          ...current.map(({ id }) => id),
          ...settings.lidarr.map(({ id }) => id),
        ];
        const newAurral: AurralSettings = {
          ...parsedAurral.value,
          id: allocateServarrServiceId(
            currentMusicIds,
            historicalServiceIdMaximum
          ),
        };
        const existing = newAurral.isDefault
          ? current.map((instance) => ({ ...instance, isDefault: false }))
          : current;
        return [...existing, newAurral];
      });
      if (parsedAurral.value.isDefault) {
        await settings.persistSection('lidarr', (current) =>
          current.some((instance) => instance.isDefault)
            ? current.map((instance) => ({ ...instance, isDefault: false }))
            : current
        );
      }
      const newAurral = aurral[aurral.length - 1];

      return res.status(201).json(redactSecrets(newAurral));
    });
  })
);

aurralRoutes.post<undefined, Record<string, unknown>, AurralConnectionSettings>(
  '/test',
  authorizedMutation<
    undefined,
    Record<string, unknown>,
    AurralConnectionSettings
  >(Permission.ADMIN, async (req, res, next) => {
    try {
      const parsedAurral = parseAurralConnectionSettings(
        preserveServarrConnectionSecret(
          req.body,
          getExternalRuntimeConfig().aurral
        )
      );

      if ('error' in parsedAurral) {
        return res.status(400).json({ message: parsedAurral.error });
      }

      const aurral = new AurralAPI({
        apiKey: parsedAurral.value.apiKey,
        url: AurralAPI.buildUrl(parsedAurral.value),
      });

      const health = await aurral.testConnection();
      if (!health.user?.username) {
        return next({
          status: 403,
          message:
            'Aurral API key must belong to a user (Settings > Profile > API access).',
        });
      }

      return res.status(200).json({
        appVersion: health.appVersion,
        user: health.user,
      });
    } catch (e) {
      logger.error('Failed to test Aurral', {
        label: 'Aurral',
        message: e instanceof Error ? e.message : String(e),
      });

      return next({ status: 500, message: 'Failed to connect to Aurral' });
    }
  })
);

aurralRoutes.put<{ id: string }, AurralSettings, AurralSettings>(
  '/:id',
  authorizedMutation<{ id: string }, AurralSettings, AurralSettings>(
    Permission.ADMIN,
    async (req, res, next) => {
      const settings = getSettings();
      const aurralId = parseNonNegativeRouteId(req.params.id);
      if (aurralId === undefined) {
        return next({ status: 404, message: 'Settings instance not found' });
      }

      const aurralIndex = settings.aurral.findIndex((r) => r.id === aurralId);
      if (aurralIndex === -1) {
        return next({ status: 404, message: 'Settings instance not found' });
      }

      return runWithMusicServiceCollectionMutationAdmission(async () => {
        const currentAurral = settings.aurral.find(
          (instance) => instance.id === aurralId
        );
        if (!currentAurral) {
          return next({
            status: 404,
            message: 'Settings instance not found',
          });
        }

        const admittedAurral = parseAurralSettings(
          preserveServarrApiKey(req.body, currentAurral),
          currentAurral
        );
        if ('error' in admittedAurral) {
          return next({ status: 400, message: admittedAurral.error });
        }

        const aurral = await settings.persistSection('aurral', (current) =>
          current.map((instance) => {
            if (instance.id === aurralId) {
              return {
                ...admittedAurral.value,
                apiKey:
                  (req.body as { apiKey?: unknown }).apiKey === REDACTED_SECRET
                    ? instance.apiKey
                    : admittedAurral.value.apiKey,
                id: aurralId,
              } as AurralSettings;
            }
            return admittedAurral.value.isDefault
              ? { ...instance, isDefault: false }
              : instance;
          })
        );
        if (admittedAurral.value.isDefault) {
          await settings.persistSection('lidarr', (current) =>
            current.some((instance) => instance.isDefault)
              ? current.map((instance) => ({ ...instance, isDefault: false }))
              : current
          );
        }

        return res
          .status(200)
          .json(redactSecrets(aurral.find(({ id }) => id === aurralId)));
      });
    }
  )
);

aurralRoutes.delete<{ id: string }>(
  '/:id',
  authorizedMutation<{ id: string }>(
    Permission.ADMIN,
    async (req, res, next) => {
      const settings = getSettings();
      const aurralId = parseNonNegativeRouteId(req.params.id);
      if (aurralId === undefined) {
        return next({ status: 404, message: 'Settings instance not found' });
      }

      const aurralIndex = settings.aurral.findIndex((r) => r.id === aurralId);
      if (aurralIndex === -1) {
        return next({ status: 404, message: 'Settings instance not found' });
      }

      return runWithMusicServiceCollectionMutationAdmission(async () => {
        const removed = settings.aurral.find(
          (instance) => instance.id === aurralId
        );
        if (!removed) {
          return next({
            status: 404,
            message: 'Settings instance not found',
          });
        }

        await assertServarrServiceCanBeRemoved('aurral', aurralId);
        await settings.persistSection('aurral', (current) => {
          const remaining = current.filter(({ id }) => id !== aurralId);
          return removed.isDefault && remaining.length > 0
            ? remaining.map((instance, index) => ({
                ...instance,
                isDefault: index === 0,
              }))
            : remaining;
        });

        return res.status(200).json(redactSecrets(removed));
      });
    }
  )
);

export default aurralRoutes;
