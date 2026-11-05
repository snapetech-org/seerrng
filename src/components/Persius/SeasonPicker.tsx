import type { TreeSeason } from '@app/components/MediaDetails/SeasonEpisodeTree';
import { useEffect, useRef } from 'react';
import { useIntl } from 'react-intl';
import messages from './messages';

function SeasonCheck({
  checked,
  mixed,
  disabled,
  onChange,
}: {
  checked: boolean;
  mixed: boolean;
  disabled: boolean;
  onChange: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = mixed;
  }, [mixed]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={onChange}
    />
  );
}

/** Presentation only: the existing request-tree adapter remains the selection owner. */
export default function SeasonPicker({
  seasons,
  selectedIds,
  disabled,
  onChange,
}: {
  seasons: TreeSeason[];
  selectedIds: number[];
  disabled: boolean;
  onChange: (ids: number[]) => void;
}) {
  const intl = useIntl();
  const selected = new Set(selectedIds);
  const selectable = seasons.filter(
    (season) =>
      season.seasonNumber > 0 &&
      season.episodes.some((episode) => episode.selectable)
  );
  const latest = selectable.at(-1);
  const ids = (season: TreeSeason) =>
    season.episodes
      .filter((episode) => episode.selectable)
      .map((episode) => episode.id);
  return (
    <div className="persius-season-picker">
      <div className="persius-season-shortcuts">
        <button
          className="persius-chip"
          type="button"
          disabled={disabled || !selectable.length}
          onClick={() => onChange(selectable.flatMap(ids))}
        >
          {intl.formatMessage(messages.allSeasons)}
        </button>
        <button
          className="persius-chip"
          type="button"
          disabled={disabled || !latest}
          onClick={() => latest && onChange(ids(latest))}
        >
          {intl.formatMessage(messages.latestSeason)}
        </button>
        <button
          className="persius-chip"
          type="button"
          disabled={disabled || !selectedIds.length}
          onClick={() => onChange([])}
        >
          {intl.formatMessage(messages.clear)}
        </button>
      </div>
      <div className="persius-seasons">
        {seasons.map((season) => {
          const eligible = ids(season);
          const chosen = eligible.filter((id) => selected.has(id)).length;
          const checked = eligible.length > 0 && chosen === eligible.length;
          const year = season.episodes
            .find((episode) => episode.releaseDate)
            ?.releaseDate?.slice(0, 4);
          return (
            <label
              className="persius-season"
              key={season.seasonNumber}
              data-disabled={disabled || !eligible.length}
            >
              <SeasonCheck
                checked={checked}
                mixed={chosen > 0 && !checked}
                disabled={disabled || !eligible.length}
                onChange={() =>
                  onChange(
                    checked
                      ? selectedIds.filter((id) => !eligible.includes(id))
                      : [...new Set([...selectedIds, ...eligible])]
                  )
                }
              />
              <span>
                <strong>{season.name}</strong>
                <small>
                  {intl.formatMessage(messages.episodes, {
                    count: season.episodeCount ?? season.episodes.length,
                  })}
                  {year ? ` · ${year}` : ''}
                </small>
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
