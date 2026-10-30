/* eslint-disable react-hooks/exhaustive-deps */
import CachedImage from '@app/components/Common/CachedImage';
import { SmallLoadingSpinner } from '@app/components/Common/LoadingSpinner';
import SlideCheckbox from '@app/components/Common/SlideCheckbox';
import useToasts from '@app/hooks/useToasts';
import type { User } from '@app/hooks/useUser';
import { Permission, useUser } from '@app/hooks/useUser';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { formatBytes } from '@app/utils/numberHelpers';
import { Listbox, Transition } from '@headlessui/react';
import { CheckIcon, ChevronDownIcon } from '@heroicons/react/24/solid';
import type { SonarrSeries } from '@server/api/servarr/sonarr';
import type { PaginatedResponse } from '@server/interfaces/api/common';
import type {
  ServiceCommonServer,
  ServiceCommonServerWithDetails,
} from '@server/interfaces/api/serviceInterfaces';
import type {
  UserPreferredLanguages,
  UserRequestRootFolders,
} from '@server/interfaces/api/userSettingsInterfaces';
import type { OverrideRulesResult } from '@server/lib/overrideRules';
import {
  getPreferredLanguage,
  languageNameMatchesCode,
} from '@server/utils/preferredLanguage';
import { readarrServiceSupportsFormat } from '@server/utils/readarrService';
import axios from 'axios';
import { isEqual } from 'lodash';
import type { ReactNode } from 'react';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useIntl } from 'react-intl';
import Select from 'react-select';
import useSWR from 'swr';

type OptionType = {
  value: number;
  label: string;
};

type RequestListboxValue = string | number;

type RequestListboxOption<T extends RequestListboxValue> = {
  value: T;
  label: string;
};

type RequestListboxControlProps<T extends RequestListboxValue> = {
  id: string;
  label: ReactNode;
  value: T;
  options: RequestListboxOption<T>[];
  onChange: (value: T) => void;
  active?: boolean;
  disabled?: boolean;
  loadingLabel: string;
};

const areNumberArraysEqual = (a: number[], b: number[]) =>
  a.length === b.length && a.every((value, index) => value === b[index]);

const formatServiceLabel = (value: string) =>
  value.replace(/\beBook\b/g, 'Ebook');

const controlLabelClass = (active: boolean) =>
  `request-listbox-label ${active ? 'request-listbox-label-active' : ''}`;

export const RequestListboxControl = <T extends RequestListboxValue>({
  id,
  label,
  value,
  options,
  onChange,
  active = false,
  disabled = false,
  loadingLabel,
}: RequestListboxControlProps<T>) => {
  const selectedLabel =
    options.find((option) => option.value === value)?.label ?? loadingLabel;

  return (
    <Listbox
      as="div"
      value={value}
      onChange={onChange}
      disabled={disabled}
      className="request-listbox-control"
    >
      {({ open }) => (
        <>
          <Listbox.Label className={controlLabelClass(active)}>
            {label}
          </Listbox.Label>
          <Listbox.Button id={id} className="request-listbox-button">
            <span>{selectedLabel}</span>
            <ChevronDownIcon
              className="request-listbox-chevron"
              aria-hidden="true"
            />
          </Listbox.Button>
          <Transition as={Fragment} show={open}>
            <Listbox.Options
              anchor="bottom start"
              portal
              modal={false}
              className="request-listbox-menu"
            >
              {options.map((option) => (
                <Listbox.Option key={option.value} value={option.value}>
                  {({ selected, active: optionActive }) => (
                    <div
                      className={`request-listbox-option ${
                        optionActive ? 'request-listbox-option-active' : ''
                      }`}
                      data-selected={selected}
                    >
                      <span>{option.label}</span>
                      {selected && (
                        <CheckIcon
                          className="request-listbox-check"
                          aria-hidden="true"
                        />
                      )}
                    </div>
                  )}
                </Listbox.Option>
              ))}
            </Listbox.Options>
          </Transition>
        </>
      )}
    </Listbox>
  );
};

const messages = defineMessages('components.RequestModal.AdvancedRequester', {
  advancedoptions: 'Advanced Request',
  service: 'Service',
  status: 'Status',
  ready: 'Ready to Request',
  showOptions: 'Show Options',
  availableRootFolders: 'Available Root Folders',
  availableSpace: 'Available Space',
  destinationserver: 'Destination Server',
  qualityprofile: 'Quality Profile',
  metadataprofile: 'Metadata Profile',
  rootfolder: 'Root Folder',
  animenote: '* This series is an anime.',
  folder: '{path} ({space})',
  requestedBy: 'Requested By',
  languageprofile: 'Language Profile',
  metadataLanguage: 'Series metadata language',
  seasonOrder: 'Series order',
  sonarrDefault: 'Sonarr default',
  tags: 'Tags',
  selecttags: 'Select tags',
  notagoptions: 'No tags',
  binderyDefaults:
    'Bindery uses its own acquisition defaults for profiles, folders, and search.',
  ignoreQuotaTitle: 'Bypass User Quota',
  ignoreQuotaDescription:
    "This request will not count against the user's quota limits. Use with caution.",
});

export type RequestOverrides = {
  server?: number;
  is4k?: boolean;
  profile?: number;
  metadataProfile?: number;
  folder?: string;
  tags?: number[];
  language?: number;
  metadataLanguage?: number | null;
  sonarrSeasonType?: string | null;
  user?: RequestUser;
  ignoreQuota?: boolean;
};

