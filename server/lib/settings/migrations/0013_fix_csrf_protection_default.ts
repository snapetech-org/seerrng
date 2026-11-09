import type { AllSettings } from '@server/lib/settings';

type MutableSettings = {
  network?: { csrfProtection?: boolean };
  migrations?: string[];
};

// A saved value is an operator choice, even if it matches a historical default.
// Never weaken that choice to repair an identity-provider compatibility bug.
const fixCsrfProtectionDefault = (settings: AllSettings): AllSettings => {
  const mutableSettings = settings as unknown as MutableSettings;

  if (
    Array.isArray(mutableSettings.migrations) &&
    mutableSettings.migrations.includes('0013_fix_csrf_protection_default')
  ) {
    return settings;
  }

  if (!mutableSettings.network) {
    mutableSettings.network = {};
  }

  mutableSettings.network.csrfProtection ??= false;

  if (!Array.isArray(mutableSettings.migrations)) {
    mutableSettings.migrations = [];
  }
  mutableSettings.migrations.push('0013_fix_csrf_protection_default');

  return settings;
};

export default fixCsrfProtectionDefault;
