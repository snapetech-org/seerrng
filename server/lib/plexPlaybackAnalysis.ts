import PlexAPI from '@server/api/plexapi';
import { MediaServerType } from '@server/constants/server';
import { getRepository } from '@server/datasource';
import { PlexAnalysisState } from '@server/entity/PlexAnalysisState';
import {
  captureConfigurationAuthority,
  runWithConfigurationSnapshot,
} from '@server/lib/configurationAdmission';
import {
  captureMediaServerUserAuthority,
  runWithMediaServerUserAuthority,
} from '@server/lib/mediaServerUserAuthority';
import requestAdmission from '@server/lib/requestAdmission';
import { getSettings, type PlexSettings } from '@server/lib/settings';
import logger from '@server/logger';
import { createHash } from 'node:crypto';
import { LessThan, MoreThan } from 'typeorm';

const DAY = 86_400_000;
const validKey = (value: unknown): value is string =>
  typeof value === 'string' && /^[1-9][0-9]{0,19}$/.test(value);
const identity = (settings: PlexSettings) =>
  createHash('sha256')
    .update(
      JSON.stringify([
        settings.machineId,
        settings.ip,
        settings.port,
        settings.useSsl ?? false,
      ])
    )
    .digest('hex');

export class PlexPlaybackAnalysis {
  private running = false;

  public async run(): Promise<void> {
    if (this.running) return;
    const settings = getSettings();
    if (
      settings.main.mediaServerType !== MediaServerType.PLEX ||
      settings.plex.analyzeOnPlayback !== true ||
      !settings.plex.machineId
    )
      return;
    this.running = true;
    const plexSettings = {
      ...settings.plex,
      libraries: settings.plex.libraries.map((library) => ({ ...library })),
    };
    const serverKey = identity(plexSettings);
    const configuration = captureConfigurationAuthority('plex', settings);
    const enabledLibraries = new Set(
      plexSettings.libraries
        .filter((library) => library.enabled && library.type === 'show')
        .map((library) => library.id)
    );
    const stillEnabled = () => {
      const current = getSettings();
      return (
        current.main.mediaServerType === MediaServerType.PLEX &&
        current.plex.analyzeOnPlayback === true &&
        identity(current.plex) === serverKey
      );
    };
    try {
      if (!enabledLibraries.size) return;
      const authority = await captureMediaServerUserAuthority(1, 'plex');
      if (!authority.plexToken) return;
      const plex = new PlexAPI({
        plexToken: authority.plexToken,
        plexSettings,
        timeout: 10_000,
      });
      const authorized = <T>(callback: () => Promise<T>): Promise<T> =>
        runWithMediaServerUserAuthority(authority, () =>
          runWithConfigurationSnapshot(configuration, callback)
        );
      const sessions = await authorized(async () =>
        stillEnabled() ? plex.getPlaybackSessions() : []
      );
      await getRepository(PlexAnalysisState).delete({
        attemptedAt: LessThan(new Date(Date.now() - 180 * DAY)),
      });
      let attempts = 0;
      for (const session of sessions.slice(0, 10)) {
        if (attempts >= 2 || !stillEnabled()) break;
        if (session.state !== 'playing' || !validKey(session.ratingKey))
          continue;
        await authorized(async () => {
          if (!stillEnabled()) return;
          const episode = await plex.getMetadata(session.ratingKey);
          const currentLibrary = getSettings().plex.libraries.find(
            (library) => library.id === episode.librarySectionID
          );
          if (
            episode.type !== 'episode' ||
            episode.ratingKey !== session.ratingKey ||
            episode.index !== session.index ||
            episode.parentIndex !== session.parentIndex ||
            !validKey(episode.parentRatingKey) ||
            !episode.librarySectionID ||
            !enabledLibraries.has(episode.librarySectionID) ||
            !currentLibrary?.enabled ||
            currentLibrary.type !== 'show'
          )
            return;
          const seasonKey = episode.parentRatingKey;
          await requestAdmission.run(
            [`plex-analysis:${serverKey}`],
            async () => {
              const repository = getRepository(PlexAnalysisState);
              const previous = await repository.findOneBy({
                serverKey,
                seasonKey,
              });
              const now = Date.now();
              if (
                (await repository.count({
                  where: {
                    serverKey,
                    attemptedAt: MoreThan(new Date(now - 60_000)),
                  },
                })) >= 2
              )
                return;
              if (
                previous &&
                (now - previous.attemptedAt.getTime() < DAY ||
                  (previous.queuedAt &&
                    now - previous.queuedAt.getTime() < 30 * DAY))
              )
                return;
              // Persist a claim before external I/O: a restart or ambiguous response must not flood Plex.
              if (!previous && (await repository.count()) >= 10_000) return;
              await repository.save(
                new PlexAnalysisState({
                  serverKey,
                  seasonKey,
                  attemptedAt: new Date(now),
                  queuedAt: previous?.queuedAt ?? null,
                })
              );
              const season = await plex.getMetadata(seasonKey);
              if (
                !stillEnabled() ||
                !getSettings().plex.libraries.some(
                  (library) =>
                    library.id === episode.librarySectionID &&
                    library.enabled &&
                    library.type === 'show'
                ) ||
                season.type !== 'season' ||
                season.ratingKey !== seasonKey ||
                season.index !== session.parentIndex ||
                (session.grandparentRatingKey &&
                  season.parentRatingKey !== session.grandparentRatingKey)
              )
                return;
              attempts += 1;
              try {
                await plex.analyzeSeason(seasonKey);
                await repository.update(
                  { serverKey, seasonKey },
                  { queuedAt: new Date() }
                );
              } catch {
                logger.warn(
                  'Plex season analysis could not be queued; retry is delayed.',
                  { label: 'Plex Playback Analysis' }
                );
              }
            }
          );
        });
      }
    } catch {
      logger.warn(
        'Plex playback analysis stopped before completing its bounded check.',
        { label: 'Plex Playback Analysis' }
      );
    } finally {
      this.running = false;
    }
  }
}
export default new PlexPlaybackAnalysis();
