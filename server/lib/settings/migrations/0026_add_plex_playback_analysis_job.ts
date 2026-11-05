import type { AllSettings } from '@server/lib/settings';

type SettingsWithJobMigrations = {
  jobs?: Partial<AllSettings['jobs']>;
  migrations?: string[];
};

const addPlexPlaybackAnalysisJob = (
  settings: SettingsWithJobMigrations
): AllSettings => {
  if (settings.migrations?.includes('0026_add_plex_playback_analysis_job')) {
    return settings as AllSettings;
  }

  settings.jobs ??= {};
  settings.jobs['plex-playback-analysis'] ??= {
    schedule: '0 * * * * *',
  };
  settings.migrations ??= [];
  settings.migrations.push('0026_add_plex_playback_analysis_job');
  return settings as AllSettings;
};

export default addPlexPlaybackAnalysisJob;
