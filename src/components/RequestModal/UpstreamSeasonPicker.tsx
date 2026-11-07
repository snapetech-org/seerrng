import {
  isTreeEpisodeSelectable,
  seasonSelection,
  toggleSeasonSelection,
  type TreeSeason,
} from '@app/components/MediaDetails/SeasonEpisodeTree';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { useEffect, useRef } from 'react';
import { useIntl } from 'react-intl';
const messages = defineMessages('components.RequestModal.UpstreamSeasons', {
  season: 'Season',
  episodes: '# of Episodes',
  status: 'Status',
  selectAll: 'Select All Seasons',
});
function SeasonSwitch({
  checked,
  mixed = false,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  mixed?: boolean;
  disabled: boolean;
  label: string;
  onChange: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = mixed;
  }, [mixed]);
  return (
    <input
      ref={ref}
      className="upstream-season-switch"
      type="checkbox"
      aria-label={label}
      checked={checked}
      disabled={disabled}
      onChange={onChange}
    />
  );
}
/** Uses the existing request-tree eligibility and selection adapter, with the upstream season table. */
export default function UpstreamSeasonPicker({
  seasons,
  selectedIds,
  disabled,
  disabledSeasons,
  onChange,
}: {
  seasons: TreeSeason[];
  selectedIds: number[];
  disabled: boolean;
  disabledSeasons: number[];
  onChange: (ids: number[]) => void;
}) {
  const intl = useIntl();
  const eligible = new Set(
    seasons.flatMap((s) =>
      s.episodes.filter(isTreeEpisodeSelectable).map((e) => e.id)
    )
  );
  const chosen = selectedIds.filter((id) => eligible.has(id)).length;
  const all = eligible.size > 0 && chosen === eligible.size;
  return (
    <table className="upstream-request-seasons">
      <thead>
        <tr>
          <th>
            <SeasonSwitch
              checked={all}
              mixed={chosen > 0 && !all}
              disabled={disabled || !eligible.size}
              label={intl.formatMessage(messages.selectAll)}
              onChange={() =>
                onChange(
                  all
                    ? selectedIds.filter((id) => !eligible.has(id))
                    : [...new Set([...selectedIds, ...eligible])]
                )
              }
            />
          </th>
          <th>{intl.formatMessage(messages.season)}</th>
          <th>{intl.formatMessage(messages.episodes)}</th>
          <th>{intl.formatMessage(messages.status)}</th>
        </tr>
      </thead>
      <tbody>
        {seasons.map((season) => {
          const selection = seasonSelection(season, selectedIds);
          const available =
            season.episodes.length > 0 &&
            season.episodes.every((e) => e.available);
          return (
            <tr key={season.seasonNumber}>
              <td>
                <SeasonSwitch
                  checked={selection.selected}
                  mixed={selection.partial}
                  disabled={disabled || selection.disabled}
                  label={season.name}
                  onChange={() =>
                    onChange(toggleSeasonSelection(season, selectedIds))
                  }
                />
              </td>
              <td>{season.name}</td>
              <td>{season.episodeCount ?? season.episodes.length}</td>
              <td>
                <span
                  className="upstream-request-season-status"
                  data-available={available}
                >
                  {intl.formatMessage(
                    available
                      ? globalMessages.available
                      : disabledSeasons.includes(season.seasonNumber)
                        ? globalMessages.requested
                        : globalMessages.notrequested
                  )}
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
