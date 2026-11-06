import Button, { type ButtonType } from '@app/components/Common/Button';
import FormatRequestControl from '@app/components/Common/FormatRequestControl';
import { isVideoQualityAvailable } from '@app/components/RequestModal/requestAvailability';
import useSettings from '@app/hooks/useSettings';
import useToasts from '@app/hooks/useToasts';
import { Permission, useUser } from '@app/hooks/useUser';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import { InformationCircleIcon } from '@heroicons/react/24/solid';
import { MediaRequestStatus, MediaStatus } from '@server/constants/media';
import type Media from '@server/entity/Media';
import type { MediaRequest } from '@server/entity/MediaRequest';
import type { ServiceCommonServer } from '@server/interfaces/api/serviceInterfaces';
import type { FormatRequestOption } from '@app/components/Common/FormatRequestControl';
import { hasAutoApprovePermission } from '@server/lib/permissions';
import axios from 'axios';
import dynamic from 'next/dynamic';
import { useMemo, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR, { mutate } from 'swr';

const RequestModal = dynamic(() => import('@app/components/RequestModal'), {
  ssr: false,
});

const messages = defineMessages('components.RequestButton', {
  viewrequest: 'View Request',
  viewrequest4k: 'View 4K Request',
  requestmore: 'Request More',
  requestmore4k: 'Request More in 4K',
  requestupdatesfailed:
    '{failed, plural, one {One request could not be updated.} other {{failed} requests could not be updated.}}',
  hd: 'HD',
  pendingFormat: 'An open pending request already exists for this format.',
  availableFormat: 'This format is already available.',
  unavailableFormat: 'This format cannot be requested in the current state.',
  noService: 'No service is configured for this format.',
  blocklisted: 'This title is blocklisted.',
  addYourTag: 'Add Your Tag',
  tagFormatOption: '{quality} · Add Your Tag',
  tagRequestPending: 'Your tag request is already waiting for this service.',
});

interface ButtonOption {
  id: string;
  text: string;
  action: () => void;
  svg?: React.ReactNode;
  buttonType?: ButtonType;
}

interface RequestFormatOption extends FormatRequestOption {
  requesterTagOnly?: boolean;
  serverId?: number;
  buttonLabel?: string;
}

interface RequestButtonProps {
  mediaType: 'movie' | 'tv';
  onUpdate: () => void;
  tmdbId: number;
  media?: Media;
  isShowComplete?: boolean;
  is4kShowComplete?: boolean;
  buttonSize?: 'standard' | 'default' | 'sm';
  buttonType?: 'primary' | 'ghost' | 'success' | 'detailRequest';
  className?: string;
  singleRequestEntry?: boolean;
}

const RequestButton = ({
  tmdbId,
  onUpdate,
  media,
  mediaType,
  isShowComplete = false,
  is4kShowComplete = false,
  buttonSize = 'standard',
  buttonType = 'primary',
  className,
  singleRequestEntry = false,
}: RequestButtonProps) => {
  const intl = useIntl();
  const settings = useSettings();
  const { addToast } = useToasts();
  const { user, hasPermission } = useUser();
  const serviceType = mediaType === 'movie' ? 'radarr' : 'sonarr';
  const { data: requestServices } = useSWR<ServiceCommonServer[]>(
    `/api/v1/service/${serviceType}`
  );
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [showRequest4kModal, setShowRequest4kModal] = useState(false);
  const [requestInitialServerId, setRequestInitialServerId] =
    useState<number>();
  const [requesterTagOnlyAction, setRequesterTagOnlyAction] = useState(false);
  const [editRequest, setEditRequest] = useState(false);
  const [isModifying, setIsModifying] = useState(false);
  const modificationActiveRef = useRef(false);
  const canSelectAnyTagDestination = hasPermission(
    [Permission.ADMIN, Permission.MANAGE_REQUESTS, Permission.REQUEST_ADVANCED],
    { type: 'or' }
  );
  const getRequesterTagService = (is4k: boolean) => {
    if (!user) {
      return undefined;
    }

    const configuredServices = (requestServices ?? [])
      .filter(
        (service) =>
          service.is4k === is4k &&
          service.tagRequests === true &&
          (canSelectAnyTagDestination ||
            service.isDefault ||
            user.requestServices?.includes(`${serviceType}:${service.id}`)) &&
          (service.isDefault ||
            canSelectAnyTagDestination ||
            Boolean(service.requestButtonLabel?.trim())) &&
          media?.serviceStatuses?.some(
            (status) =>
              status.serviceType === serviceType &&
              status.serverId === service.id &&
              status.format === (is4k ? '4k' : 'standard') &&
              status.status === MediaStatus.AVAILABLE
          )
      )
      .sort(
        (left, right) =>
          Number(right.isDefault) - Number(left.isDefault) || left.id - right.id
      );

    return configuredServices[0];
  };
  const hasOwnActiveRequestForTagService = (serverId: number, is4k: boolean) =>
    (media?.requests ?? []).some(
      (request) =>
        request.requestedBy?.id === user?.id &&
        (request.status === MediaRequestStatus.PENDING ||
          request.status === MediaRequestStatus.APPROVED) &&
        (request.serviceTargets?.length
          ? request.serviceTargets.some(
              (target) =>
                target.serviceType === serviceType &&
                target.serverId === serverId &&
                target.format === (is4k ? '4k' : 'standard')
            )
          : request.type === mediaType &&
            request.serverId === serverId &&
            request.is4k === is4k)
    );
  const openRequestModal = (
    is4k: boolean,
    tagOnly = false,
    serverId?: number
  ) => {
    setEditRequest(false);
    setRequestInitialServerId(serverId);
    setRequesterTagOnlyAction(tagOnly);
    if (is4k) {
      setShowRequest4kModal(true);
    } else {
      setShowRequestModal(true);
    }
  };

  // All pending requests
  const activeRequests = media?.requests.filter(
    (request) => request.status === MediaRequestStatus.PENDING && !request.is4k
  );
  const active4kRequests = media?.requests.filter(
    (request) => request.status === MediaRequestStatus.PENDING && request.is4k
  );

  // Current user's pending request, or the first pending request
  const activeRequest = useMemo(() => {
    return activeRequests && activeRequests.length > 0
      ? (activeRequests.find(
          (request) => request.requestedBy?.id === user?.id
        ) ?? activeRequests[0])
      : undefined;
  }, [activeRequests, user]);
  const active4kRequest = useMemo(() => {
    return active4kRequests && active4kRequests.length > 0
      ? (active4kRequests.find(
          (request) => request.requestedBy?.id === user?.id
        ) ?? active4kRequests[0])
      : undefined;
  }, [active4kRequests, user]);

  const modifyRequest = async (
    request: MediaRequest,
    type: 'approve' | 'decline'
  ) => {
    if (modificationActiveRef.current) {
      return;
    }
    modificationActiveRef.current = true;
    setIsModifying(true);

    try {
      await axios.post(`/api/v1/request/${request.id}/${type}`);

      onUpdate();
      void mutate('/api/v1/request/count').catch(() => undefined);
    } catch {
      addToast(
        intl.formatMessage(messages.requestupdatesfailed, { failed: 1 }),
        {
          appearance: 'error',
          autoDismiss: true,
        }
      );
    } finally {
      modificationActiveRef.current = false;
      setIsModifying(false);
    }
  };

  const buttons: ButtonOption[] = [];

  // If there are pending requests, show request management options first
  if (activeRequest || active4kRequest) {
    if (
      activeRequest &&
      (activeRequest.requestedBy?.id === user?.id ||
        (activeRequests?.length === 1 &&
          hasPermission(Permission.MANAGE_REQUESTS)))
    ) {
      buttons.push({
        id: 'active-request',
        text: intl.formatMessage(messages.viewrequest),
        action: () => {
          const tagTarget = activeRequest.serviceTargets?.find(
            (target) => target.requesterTagOnly
          );
          setRequestInitialServerId(tagTarget?.serverId);
          setRequesterTagOnlyAction(Boolean(tagTarget));
          setEditRequest(true);
          setShowRequestModal(true);
        },
        svg: <InformationCircleIcon />,
      });
    }

    if (
      active4kRequest &&
      (active4kRequest.requestedBy?.id === user?.id ||
        (active4kRequests?.length === 1 &&
          hasPermission(Permission.MANAGE_REQUESTS)))
    ) {
      buttons.push({
        id: 'active-4k-request',
        text: intl.formatMessage(messages.viewrequest4k),
        action: () => {
          const tagTarget = active4kRequest.serviceTargets?.find(
            (target) => target.requesterTagOnly
          );
          setRequestInitialServerId(tagTarget?.serverId);
          setRequesterTagOnlyAction(Boolean(tagTarget));
          setEditRequest(true);
          setShowRequest4kModal(true);
        },
        svg: <InformationCircleIcon />,
      });
    }
  }

  // Standard request button
  if (
    (!media ||
      media.status === MediaStatus.UNKNOWN ||
      (media.status === MediaStatus.DELETED && !activeRequest)) &&
    hasPermission(
      [
        Permission.REQUEST,
        mediaType === 'movie'
          ? Permission.REQUEST_MOVIE
          : Permission.REQUEST_TV,
      ],
      { type: 'or' }
    )
  ) {
    buttons.push({
      id: 'request',
      text: intl.formatMessage(globalMessages.request),
      action: () => {
        openRequestModal(false);
      },
      svg: <ArrowDownTrayIcon />,
    });
  } else if (
    mediaType === 'tv' &&
    (!activeRequest || activeRequest.requestedBy?.id !== user?.id) &&
    hasPermission([Permission.REQUEST, Permission.REQUEST_TV], {
      type: 'or',
    }) &&
    media &&
    media.status !== MediaStatus.BLOCKLISTED &&
    !isShowComplete
  ) {
    buttons.push({
      id: 'request-more',
      text: intl.formatMessage(messages.requestmore),
      action: () => {
        openRequestModal(false);
      },
      svg: <ArrowDownTrayIcon />,
    });
  }

  // 4K request button
  if (
    (!media ||
      media.status4k === MediaStatus.UNKNOWN ||
      (media.status4k === MediaStatus.DELETED && !active4kRequest)) &&
    hasPermission(
      [
        Permission.REQUEST_4K,
        mediaType === 'movie'
          ? Permission.REQUEST_4K_MOVIE
          : Permission.REQUEST_4K_TV,
      ],
      { type: 'or' }
    ) &&
    ((settings.currentSettings.movie4kEnabled && mediaType === 'movie') ||
      (settings.currentSettings.series4kEnabled && mediaType === 'tv'))
  ) {
    buttons.push({
      id: 'request4k',
      text: intl.formatMessage(globalMessages.request4k),
      action: () => {
        openRequestModal(true);
      },
      svg: <ArrowDownTrayIcon />,
    });
  } else if (
    mediaType === 'tv' &&
    (!active4kRequest || active4kRequest.requestedBy?.id !== user?.id) &&
    hasPermission([Permission.REQUEST_4K, Permission.REQUEST_4K_TV], {
      type: 'or',
    }) &&
    media &&
    media.status4k !== MediaStatus.BLOCKLISTED &&
    !is4kShowComplete &&
    settings.currentSettings.series4kEnabled
  ) {
    buttons.push({
      id: 'request-more-4k',
      text: intl.formatMessage(messages.requestmore4k),
      action: () => {
        openRequestModal(true);
      },
      svg: <ArrowDownTrayIcon />,
    });
  }

  const requestActionIds = new Set([
    'request',
    'request-more',
    'request4k',
    'request-more-4k',
  ]);
  const nonRequestButtons = buttons.filter(
    (button) => !requestActionIds.has(button.id)
  );
  const standardRequestButton = buttons.find(
    (button) => button.id === 'request' || button.id === 'request-more'
  );
  const request4kButton = buttons.find(
    (button) => button.id === 'request4k' || button.id === 'request-more-4k'
  );
  const canRequestStandard = hasPermission(
    [
      Permission.REQUEST,
      mediaType === 'movie' ? Permission.REQUEST_MOVIE : Permission.REQUEST_TV,
    ],
    { type: 'or' }
  );
  const canRequest4k =
    ((settings.currentSettings.movie4kEnabled && mediaType === 'movie') ||
      (settings.currentSettings.series4kEnabled && mediaType === 'tv')) &&
    hasPermission(
      [
        Permission.REQUEST_4K,
        mediaType === 'movie'
          ? Permission.REQUEST_4K_MOVIE
          : Permission.REQUEST_4K_TV,
      ],
      { type: 'or' }
    );
  const canChooseAlternateTarget = hasPermission(
    [Permission.REQUEST_ADVANCED, Permission.MANAGE_REQUESTS],
    { type: 'or' }
  );
  const hasStandardService =
    requestServices === undefined ||
    requestServices.some((service) => !service.is4k);
  const has4kService =
    requestServices === undefined ||
    requestServices.some((service) => service.is4k);
  const isBlocklisted = media?.status === MediaStatus.BLOCKLISTED;
  const canApproveStandard =
    !!user &&
    !!activeRequest &&
    hasAutoApprovePermission(user.permissions, mediaType);
  const canApprove4k =
    !!user &&
    !!active4kRequest &&
    hasAutoApprovePermission(user.permissions, mediaType, true);
  const standardIsAvailable = isVideoQualityAvailable(media, mediaType);
  const fourKIsAvailable = isVideoQualityAvailable(media, mediaType, true);
  const standardTagService = getRequesterTagService(false);
  const fourKTagService = getRequesterTagService(true);
  const standardTagRequestPending = Boolean(
    standardTagService &&
    hasOwnActiveRequestForTagService(standardTagService.id, false)
  );
  const fourKTagRequestPending = Boolean(
    fourKTagService &&
    hasOwnActiveRequestForTagService(fourKTagService.id, true)
  );
  const canOpenStandardAlternate =
    canChooseAlternateTarget && hasStandardService && !isBlocklisted;
  const canOpen4kAlternate =
    canChooseAlternateTarget && has4kService && !isBlocklisted;
  const requestOptions: RequestFormatOption[] = [
    ...(canRequestStandard
      ? [
          {
            id: 'standard',
            label: standardTagService
              ? intl.formatMessage(messages.tagFormatOption, { quality: 'HD' })
              : intl.formatMessage(messages.hd),
            onClick: standardTagService
              ? () => openRequestModal(false, true, standardTagService.id)
              : standardRequestButton
                ? standardRequestButton.action
                : canApproveStandard && activeRequest
                  ? () => void modifyRequest(activeRequest, 'approve')
                  : () => openRequestModal(false),
            disabled: standardTagService
              ? standardTagRequestPending || isBlocklisted
              : standardIsAvailable ||
                !hasStandardService ||
                isBlocklisted ||
                (!standardRequestButton &&
                  !(canApproveStandard && activeRequest) &&
                  !canOpenStandardAlternate),
            disabledReason: standardTagService
              ? isBlocklisted
                ? intl.formatMessage(messages.blocklisted)
                : standardTagRequestPending
                  ? intl.formatMessage(messages.tagRequestPending)
                  : undefined
              : standardIsAvailable
                ? intl.formatMessage(messages.availableFormat)
                : !hasStandardService
                  ? intl.formatMessage(messages.noService)
                  : isBlocklisted
                    ? intl.formatMessage(messages.blocklisted)
                    : activeRequest
                      ? intl.formatMessage(messages.pendingFormat)
                      : intl.formatMessage(messages.unavailableFormat),
            requesterTagOnly: Boolean(standardTagService),
            serverId: standardTagService?.id,
            buttonLabel: standardTagService
              ? intl.formatMessage(messages.addYourTag)
              : undefined,
          },
        ]
      : []),
    ...(canRequest4k
      ? [
          {
            id: '4k',
            label: fourKTagService
              ? intl.formatMessage(messages.tagFormatOption, { quality: '4K' })
              : '4K',
            onClick: fourKTagService
              ? () => openRequestModal(true, true, fourKTagService.id)
              : request4kButton
                ? request4kButton.action
                : canApprove4k && active4kRequest
                  ? () => void modifyRequest(active4kRequest, 'approve')
                  : () => openRequestModal(true),
            disabled: fourKTagService
              ? fourKTagRequestPending || isBlocklisted
              : fourKIsAvailable ||
                !has4kService ||
                isBlocklisted ||
                (!request4kButton &&
                  !(canApprove4k && active4kRequest) &&
                  !canOpen4kAlternate),
            disabledReason: fourKTagService
              ? isBlocklisted
                ? intl.formatMessage(messages.blocklisted)
                : fourKTagRequestPending
                  ? intl.formatMessage(messages.tagRequestPending)
                  : undefined
              : fourKIsAvailable
                ? intl.formatMessage(messages.availableFormat)
                : !has4kService
                  ? intl.formatMessage(messages.noService)
                  : isBlocklisted
                    ? intl.formatMessage(messages.blocklisted)
                    : active4kRequest
                      ? intl.formatMessage(messages.pendingFormat)
                      : intl.formatMessage(messages.unavailableFormat),
            requesterTagOnly: Boolean(fourKTagService),
            serverId: fourKTagService?.id,
            buttonLabel: fourKTagService
              ? intl.formatMessage(messages.addYourTag)
              : undefined,
          },
        ]
      : []),
  ];

  if (nonRequestButtons.length === 0 && requestOptions.length === 0) {
    return null;
  }

  const entryOption = requestOptions.find((option) => !option.disabled);
  const openRequestScreen = () => {
    if (!entryOption || isModifying) {
      return;
    }
    const is4k = entryOption.id === '4k';
    const pendingRequest = is4k ? active4kRequest : activeRequest;
    setRequestInitialServerId(entryOption.serverId);
    setRequesterTagOnlyAction(entryOption.requesterTagOnly ?? false);
    setEditRequest(
      !entryOption.requesterTagOnly &&
        !!pendingRequest &&
        (pendingRequest.requestedBy?.id === user?.id ||
          hasPermission(Permission.MANAGE_REQUESTS))
    );
    if (is4k) {
      setShowRequest4kModal(true);
    } else {
      setShowRequestModal(true);
    }
  };

  return (
    <>
      {showRequestModal && (
        <RequestModal
          tmdbId={tmdbId}
          show={showRequestModal}
          type={mediaType}
          show4kSelector
          initialServerId={requestInitialServerId}
          requesterTagOnly={requesterTagOnlyAction}
          editRequest={editRequest ? activeRequest : undefined}
          onComplete={() => {
            onUpdate();
            setShowRequestModal(false);
          }}
          onCancel={() => setShowRequestModal(false)}
        />
      )}
      {showRequest4kModal && (
        <RequestModal
          tmdbId={tmdbId}
          show={showRequest4kModal}
          type={mediaType}
          show4kSelector
          initialServerId={requestInitialServerId}
          requesterTagOnly={requesterTagOnlyAction}
          editRequest={editRequest ? active4kRequest : undefined}
          is4k
          onComplete={() => {
            onUpdate();
            setShowRequest4kModal(false);
          }}
          onCancel={() => setShowRequest4kModal(false)}
        />
      )}
      {nonRequestButtons.map((button) => (
        <Button
          key={`request-option-${button.id}`}
          buttonSize={buttonSize}
          buttonType={button.buttonType ?? buttonType}
          onClick={button.action}
          disabled={isModifying}
          className={className}
        >
          {button.svg}
          <span>{button.text}</span>
        </Button>
      ))}
      {singleRequestEntry ? (
        requestOptions.length > 0 && (
          <Button
            buttonSize={buttonSize}
            buttonType={buttonType}
            onClick={openRequestScreen}
            disabled={!entryOption || isModifying}
            disabledReason={
              !entryOption ? requestOptions[0]?.disabledReason : undefined
            }
            className={className}
          >
            <ArrowDownTrayIcon aria-hidden="true" />
            <span>
              {entryOption?.buttonLabel ??
                intl.formatMessage(globalMessages.request)}
            </span>
          </Button>
        )
      ) : (
        <FormatRequestControl options={requestOptions} className={className} />
      )}
    </>
  );
};

export default RequestButton;
