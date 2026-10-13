import Button from '@app/components/Common/Button';
import CachedImage from '@app/components/Common/CachedImage';
import { SmallLoadingSpinner } from '@app/components/Common/LoadingSpinner';
import Tooltip from '@app/components/Common/Tooltip';
import RegionSelector from '@app/components/RegionSelector';
import { encodeURIExtraParams } from '@app/hooks/useDiscover';
import { useSearchActivityReporter } from '@app/hooks/useSearchActivity';
import useSettings from '@app/hooks/useSettings';
import defineMessages from '@app/utils/defineMessages';
import { ArrowDownIcon, ArrowUpIcon } from '@heroicons/react/20/solid';
import { CheckCircleIcon, ChevronDownIcon } from '@heroicons/react/24/solid';
import type {
  TmdbCompanySearchResponse,
  TmdbGenre,
  TmdbKeywordSearchResponse,
} from '@server/api/themoviedb/interfaces';
import { MAX_DISCOVER_KEYWORD_IDS } from '@server/constants/discover';
import type { UserResultsResponse } from '@server/interfaces/api/userInterfaces';
import type {
  Keyword,
  ProductionCompany,
  WatchProviderDetails,
} from '@server/models/common';
import axios from 'axios';
import { useEffect, useId, useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import type {
  ControlProps,
  DropdownIndicatorProps,
  MultiValue,
  SingleValue,
} from 'react-select';
import AsyncSelect from 'react-select/async';
import useSWR from 'swr';
import { getGenreSelectorOptions } from './genreOptions';

const messages = defineMessages('components.Selector', {
  any: 'Any',
  searchKeywords: 'Search keywords…',
  searchGenres: 'Select genres…',
  searchStudios: 'Search studios…',
  searchUsers: 'Select users…',
  starttyping: 'Starting typing to search.',
  nooptions: 'No results',
  showmore: 'Show More',
  showless: 'Show Less',
  searchStatus: 'Select status...',
  returningSeries: 'Returning Series',
  planned: 'Planned',
  inProduction: 'In Production',
  ended: 'Ended',
  canceled: 'Canceled',
  pilot: 'Pilot',
  selectAll: 'Select All',
  clearAll: 'Clear All',
  allProvidersSelected: 'All available providers are already selected.',
  noProvidersAvailable: 'No providers are available in this region.',
  noProvidersSelected: 'No providers are currently selected.',
});

type SingleVal = {
  label: string;
  value: number;
};

const CompactSelectControl = <Option, IsMulti extends boolean>({
  children,
  innerRef,
  innerProps,
  isDisabled,
  isFocused,
  menuIsOpen,
}: ControlProps<Option, IsMulti>) => (
  <div
    ref={innerRef}
    {...innerProps}
    className={[
      'react-select__control',
      isDisabled && 'react-select__control--is-disabled',
      isFocused && 'react-select__control--is-focused',
      menuIsOpen && 'react-select__control--menu-is-open',
    ]
      .filter(Boolean)
      .join(' ')}
  >
    {children}
  </div>
);

const CompactDropdownIndicator = <Option, IsMulti extends boolean>({
  innerProps,
}: DropdownIndicatorProps<Option, IsMulti>) => (
  <div {...innerProps} className="react-select__dropdown-indicator">
    <ChevronDownIcon className="app-filter-select-chevron" aria-hidden="true" />
  </div>
);

export const compactSelectComponents = {
  Control: CompactSelectControl,
  DropdownIndicator: CompactDropdownIndicator,
};

type BaseSelectorMultiProps = {
  defaultValue?: string;
  isMulti: true;
  isDisabled?: boolean;
  compact?: boolean;
  onChange: (value: MultiValue<SingleVal> | null) => void;
};

type BaseSelectorSingleProps = {
  defaultValue?: string;
  isMulti?: false;
  isDisabled?: boolean;
  compact?: boolean;
  onChange: (value: SingleValue<SingleVal> | null) => void;
};

export const CompanySelector = ({
  defaultValue,
  isMulti,
  isDisabled,
  compact,
  onChange,
}: BaseSelectorSingleProps | BaseSelectorMultiProps) => {
  const intl = useIntl();
  const [defaultDataValue, setDefaultDataValue] = useState<
    { label: string; value: number }[] | null
  >(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const loadDefaultCompany = async (): Promise<void> => {
      if (!defaultValue) {
        setDefaultDataValue(null);
        return;
      }

      try {
        const response = await axios.get<ProductionCompany>(
          `/api/v1/studio/${defaultValue}`,
          { signal: controller.signal }
        );

        const studio = response.data;
        if (active) {
          setDefaultDataValue([
            {
              label: studio.name ?? '',
              value: studio.id ?? 0,
            },
          ]);
        }
      } catch {
        if (active) {
          setDefaultDataValue(null);
        }
      }
    };

    void loadDefaultCompany();
    return () => {
      active = false;
      controller.abort();
    };
  }, [defaultValue]);

  const loadCompanyOptions = async (inputValue: string) => {
    if (inputValue === '') {
      return [];
    }

    const results = await axios.get<TmdbCompanySearchResponse>(
      '/api/v1/search/company',
      {
        params: {
          query: encodeURIExtraParams(inputValue),
        },
      }
    );

    return results.data.results.map((result) => ({
      label: result.name,
      value: result.id,
    }));
  };

  return (
    <AsyncSelect
      key={`company-selector-${defaultDataValue}`}
      className={`react-select-container ${compact ? 'discover-compact-select' : ''}`}
      classNamePrefix="react-select"
      unstyled={compact}
      components={compact ? compactSelectComponents : undefined}
      isMulti={isMulti}
      hideSelectedOptions={!isMulti}
      isDisabled={isDisabled}
      defaultValue={defaultDataValue}
      defaultOptions
      cacheOptions
      isClearable
      noOptionsMessage={({ inputValue }) =>
        inputValue === ''
          ? intl.formatMessage(messages.starttyping)
          : intl.formatMessage(messages.nooptions)
      }
      loadOptions={loadCompanyOptions}
      placeholder={intl.formatMessage(
        compact ? messages.any : messages.searchStudios
      )}
      onChange={(value) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onChange(value as any);
      }}
    />
  );
};