type RequestUser = Pick<
  User,
  | 'avatar'
  | 'displayName'
  | 'email'
  | 'id'
  | 'jellyfinUsername'
  | 'permissions'
  | 'plexId'
  | 'tvSeasonWatchGateStatus'
>;

type ClientUserResultsResponse = PaginatedResponse & {
  results: User[];
};

interface AdvancedRequesterProps {
  type: 'movie' | 'tv' | 'music' | 'book';
  tmdbId?: number;
  tvdbId?: number;
  musicId?: string;
  bookId?: string;
  is4k: boolean;
  isAnime?: boolean;
  bookFormat?: 'ebook' | 'audiobook' | 'both';
  defaultOverrides?: RequestOverrides;
  requestUser?: RequestUser;
  requestId?: number;
  quota?: {
    movie: { limit?: number };
    tv: { limit?: number };
    music: { limit?: number };
    book: { limit?: number };
  };
  mediaTitle?: string;
  posterPath?: string;
  requestStatus?: string;
  expanded?: boolean;
  panelOnly?: boolean;
  rootFolderTable?: boolean;
  allow4kServerSelection?: boolean;
  reassignMissingServer?: boolean;
  requestedByPortal?: HTMLElement | null;
  onChange: (overrides: RequestOverrides) => void;
}

