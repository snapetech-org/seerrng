import type { AllSettings } from '@server/lib/settings';

type SettingsWithJobMigrations = {
  jobs?: Partial<AllSettings['jobs']>;
  migrations?: string[];
};

const addPodcastCleanupJob = (
  settings: SettingsWithJobMigrations
): AllSettings => {
  if (settings.migrations?.includes('0030_add_podcast_cleanup_job')) {
    return settings as AllSettings;
  }

  settings.jobs ??= {};
  settings.jobs['podcast-cleanup'] ??= {
    schedule: '0 20 * * * *',
  };
  settings.migrations ??= [];
  settings.migrations.push('0030_add_podcast_cleanup_job');
  return settings as AllSettings;
};

export default addPodcastCleanupJob;