type GenreSelectorProps = (BaseSelectorMultiProps | BaseSelectorSingleProps) & {
  type: 'movie' | 'tv';
};

export const GenreSelector = ({
  isMulti,
  defaultValue,
  isDisabled,
  compact,
  onChange,
  type,
}: GenreSelectorProps) => {
  const intl = useIntl();
  const genreUrl = `/api/v1/genres/${type}`;
  const { data: availableGenres } = useSWR<TmdbGenre[]>(genreUrl);
  const availableGenreOptions = useMemo(
    () => getGenreSelectorOptions(availableGenres ?? []),
    [availableGenres]
  );
  const [defaultDataValue, setDefaultDataValue] = useState<
    { label: string; value: number }[] | null
  >(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const loadDefaultGenre = async (): Promise<void> => {
      if (!defaultValue) {
        setDefaultDataValue(null);
        return;
      }

      try {
        const genres = defaultValue.split(',');

        const response = await axios.get<TmdbGenre[]>(
          `/api/v1/genres/${type}`,
          { signal: controller.signal }
        );

        const genreData = genres
          .filter((genre) =>
            response.data.find((gd) => gd.id === Number(genre))
          )
          .map((g) => response.data.find((gd) => gd.id === Number(g)))
          .map((g) => ({
            label: g?.name ?? '',
            value: g?.id ?? 0,
          }));

        if (active) {
          setDefaultDataValue(genreData);
        }
      } catch {
        if (active) {
          setDefaultDataValue(null);
        }
      }
    };

    void loadDefaultGenre();
    return () => {
      active = false;
      controller.abort();
    };
  }, [defaultValue, type]);

  const loadGenreOptions = async (inputValue: string) => {
    const genres =
      availableGenres ?? (await axios.get<TmdbGenre[]>(genreUrl)).data;

    return getGenreSelectorOptions(genres, inputValue);
  };

  return (
    <AsyncSelect
      key={`genre-select-${type}-${defaultDataValue}-${availableGenreOptions.length}`}
      className={`react-select-container ${compact ? 'discover-compact-select' : ''}`}
      classNamePrefix="react-select"
      unstyled={compact}
      components={compact ? compactSelectComponents : undefined}
      defaultValue={isMulti ? defaultDataValue : defaultDataValue?.[0]}
      defaultOptions={availableGenreOptions}
      cacheOptions
      isMulti={isMulti}
      hideSelectedOptions={!isMulti}
      isDisabled={isDisabled}
      loadOptions={loadGenreOptions}
      placeholder={intl.formatMessage(
        compact ? messages.any : messages.searchGenres
      )}
      onChange={(value) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onChange(value as any);
      }}
    />
  );
};

