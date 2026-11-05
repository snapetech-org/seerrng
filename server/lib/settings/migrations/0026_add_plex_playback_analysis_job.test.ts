import { describe, expect, it } from 'vitest';
import addPlexPlaybackAnalysisJob from './0026_add_plex_playback_analysis_job';

describe('Plex playback analysis job settings migration', () => {
  it('adds the regular sync schedule and preserves an operator schedule', () => {
    const defaults = addPlexPlaybackAnalysisJob({
      jobs: {},
      migrations: [],
    });
    expect(defaults.jobs['plex-playback-analysis']).toEqual({
      schedule: '0 * * * * *',
    });

    const customized = addPlexPlaybackAnalysisJob({
      jobs: {
        'plex-playback-analysis': {
          schedule: '0 30 * * * *',
          enabled: false,
        },
      },
      migrations: [],
    });
    expect(customized.jobs['plex-playback-analysis']).toEqual({
      schedule: '0 30 * * * *',
      enabled: false,
    });
  });

  it('does not reapply a recorded migration', () => {
    const migrated = {
      jobs: {},
      migrations: ['0026_add_plex_playback_analysis_job'],
    };
    expect(addPlexPlaybackAnalysisJob(migrated)).toBe(migrated);
  });
});
