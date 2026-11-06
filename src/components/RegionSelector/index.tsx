import { useSearchActivityReporter } from '@app/hooks/useSearchActivity';
import useSettings from '@app/hooks/useSettings';
import defineMessages from '@app/utils/defineMessages';
import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
  Transition,
} from '@headlessui/react';
import { CheckIcon, ChevronDownIcon } from '@heroicons/react/24/solid';
import type { Region } from '@server/lib/settings';
import { countries } from 'country-flag-icons';
import 'country-flag-icons/3x2/flags.css';
import { useEffect, useId, useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.RegionSelector', {
  regionDefault: 'All Regions',
  regionServerDefault: 'Default ({region})',
});

interface RegionSelectorProps {
  value: string;
  name: string;
  ariaLabel?: string;
  isUserSetting?: boolean;
  disableAll?: boolean;
  watchProviders?: boolean;
  regionType?: 'discover' | 'streaming';
  onChange?: (fieldName: string, region: string) => void;
  compact?: boolean;
}

const RegionSelector = ({
  name,
  value,
  ariaLabel,
  isUserSetting = false,
  disableAll = false,
  watchProviders = false,
  regionType = 'discover',
  onChange,
  compact = false,
}: RegionSelectorProps) => {
  const { currentSettings } = useSettings();
  const intl = useIntl();
  const { data: regions, isLoading } = useSWR<Region[]>(
    watchProviders ? '/api/v1/watchproviders/regions' : '/api/v1/regions'
  );
  const activityId = useId();
  useSearchActivityReporter(
    compact && isLoading,
    `region-selector:${activityId}`
  );
  const [selectedRegion, setSelectedRegion] = useState<Region | null>(null);

  const allRegion: Region = useMemo(
    () => ({
      iso_3166_1: 'all',
      english_name: 'All',
    }),
    []
  );

  const sortedRegions = useMemo(() => {
    regions?.forEach((region) => {
      region.name =
        intl.formatDisplayName(region.iso_3166_1, {
          type: 'region',
          fallback: 'none',
        }) ?? region.english_name;
    });

    return [...(regions ?? [])].sort((a, b) =>
      (a.name ?? a.english_name).localeCompare(b.name ?? b.english_name)
    );
  }, [intl, regions]);

  const regionName = (regionCode: string) =>
    sortedRegions?.find((region) => region.iso_3166_1 === regionCode)?.name ??
    regionCode;

  const regionValue =
    regionType === 'discover'
      ? currentSettings.discoverRegion
      : currentSettings.streamingRegion;

  useEffect(() => {
    if (regions && value) {
      if (value === 'all') {
        setSelectedRegion(allRegion);
      } else {
        const matchedRegion = regions.find(
          (region) => region.iso_3166_1 === value
        );
        setSelectedRegion(matchedRegion ?? null);
      }
    }
  }, [value, regions, allRegion]);

  const handleRegionSelect = (region: Region | null) => {
    setSelectedRegion(region);
    onChange?.(name, region?.iso_3166_1 ?? '');
  };

  const optionClass = (active: boolean) =>
    compact
      ? `app-filter-select-option ${active ? 'app-filter-select-option-active' : ''}`
      : `${active ? 'bg-indigo-600 text-white' : 'text-gray-300'} relative flex cursor-default items-center pe-4 ps-8 select-none py-2`;
  const valueClass = (selected: boolean) =>
    compact
      ? undefined
      : `${selected ? 'font-semibold' : 'font-normal'} block truncate`;

  return (
    <div
      className={compact ? undefined : 'w-full'}
      data-filter-region={compact ? 'container' : undefined}
    >
      <Listbox as="div" value={selectedRegion} onChange={handleRegionSelect}>
        {({ open }) => (
          <div
            className={compact ? undefined : 'relative'}
            data-filter-region={compact ? 'container' : undefined}
          >
            <span
              className={
                compact ? undefined : 'inline-block w-full rounded-md shadow-sm'
              }
            >
              <ListboxButton
                id={name}
                aria-label={ariaLabel}
                className={
                  compact
                    ? 'app-filter-select-trigger'
                    : 'settings-compatible-listbox-button relative flex w-full cursor-default items-center rounded-md border ps-2 pe-8 text-start text-gray-100 transition duration-150 ease-in-out focus:outline-none'
                }
                data-filter-region={compact ? 'trigger' : undefined}
              >
                {((selectedRegion &&
                  countries.includes(selectedRegion?.iso_3166_1)) ||
                  (isUserSetting &&
                    !selectedRegion &&
                    regionValue &&
                    countries.includes(regionValue))) && (
                  <span
                    className={
                      compact
                        ? undefined
                        : 'me-2 h-4 overflow-hidden text-base leading-4'
                    }
                    data-filter-region={compact ? 'flag' : undefined}
                  >
                    <span
                      className={`flag:${
                        selectedRegion ? selectedRegion.iso_3166_1 : regionValue
                      }`}
                    />
                  </span>
                )}
                <span
                  className={compact ? undefined : 'block truncate'}
                  data-filter-region={compact ? 'value' : undefined}
                >
                  {selectedRegion && selectedRegion.iso_3166_1 !== 'all'
                    ? regionName(selectedRegion.iso_3166_1)
                    : isUserSetting && selectedRegion?.iso_3166_1 !== 'all'
                      ? intl.formatMessage(messages.regionServerDefault, {
                          region: regionValue
                            ? regionName(regionValue)
                            : intl.formatMessage(messages.regionDefault),
                        })
                      : intl.formatMessage(messages.regionDefault)}
                </span>
                {compact ? (
                  <ChevronDownIcon className="app-filter-select-chevron" />
                ) : (
                  <span className="pointer-events-none absolute inset-y-0 end-0 flex items-center pe-2 text-gray-500">
                    <ChevronDownIcon className="h-5 w-5" />
                  </span>
                )}
              </ListboxButton>
            </span>

            <Transition
              as="div"
              show={open}
              leave={
                compact ? undefined : 'transition-opacity ease-in duration-100'
              }
              leaveFrom={compact ? undefined : 'opacity-100'}
              leaveTo={compact ? undefined : 'opacity-0'}
              className={
                compact
                  ? 'app-filter-select-menu'
                  : 'absolute z-50 mt-1 w-full rounded-md bg-gray-800 shadow-lg'
              }
            >
              <ListboxOptions
                static
                className={
                  compact
                    ? undefined
                    : 'max-h-60 overflow-auto rounded-md py-1 text-base leading-6 shadow-xs focus:outline-none sm:text-sm sm:leading-5'
                }
                data-filter-region={compact ? 'options' : undefined}
              >
                {isUserSetting && (
                  <ListboxOption value={null}>
                    {({ selected, active }) => (
                      <div
                        className={optionClass(active)}
                        data-filter-region={compact ? 'option' : undefined}
                      >
                        <span
                          className={compact ? undefined : 'me-2 text-base'}
                          data-filter-region={compact ? 'flag' : undefined}
                        >
                          <span
                            className={
                              countries.includes(regionValue)
                                ? `flag:${regionValue}`
                                : compact
                                  ? undefined
                                  : 'pe-6'
                            }
                          />
                        </span>
                        <span
                          className={valueClass(selected)}
                          data-filter-region={compact ? 'value' : undefined}
                          data-selected={selected}
                        >
                          {intl.formatMessage(messages.regionServerDefault, {
                            region: regionValue
                              ? regionName(regionValue)
                              : intl.formatMessage(messages.regionDefault),
                          })}
                        </span>
                        {selected && (
                          <span
                            className={
                              compact
                                ? 'app-filter-select-check'
                                : `${active ? 'text-white' : 'text-indigo-600'} absolute inset-y-0 start-0 flex items-center ps-1.5`
                            }
                          >
                            <CheckIcon
                              className={compact ? undefined : 'h-5 w-5'}
                            />
                          </span>
                        )}
                      </div>
                    )}
                  </ListboxOption>
                )}
                {!disableAll && (
                  <ListboxOption value={isUserSetting ? allRegion : null}>
                    {({ selected, active }) => (
                      <div
                        className={
                          compact
                            ? optionClass(active)
                            : `${active ? 'bg-indigo-600 text-white' : 'text-gray-300'} relative cursor-default py-2 ps-8 pe-4 select-none`
                        }
                        data-filter-region={compact ? 'option' : undefined}
                      >
                        <span
                          className={
                            compact
                              ? undefined
                              : `${selected ? 'font-semibold' : 'font-normal'} block truncate ps-8`
                          }
                          data-filter-region={compact ? 'value' : undefined}
                          data-selected={selected}
                        >
                          {intl.formatMessage(messages.regionDefault)}
                        </span>
                        {selected && (
                          <span
                            className={
                              compact
                                ? 'app-filter-select-check'
                                : `${active ? 'text-white' : 'text-indigo-600'} absolute inset-y-0 start-0 flex items-center ps-1.5`
                            }
                          >
                            <CheckIcon
                              className={compact ? undefined : 'h-5 w-5'}
                            />
                          </span>
                        )}
                      </div>
                    )}
                  </ListboxOption>
                )}
                {sortedRegions?.map((region) => (
                  <ListboxOption key={region.iso_3166_1} value={region}>
                    {({ selected, active }) => (
                      <div
                        className={optionClass(active)}
                        data-filter-region={compact ? 'option' : undefined}
                      >
                        <span
                          className={compact ? undefined : 'me-2 text-base'}
                          data-filter-region={compact ? 'flag' : undefined}
                        >
                          <span
                            className={
                              countries.includes(region.iso_3166_1)
                                ? `flag:${region.iso_3166_1}`
                                : compact
                                  ? undefined
                                  : 'pe-6'
                            }
                          />
                        </span>
                        <span
                          className={valueClass(selected)}
                          data-filter-region={compact ? 'value' : undefined}
                          data-selected={selected}
                        >
                          {regionName(region.iso_3166_1)}
                        </span>
                        {selected && (
                          <span
                            className={
                              compact
                                ? 'app-filter-select-check'
                                : `${active ? 'text-white' : 'text-indigo-600'} absolute inset-y-0 start-0 flex items-center ps-1.5`
                            }
                          >
                            <CheckIcon
                              className={compact ? undefined : 'h-5 w-5'}
                            />
                          </span>
                        )}
                      </div>
                    )}
                  </ListboxOption>
                ))}
              </ListboxOptions>
            </Transition>
          </div>
        )}
      </Listbox>
    </div>
  );
};

export default RegionSelector;
