import FilterPanel from '@app/components/Discover/FilterPanel';
import type { FilterOptions } from '@app/components/Discover/constants';
import { useBatchUpdateQueryParams } from '@app/hooks/useUpdateQueryParams';
import { useRouter } from 'next/router';
import { useIntl } from 'react-intl';
import useSWR from 'swr';
import messages from './messages';

export type LibraryView = 'all' | 'available' | 'missing';
export const libraryView = (value: unknown): LibraryView =>
  value === 'available' || value === 'missing' ? value : 'all';

export function AvailabilitySegments({
  value,
  onChange,
}: {
  value: LibraryView;
  onChange: (value: LibraryView) => void;
}) {
  const intl = useIntl();
  return (
    <div
      className="persius-segments"
      role="group"
      aria-label={intl.formatMessage(messages.libraryFilter)}
    >
      {(['all', 'available', 'missing'] as const).map((key) => (
        <button
          key={key}
          type="button"
          aria-pressed={value === key}
          onClick={() => onChange(key)}
        >
          {intl.formatMessage(
            key === 'all'
              ? messages.all
              : key === 'available'
                ? messages.inLibrary
                : messages.notYet
          )}
        </button>
      ))}
    </div>
  );
}

export default function CatalogControls({
  type,
  filters,
  count,
}: {
  type: 'movie' | 'tv';
  filters: FilterOptions;
  count: number;
}) {
  const intl = useIntl();
  const router = useRouter();
  const update = useBatchUpdateQueryParams({ page: undefined });
  const { data: genres } = useSWR<{ id: number; name: string }[]>(
    `/api/v1/genres/${type}`
  );
  const dateSort =
    type === 'movie' ? 'release_date.desc' : 'first_air_date.desc';
  return (
    <div className="persius-catalog-controls">
      <div className="persius-filter-row">
        <AvailabilitySegments
          value={libraryView(router.query.libraryView)}
          onChange={(value) =>
            update({
              libraryView: value === 'all' ? undefined : value,
              availability: undefined,
            })
          }
        />
        <label className="persius-sort">
          {intl.formatMessage(messages.sort)}
          <select
            value={filters.sortBy ?? 'popularity.desc'}
            onChange={(event) => update({ sortBy: event.target.value })}
          >
            <option value="popularity.desc">
              {intl.formatMessage(messages.popular)}
            </option>
            <option value={dateSort}>
              {intl.formatMessage(messages.releaseDate)}
            </option>
            <option value="vote_average.desc">
              {intl.formatMessage(messages.rating)}
            </option>
            <option value="original_title.asc">
              {intl.formatMessage(messages.title)}
            </option>
            {filters.sortBy &&
              ![
                'popularity.desc',
                dateSort,
                'vote_average.desc',
                'original_title.asc',
              ].includes(filters.sortBy) && (
                <option value={filters.sortBy}>{filters.sortBy}</option>
              )}
          </select>
        </label>
        <span className="persius-filter-count">
          {intl.formatMessage(messages.loadedTitles, { count })}
        </span>
      </div>
      <div
        className="persius-genres"
        role="group"
        aria-label={intl.formatMessage(messages.genres)}
      >
        <button
          className="persius-chip"
          type="button"
          aria-pressed={!filters.genre}
          onClick={() => update({ genre: undefined, excludeGenre: undefined })}
        >
          {intl.formatMessage(messages.allGenres)}
        </button>
        {genres?.map((genre) => (
          <button
            className="persius-chip"
            key={genre.id}
            type="button"
            aria-pressed={filters.genre === String(genre.id)}
            onClick={() =>
              update({
                genre:
                  filters.genre === String(genre.id)
                    ? undefined
                    : String(genre.id),
                excludeGenre: undefined,
              })
            }
          >
            {genre.name}
          </button>
        ))}
      </div>
      <details className="persius-secondary">
        <summary>{intl.formatMessage(messages.filters)}</summary>
        <FilterPanel type={type} currentFilters={filters} />
      </details>
    </div>
  );
}