const AdvancedRequester = ({
  type,
  tmdbId,
  tvdbId,
  musicId,
  bookId,
  is4k = false,
  isAnime = false,
  bookFormat,
  defaultOverrides,
  requestUser,
  requestId,
  quota,
  mediaTitle,
  posterPath,
  requestStatus,
  expanded,
  panelOnly = false,
  rootFolderTable = false,
  allow4kServerSelection = false,
  reassignMissingServer = false,
  requestedByPortal,
  onChange,
}: AdvancedRequesterProps) => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const { user: currentUser, hasPermission: currentHasPermission } = useUser();
  const serviceType =
    type === 'movie'
      ? 'radarr'
      : type === 'music'
        ? 'lidarr'
        : type === 'book'
          ? 'readarr'
          : 'sonarr';
  const { data, error } = useSWR<ServiceCommonServer[]>(
    `/api/v1/service/${serviceType}`,
    {
      refreshInterval: 0,
      refreshWhenHidden: false,
      revalidateOnFocus: false,
      revalidateOnMount: true,
    }
  );
  const [selectedServer, setSelectedServer] = useState<number | null>(
    defaultOverrides?.server !== undefined && defaultOverrides?.server >= 0
      ? defaultOverrides?.server
      : null
  );
  const [selectedProfile, setSelectedProfile] = useState<number>(
    defaultOverrides?.profile ?? -1
  );
  const [selectedMetadataProfile, setSelectedMetadataProfile] =
    useState<number>(defaultOverrides?.metadataProfile ?? -1);
  const [selectedFolder, setSelectedFolder] = useState<string>(
    defaultOverrides?.folder ?? ''
  );
  const folderManuallySelected = useRef(false);

  const [selectedLanguage, setSelectedLanguage] = useState<number>(
    defaultOverrides?.language ?? -1
  );
  const [selectedMetadataLanguage, setSelectedMetadataLanguage] =
    useState<number>(defaultOverrides?.metadataLanguage ?? -1);
  const [selectedSonarrSeasonType, setSelectedSonarrSeasonType] =
    useState<string>(defaultOverrides?.sonarrSeasonType ?? '');
  const profileManuallySelected = useRef(false);
  const languageManuallySelected = useRef(false);

  const [selectedTags, setSelectedTags] = useState<number[]>(
    defaultOverrides?.tags ?? []
  );

  const [ignoreQuota, setIgnoreQuota] = useState<boolean>(
    defaultOverrides?.ignoreQuota ?? false
  );
  const quotaLimitForType =
    type === 'movie'
      ? quota?.movie.limit
      : type === 'music'
        ? quota?.music.limit
        : type === 'book'
          ? quota?.book.limit
          : quota?.tv.limit;
  const isIgnoreQuotaVisible =
    currentHasPermission([Permission.MANAGE_REQUESTS]) &&
    (quotaLimitForType ?? 0) > 0;

  const { data: serverData, isValidating } =
    useSWR<ServiceCommonServerWithDetails>(
      selectedServer !== null
        ? `/api/v1/service/${serviceType}/${selectedServer}`
        : null,
      {
        refreshInterval: 0,
        refreshWhenHidden: false,
        revalidateOnFocus: false,
      }
    );

  const [selectedUser, setSelectedUser] = useState<RequestUser | null>(
    requestUser ?? null
  );
  const preferenceUserId =
    selectedUser?.id ?? requestUser?.id ?? currentUser?.id;
  const { data: requestUserLanguages } = useSWR<UserPreferredLanguages>(
    preferenceUserId
      ? `/api/v1/user/${preferenceUserId}/settings/preferred-languages`
      : null
  );
  const { data: requestUserRootFolders } = useSWR<UserRequestRootFolders>(
    preferenceUserId
      ? `/api/v1/user/${preferenceUserId}/settings/request-root-folders`
      : null
  );
  const folderSelectionContextRef = useRef({
    selectedServer,
    serviceType,
    userId: preferenceUserId,
  });
  const selectRequestFolder = (path: string) => {
    folderManuallySelected.current = true;
    setSelectedFolder(path);
  };
  const preferredLanguage = getPreferredLanguage(requestUserLanguages, type);
  const bookServiceType = bookFormat === 'audiobook' ? 'audiobook' : 'ebook';
  const serviceOverridesEnabled = type !== 'book' || bookFormat !== 'both';
  const serviceServers = useMemo(
    () =>
      (data ?? []).filter(
        (server) =>
          (allow4kServerSelection || Boolean(server.is4k) === is4k) &&
          (type !== 'book' ||
            readarrServiceSupportsFormat(server, bookServiceType))
      ),
    [allow4kServerSelection, bookServiceType, data, is4k, type]
  );
  const selectedServerDetails = useMemo(
    () => (data ?? []).find((server) => server.id === selectedServer),
    [data, selectedServer]
  );
  const selectedIsBindery =
    type === 'book' && selectedServerDetails?.backend === 'bindery';
  const canCustomizeServiceRequest =
    serviceOverridesEnabled && !selectedIsBindery;
  const selectedIs4k = allow4kServerSelection
    ? (selectedServerDetails?.is4k ?? is4k)
    : is4k;
  const sonarrLookupUrl =
    type === 'tv' && tmdbId && selectedServer !== null
      ? `/api/v1/service/sonarr/lookup/${tmdbId}?${new URLSearchParams({
          is4k: String(selectedIs4k),
          serverId: String(selectedServer),
          ...(selectedMetadataLanguage !== -1
            ? { language: String(selectedMetadataLanguage) }
            : {}),
        }).toString()}`
      : null;
  const { data: sonarrLookupResults } = useSWR<SonarrSeries[]>(sonarrLookupUrl);
  const selectedSonarrSeries = sonarrLookupResults?.find(
    (series) => series.tvdbId === tvdbId
  );
  const availableSeasonTypes = selectedSonarrSeries?.seasonTypes ?? [];
  const availableServers = serviceServers;
  const selectedUserId = selectedUser?.id;
  const previousSelectedUserIdRef = useRef<number | undefined>(selectedUserId);

  const { data: userData } = useSWR<ClientUserResultsResponse>(
    currentHasPermission([Permission.MANAGE_REQUESTS, Permission.MANAGE_USERS])
      ? '/api/v1/user?take=1000&sort=displayname'
      : null
  );
  const selectableUserData = userData?.results;

  useEffect(() => {
    if (selectableUserData && !requestUser) {
      const nextSelectedUser =
        selectableUserData.find((u) => u.id === currentUser?.id) ?? null;

      if (nextSelectedUser?.id !== selectedUserId) {
        setIgnoreQuota(false);
      }

      setSelectedUser(nextSelectedUser);
    }
  }, [selectableUserData]);

  useEffect(() => {
    let defaultServer = data?.find((server) => {
      const formatMatches =
        type !== 'book' ||
        readarrServiceSupportsFormat(server, bookServiceType);

      return server.isDefault && Boolean(server.is4k) === is4k && formatMatches;
    });

    if (!defaultServer && type === 'book') {
      defaultServer = data?.find((server) =>
        readarrServiceSupportsFormat(server, bookServiceType)
      );
    }

    if (!defaultServer && serviceServers.length > 0) {
      defaultServer = serviceServers[0];
    }

    // Only fall back to the default when nothing valid is selected; this
    // effect re-runs on every selectedServer change and must not undo a
    // user's explicit choice of a non-default instance.
    const selectionUnavailable =
      selectedServer === null ||
      !serviceServers.some((server) => server.id === selectedServer);
    const canReplaceUnavailableServer =
      reassignMissingServer && selectionUnavailable;

    if (
      defaultServer &&
      selectionUnavailable &&
      (!defaultOverrides ||
        defaultOverrides.server === null ||
        canReplaceUnavailableServer)
    ) {
      setSelectedServer(defaultServer.id);
    }
  }, [
    data,
    bookServiceType,
    reassignMissingServer,
    selectedServer,
    serviceServers,
    type,
  ]);

  useEffect(() => {
    const previousContext = folderSelectionContextRef.current;
    if (
      previousContext.selectedServer !== selectedServer ||
      previousContext.serviceType !== serviceType ||
      previousContext.userId !== preferenceUserId
    ) {
      folderManuallySelected.current = false;
      folderSelectionContextRef.current = {
        selectedServer,
        serviceType,
        userId: preferenceUserId,
      };
    }

    if (serverData) {
      const defaultProfile = serverData.profiles.find(
        (profile) =>
          profile.id ===
          (isAnime && serverData.server.activeAnimeProfileId
            ? serverData.server.activeAnimeProfileId
            : serverData.server.activeProfileId)
      );
      const defaultFolder = serverData.rootFolders.find(
        (folder) =>
          folder.path ===
          (isAnime && serverData.server.activeAnimeDirectory
            ? serverData.server.activeAnimeDirectory
            : serverData.server.activeDirectory)
      );
      const preferredFolder = serverData.rootFolders.find(
        (folder) =>
          folder.path ===
          requestUserRootFolders?.[`${serviceType}:${serverData.server.id}`]
      );
      const defaultLanguage = serverData.languageProfiles?.find(
        (language) =>
          language.id ===
          (isAnime && serverData.server.activeAnimeLanguageProfileId
            ? serverData.server.activeAnimeLanguageProfileId
            : serverData.server.activeLanguageProfileId)
      );
      const defaultMetadataProfile = serverData.metadataProfiles?.find(
        (profile) =>
          profile.id ===
          (serverData.server.activeMetadataProfileId ??
            serverData.metadataProfiles?.[0]?.id)
      );
      const defaultTags = isAnime
        ? serverData.server.activeAnimeTags
        : serverData.server.activeTags;

      const applyOverrides =
        defaultOverrides &&
        ((defaultOverrides.server === null && serverData.server.isDefault) ||
          defaultOverrides.server === serverData.server.id);

      if (
        defaultProfile &&
        defaultProfile.id !== selectedProfile &&
        !profileManuallySelected.current &&
        (!applyOverrides || defaultOverrides.profile == null)
      ) {
        setSelectedProfile(defaultProfile.id);
      }

      if (
        defaultMetadataProfile &&
        defaultMetadataProfile.id !== selectedMetadataProfile &&
        (!applyOverrides || defaultOverrides.metadataProfile == null)
      ) {
        setSelectedMetadataProfile(defaultMetadataProfile.id);
      }

      const defaultRequestFolderPath =
        (preferredFolder ?? defaultFolder)?.path ?? '';
      if (
        defaultRequestFolderPath !== selectedFolder &&
        !folderManuallySelected.current &&
        (!applyOverrides || !defaultOverrides.folder)
      ) {
        setSelectedFolder(defaultRequestFolderPath);
      }

      if (
        defaultLanguage &&
        defaultLanguage.id !== selectedLanguage &&
        !languageManuallySelected.current &&
        (!applyOverrides || defaultOverrides.language == null)
      ) {
        setSelectedLanguage(defaultLanguage.id);
      }

      if (
        defaultTags &&
        !areNumberArraysEqual(defaultTags, selectedTags) &&
        (!applyOverrides || defaultOverrides.tags == null)
      ) {
        setSelectedTags(defaultTags);
      }
    }
  }, [
    defaultOverrides?.folder,
    isAnime,
    preferenceUserId,
    requestUserRootFolders,
    selectedServer,
    serverData,
    serviceType,
  ]);

  useEffect(() => {
    if (!serverData || !preferredLanguage) return;

    if (
      defaultOverrides?.profile == null &&
      !profileManuallySelected.current &&
      type !== 'book' &&
      type !== 'tv'
    ) {
      const preferredProfile = serverData.profiles.find((profile) =>
        languageNameMatchesCode(profile.language, preferredLanguage)
      );
      if (preferredProfile) {
        setSelectedProfile(preferredProfile.id);
      }
    }

    if (type === 'tv') {
      if (
        defaultOverrides?.profile == null &&
        !profileManuallySelected.current
      ) {
        const preferredQualityProfile = serverData.profiles.find((profile) =>
          languageNameMatchesCode(profile.language, preferredLanguage)
        );
        if (preferredQualityProfile) {
          setSelectedProfile(preferredQualityProfile.id);
        }
      }

      if (
        defaultOverrides?.language == null &&
        !languageManuallySelected.current
      ) {
        const preferredLanguageProfile = serverData.languageProfiles?.find(
          (profile) =>
            (profile.languages ?? []).some((language) =>
              languageNameMatchesCode(language, preferredLanguage)
            ) || languageNameMatchesCode(profile.name, preferredLanguage)
        );
        if (preferredLanguageProfile) {
          setSelectedLanguage(preferredLanguageProfile.id);
        }
      }
    }
  }, [
    defaultOverrides?.language,
    defaultOverrides?.profile,
    preferredLanguage,
    serverData,
    type,
  ]);

  useEffect(() => {
    if (defaultOverrides && defaultOverrides.server != null) {
      setSelectedServer(defaultOverrides.server);
    }

    if (defaultOverrides && defaultOverrides.profile != null) {
      setSelectedProfile(defaultOverrides.profile);
    }

    if (defaultOverrides && defaultOverrides.metadataProfile != null) {
      setSelectedMetadataProfile(defaultOverrides.metadataProfile);
    }

    if (defaultOverrides && defaultOverrides.folder) {
      setSelectedFolder(defaultOverrides.folder);
    }

    if (defaultOverrides && defaultOverrides.language != null) {
      setSelectedLanguage(defaultOverrides.language);
    }

    if (defaultOverrides && defaultOverrides.metadataLanguage != null) {
      setSelectedMetadataLanguage(defaultOverrides.metadataLanguage);
    }

    if (defaultOverrides && defaultOverrides.sonarrSeasonType != null) {
      setSelectedSonarrSeasonType(defaultOverrides.sonarrSeasonType);
    }

    if (defaultOverrides && defaultOverrides.tags != null) {
      setSelectedTags(defaultOverrides.tags);
    }

    if (defaultOverrides && defaultOverrides.ignoreQuota != null) {
      setIgnoreQuota(defaultOverrides.ignoreQuota);
    }
  }, [
    defaultOverrides?.server,
    defaultOverrides?.folder,
    defaultOverrides?.profile,
    defaultOverrides?.metadataProfile,
    defaultOverrides?.language,
    defaultOverrides?.metadataLanguage,
    defaultOverrides?.sonarrSeasonType,
    defaultOverrides?.tags,
    defaultOverrides?.ignoreQuota,
  ]);

  useEffect(() => {
    const selectedUserChanged =
      previousSelectedUserIdRef.current !== selectedUserId;
    previousSelectedUserIdRef.current = selectedUserId;

    if (selectedUserChanged) {
      folderManuallySelected.current = false;
    }

    if (!isIgnoreQuotaVisible || selectedUserChanged) {
      setIgnoreQuota(false);
    }
  }, [isIgnoreQuotaVisible, selectedUserId]);

  useEffect(() => {
    if (selectedServer !== null || selectedUser) {
      onChange({
        folder:
          canCustomizeServiceRequest && selectedFolder !== ''
            ? selectedFolder
            : undefined,
        profile:
          canCustomizeServiceRequest && selectedProfile !== -1
            ? selectedProfile
            : undefined,
        metadataProfile:
          canCustomizeServiceRequest && selectedMetadataProfile !== -1
            ? selectedMetadataProfile
            : undefined,
        server: serviceOverridesEnabled
          ? (selectedServer ?? undefined)
          : undefined,
        is4k: serviceOverridesEnabled ? selectedIs4k : undefined,
        user: selectedUser ?? undefined,
        language:
          serviceOverridesEnabled && selectedLanguage !== -1
            ? selectedLanguage
            : undefined,
        metadataLanguage:
          type !== 'tv'
            ? undefined
            : selectedMetadataLanguage !== -1
              ? selectedMetadataLanguage
              : defaultOverrides?.metadataLanguage != null
                ? null
                : undefined,
        sonarrSeasonType:
          type !== 'tv'
            ? undefined
            : selectedSonarrSeasonType
              ? selectedSonarrSeasonType
              : defaultOverrides?.sonarrSeasonType
                ? null
                : undefined,
        tags: canCustomizeServiceRequest ? selectedTags : undefined,
        ignoreQuota: isIgnoreQuotaVisible && ignoreQuota ? true : undefined,
      });
    }
  }, [
    selectedFolder,
    selectedServer,
    selectedIs4k,
    selectedProfile,
    selectedMetadataProfile,
    selectedUser,
    selectedLanguage,
    selectedMetadataLanguage,
    selectedSonarrSeasonType,
    selectedTags,
    serviceOverridesEnabled,
    canCustomizeServiceRequest,
    ignoreQuota,
    isIgnoreQuotaVisible,
    defaultOverrides?.metadataLanguage,
    defaultOverrides?.sonarrSeasonType,
    type,
  ]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (
        ((tmdbId && (type === 'movie' || type === 'tv')) ||
          type === 'music' ||
          (type === 'book' && bookFormat !== 'both')) &&
        !currentHasPermission([Permission.MANAGE_REQUESTS]) &&
        serverData?.server.id === selectedServer &&
        !selectedIsBindery
      ) {
        try {
          const { data: override } = await axios.post<OverrideRulesResult>(
            '/api/v1/overrideRule/advancedRequest',
            {
              mediaType: type,
              is4k,
              requestUser:
                selectedUser?.id ?? requestUser?.id ?? currentUser?.id,
              tmdbId,
              musicId,
              bookId,
              bookFormat: type === 'book' ? bookServiceType : undefined,
              tags: selectedTags.length > 0 ? selectedTags : undefined,
              serviceId: selectedServer ?? undefined,
              requestId: requestId ?? undefined,
            }
          );
          if (cancelled) {
            return;
          }
          if (!defaultOverrides?.folder && override.rootFolder) {
            folderManuallySelected.current = true;
            setSelectedFolder(override.rootFolder);
          }
          if (!defaultOverrides?.profile && override.profileId) {
            setSelectedProfile(override.profileId);
          }
          if (
            !defaultOverrides?.tags &&
            override.tags &&
            !isEqual(override.tags, selectedTags)
          ) {
            setSelectedTags(override.tags);
          }
        } catch {
          if (cancelled) {
            return;
          }
          addToast(intl.formatMessage(globalMessages.error), {
            appearance: 'error',
            autoDismiss: true,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    tmdbId,
    musicId,
    bookId,
    bookServiceType,
    bookFormat,
    type,
    is4k,
    serverData?.server.id,
    selectedServer,
    selectedIsBindery,
    selectedUserId,
    requestUser?.id,
    currentUser?.id,
    defaultOverrides?.folder,
    defaultOverrides?.profile,
    defaultOverrides?.tags,
  ]);

  if (!data && !error) {
    return (
      <div
        className={panelOnly ? 'card-layout card-spacing-after' : 'mb-2 w-full'}
        data-card-layout={panelOnly ? 'request-options' : undefined}
        data-options-state={panelOnly ? 'loading' : undefined}
      >
        <SmallLoadingSpinner />
      </div>
    );
  }

  const serviceOptionsHidden =
    !serviceOverridesEnabled ||
    selectedServer === null ||
    (availableServers.length < 2 &&
      (!serverData ||
        (serverData.profiles.length < 2 &&
          (serverData.metadataProfiles ?? []).length < 2 &&
          serverData.rootFolders.length < 2 &&
          (serverData.languageProfiles ?? []).length < 2 &&
          (serverData.metadataLanguages ?? []).length === 0 &&
          availableSeasonTypes.length < 2 &&
          !serverData.tags?.length)));
  const selectedService = serviceServers.find(
    (server) => server.id === selectedServer
  );
  const defaultService =
    serviceServers.find(
      (server) => server.isDefault && Boolean(server.is4k) === is4k
    ) ?? serviceServers[0];
  const defaultProfileId = serverData
    ? isAnime && serverData.server.activeAnimeProfileId
      ? serverData.server.activeAnimeProfileId
      : serverData.server.activeProfileId
    : undefined;
  const defaultMetadataProfileId =
    serverData?.server.activeMetadataProfileId ??
    serverData?.metadataProfiles?.[0]?.id;
  const selectedServiceFolderPath = serverData?.rootFolders.find(
    (folder) =>
      folder.path ===
      requestUserRootFolders?.[`${serviceType}:${serverData.server.id}`]
  )?.path;
  const defaultFolderPath =
    selectedServiceFolderPath ??
    (serverData
      ? isAnime && serverData.server.activeAnimeDirectory
        ? serverData.server.activeAnimeDirectory
        : serverData.server.activeDirectory
      : undefined);
  const defaultLanguageId = serverData
    ? isAnime && serverData.server.activeAnimeLanguageProfileId
      ? serverData.server.activeAnimeLanguageProfileId
      : serverData.server.activeLanguageProfileId
    : undefined;
  const defaultTagIds = serverData
    ? isAnime
      ? serverData.server.activeAnimeTags
      : serverData.server.activeTags
    : undefined;
  const canSelectRequestedBy =
    currentHasPermission([
      Permission.MANAGE_REQUESTS,
      Permission.MANAGE_USERS,
    ]) && !!selectedUser;

  const requestedByControl =
    requestedByPortal && canSelectRequestedBy
      ? createPortal(
          <Listbox
            as="div"
            value={selectedUser}
            onChange={(value) => {
              setIgnoreQuota(false);
              setSelectedUser(value);
            }}
            className="request-listbox-control"
          >
            {({ open }) => (
              <>
                <Listbox.Label
                  className={controlLabelClass(
                    selectedUser.id !== currentUser?.id
                  )}
                >
                  <span>{intl.formatMessage(messages.requestedBy)}</span>
                </Listbox.Label>
                <Listbox.Button className="request-listbox-button">
                  <span>{selectedUser.displayName}</span>
                  <ChevronDownIcon
                    className="request-listbox-chevron"
                    aria-hidden="true"
                  />
                </Listbox.Button>
                <Transition as={Fragment} show={open}>
                  <Listbox.Options
                    anchor="top end"
                    portal
                    modal={false}
                    className="request-listbox-menu"
                  >
                    {(selectableUserData ?? []).map((candidate) => (
                      <Listbox.Option key={candidate.id} value={candidate}>
                        {({ selected, active }) => (
                          <div
                            className={`request-listbox-option ${
                              active ? 'request-listbox-option-active' : ''
                            }`}
                            data-selected={selected}
                          >
                            <span>{candidate.displayName}</span>
                            {selected && (
                              <CheckIcon
                                className="request-listbox-check"
                                aria-hidden="true"
                              />
                            )}
                          </div>
                        )}
                      </Listbox.Option>
                    ))}
                  </Listbox.Options>
                </Transition>
              </>
            )}
          </Listbox>,
          requestedByPortal
        )
      : null;

  return (
    <>
      {requestedByControl}
      <details
        open={panelOnly ? expanded : true}
        className={
          panelOnly
            ? 'card-layout'
            : 'app-card-inset refreshed-inset-surface card-spacing-before group rounded-lg border border-gray-700'
        }
        data-card-layout={panelOnly ? 'request-options' : undefined}
        data-expanded={panelOnly ? expanded : undefined}
      >
        <summary
          onClick={panelOnly ? undefined : (event) => event.preventDefault()}
          hidden={panelOnly}
          className={
            panelOnly
              ? undefined
              : 'flex cursor-pointer list-none items-center gap-3 p-3 focus:ring-2 focus:ring-indigo-400 focus:outline-none'
          }
        >
          <div className="relative h-16 w-11 flex-shrink-0 overflow-hidden rounded ring-1 ring-gray-600">
            <CachedImage
              type={
                type === 'book' ? 'book' : type === 'music' ? 'music' : 'tmdb'
              }
              src={posterPath || '/images/seerr_poster_not_found.png'}
              alt=""
              fill
              className="object-cover"
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-white">
              {mediaTitle || intl.formatMessage(messages.advancedoptions)}
            </div>
            <dl className="media-detail-rows detail-card-heading-spacing refreshed-detail-text grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 text-xs">
              <dt className="font-medium text-gray-200">
                {intl.formatMessage(messages.status)}:
              </dt>
              <dd className="m-0 truncate">
                {requestStatus || intl.formatMessage(messages.ready)}
              </dd>
              <dt className="font-medium text-gray-200">
                {intl.formatMessage(messages.service)}:
              </dt>
              <dd className="m-0 truncate">
                {selectedService?.name ??
                  intl.formatMessage(globalMessages.loading)}
              </dd>
              {!selectedIsBindery && (
                <>
                  <dt className="font-medium text-gray-200">
                    {intl.formatMessage(messages.rootfolder)}:
                  </dt>
                  <dd className="m-0 truncate">
                    {selectedFolder ||
                      intl.formatMessage(globalMessages.loading)}
                  </dd>
                </>
              )}
            </dl>
          </div>
          <span className="flex-shrink-0 text-xs font-semibold text-indigo-300 group-open:hidden">
            {intl.formatMessage(messages.showOptions)}
          </span>
          <ChevronDownIcon className="refreshed-detail-text-muted h-5 w-5 flex-shrink-0 transition group-open:rotate-180" />
        </summary>
        <div
          className={
            panelOnly
              ? 'app-card-inset refreshed-inset-surface'
              : 'border-t border-gray-700 p-3'
          }
          data-card-part={panelOnly ? 'body' : undefined}
          hidden={!rootFolderTable && serviceOptionsHidden}
        >
          {!!data && selectedServer !== null && serviceOverridesEnabled && (
            <div
              className={
                panelOnly
                  ? 'app-action-row card-spacing-after'
                  : 'mb-3 flex flex-wrap items-center gap-2'
              }
              data-action-placement={panelOnly ? 'leading' : undefined}
            >
              {serviceServers.length > 0 && (
                <RequestListboxControl
                  id="server"
                  label={intl.formatMessage(messages.destinationserver)}
                  value={selectedServer}
                  options={serviceServers.map((server) => ({
                    value: server.id,
                    label: formatServiceLabel(server.name),
                  }))}
                  onChange={(serverId) => {
                    profileManuallySelected.current = false;
                    languageManuallySelected.current = false;
                    setSelectedMetadataLanguage(-1);
                    setSelectedSonarrSeasonType('');
                    setSelectedServer(serverId);
                  }}
                  active={
                    defaultService !== undefined &&
                    selectedServer !== defaultService.id
                  }
                  loadingLabel={intl.formatMessage(globalMessages.loading)}
                />
              )}
              {selectedIsBindery && (
                <p className="description">
                  {intl.formatMessage(messages.binderyDefaults)}
                </p>
              )}
              {canCustomizeServiceRequest &&
                (type === 'music' || type === 'book') &&
                (isValidating ||
                  !serverData ||
                  (serverData.metadataProfiles ?? []).length > 0) && (
                  <RequestListboxControl
                    id="metadataProfile"
                    label={intl.formatMessage(messages.metadataprofile)}
                    value={selectedMetadataProfile}
                    options={(serverData?.metadataProfiles ?? [])
                      .toSorted((a, b) =>
                        a.name.localeCompare(b.name, intl.locale, {
                          numeric: true,
                          sensitivity: 'base',
                        })
                      )
                      .map((profile) => ({
                        value: profile.id,
                        label: formatServiceLabel(profile.name),
                      }))}
                    onChange={setSelectedMetadataProfile}
                    active={
                      defaultMetadataProfileId !== undefined &&
                      selectedMetadataProfile !== defaultMetadataProfileId
                    }
                    disabled={isValidating || !serverData}
                    loadingLabel={intl.formatMessage(globalMessages.loading)}
                  />
                )}
              {canCustomizeServiceRequest &&
                (isValidating ||
                  !serverData ||
                  serverData.profiles.length > 0) && (
                  <RequestListboxControl
                    id="profile"
                    label={intl.formatMessage(messages.qualityprofile)}
                    value={selectedProfile}
                    options={(serverData?.profiles ?? [])
                      .toSorted((a, b) =>
                        a.name.localeCompare(b.name, intl.locale, {
                          numeric: true,
                          sensitivity: 'base',
                        })
                      )
                      .map((profile) => ({
                        value: profile.id,
                        label: formatServiceLabel(profile.name),
                      }))}
                    onChange={(profileId) => {
                      profileManuallySelected.current = true;
                      setSelectedProfile(profileId);
                    }}
                    active={
                      defaultProfileId !== undefined &&
                      selectedProfile !== defaultProfileId
                    }
                    disabled={isValidating || !serverData}
                    loadingLabel={intl.formatMessage(globalMessages.loading)}
                  />
                )}
              {canCustomizeServiceRequest &&
                !rootFolderTable &&
                (isValidating ||
                  !serverData ||
                  serverData.rootFolders.length > 1) && (
                  <RequestListboxControl<string>
                    id="folder"
                    label={intl.formatMessage(messages.rootfolder)}
                    value={selectedFolder}
                    options={(serverData?.rootFolders ?? []).map((folder) => ({
                      value: folder.path ?? '',
                      label: intl.formatMessage(messages.folder, {
                        path: folder.path,
                        space: formatBytes(folder.freeSpace ?? 0),
                      }),
                    }))}
                    onChange={selectRequestFolder}
                    active={
                      defaultFolderPath !== undefined &&
                      selectedFolder !== defaultFolderPath
                    }
                    disabled={isValidating || !serverData}
                    loadingLabel={intl.formatMessage(globalMessages.loading)}
                  />
                )}
              {type === 'tv' &&
                (isValidating ||
                  !serverData ||
                  (serverData.languageProfiles ?? []).length > 0) && (
                  <RequestListboxControl
                    id="language"
                    label={intl.formatMessage(messages.languageprofile)}
                    value={selectedLanguage ?? 0}
                    onChange={(languageId) => {
                      languageManuallySelected.current = true;
                      setSelectedLanguage(languageId);
                    }}
                    options={(serverData?.languageProfiles ?? []).map(
                      (language) => ({
                        value: language.id,
                        label: language.name,
                      })
                    )}
                    active={
                      defaultLanguageId !== undefined &&
                      selectedLanguage !== defaultLanguageId
                    }
                    disabled={isValidating || !serverData}
                    loadingLabel={intl.formatMessage(globalMessages.loading)}
                  />
                )}
              {type === 'tv' &&
                (isValidating ||
                  !serverData ||
                  (serverData.metadataLanguages ?? []).length > 0) && (
                  <RequestListboxControl
                    id="metadataLanguage"
                    label={intl.formatMessage(messages.metadataLanguage)}
                    value={selectedMetadataLanguage}
                    options={[
                      {
                        value: -1,
                        label: intl.formatMessage(messages.sonarrDefault),
                      },
                      ...(serverData?.metadataLanguages ?? []).map(
                        (language) => ({
                          value: language.id,
                          label: language.name,
                        })
                      ),
                    ]}
                    onChange={setSelectedMetadataLanguage}
                    active={selectedMetadataLanguage !== -1}
                    disabled={isValidating || !serverData}
                    loadingLabel={intl.formatMessage(globalMessages.loading)}
                  />
                )}
              {type === 'tv' && availableSeasonTypes.length > 1 && (
                <RequestListboxControl<string>
                  id="seasonOrder"
                  label={intl.formatMessage(messages.seasonOrder)}
                  value={selectedSonarrSeasonType}
                  options={[
                    {
                      value: '',
                      label: intl.formatMessage(messages.sonarrDefault),
                    },
                    ...availableSeasonTypes.map((seasonType) => ({
                      value: seasonType.type,
                      label:
                        seasonType.name === seasonType.type
                          ? seasonType.name
                          : `${seasonType.name} (${seasonType.type})`,
                    })),
                  ]}
                  onChange={(seasonType) => {
                    setSelectedSonarrSeasonType(seasonType);
                  }}
                  active={selectedSonarrSeasonType !== ''}
                  disabled={!selectedSonarrSeries}
                  loadingLabel={intl.formatMessage(globalMessages.loading)}
                />
              )}
            </div>
          )}
          {rootFolderTable && canCustomizeServiceRequest && (
            <div className="card-spacing-after">
              <h4 className="card-table-heading card-spacing-after">
                {intl.formatMessage(messages.availableRootFolders)}
              </h4>
              <div className="card-table" data-table-layout="request-folders">
                <div data-table-part="header">
                  <span className="card-table-heading refreshed-detail-text">
                    {intl.formatMessage(messages.rootfolder)}
                  </span>
                  <span className="card-table-heading refreshed-detail-text">
                    {intl.formatMessage(messages.availableSpace)}
                  </span>
                </div>
                <div
                  className="scrollable-card"
                  data-table-part="rows"
                  data-scrollable={(serverData?.rootFolders.length ?? 0) > 5}
                >
                  {isValidating || !serverData ? (
                    <span
                      className="card-table-value refreshed-detail-text-muted"
                      data-table-part="feedback"
                    >
                      {intl.formatMessage(globalMessages.loading)}
                    </span>
                  ) : (
                    serverData.rootFolders.map((folder) => {
                      const isSelected = folder.path === selectedFolder;

                      return (
                        <button
                          type="button"
                          key={`folder-card-${folder.id}`}
                          data-button-help="off"
                          onClick={() => selectRequestFolder(folder.path ?? '')}
                          data-table-part="choice-row"
                          aria-pressed={isSelected}
                        >
                          <span className="card-table-value">
                            {folder.path}
                          </span>
                          <span className="card-table-value refreshed-detail-text">
                            {formatBytes(folder.freeSpace ?? 0)}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}
          {selectedServer !== null &&
            canCustomizeServiceRequest &&
            !isValidating &&
            !!serverData?.tags?.length && (
              <div
                className={
                  panelOnly
                    ? 'discover-filter-control card-spacing-after'
                    : 'discover-filter-control mb-2 max-w-xl'
                }
                data-options-control={panelOnly ? 'tags' : undefined}
              >
                <label
                  htmlFor="tags"
                  className={controlLabelClass(
                    defaultTagIds !== undefined &&
                      !areNumberArraysEqual(selectedTags, defaultTagIds)
                  )}
                >
                  {intl.formatMessage(messages.tags)}
                </label>
                <Select<OptionType, true>
                  name="tags"
                  options={(serverData?.tags ?? []).map((tag) => ({
                    label: tag.label,
                    value: tag.id,
                  }))}
                  isMulti
                  placeholder={intl.formatMessage(messages.selecttags)}
                  className="react-select-container react-select-container-dark discover-compact-select"
                  classNamePrefix="react-select"
                  value={
                    selectedTags
                      .map((tagId) => {
                        const foundTag = serverData?.tags.find(
                          (tag) => tag.id === tagId
                        );

                        if (!foundTag) {
                          return undefined;
                        }

                        return {
                          value: foundTag.id,
                          label: foundTag.label,
                        };
                      })
                      .filter((option) => option !== undefined) as OptionType[]
                  }
                  onChange={(value) => {
                    setSelectedTags(value.map((option) => option.value));
                  }}
                  noOptionsMessage={() =>
                    intl.formatMessage(messages.notagoptions)
                  }
                />
              </div>
            )}
          {isIgnoreQuotaVisible && (
            <div className={panelOnly ? 'card-spacing-after' : 'mb-2'}>
              <label htmlFor="ignoreQuota">
                {intl.formatMessage(messages.ignoreQuotaTitle)}
              </label>
              <div
                className={
                  panelOnly
                    ? 'app-action-row'
                    : 'flex items-center justify-between'
                }
                data-action-placement={panelOnly ? 'distributed' : undefined}
                data-options-control={panelOnly ? 'quota' : undefined}
              >
                <p
                  className={
                    panelOnly
                      ? 'card-body-text refreshed-detail-text'
                      : 'refreshed-detail-text text-sm'
                  }
                >
                  {intl.formatMessage(messages.ignoreQuotaDescription)}
                </p>
                <SlideCheckbox
                  checked={ignoreQuota}
                  onClick={() => setIgnoreQuota(!ignoreQuota)}
                />
              </div>
            </div>
          )}
          {isAnime && (
            <div
              className={panelOnly ? 'card-body-text' : 'mt-4 italic'}
              data-options-note={panelOnly ? 'anime' : undefined}
            >
              {intl.formatMessage(messages.animenote)}
            </div>
          )}
        </div>
      </details>
    </>
  );
};

export default AdvancedRequester;
