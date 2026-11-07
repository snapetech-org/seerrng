import Button from '@app/components/Common/Button';
import SlideOver from '@app/components/Common/SlideOver';
import {
  countActiveFilters,
  type FilterOptions,
} from '@app/components/Discover/constants';
import FilterPanel from '@app/components/Discover/FilterPanel';
import defineMessages from '@app/utils/defineMessages';
import { BarsArrowDownIcon, FunnelIcon } from '@heroicons/react/24/solid';
import { useState } from 'react';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.Discover.UpstreamControls', {
  sortBy: 'Sort By',
  ascending: 'Ascending',
  descending: 'Descending',
  filters: 'Filters',
  activeFilters: '{count} Active Filters',
});
export default function UpstreamDiscoveryControls({
  type,
  filters,
  currentSort,
  sorts,
  onSort,
}: {
  type: 'movie' | 'tv';
  filters: FilterOptions;
  currentSort: string;
  sorts: readonly { label: string; asc: string; desc: string }[];
  onSort: (sort: string) => void;
}) {
  const intl = useIntl();
  const [showFilters, setShowFilters] = useState(false);
  const activeFilters = { ...filters };
  delete activeFilters.sortBy;
  return (
    <div className="upstream-discovery-controls">
      <label className="upstream-sort-control">
        <span className="sr-only">{intl.formatMessage(messages.sortBy)}</span>
        <BarsArrowDownIcon aria-hidden="true" />
        <select
          aria-label={intl.formatMessage(messages.sortBy)}
          value={currentSort}
          onChange={(event) => {
            const value = event.target.value;
            if (sorts.some((s) => s.asc === value || s.desc === value))
              onSort(value);
          }}
        >
          {sorts.flatMap((sort) => [
            <option key={sort.desc} value={sort.desc}>
              {sort.label} {intl.formatMessage(messages.descending)}
            </option>,
            <option key={sort.asc} value={sort.asc}>
              {sort.label} {intl.formatMessage(messages.ascending)}
            </option>,
          ])}
        </select>
      </label>
      <Button onClick={() => setShowFilters(true)}>
        <FunnelIcon aria-hidden="true" />
        {intl.formatMessage(messages.activeFilters, {
          count: countActiveFilters(activeFilters),
        })}
      </Button>
      <SlideOver
        show={showFilters}
        title={intl.formatMessage(messages.filters)}
        onClose={() => setShowFilters(false)}
      >
        <FilterPanel type={type} currentFilters={filters} />
      </SlideOver>
    </div>
  );
}
