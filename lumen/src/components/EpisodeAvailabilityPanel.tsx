import { useState } from 'react';
import type { Season } from '../api';
import { useApi } from '../hooks';
import { Icon } from '../icons';
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

function EpisodeFiles({ tvId, season }: { tvId: number; season: number }) {
  const { data, error, reload } = useApi<{ episodes: Episode[] }>(
    `/tv/${tvId}/season/${season}`
  );
  const episodes = data?.episodes ?? [];
  return (
    <>
      <ServiceNote error={error} what="episode availability" retry={reload} />
      {!data && !error && (
        <p className="note" role="status">
          Loading episodes…
        </p>
      )}
      {data && !episodes.length && <p className="note">No episodes found.</p>}
      {!!episodes.length && (
        <Facts
          rows={episodes.map((episode) => {
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
                ...(hd ? [`${source} HD`] : []),
                ...(fourK ? [`${source} 4K`] : []),
              ];
            });
            return [
              `E${episode.episodeNumber} ${episode.name}`,
              labels.join(' · ') || 'No file reported',
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
}: {
  tvId: number;
  seasons: Season[];
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<number>();
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
        Episode Availability
      </summary>
      {open && season && (
        <>
          <div className="toolbar">
            <label className="sel">
              <span className="lbl">Availability Season</span>
              <select
                aria-label="Availability Season"
                value={season.seasonNumber}
                onChange={(event) => setSelected(Number(event.target.value))}
              >
                {seasons.map(({ name, seasonNumber }) => (
                  <option value={seasonNumber} key={seasonNumber}>
                    {name ||
                      (seasonNumber === 0
                        ? 'Specials'
                        : `Season ${seasonNumber}`)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <EpisodeFiles
            key={season.seasonNumber}
            tvId={tvId}
            season={season.seasonNumber}
          />
        </>
      )}
    </details>
  );
}
