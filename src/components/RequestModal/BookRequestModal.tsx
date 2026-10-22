import Alert from '@app/components/Common/Alert';
import { getBookFormatMessage } from '@app/components/Common/BookFormatBadge';
import CachedImage from '@app/components/Common/CachedImage';
import Modal from '@app/components/Common/Modal';
import {
  EditionCardPicker,
  type EditionChoice,
} from '@app/components/EditionCompare';
import MediaQualitySelect from '@app/components/MediaDetails/MediaQualitySelect';
import AdvancedOptionsDisclosureButton from '@app/components/RequestModal/AdvancedOptionsDisclosureButton';
import type { RequestOverrides } from '@app/components/RequestModal/AdvancedRequester';
import AdvancedRequester, {
  RequestListboxControl,
} from '@app/components/RequestModal/AdvancedRequester';
import QuotaDisplay from '@app/components/RequestModal/QuotaDisplay';
import RequestFooterStatus from '@app/components/RequestModal/RequestFooterStatus';
import RequestMediaCard from '@app/components/RequestModal/RequestMediaCard';
import {
  canPromotePendingDestinationRequests,
  createRequestDestination,
  isRequestDestinationAvailable,
  isRequestDestinationRequested,
} from '@app/components/RequestModal/requestAvailability';
import useAdvancedOptionsDisclosure from '@app/hooks/useAdvancedOptionsDisclosure';
import useSettings from '@app/hooks/useSettings';
import useToasts from '@app/hooks/useToasts';
import { useUser } from '@app/hooks/useUser';
import globalMessages from '@app/i18n/globalMessages';
import {
  encodeApiPathSegment,
  normalizeOpenLibraryWorkId,
} from '@app/utils/apiPath';
import defineMessages from '@app/utils/defineMessages';
import { getUserServiceAvailability } from '@app/utils/serviceAvailability';
import { ArrowDownTrayIcon, XMarkIcon } from '@heroicons/react/24/outline';
import {
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from '@server/constants/media';
import type { MediaRequest } from '@server/entity/MediaRequest';
import type { NonFunctionProperties } from '@server/interfaces/api/common';
import type { ServiceCommonServer } from '@server/interfaces/api/serviceInterfaces';
import type { QuotaResponse } from '@server/interfaces/api/userInterfaces';
import type { UserPreferredLanguages } from '@server/interfaces/api/userSettingsInterfaces';
import { Permission, hasAutoApprovePermission } from '@server/lib/permissions';
import type { BookDetails } from '@server/models/Book';
import {
  getPreferredLanguage,
  languageCodesMatch,
} from '@server/utils/preferredLanguage';
import { readarrServiceSupportsFormat } from '@server/utils/readarrService';
import axios from 'axios';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR, { mutate } from 'swr';

const messages = defineMessages('components.RequestModal.Book', {
  requestSuccessWithFormat:
    '<strong>{title}</strong> requested successfully as {format}.',
  requestCancel: 'Request for <strong>{title}</strong> canceled.',
  requestEdited: 'Request for <strong>{title}</strong> edited successfully!',
  requestApproved: 'Request for <strong>{title}</strong> approved!',
  requestbook: 'Request Book',
  pendingrequest: 'Pending Book Request',
  pendingRequestFormat: 'Pending {format} Request',
  edit: 'Edit Request',
  approve: 'Approve Request',
  cancel: 'Cancel Request',
  close: 'Close',
  pendingapproval: 'Your request is pending approval.',
  requestfrom: "{username}'s request is pending approval.",
  requesterror: 'Something went wrong while submitting the request.',
  backendRequestFailed:
    'The request was submitted, but Bookshelf rejected it while processing.',
  editerror: 'Something went wrong while editing the request.',
  edition: 'Edition / ISBN',
  automaticEdition: 'Automatic best match',
  automaticEditionInfo:
    'Automatic uses the first valid ISBN from Open Library. Pick a specific edition when testers report a mismatch.',
  noIsbnCandidates:
    'No valid ISBN candidates were found. Bookshelf will fall back to title matching.',
  noEbookServer:
    'No Book Bookshelf service is configured. Book requests are unavailable.',
  noAudiobookServer:
    'No audiobook Bookshelf service is configured. Audiobook requests are unavailable.',
  ebook: 'Book',
  audiobook: 'Audiobook',
  mediaAndFormat: 'Media & Format',
  firstPublished: 'First Published',
  pages: 'Pages',
  genres: 'Genres',
  author: 'Author',
  publisher: 'Publisher',
  status: 'Status',
  service: 'Service',
  approval: 'Approval',
  readyToRequest: 'Ready to Request',
  requested: 'Requested',
  notAvailable: 'Not Available',
  advancedOptions: 'Advanced Options',
  format: 'Format',
});

const getEditionLanguageName = (language: string, locale: string): string => {
  const languageCode = language.split('/').filter(Boolean).pop() ?? language;

  try {
    return (
      new Intl.DisplayNames([locale], { type: 'language' }).of(languageCode) ??
      languageCode.toUpperCase()
    );
  } catch {
    return languageCode.toUpperCase();
  }
};

const matchesBookLanguage = (
  editionLanguages: string[] | undefined,
  preferredLanguage: string
): boolean =>
  !!preferredLanguage &&
  !!editionLanguages?.some((language) =>
    languageCodesMatch(language, preferredLanguage)
  );

interface BookRequestModalProps {
  bookId: string;
  initialBookFormat?: 'ebook' | 'audiobook' | 'both';
  onCancel?: () => void;
  onComplete?: (newStatus: MediaStatus) => void;
  onUpdating?: (isUpdating: boolean) => void;
  editRequest?: NonFunctionProperties<MediaRequest>;
}

const BookRequestModal = ({
  bookId,
  initialBookFormat = 'ebook',
  onCancel,
  onComplete,
  onUpdating,
  editRequest,
}: BookRequestModalProps) => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const { currentSettings } = useSettings();
  const { user, hasPermission } = useUser();
  const serviceAvailability = getUserServiceAvailability(
    currentSettings,
    user?.settings?.enabledMediaCategories,
    hasPermission(Permission.ADMIN)
  );
  const [isUpdating, setIsUpdating] = useState(false);
  const [bookFormat, setBookFormat] = useState<'ebook' | 'audiobook'>(
    (editRequest?.bookFormat ?? initialBookFormat) === 'audiobook'
      ? 'audiobook'
      : 'ebook'
  );
  const [hasUserSelectedFormat, setHasUserSelectedFormat] = useState(false);
  const [selectedIsbn, setSelectedIsbn] = useState<string>('');
  const [editionChoice, setEditionChoice] = useState<EditionChoice>({
    policy: 'only',
  });
  const [preferredLanguage, setPreferredLanguage] = useState('');
  const [appliedPreferenceUserId, setAppliedPreferenceUserId] = useState<
    number | null
  >(null);
  const [requestOverrides, setRequestOverrides] =
    useState<RequestOverrides | null>(null);
  const {
    open: advancedOptionsOpen,
    pinned: advancedOptionsPinned,
    toggleOpen: toggleAdvancedOptions,
    togglePin: toggleAdvancedOptionsPin,
  } = useAdvancedOptionsDisclosure('book');
  const [requestedByPortal, setRequestedByPortal] =
    useState<HTMLDivElement | null>(null);
  const normalizedBookId = normalizeOpenLibraryWorkId(bookId);
  const { data, error } = useSWR<BookDetails>(
    `/api/v1/book/${encodeApiPathSegment(normalizedBookId)}`,
    {
      revalidateOnMount: true,
    }
  );
  const canChooseRequestUser = hasPermission(
    [Permission.MANAGE_REQUESTS, Permission.MANAGE_USERS],
    { type: 'or' }
  );
  const preferenceUserId = canChooseRequestUser
    ? (requestOverrides?.user?.id ?? user?.id)
    : user?.id;
  const { data: requestUserLanguages } = useSWR<UserPreferredLanguages>(
    preferenceUserId
      ? `/api/v1/user/${preferenceUserId}/settings/preferred-languages`
      : null
  );
  const preferredBookLanguage = getPreferredLanguage(
    requestUserLanguages,
    'book'
  );
  const visibleEditionCandidates = useMemo(() => {
    const candidates = data?.isbnCandidates ?? [];
    if (!preferredBookLanguage) {
      return candidates.slice(0, 25);
    }

    const preferredCandidate = candidates.find((candidate) =>
      matchesBookLanguage(candidate.languages, preferredBookLanguage)
    );
    const visibleCandidates = candidates
      .slice(0, 25)
      .filter((candidate) => candidate.isbn !== preferredCandidate?.isbn);

    return preferredCandidate
      ? [preferredCandidate, ...visibleCandidates].slice(0, 25)
      : candidates.slice(0, 25);
  }, [data?.isbnCandidates, preferredBookLanguage]);
  const editionLanguages = useMemo(() => {
    const languages = visibleEditionCandidates.flatMap(
      (candidate) => candidate.languages ?? []
    );

    return [...new Set(languages)].sort((left, right) =>
      getEditionLanguageName(left, intl.locale).localeCompare(
        getEditionLanguageName(right, intl.locale),
        intl.locale
      )
    );
  }, [intl.locale, visibleEditionCandidates]);
  const { data: bookServices } = useSWR<ServiceCommonServer[]>(
    '/api/v1/service/readarr'
  );
  const selectedService = bookServices?.find(
    (server) => server.id === requestOverrides?.server
  );
  const defaultEbookService = bookServices?.find(
    (server) =>
      server.isDefault && readarrServiceSupportsFormat(server, 'ebook')
  );
  const defaultAudiobookService = bookServices?.find(
    (server) =>
      server.isDefault && readarrServiceSupportsFormat(server, 'audiobook')
  );
  const ebookDestination = createRequestDestination(
    'readarr',
    'ebook',
    bookFormat === 'ebook'
      ? (selectedService ?? defaultEbookService)
      : defaultEbookService,
    bookFormat === 'ebook' ? requestOverrides : null
  );
  const audiobookDestination = createRequestDestination(
    'readarr',
    'audiobook',
    bookFormat === 'audiobook'
      ? (selectedService ?? defaultAudiobookService)
      : defaultAudiobookService,
    bookFormat === 'audiobook' ? requestOverrides : null
  );
  const selectedDestinations =
    bookFormat === 'audiobook' ? [audiobookDestination] : [ebookDestination];
  const destinationAvailable = (format: 'ebook' | 'audiobook') => {
    const target = format === 'ebook' ? ebookDestination : audiobookDestination;
    const externalServiceId =
      format === 'ebook'
        ? data?.mediaInfo?.externalServiceId
        : data?.mediaInfo?.audiobookExternalServiceId;
    const serviceId =
      format === 'ebook'
        ? data?.mediaInfo?.serviceId
        : data?.mediaInfo?.audiobookServiceId;

    return isRequestDestinationAvailable(
      data?.mediaInfo
        ? {
            ...data.mediaInfo,
            status:
              data.mediaInfo.status === MediaStatus.AVAILABLE &&
              externalServiceId != null
                ? MediaStatus.AVAILABLE
                : MediaStatus.UNKNOWN,
            serviceId,
          }
        : undefined,
      target
    );
  };
  const selectedDestinationAvailable =
    !editRequest &&
    selectedDestinations.length > 0 &&
    selectedDestinations.every(
      (target) =>
        !!target && destinationAvailable(target.format as 'ebook' | 'audiobook')
    );
  const selectedDestinationFullyCovered =
    !editRequest &&
    selectedDestinations.length > 0 &&
    selectedDestinations.every(
      (target) =>
        !!target &&
        (destinationAvailable(target.format as 'ebook' | 'audiobook') ||
          isRequestDestinationRequested(data?.mediaInfo?.requests, target))
    );
  const selectedDestinationRequested =
    selectedDestinationFullyCovered && !selectedDestinationAvailable;
  const requestedDestinations = selectedDestinations.filter(
    (target) =>
      !!target &&
      !destinationAvailable(target.format as 'ebook' | 'audiobook') &&
      isRequestDestinationRequested(data?.mediaInfo?.requests, target)
  );
  const selectedDestinationPromotable =
    selectedDestinationRequested &&
    canPromotePendingDestinationRequests(
      data?.mediaInfo?.requests,
      requestedDestinations,
      {
        canManageRequests: hasPermission(Permission.MANAGE_REQUESTS),
        hasAutoApprove: hasAutoApprovePermission(
          user?.permissions ?? 0,
          'book'
        ),
      }
    );
  const selectedDestinationCovered =
    selectedDestinationFullyCovered && !selectedDestinationPromotable;
  const { data: quota } = useSWR<QuotaResponse>(
    user &&
      (!requestOverrides?.user?.id ||
        hasPermission([Permission.MANAGE_REQUESTS, Permission.MANAGE_USERS], {
          type: 'or',
        }))
      ? `/api/v1/user/${requestOverrides?.user?.id ?? user.id}/quota`
      : null
  );

  useEffect(() => {
    setBookFormat(
      (editRequest?.bookFormat ?? initialBookFormat) === 'audiobook'
        ? 'audiobook'
        : 'ebook'
    );
    setHasUserSelectedFormat(false);
    setSelectedIsbn('');
    setPreferredLanguage('');
    setAppliedPreferenceUserId(null);
    setRequestOverrides(null);
  }, [bookId, editRequest?.bookFormat, editRequest?.id, initialBookFormat]);

  useEffect(() => {
    if (
      editRequest ||
      !preferenceUserId ||
      appliedPreferenceUserId === preferenceUserId ||
      !requestUserLanguages ||
      !data?.isbnCandidates
    ) {
      return;
    }

    setAppliedPreferenceUserId(preferenceUserId);

    if (!preferredBookLanguage) {
      return;
    }

    const preferredEdition = visibleEditionCandidates.find((candidate) =>
      matchesBookLanguage(candidate.languages, preferredBookLanguage)
    );
    if (!preferredEdition) {
      return;
    }

    setSelectedIsbn(preferredEdition.isbn);
    setPreferredLanguage(
      preferredEdition.languages?.find((language) =>
        matchesBookLanguage([language], preferredBookLanguage)
      ) ?? ''
    );
  }, [
    data?.isbnCandidates,
    editRequest,
    appliedPreferenceUserId,
    preferredBookLanguage,
    preferenceUserId,
    requestUserLanguages,
    visibleEditionCandidates,
  ]);

  const hasEbookServer = (bookServices ?? []).some((service) =>
    readarrServiceSupportsFormat(service, 'ebook')
  );
  const hasAudiobookServer = (bookServices ?? []).some((service) =>
    readarrServiceSupportsFormat(service, 'audiobook')
  );
  const hasEnabledEbookCategory =
    serviceAvailability.enabledMediaCategories?.ebook !== false ||
    (editRequest?.bookFormat !== undefined &&
      (editRequest.bookFormat === 'ebook' ||
        editRequest.bookFormat === 'both'));
  const hasEnabledAudiobookCategory =
    serviceAvailability.enabledMediaCategories?.audiobook !== false ||
    (editRequest?.bookFormat !== undefined &&
      (editRequest.bookFormat === 'audiobook' ||
        editRequest.bookFormat === 'both'));
  const formatAvailable = useMemo(
    () => ({
      ebook: hasEbookServer && hasEnabledEbookCategory,
      audiobook: hasAudiobookServer && hasEnabledAudiobookCategory,
      both:
        hasEbookServer &&
        hasAudiobookServer &&
        hasEnabledEbookCategory &&
        hasEnabledAudiobookCategory,
    }),
    [
      hasAudiobookServer,
      hasEbookServer,
      hasEnabledAudiobookCategory,
      hasEnabledEbookCategory,
    ]
  );

  useEffect(() => {
    if (!bookServices) {
      return;
    }

    if (formatAvailable[bookFormat]) {
      return;
    }

    if (formatAvailable.ebook) {
      setBookFormat('ebook');
    } else if (formatAvailable.audiobook) {
      setBookFormat('audiobook');
    }
  }, [
    bookFormat,
    bookServices,
    formatAvailable,
    formatAvailable.audiobook,
    formatAvailable.ebook,
  ]);

  useEffect(() => {
    if (editRequest || hasUserSelectedFormat || !data?.mediaInfo) {
      return;
    }

    const hasEbookServiceLink =
      data.mediaInfo.serviceId !== null &&
      data.mediaInfo.serviceId !== undefined &&
      data.mediaInfo.externalServiceId !== null &&
      data.mediaInfo.externalServiceId !== undefined;
    const hasAudiobookServiceLink =
      data.mediaInfo.audiobookServiceId !== null &&
      data.mediaInfo.audiobookServiceId !== undefined &&
      data.mediaInfo.audiobookExternalServiceId !== null &&
      data.mediaInfo.audiobookExternalServiceId !== undefined;
    const activeRequests =
      data.mediaInfo.requests?.filter(
        (request) =>
          request.status !== MediaRequestStatus.DECLINED &&
          request.status !== MediaRequestStatus.FAILED &&
          request.status !== MediaRequestStatus.COMPLETED
      ) ?? [];
    const hasActiveEbookRequest = activeRequests.some(
      (request) =>
        (request.bookFormat ?? 'ebook') === 'ebook' ||
        request.bookFormat === 'both'
    );
    const hasActiveAudiobookRequest = activeRequests.some(
      (request) =>
        request.bookFormat === 'audiobook' || request.bookFormat === 'both'
    );
    const ebookCovered = hasEbookServiceLink || hasActiveEbookRequest;
    const audiobookCovered =
      hasAudiobookServiceLink || hasActiveAudiobookRequest;

    if (ebookCovered && !audiobookCovered) {
      setBookFormat('audiobook');
    } else if (!ebookCovered && audiobookCovered) {
      setBookFormat('ebook');
    }
  }, [data?.mediaInfo, editRequest, hasUserSelectedFormat]);

  useEffect(() => {
    onUpdating?.(isUpdating);
  }, [isUpdating, onUpdating]);

  const hasAutoApprove = hasAutoApprovePermission(
    requestOverrides?.user?.permissions ?? user?.permissions ?? 0,
    'book'
  );

  const getOverrideParams = useCallback(() => {
    if (!requestOverrides) {
      return {};
    }

    return {
      serverId: requestOverrides.server,
      profileId: requestOverrides.profile,
      metadataProfileId: requestOverrides.metadataProfile,
      rootFolder: requestOverrides.folder,
      userId: requestOverrides.user?.id,
      tags: requestOverrides.tags,
    };
  }, [requestOverrides]);

  const handleBookFormatChange = (value: 'ebook' | 'audiobook') => {
    if (bookServices && !formatAvailable[value]) {
      return;
    }

    setHasUserSelectedFormat(true);
    setRequestOverrides(null);
    setBookFormat(value);
  };

  const formatWarning =
    bookServices && !formatAvailable[bookFormat]
      ? bookFormat === 'ebook'
        ? messages.noEbookServer
        : messages.noAudiobookServer
      : null;
  const formatLabel = intl.formatMessage(getBookFormatMessage(bookFormat));
  const requestLabel = intl.formatMessage(messages.requestbook);
  const canUseAdvancedOptions = hasPermission(
    [Permission.REQUEST_ADVANCED, Permission.MANAGE_REQUESTS],
    { type: 'or' }
  );
  const notAvailable = intl.formatMessage(messages.notAvailable);
  const serviceLabel =
    selectedService?.name ??
    (bookFormat === 'audiobook'
      ? defaultAudiobookService?.name
      : defaultEbookService?.name) ??
    notAvailable;
  const genres = data?.subjects?.slice(0, 3).join(', ') || notAvailable;
  const requestButtonLabel = isUpdating
    ? intl.formatMessage(globalMessages.requesting)
    : intl.formatMessage(globalMessages.request);

  const formatOptions = [
    {
      label: intl.formatMessage(messages.ebook),
      value: 'ebook' as const,
      disabled: !formatAvailable.ebook,
    },
    {
      label: intl.formatMessage(messages.audiobook),
      value: 'audiobook' as const,
      disabled: !formatAvailable.audiobook,
    },
  ];

  const handlePreferredLanguageChange = (language: string) => {
    setAppliedPreferenceUserId(preferenceUserId ?? null);
    setPreferredLanguage(language);
    const matchingEdition = language
      ? visibleEditionCandidates.find((candidate) =>
          candidate.languages?.includes(language)
        )
      : undefined;
    setSelectedIsbn(matchingEdition?.isbn ?? '');
  };

  const sendRequest = useCallback(async () => {
    if (selectedDestinationCovered) {
      return;
    }

    setIsUpdating(true);

    try {
      const selectedEdition = data?.isbnCandidates?.find(
        (candidate) => candidate.isbn === selectedIsbn
      );
      const response = await axios.post<MediaRequest>('/api/v1/request', {
        mediaId: data?.id
          ? normalizeOpenLibraryWorkId(data.id)
          : normalizedBookId,
        mediaType: MediaType.BOOK,
        isbn13: selectedIsbn || data?.isbn13,
        editionId: selectedEdition?.editionId ?? data?.editionId,
        preferredIsbn13: selectedIsbn || undefined,
        preferredEditionId:
          editionChoice.editionId ?? selectedEdition?.editionId,
        ...(editionChoice.editionId
          ? {
              editionPolicy: editionChoice.policy,
              variantKey: editionChoice.variantKey,
            }
          : {}),
        authorId: data?.authorId,
        format: bookFormat,
        ...getOverrideParams(),
      });

      mutate('/api/v1/request?filter=all&take=10&sort=modified&skip=0');
      mutate('/api/v1/request/count');

      if (response.data) {
        if (response.data.status === MediaRequestStatus.FAILED) {
          addToast(intl.formatMessage(messages.backendRequestFailed), {
            appearance: 'error',
            autoDismiss: true,
          });
          return;
        }

        onComplete?.(
          response.data.status === MediaRequestStatus.APPROVED
            ? MediaStatus.PROCESSING
            : MediaStatus.PENDING
        );
        const formatLabel =
          bookFormat === 'ebook'
            ? intl.formatMessage(messages.ebook)
            : intl.formatMessage(messages.audiobook);
        addToast(
          <span>
            {intl.formatMessage(messages.requestSuccessWithFormat, {
              title: data?.title,
              format: formatLabel,
              strong: (msg: React.ReactNode) => <strong>{msg}</strong>,
            })}
          </span>,
          { appearance: 'success', autoDismiss: true }
        );
      }
    } catch {
      addToast(intl.formatMessage(messages.requesterror), {
        appearance: 'error',
        autoDismiss: true,
      });
    } finally {
      setIsUpdating(false);
    }
  }, [
    addToast,
    bookFormat,
    data?.authorId,
    data?.editionId,
    data?.id,
    data?.isbn13,
    data?.isbnCandidates,
    data?.title,
    intl,
    normalizedBookId,
    onComplete,
    getOverrideParams,
    selectedDestinationCovered,
    selectedIsbn,
    editionChoice,
  ]);

  const cancelRequest = async () => {
    setIsUpdating(true);

    try {
      const response = await axios.delete<MediaRequest>(
        `/api/v1/request/${editRequest?.id}`
      );
      mutate('/api/v1/request?filter=all&take=10&sort=modified&skip=0');
      mutate('/api/v1/request/count');

      if (response.status === 204) {
        onComplete?.(MediaStatus.UNKNOWN);
        addToast(
          <span>
            {intl.formatMessage(messages.requestCancel, {
              title: data?.title,
              strong: (msg: React.ReactNode) => <strong>{msg}</strong>,
            })}
          </span>,
          { appearance: 'success', autoDismiss: true }
        );
      }
    } catch {
      addToast(intl.formatMessage(messages.editerror), {
        appearance: 'error',
        autoDismiss: true,
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const updateRequest = async (alsoApproveRequest = false) => {
    setIsUpdating(true);

    try {
      await axios.put(`/api/v1/request/${editRequest?.id}`, {
        mediaType: MediaType.BOOK,
        format: bookFormat,
        ...getOverrideParams(),
      });

      if (alsoApproveRequest) {
        await axios.post(`/api/v1/request/${editRequest?.id}/approve`);
      }
      mutate('/api/v1/request?filter=all&take=10&sort=modified&skip=0');
      mutate('/api/v1/request/count');

      addToast(
        <span>
          {intl.formatMessage(
            alsoApproveRequest
              ? messages.requestApproved
              : messages.requestEdited,
            {
              title: data?.title,
              strong: (msg: React.ReactNode) => <strong>{msg}</strong>,
            }
          )}
        </span>,
        { appearance: 'success', autoDismiss: true }
      );

      onComplete?.(MediaStatus.PENDING);
    } catch {
      addToast(intl.formatMessage(messages.editerror), {
        appearance: 'error',
        autoDismiss: true,
      });
    } finally {
      setIsUpdating(false);
    }
  };

  if (editRequest) {
    const isOwner = editRequest.requestedBy.id === user?.id;

    return (
      <Modal
        loading={!data && !error}
        backgroundClickable
        onCancel={onCancel}
        title={intl.formatMessage(messages.pendingRequestFormat, {
          format: formatLabel,
        })}
        subTitle={data?.title}
        onOk={() =>
          hasPermission(Permission.MANAGE_REQUESTS)
            ? updateRequest(true)
            : hasPermission(Permission.REQUEST_ADVANCED)
              ? updateRequest()
              : cancelRequest()
        }
        okDisabled={isUpdating || !!formatWarning}
        okButtonProps={{
          buttonIcon:
            !hasPermission(Permission.MANAGE_REQUESTS) &&
            !hasPermission(Permission.REQUEST_ADVANCED)
              ? 'cancel'
              : undefined,
        }}
        secondaryButtonProps={{ buttonIcon: 'cancel' }}
        okText={
          hasPermission(Permission.MANAGE_REQUESTS)
            ? intl.formatMessage(messages.approve)
            : hasPermission(Permission.REQUEST_ADVANCED)
              ? intl.formatMessage(messages.edit)
              : intl.formatMessage(messages.cancel)
        }
        okButtonType={
          hasPermission(Permission.MANAGE_REQUESTS)
            ? 'success'
            : hasPermission(Permission.REQUEST_ADVANCED)
              ? 'primary'
              : 'danger'
        }
        onSecondary={
          isOwner &&
          hasPermission(
            [Permission.REQUEST_ADVANCED, Permission.MANAGE_REQUESTS],
            { type: 'or' }
          )
            ? () => cancelRequest()
            : undefined
        }
        secondaryDisabled={isUpdating}
        secondaryText={
          isOwner &&
          hasPermission(
            [Permission.REQUEST_ADVANCED, Permission.MANAGE_REQUESTS],
            { type: 'or' }
          )
            ? intl.formatMessage(messages.cancel)
            : undefined
        }
        secondaryButtonType="danger"
        cancelText={intl.formatMessage(messages.close)}
        cancelButtonType="danger"
        alignTop
        actionButtonSize="standard"
        dialogClass="app-card-main request-modal-site-surface sm:max-w-5xl"
      >
        <RequestMediaCard artwork={data?.posterPath} artworkType="book">
          <div className="app-card-inset refreshed-inset-surface rounded-lg border border-gray-700 p-3">
            {isOwner
              ? intl.formatMessage(messages.pendingapproval)
              : intl.formatMessage(messages.requestfrom, {
                  username: editRequest.requestedBy.displayName,
                })}
          </div>
          <MediaQualitySelect
            value={bookFormat}
            options={formatOptions}
            onChange={handleBookFormatChange}
            label={intl.formatMessage(messages.format)}
            autoSelectAvailable={false}
            purpose="request"
          />
          {formatWarning && (
            <div className="mt-4">
              <Alert title={intl.formatMessage(formatWarning)} type="warning" />
            </div>
          )}
          {(hasPermission(Permission.REQUEST_ADVANCED) ||
            hasPermission(Permission.MANAGE_REQUESTS)) && (
            <AdvancedRequester
              type="book"
              bookId={data?.id}
              is4k={false}
              bookFormat={bookFormat}
              mediaTitle={data?.title}
              posterPath={data?.posterPath}
              requestStatus={formatLabel}
              requestUser={editRequest.requestedBy}
              defaultOverrides={{
                folder: editRequest.rootFolder,
                metadataProfile: editRequest.metadataProfileId,
                profile: editRequest.profileId,
                server: editRequest.serverId,
                tags: editRequest.tags,
              }}
              onChange={(overrides) => setRequestOverrides(overrides)}
            />
          )}
        </RequestMediaCard>
      </Modal>
    );
  }

  return (
    <Modal
      loading={(!data && !error) || !quota}
      backgroundClickable
      onCancel={onCancel}
      onOk={sendRequest}
      hideActions
      alignTop
      okDisabled={
        isUpdating ||
        selectedDestinationAvailable ||
        quota?.book?.restricted ||
        !!formatWarning
      }
      title={requestLabel}
      okText={requestButtonLabel}
      okButtonType="primary"
      dialogClass="app-card-main request-modal-site-surface sm:max-w-5xl"
    >
      {(quota?.book?.limit ?? 0) > 0 && (
        <QuotaDisplay
          mediaType="book"
          quota={quota?.book}
          userOverride={
            requestOverrides?.user && requestOverrides.user.id !== user?.id
              ? requestOverrides?.user?.id
              : undefined
          }
        />
      )}
      <RequestMediaCard artwork={data?.posterPath} artworkType="book">
        <div className="app-card-inset refreshed-inset-surface detail-summary-card grid min-w-0 grid-cols-[64px_minmax(0,1fr)] gap-3 sm:grid-cols-[80px_minmax(0,1fr)]">
          <div className="detail-card-poster relative overflow-hidden rounded-lg ring-1 ring-gray-600">
            <CachedImage
              type="book"
              src={data?.posterPath || '/images/seerr_poster_not_found.png'}
              alt=""
              fill
              sizes="(min-width: 640px) 80px, 64px"
              className="object-cover"
            />
          </div>

          <div className="flex min-w-0 flex-col">
            <h3 className="detail-summary-title truncate text-lg leading-5 font-semibold text-white">
              {data?.title}
              {data?.firstPublishYear ? ` (${data.firstPublishYear})` : ''}
            </h3>

            <div className="detail-card-heading-spacing detail-three-column-grid grid min-h-0 min-w-0 flex-1 items-stretch">
              <div className="detail-paired-column-span min-w-0">
                <dl className="media-detail-rows detail-paired-columns refreshed-detail-text grid min-w-0 content-start text-xs">
                  <dt className="card:col-start-1 card:row-start-1 font-medium text-gray-100">
                    {intl.formatMessage(messages.mediaAndFormat)}:
                  </dt>
                  <dd className="card:col-start-3 card:row-start-1 m-0 truncate">
                    {intl.formatMessage(globalMessages.book)} · {formatLabel}
                  </dd>
                  <dt className="card:col-start-1 card:row-start-2 font-medium text-gray-100">
                    {intl.formatMessage(messages.firstPublished)}:
                  </dt>
                  <dd className="card:col-start-3 card:row-start-2 m-0 truncate">
                    {data?.firstPublishYear ?? notAvailable}
                  </dd>
                  <dt className="card:col-start-1 card:row-start-3 font-medium text-gray-100">
                    {intl.formatMessage(messages.pages)}:
                  </dt>
                  <dd className="card:col-start-3 card:row-start-3 m-0 truncate">
                    {data?.numberOfPages
                      ? intl.formatNumber(data.numberOfPages)
                      : notAvailable}
                  </dd>

                  <div className="media-detail-rows media-detail-column-divider card:col-span-1 card:col-start-5 card:row-span-3 card:row-start-1 col-span-2 grid min-w-0 grid-cols-[max-content_minmax(0,1fr)] content-start gap-x-3">
                    <dt className="font-medium text-gray-100">
                      {intl.formatMessage(messages.author)}:
                    </dt>
                    <dd className="m-0 truncate">
                      {data?.author || notAvailable}
                    </dd>
                    <dt className="font-medium text-gray-100">
                      {intl.formatMessage(messages.publisher)}:
                    </dt>
                    <dd className="m-0 truncate">
                      {data?.publisher || notAvailable}
                    </dd>
                  </div>

                  <dt className="card:col-start-1 card:row-start-4 font-medium text-gray-100">
                    {intl.formatMessage(messages.genres)}:
                  </dt>
                  <dd className="card:col-span-3 card:col-start-3 card:row-start-4 m-0 line-clamp-2 min-w-0 break-words">
                    {genres}
                  </dd>
                </dl>
              </div>

              <dl className="media-detail-rows media-detail-column-divider refreshed-detail-text grid h-full min-w-0 grid-cols-[max-content_minmax(0,1fr)] content-start gap-x-3 text-xs">
                <dt className="font-medium text-gray-100">
                  {intl.formatMessage(messages.status)}:
                </dt>
                <dd className="m-0 truncate">
                  {intl.formatMessage(
                    selectedDestinationAvailable
                      ? globalMessages.available
                      : selectedDestinationRequested
                        ? messages.requested
                        : messages.readyToRequest
                  )}
                </dd>
                <dt className="font-medium text-gray-100">
                  {intl.formatMessage(messages.service)}:
                </dt>
                <dd className="m-0 truncate">{serviceLabel}</dd>
                <dt className="font-medium text-gray-100">
                  {intl.formatMessage(messages.approval)}:
                </dt>
                <dd className="m-0 min-w-0">
                  <RequestFooterStatus
                    available={selectedDestinationAvailable}
                    requested={selectedDestinationRequested}
                    hasAutoApprove={hasAutoApprove}
                  />
                </dd>
              </dl>
            </div>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <MediaQualitySelect
            value={bookFormat}
            options={formatOptions}
            onChange={handleBookFormatChange}
            label={intl.formatMessage(messages.format)}
            autoSelectAvailable={false}
            purpose="request"
          />
          {!!data?.isbnCandidates?.length && (
            <div className="flex flex-wrap items-center gap-2">
              {!!editionLanguages.length && (
                <RequestListboxControl
                  id="edition-language"
                  label={intl.formatMessage({
                    id: 'components.Discover.FilterPanel.language',
                    defaultMessage: 'Language',
                  })}
                  value={preferredLanguage}
                  onChange={handlePreferredLanguageChange}
                  active={!!preferredLanguage}
                  loadingLabel={intl.formatMessage(globalMessages.all)}
                  options={[
                    {
                      value: '',
                      label: intl.formatMessage(globalMessages.all),
                    },
                    ...editionLanguages.map((language) => ({
                      value: language,
                      label: getEditionLanguageName(language, intl.locale),
                    })),
                  ]}
                />
              )}
              <RequestListboxControl
                id="isbn"
                label={intl.formatMessage(messages.edition)}
                value={selectedIsbn}
                onChange={(isbn) => {
                  setAppliedPreferenceUserId(preferenceUserId ?? null);
                  setSelectedIsbn(isbn);
                  setPreferredLanguage('');
                }}
                active={!!selectedIsbn}
                loadingLabel={intl.formatMessage(messages.automaticEdition)}
                options={[
                  {
                    value: '',
                    label: intl.formatMessage(messages.automaticEdition),
                  },
                  ...visibleEditionCandidates.map((candidate) => ({
                    value: candidate.isbn,
                    label: [candidate.isbn, candidate.title, candidate.format]
                      .concat(
                        (candidate.languages ?? []).map((language) =>
                          getEditionLanguageName(language, intl.locale)
                        )
                      )
                      .filter(Boolean)
                      .join(' - '),
                  })),
                ]}
              />
            </div>
          )}
        </div>
        {data && (
          <EditionCardPicker
            key={bookFormat}
            mediaId={
              bookFormat === 'audiobook'
                ? data.mediaInfo?.audiobookExternalServiceId !== undefined &&
                  data.mediaInfo?.audiobookExternalServiceId !== null
                  ? data.mediaInfo.id
                  : undefined
                : data.mediaInfo?.externalServiceId !== undefined &&
                    data.mediaInfo?.externalServiceId !== null
                  ? data.mediaInfo.id
                  : undefined
            }
            format={bookFormat}
            title={data.title}
            author={data.author}
            value={editionChoice}
            onChange={setEditionChoice}
          />
        )}
        {formatWarning && (
          <div className="mt-2">
            <Alert title={intl.formatMessage(formatWarning)} type="warning" />
          </div>
        )}

        {canUseAdvancedOptions && (
          <AdvancedRequester
            key={bookFormat}
            type="book"
            bookId={data?.id}
            is4k={false}
            bookFormat={bookFormat}
            mediaTitle={data?.title}
            posterPath={data?.posterPath}
            requestStatus={formatLabel}
            expanded={advancedOptionsOpen}
            panelOnly
            rootFolderTable
            requestedByPortal={requestedByPortal}
            onChange={(overrides) => setRequestOverrides(overrides)}
          />
        )}

        <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
          <div className="mr-auto flex items-center gap-2">
            {canUseAdvancedOptions && (
              <AdvancedOptionsDisclosureButton
                label={intl.formatMessage(messages.advancedOptions)}
                controlVariant="book-request-advanced-options"
                open={advancedOptionsOpen}
                pinned={advancedOptionsPinned}
                onToggle={toggleAdvancedOptions}
                onPin={toggleAdvancedOptionsPin}
              />
            )}
          </div>
          <div
            className="compact-control flex items-center"
            ref={setRequestedByPortal}
          />
          <button
            type="button"
            onClick={onCancel}
            data-testid="modal-cancel-button"
            className="app-button app-button-danger button-standard"
          >
            <XMarkIcon aria-hidden="true" />
            {intl.formatMessage(globalMessages.cancel)}
          </button>
          <button
            type="button"
            onClick={() => void sendRequest()}
            data-testid="modal-ok-button"
            disabled={
              isUpdating ||
              selectedDestinationCovered ||
              quota?.book?.restricted ||
              !!formatWarning
            }
            className="app-button app-button-success button-standard"
          >
            <ArrowDownTrayIcon aria-hidden="true" />
            {requestButtonLabel}
          </button>
        </div>
      </RequestMediaCard>
    </Modal>
  );
};

export default BookRequestModal;
