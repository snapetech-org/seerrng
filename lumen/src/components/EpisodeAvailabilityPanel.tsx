import { useState } from 'react';
import type { MediaInfo, Season } from '../api';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';
import { Icon } from '../icons';
import {
  isSharedVideoEpisode,
  useVideoAvailability,
} from '../videoAvailability';
import { Facts } from './detail';
import { ServiceNote } from './extra';

const sources = {
  sonarr: 'Sonarr',
  plex: 'Plex',
  jellyfin: 'Jellyfin',
  emby: 'Emby',
} as const;
interface QualityAvailability {
  hd: boolean;
  fourK: boolean;
}
interface Episode {
  episodeNumber: number;
  name: string;
  availabilitySources?: (QualityAvailability & {
    sourceType: keyof typeof sources;
  })[];
  sonarrAvailability?: QualityAvailability;
}

function EpisodeFiles({
  tvId,
  season,
  coverage,
}: {
  tvId: number;
  season: number;
  coverage?: MediaInfo['viewerRequestCoverage'];
}) {
  const { data, error, reload } = useApi<{ episodes: Episode[] }>(
    `/tv/${tvId}/season/${season}`
  );
  const { t } = useLumenLocale();
  const episodes = data?.episodes ?? [];
  const mode = useVideoAvailability();
  return (
    <>
      <ServiceNote
        error={error}
        what={t('lumen.tvAvailability.what', 'episode availability')}
        title={t(
          'lumen.tvAvailability.loadFailure',
          'Could not load episode availability'
        )}
        retryLabel={t('lumen.tvAvailability.retry', 'Retry')}
        retry={reload}
      />
      {!data && !error && (
        <p className="note" role="status">
          {t('lumen.tvAvailability.loading', 'Loading episodes…')}
        </p>
      )}
      {data && !episodes.length && (
        <p className="note">
          {t('lumen.tvAvailability.empty', 'No episodes found.')}
        </p>
      )}
      {!!episodes.length && (
        <Facts
          rows={episodes.map((episode) => {
            const sharedHd = isSharedVideoEpisode(
              coverage,
              season,
              episode.episodeNumber,
              false,
              mode
            );
            const shared4k = isSharedVideoEpisode(
              coverage,
              season,
              episode.episodeNumber,
              true,
              mode
            );
            const reported =
              episode.availabilitySources ??
              (episode.sonarrAvailability
                ? [
                    {
                      sourceType: 'sonarr' as const,
                      ...episode.sonarrAvailability,
                    },
                  ]
                : []);
            const labels = reported.flatMap(({ sourceType, hd, fourK }) => {
              const source = sources[sourceType];
              if (!source) return [];
              return [
                ...(hd && !sharedHd
                  ? [
                      t('lumen.tvAvailability.sourceHd', '{source} HD', {
                        source,
                      }),
                    ]
                  : []),
                ...(fourK && !shared4k
                  ? [
                      t('lumen.tvAvailability.source4k', '{source} 4K', {
                        source,
                      }),
                    ]
                  : []),
              ];
            });
            if (mode === 'distinguish') {
              if (sharedHd && reported.some(({ hd }) => hd))
                labels.push(t('lumen.tvAvailability.sharedHd', 'Shared HD'));
              if (shared4k && reported.some(({ fourK }) => fourK))
                labels.push(t('lumen.tvAvailability.shared4k', 'Shared 4K'));
            }
            return [
              `E${episode.episodeNumber} ${episode.name}`,
              labels.join(' · ') ||
                (mode === 'hide'
                  ? t(
                      'lumen.tvAvailability.noVisibleFile',
                      'No visible file reported'
                    )
                  : t('lumen.tvAvailability.noFile', 'No file reported')),
            ];
          })}
        />
      )}
    </>
  );
}

export function EpisodeAvailabilityPanel({
  tvId,
  seasons,
  coverage,
}: {
  tvId: number;
  seasons: Season[];
  coverage?: MediaInfo['viewerRequestCoverage'];
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<number>();
  const { t } = useLumenLocale();
  const season =
    seasons.find((item) => item.seasonNumber === selected) ??
    seasons.find((item) => item.seasonNumber > 0) ??
    seasons[0];
  return (
    <details
      className="adv"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        <Icon name="chev" size="sm" />
        {t('lumen.tvAvailability.title', 'Episode Availability')}
      </summary>
      {open && season && (
        <>
          <div className="toolbar">
            <label className="sel">
              <span className="lbl">
                {t('lumen.tvAvailability.seasonLabel', 'Availability Season')}
              </span>
              <select
                aria-label={t(
                  'lumen.tvAvailability.seasonLabel',
                  'Availability Season'
                )}
                value={season.seasonNumber}
                onChange={(event) => setSelected(Number(event.target.value))}
              >
                {seasons.map(({ name, seasonNumber }) => (
                  <option value={seasonNumber} key={seasonNumber}>
                    {name ||
                      (seasonNumber === 0
                        ? t('lumen.tvEpisodeRequest.specials', 'Specials')
                        : t(
                            'lumen.tvEpisodeRequest.seasonNumber',
                            'Season {number}',
                            {
                              number: seasonNumber,
                            }
                          ))}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <EpisodeFiles
            key={season.seasonNumber}
            tvId={tvId}
            season={season.seasonNumber}
            coverage={coverage}
          />
        </>
      )}
    </details>
  );
}
