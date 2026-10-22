import { Permission } from '@server/lib/permissions';
import { describe, expect, it } from 'vitest';
import {
  buildSetupDefaultsSettings,
  getSetupDefaultsSelection,
} from './setupDefaultsLogic';

const combinePermissions = (...permissions: Permission[]) =>
  Number(
    permissions.reduce((mask, permission) => mask | BigInt(permission), 0n)
  );

const defaults = {
  defaultPermissions: combinePermissions(
    Permission.REQUEST,
    Permission.REQUEST_TV,
    Permission.MANAGE_DOWNLOADS
  ),
  enable4k: true,
  partialRequestsEnabled: true,
};

describe('setup request defaults', () => {
  it('reads the existing request, 4K, and partial request settings', () => {
    expect(
      getSetupDefaultsSelection({
        ...defaults,
        defaultPermissions: combinePermissions(
          Permission.REQUEST,
          Permission.REQUEST_4K,
          Permission.MANAGE_DOWNLOADS
        ),
      })
    ).toEqual({
      allowRequests: true,
      allow4kRequests: true,
      enable4k: true,
      partialRequestsEnabled: true,
    });
  });

  it('updates request access without changing unrelated permissions', () => {
    const result = buildSetupDefaultsSettings(defaults, {
      allowRequests: false,
      allow4kRequests: true,
      enable4k: false,
      partialRequestsEnabled: false,
    });

    expect(result.defaultPermissions).toBe(Permission.MANAGE_DOWNLOADS);
    expect(result.enable4k).toBe(false);
    expect(result.partialRequestsEnabled).toBe(false);
  });

  it('adds standard and 4K request access while preserving other flags', () => {
    const result = buildSetupDefaultsSettings(
      {
        ...defaults,
        defaultPermissions: combinePermissions(Permission.MANAGE_DOWNLOADS),
      },
      {
        allowRequests: true,
        allow4kRequests: true,
        enable4k: true,
        partialRequestsEnabled: true,
      }
    );

    expect(result.defaultPermissions).toBe(
      combinePermissions(
        Permission.REQUEST,
        Permission.REQUEST_4K,
        Permission.MANAGE_DOWNLOADS
      )
    );
  });

  it('clears all 4K request variants when the default is disabled', () => {
    const result = buildSetupDefaultsSettings(
      {
        ...defaults,
        defaultPermissions: combinePermissions(
          Permission.REQUEST,
          Permission.REQUEST_4K,
          Permission.REQUEST_4K_MOVIE,
          Permission.REQUEST_4K_TV
        ),
      },
      {
        allowRequests: true,
        allow4kRequests: false,
        enable4k: true,
        partialRequestsEnabled: true,
      }
    );

    expect(result.defaultPermissions).toBe(
      combinePermissions(Permission.REQUEST)
    );
  });
});
