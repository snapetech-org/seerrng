import { Permission } from '@server/lib/permissions';

export interface SetupDefaultsSettings {
  defaultPermissions: number;
  enable4k: boolean;
  partialRequestsEnabled: boolean;
}

export interface SetupDefaultsSelection {
  allowRequests: boolean;
  allow4kRequests: boolean;
  enable4k: boolean;
  partialRequestsEnabled: boolean;
}

const REQUEST_PERMISSIONS = [
  Permission.REQUEST,
  Permission.REQUEST_MOVIE,
  Permission.REQUEST_TV,
  Permission.REQUEST_MUSIC,
  Permission.REQUEST_BOOK,
  Permission.REQUEST_COMIC,
  Permission.REQUEST_MAGAZINE,
  Permission.REQUEST_SPORTS,
  Permission.REQUEST_ADULT,
] as const;

const FOUR_K_REQUEST_PERMISSIONS = [
  Permission.REQUEST_4K,
  Permission.REQUEST_4K_MOVIE,
  Permission.REQUEST_4K_TV,
] as const;

const hasAnyPermission = (mask: bigint, permissions: readonly Permission[]) =>
  permissions.some((permission) => (mask & BigInt(permission)) !== 0n);

export const getSetupDefaultsSelection = (
  settings: SetupDefaultsSettings
): SetupDefaultsSelection => {
  const permissions = BigInt(settings.defaultPermissions);

  return {
    allowRequests: hasAnyPermission(permissions, REQUEST_PERMISSIONS),
    allow4kRequests:
      settings.enable4k &&
      hasAnyPermission(permissions, FOUR_K_REQUEST_PERMISSIONS),
    enable4k: settings.enable4k,
    partialRequestsEnabled: settings.partialRequestsEnabled,
  };
};

export const buildSetupDefaultsSettings = (
  current: SetupDefaultsSettings,
  selection: SetupDefaultsSelection
): SetupDefaultsSettings => {
  let permissions = BigInt(current.defaultPermissions);

  if (selection.allowRequests) {
    permissions |= BigInt(Permission.REQUEST);
  } else {
    for (const permission of REQUEST_PERMISSIONS) {
      permissions &= ~BigInt(permission);
    }
    for (const permission of FOUR_K_REQUEST_PERMISSIONS) {
      permissions &= ~BigInt(permission);
    }
  }

  if (
    selection.allowRequests &&
    selection.allow4kRequests &&
    selection.enable4k
  ) {
    permissions |= BigInt(Permission.REQUEST_4K);
  } else {
    for (const permission of FOUR_K_REQUEST_PERMISSIONS) {
      permissions &= ~BigInt(permission);
    }
  }

  return {
    defaultPermissions: Number(permissions),
    enable4k: selection.enable4k,
    partialRequestsEnabled: selection.partialRequestsEnabled,
  };
};
