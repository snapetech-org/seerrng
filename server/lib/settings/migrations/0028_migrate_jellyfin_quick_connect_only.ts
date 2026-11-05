import type { AllSettings } from '@server/lib/settings';

const migrationName = '0028_migrate_jellyfin_quick_connect_only';
type LegacySettings = {
  main?: Partial<AllSettings['main']> & { quickConnectOnly?: unknown };
  migrations?: string[];
};

const migrateJellyfinQuickConnectOnly = (
  settings: LegacySettings
): AllSettings => {
  const main = settings.main;
  if (main && Object.prototype.hasOwnProperty.call(main, 'quickConnectOnly')) {
    if (typeof main.jellyfinQuickConnectOnly !== 'boolean') {
      main.jellyfinQuickConnectOnly = main.quickConnectOnly === true;
    }
    delete main.quickConnectOnly;
  }
  const migrations = settings.migrations ?? (settings.migrations = []);
  if (!migrations.includes(migrationName)) migrations.push(migrationName);
  return settings as AllSettings;
};

export default migrateJellyfinQuickConnectOnly;