export const StatusSelector = ({
  isMulti,
  isDisabled,
  defaultValue,
  compact,
  onChange,
}: BaseSelectorMultiProps | BaseSelectorSingleProps) => {
  const intl = useIntl();
  const [defaultDataValue, setDefaultDataValue] = useState<
    { label: string; value: number }[] | null
  >(null);

  const options = useMemo(
    () => [
      { name: intl.formatMessage(messages.returningSeries), id: 0 },
      { name: intl.formatMessage(messages.planned), id: 1 },
      { name: intl.formatMessage(messages.inProduction), id: 2 },
      { name: intl.formatMessage(messages.ended), id: 3 },
      { name: intl.formatMessage(messages.canceled), id: 4 },
      { name: intl.formatMessage(messages.pilot), id: 5 },
    ],
    [intl]
  );

  useEffect(() => {
    if (!defaultValue) {
      setDefaultDataValue(null);
      return;
    }
    const statuses = defaultValue.split('|');

    const statusData = options
      .filter((opt) => statuses.find((s) => Number(s) === opt.id))
      .map((o) => ({
        label: o.name,
        value: o.id,
      }));

    setDefaultDataValue(statusData);
  }, [defaultValue, options]);

  const loadStatusOptions = async () => {
    return options
      .map((result) => ({
        label: result.name,
        value: result.id,
      }))
      .filter(({ label }) => label.toLowerCase());
  };

  return (
    <AsyncSelect
      key={`status-select-${defaultDataValue}`}
      className={`react-select-container ${compact ? 'discover-compact-select' : ''}`}
      classNamePrefix="react-select"
      unstyled={compact}
      components={compact ? compactSelectComponents : undefined}
      defaultValue={isMulti ? defaultDataValue : defaultDataValue?.[0]}
      defaultOptions
      isMulti={isMulti}
      hideSelectedOptions={!isMulti}
      isDisabled={isDisabled}
      loadOptions={loadStatusOptions}
      placeholder={intl.formatMessage(
        compact ? messages.any : messages.searchStatus
      )}
      onChange={(value) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onChange(value as any);
      }}
    />
  );
};

export const KeywordSelector = ({
  isMulti,
  isDisabled,
  defaultValue,
  onChange,
}: BaseSelectorMultiProps | BaseSelectorSingleProps) => {
  const intl = useIntl();
  const [selectedValue, setSelectedValue] = useState<
    MultiValue<SingleVal> | SingleValue<SingleVal> | null
  >(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const loadDefaultKeywords = async (): Promise<void> => {
      if (!defaultValue) {
        if (active) {
          setSelectedValue(null);
        }
        return;
      }

      try {
        const keywords = await Promise.all(
          defaultValue
            .split(',')
            .slice(0, MAX_DISCOVER_KEYWORD_IDS)
            .map(async (keywordId) => {
              const keyword = await axios.get<Keyword | null>(
                `/api/v1/keyword/${keywordId}`,
                { signal: controller.signal }
              );
              return keyword.data;
            })
        );

        const validKeywords: Keyword[] = keywords.filter(
          (keyword): keyword is Keyword => keyword !== null
        );

        if (active) {
          const nextValue = validKeywords.map((keyword) => ({
            label: keyword.name,
            value: keyword.id,
          }));
          setSelectedValue(isMulti ? nextValue : (nextValue[0] ?? null));
        }
      } catch {
        if (active) {
          setSelectedValue(null);
        }
      }
    };

    void loadDefaultKeywords();
    return () => {
      active = false;
      controller.abort();
    };
  }, [defaultValue, isMulti]);

  const loadKeywordOptions = async (inputValue: string) => {
    const results = await axios.get<TmdbKeywordSearchResponse>(
      '/api/v1/search/keyword',
      {
        params: {
          query: encodeURIExtraParams(inputValue),
        },
      }
    );

    return results.data.results.map((result) => ({
      label: result.name,
      value: result.id,
    }));
  };

  return (
    <AsyncSelect
      inputId="data"
      isMulti={isMulti}
      hideSelectedOptions={!isMulti}
      isDisabled={isDisabled}
      className="react-select-container"
      classNamePrefix="react-select"
      noOptionsMessage={({ inputValue }) =>
        inputValue === ''
          ? intl.formatMessage(messages.starttyping)
          : intl.formatMessage(messages.nooptions)
      }
      value={selectedValue}
      loadOptions={loadKeywordOptions}
      placeholder={intl.formatMessage(messages.searchKeywords)}
      onChange={(value) => {
        setSelectedValue(value);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onChange(value as any);
      }}
    />
  );
};

type WatchProviderSelectorProps = {
  type: 'movie' | 'tv';
  region?: string;
  activeProviders?: number[];
  onChange: (region: string, value: number[]) => void;
  regionLabel?: string;
};

