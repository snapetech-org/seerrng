import type { AllSettings } from '@server/lib/settings';

type SettingsWithJobMigrations = {
  jobs?: Partial<AllSettings['jobs']>;
  migrations?: string[];
};

const addMovieCollectionQueueJob = (
  settings: SettingsWithJobMigrations
): AllSettings => {
  if (settings.migrations?.includes('0027_add_movie_collection_queue_job')) {
    return settings as AllSettings;
  }

  settings.jobs ??= {};
  settings.jobs['movie-collection-queue'] ??= {
    schedule: '0 * * * * *',
  };
  settings.migrations ??= [];
  settings.migrations.push('0027_add_movie_collection_queue_job');
  return settings as AllSettings;
};

export default addMovieCollectionQueueJob;