export const WatchProviderSelector = ({
  type,
  onChange,
  region,
  activeProviders,
  regionLabel,
}: WatchProviderSelectorProps) => {
  const intl = useIntl();
  const { currentSettings } = useSettings();
  const [showMore, setShowMore] = useState(false);
  const [watchRegion, setWatchRegion] = useState(
    region
      ? region
      : currentSettings.discoverRegion
        ? currentSettings.discoverRegion
        : 'US'
  );
  const [activeProvider, setActiveProvider] = useState<number[]>(
    activeProviders ?? []
  );
  const { data, isLoading } = useSWR<WatchProviderDetails[]>(
    `/api/v1/watchproviders/${
      type === 'movie' ? 'movies' : 'tv'
    }?watchRegion=${watchRegion}`
  );
  const activityId = useId();
  useSearchActivityReporter(
    Boolean(regionLabel) && isLoading,
    `watch-provider-selector:${activityId}`
  );

  useEffect(() => {
    onChange(watchRegion, activeProvider);
    // removed onChange as a dependency as we only need to call it when the value(s) change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProvider, watchRegion]);

  const orderedData = useMemo(() => {
    if (!data) {
      return [];
    }

    return [...data].sort(
      (a, b) =>
        (a.displayPriority ?? Number.MAX_SAFE_INTEGER) -
        (b.displayPriority ?? Number.MAX_SAFE_INTEGER)
    );
  }, [data]);

  const toggleProvider = (id: number) => {
    if (activeProvider.includes(id)) {
      setActiveProvider(activeProvider.filter((p) => p !== id));
    } else {
      setActiveProvider([...activeProvider, id]);
    }
  };

  const initialProviders = orderedData.slice(0, 24);
  const otherProviders = orderedData.slice(24);
  const allProvidersSelected =
    orderedData.length > 0 &&
    orderedData.every((provider) => activeProvider.includes(provider.id));

  const selectAllProviders = () => {
    const availableProviderIds = new Set(
      orderedData.map((provider) => provider.id)
    );

    setActiveProvider((current) => {
      const next: number[] = [];
      const selectedProviderIds = new Set<number>();

      for (const providerId of current) {
        if (
          availableProviderIds.has(providerId) &&
          !selectedProviderIds.has(providerId)
        ) {
          next.push(providerId);
          selectedProviderIds.add(providerId);
        }
      }

      for (const provider of orderedData) {
        if (!selectedProviderIds.has(provider.id)) {
          next.push(provider.id);
          selectedProviderIds.add(provider.id);
        }
      }

      return next;
    });
  };

  return (
    <>
      {regionLabel ? (
        <div className="discover-filter-control" data-provider-region="region">
          <span className="discover-filter-control-label">{regionLabel}</span>
          <RegionSelector
            value={watchRegion}
            name="watchRegion"
            onChange={(_name, value) => {
              if (value !== watchRegion) {
                setActiveProvider([]);
              }
              setWatchRegion(value);
            }}
            disableAll
            watchProviders
            compact
          />
        </div>
      ) : (
        <RegionSelector
          value={watchRegion}
          name="watchRegion"
          onChange={(_name, value) => {
            if (value !== watchRegion) {
              setActiveProvider([]);
            }
            setWatchRegion(value);
          }}
          disableAll
          watchProviders
        />
      )}
      {isLoading ? (
        regionLabel ? null : (
          <SmallLoadingSpinner />
        )
      ) : (
        <div className="provider-icons" data-provider-region="layout">
          <div
            className="app-action-row"
            data-action-placement="leading"
            data-provider-region="actions"
          >
            <Button
              type="button"
              buttonSize="sm"
              disabled={orderedData.length === 0 || allProvidersSelected}
              disabledReason={
                orderedData.length === 0
                  ? intl.formatMessage(messages.noProvidersAvailable)
                  : intl.formatMessage(messages.allProvidersSelected)
              }
              onClick={selectAllProviders}
            >
              {intl.formatMessage(messages.selectAll)}
            </Button>
            <Button
              type="button"
              buttonSize="sm"
              disabled={activeProvider.length === 0}
              disabledReason={intl.formatMessage(messages.noProvidersSelected)}
              onClick={() => setActiveProvider([])}
            >
              {intl.formatMessage(messages.clearAll)}
            </Button>
          </div>
          <div className="provider-icons">
            {initialProviders.map((provider) => {
              const isActive = activeProvider.includes(provider.id);
              return (
                <Tooltip
                  content={provider.name}
                  key={`prodiver-${provider.id}`}
                >
                  <button
                    type="button"
                    className="provider-container"
                    data-selected={isActive}
                    aria-label={provider.name}
                    aria-pressed={isActive}
                    onClick={() => toggleProvider(provider.id)}
                  >
                    <div data-provider-region="logo">
                      <CachedImage
                        type="tmdb"
                        src={`https://image.tmdb.org/t/p/w185${provider.logoPath}`}
                        alt=""
                        fill
                      />
                    </div>
                    {isActive && (
                      <div data-provider-region="check">
                        <CheckCircleIcon />
                      </div>
                    )}
                  </button>
                </Tooltip>
              );
            })}
          </div>
          {showMore && otherProviders.length > 0 && (
            <div className="provider-icons" data-provider-region="expanded">
              {otherProviders.map((provider) => {
                const isActive = activeProvider.includes(provider.id);
                return (
                  <Tooltip
                    content={provider.name}
                    key={`prodiver-${provider.id}`}
                  >
                    <button
                      type="button"
                      className="provider-container"
                      data-selected={isActive}
                      aria-label={provider.name}
                      aria-pressed={isActive}
                      onClick={() => toggleProvider(provider.id)}
                    >
                      <div data-provider-region="logo">
                        <CachedImage
                          type="tmdb"
                          src={`https://image.tmdb.org/t/p/w185${provider.logoPath}`}
                          alt=""
                          fill
                        />
                      </div>
                      {isActive && (
                        <div data-provider-region="check">
                          <CheckCircleIcon />
                        </div>
                      )}
                    </button>
                  </Tooltip>
                );
              })}
            </div>
          )}
          {otherProviders.length > 0 && (
            <Button
              buttonSize="standard"
              data-provider-region="expand-control"
              type="button"
              onClick={() => setShowMore(!showMore)}
            >
              <span data-provider-region="divider" aria-hidden="true" />
              {showMore ? (
                <>
                  <ArrowUpIcon />
                  <span>{intl.formatMessage(messages.showless)}</span>
                  <ArrowUpIcon />
                </>
              ) : (
                <>
                  <ArrowDownIcon />
                  <span>{intl.formatMessage(messages.showmore)}</span>
                  <ArrowDownIcon />
                </>
              )}
              <span data-provider-region="divider" aria-hidden="true" />
            </Button>
          )}
        </div>
      )}
    </>
  );
};

export const UserSelector = ({
  isMulti,
  isDisabled,
  defaultValue,
  onChange,
}: BaseSelectorMultiProps | BaseSelectorSingleProps) => {
  const intl = useIntl();
  const [defaultDataValue, setDefaultDataValue] = useState<
    { label: string; value: number }[] | null
  >(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const loadUsers = async (): Promise<void> => {
      if (!defaultValue) {
        setDefaultDataValue(null);
        return;
      }

      try {
        const users = defaultValue.split(',');

        const res = await axios.get(
          `/api/v1/user?includeIds=${encodeURIComponent(defaultValue)}`,
          { signal: controller.signal }
        );
        const response: UserResultsResponse = res.data;

        const userData = users
          .filter((u) => response.results.find((user) => user.id === Number(u)))
          .map((u) => response.results.find((user) => user.id === Number(u)))
          .map((u) => ({
            label: u?.displayName ?? '',
            value: u?.id ?? 0,
          }));

        if (active) {
          setDefaultDataValue(userData);
        }
      } catch {
        if (active) {
          setDefaultDataValue(null);
        }
      }
    };

    void loadUsers();
    return () => {
      active = false;
      controller.abort();
    };
  }, [defaultValue]);

  const loadUserOptions = async (inputValue: string) => {
    const res = await axios.get(
      `/api/v1/user${inputValue ? `?q=${encodeURIComponent(inputValue)}` : ''}`
    );
    const results: UserResultsResponse = res.data;

    return results.results
      .map((result) => ({
        label: result.displayName,
        value: result.id,
      }))
      .filter(({ label }) =>
        label.toLowerCase().includes(inputValue.toLowerCase())
      );
  };

  return (
    <AsyncSelect
      key={`user-select-${defaultDataValue}`}
      className="react-select-container"
      classNamePrefix="react-select"
      defaultValue={isMulti ? defaultDataValue : defaultDataValue?.[0]}
      defaultOptions
      cacheOptions
      isMulti={isMulti}
      hideSelectedOptions={!isMulti}
      isDisabled={isDisabled}
      loadOptions={loadUserOptions}
      placeholder={intl.formatMessage(messages.searchUsers)}
      onChange={(value) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onChange(value as any);
      }}
    />
  );
};

export { default as USCertificationSelector } from './USCertificationSelector';
