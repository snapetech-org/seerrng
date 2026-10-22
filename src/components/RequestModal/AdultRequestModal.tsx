import Alert from '@app/components/Common/Alert';
import Modal from '@app/components/Common/Modal';
import QuotaDisplay from '@app/components/RequestModal/QuotaDisplay';
import useSettings from '@app/hooks/useSettings';
import useToasts from '@app/hooks/useToasts';
import { Permission, useUser } from '@app/hooks/useUser';
import globalMessages from '@app/i18n/globalMessages';
import { encodeApiPathSegment } from '@app/utils/apiPath';
import defineMessages from '@app/utils/defineMessages';
import { getUserServiceAvailability } from '@app/utils/serviceAvailability';
import { MediaRequestStatus, MediaStatus } from '@server/constants/media';
import type { MediaRequest } from '@server/entity/MediaRequest';
import type { NonFunctionProperties } from '@server/interfaces/api/common';
import type { WhisparrServiceOption } from '@server/interfaces/api/serviceInterfaces';
import type { QuotaResponse } from '@server/interfaces/api/userInterfaces';
import type { AdultDetails } from '@server/models/Adult';
import axios from 'axios';
import { useCallback, useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR, { mutate, useSWRConfig } from 'swr';

const messages = defineMessages('components.RequestModal.Adult', {
  request: 'Request scene',
  cancelRequest: 'Cancel request',
  success: '<strong>{title}</strong> requested successfully.',
  cancelled: 'Request for <strong>{title}</strong> canceled.',
  submitError: 'Something went wrong while submitting the request.',
  cancelError: 'Something went wrong while canceling the request.',
  backendError:
    'Whisparr could not accept this scene request. Check the service and try again.',
  detailsUnavailable: 'Whisparr scene details could not be loaded.',
  quotaUnavailable:
    'Your Adult request limit could not be checked. Try again in a moment.',
  permission: 'You do not have permission to request adult media.',
  categoryDisabled: 'Adult requests are disabled by the administrator.',
  pending: 'Your adult scene request is waiting for approval.',
  approved: 'Your adult scene request was approved and is being processed.',
  requestFor: "{username}'s request is waiting for approval.",
  requestForApproved:
    "{username}'s request was approved and is being processed.",
  studio: 'Studio',
  year: 'Year',
  service: 'Whisparr server',
  defaultService: 'Default ({name})',
  noService: 'No Whisparr server is configured.',
  serviceUnavailable:
    'No usable Whisparr destination is available. Ask an administrator to check the service settings.',
  available: 'This scene is already available on this server.',
  processing: 'This scene is already being processed on this server.',
});

interface AdultRequestModalProps {
  adultId: string;
  adultRequestId?: number;
  adultRequestStatus?: MediaRequestStatus;
  initialServerId?: number;
  onCancel?: () => void;
  onComplete?: (newStatus: MediaStatus) => void;
  onUpdating?: (isUpdating: boolean) => void;
  editRequest?: NonFunctionProperties<MediaRequest>;
}

const AdultRequestModal = ({
  adultId,
  adultRequestId,
  adultRequestStatus,
  initialServerId,
  onCancel,
  onComplete,
  onUpdating,
  editRequest,
}: AdultRequestModalProps) => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const { user, hasPermission } = useUser();
  const { currentSettings } = useSettings();
  const serviceAvailability = getUserServiceAvailability(
    currentSettings,
    user?.settings?.enabledMediaCategories,
    hasPermission(Permission.ADMIN)
  );
  const { mutate: mutateCache } = useSWRConfig();
  const [isUpdating, setIsUpdating] = useState(false);
  const [selectedServerId, setSelectedServerId] = useState<number | undefined>(
    initialServerId
  );
  const { data: services, error: servicesError } = useSWR<
    WhisparrServiceOption[]
  >('/api/v1/service/whisparr');
  const canUseAdvancedOptions = hasPermission(
    [Permission.REQUEST_ADVANCED, Permission.MANAGE_REQUESTS],
    { type: 'or' }
  );
  const defaultService = services?.find((service) => service.isDefault);
  const serviceIdForDetails = canUseAdvancedOptions
    ? (selectedServerId ?? defaultService?.id)
    : defaultService?.id;
  const serviceUnavailable = Boolean(
    servicesError ||
    (services &&
      (services.length === 0 || (!canUseAdvancedOptions && !defaultService)))
  );
  const detailUrl = `/api/v1/adult/${encodeApiPathSegment(adultId)}${
    serviceIdForDetails !== undefined ? `?serverId=${serviceIdForDetails}` : ''
  }`;
  const {
    data,
    error: detailsError,
    mutate: revalidateDetails,
  } = useSWR<AdultDetails>(detailUrl);
  const { data: quota, error: quotaError } = useSWR<QuotaResponse>(
    user ? `/api/v1/user/${user.id}/quota` : null
  );
  const requestId =
    editRequest?.id ?? adultRequestId ?? data?.mediaInfo?.requestId;
  const canRequest = hasPermission(
    [Permission.ADMIN, Permission.MANAGE_REQUESTS, Permission.REQUEST_ADULT],
    { type: 'or' }
  );
  const categoryEnabled =
    serviceAvailability.adultEnabled &&
    serviceAvailability.enabledMediaCategories?.adult !== false;
  const isQuotaRestricted = quota?.adult?.restricted ?? false;
  const detailsUnavailable = Boolean(detailsError);
  const quotaUnavailable = Boolean(quotaError);
  const isAvailable =
    data?.mediaInfo?.status === MediaStatus.AVAILABLE ||
    data?.mediaInfo?.status === MediaStatus.PARTIALLY_AVAILABLE;
  const isProcessing = data?.mediaInfo?.status === MediaStatus.PROCESSING;
  const destinationSatisfied = isAvailable || isProcessing;
  const selectedService = services?.find(
    (service) => service.id === selectedServerId
  );
  const displayedService = canUseAdvancedOptions
    ? (selectedService ?? defaultService)
    : defaultService;

  useEffect(() => onUpdating?.(isUpdating), [isUpdating, onUpdating]);

  const refreshRequests = useCallback(async () => {
    await Promise.all([
      revalidateDetails(),
      mutate('/api/v1/request/count'),
      mutate('/api/v1/request?filter=all&take=10&sort=modified&skip=0'),
      mutateCache(
        (key) =>
          typeof key === 'string' && key.startsWith('/api/v1/request/status')
      ),
      mutateCache(
        (key) =>
          typeof key === 'string' && key.startsWith('/api/v1/adult/search')
      ),
    ]);
  }, [mutateCache, revalidateDetails]);

  const sendRequest = useCallback(async () => {
    if (
      !data ||
      detailsUnavailable ||
      !canRequest ||
      !categoryEnabled ||
      isQuotaRestricted ||
      !quota ||
      quotaUnavailable ||
      destinationSatisfied ||
      serviceUnavailable
    ) {
      return;
    }
    setIsUpdating(true);
    try {
      const response = await axios.post<MediaRequest>('/api/v1/request', {
        mediaId: adultId,
        mediaType: 'adult',
        ...(canUseAdvancedOptions && selectedServerId !== undefined
          ? { serverId: selectedServerId }
          : {}),
      });
      await refreshRequests();
      if (response.data?.status === MediaRequestStatus.FAILED) {
        addToast(intl.formatMessage(messages.backendError), {
          appearance: 'error',
          autoDismiss: true,
        });
        return;
      }
      onComplete?.(
        response.data.status === MediaRequestStatus.APPROVED ||
          response.data.status === MediaRequestStatus.COMPLETED
          ? MediaStatus.PROCESSING
          : MediaStatus.PENDING
      );
      addToast(
        <span>
          {intl.formatMessage(messages.success, {
            title: data.title,
            strong: (text: React.ReactNode) => <strong>{text}</strong>,
          })}
        </span>,
        { appearance: 'success', autoDismiss: true }
      );
    } catch (error) {
      const responseMessage = axios.isAxiosError<{ message?: unknown }>(error)
        ? error.response?.data?.message
        : undefined;
      addToast(
        typeof responseMessage === 'string' && responseMessage
          ? responseMessage
          : intl.formatMessage(messages.submitError),
        { appearance: 'error', autoDismiss: true }
      );
    } finally {
      setIsUpdating(false);
    }
  }, [
    addToast,
    adultId,
    canRequest,
    canUseAdvancedOptions,
    categoryEnabled,
    data,
    detailsUnavailable,
    destinationSatisfied,
    intl,
    isQuotaRestricted,
    quota,
    quotaUnavailable,
    onComplete,
    refreshRequests,
    selectedServerId,
    serviceUnavailable,
  ]);

  const cancelRequest = async () => {
    if (!requestId) return;
    setIsUpdating(true);
    try {
      const response = await axios.delete(`/api/v1/request/${requestId}`);
      await refreshRequests();
      if (response.status === 204) {
        onComplete?.(MediaStatus.UNKNOWN);
        addToast(
          <span>
            {intl.formatMessage(messages.cancelled, {
              title: data?.title ?? adultId,
              strong: (text: React.ReactNode) => <strong>{text}</strong>,
            })}
          </span>,
          { appearance: 'success', autoDismiss: true }
        );
      }
    } catch {
      addToast(intl.formatMessage(messages.cancelError), {
        appearance: 'error',
        autoDismiss: true,
      });
    } finally {
      setIsUpdating(false);
    }
  };

  if (editRequest || requestId !== undefined) {
    const isOwner = !editRequest || editRequest.requestedBy.id === user?.id;
    const requestStatus =
      editRequest?.status ??
      adultRequestStatus ??
      data?.mediaInfo?.requestStatus;
    const isApproved = requestStatus === MediaRequestStatus.APPROVED;
    return (
      <Modal
        backgroundClickable
        onCancel={onCancel}
        title={intl.formatMessage(messages.cancelRequest)}
        subTitle={data?.title ?? adultId}
        onOk={() => void cancelRequest()}
        okDisabled={isUpdating}
        okText={intl.formatMessage(messages.cancelRequest)}
        okButtonType="danger"
        cancelText={intl.formatMessage(globalMessages.close)}
        cancelButtonType="default"
      >
        <div className="app-card-inset refreshed-inset-surface rounded-lg border border-gray-700 p-3">
          {isOwner
            ? intl.formatMessage(
                isApproved ? messages.approved : messages.pending
              )
            : intl.formatMessage(
                isApproved ? messages.requestForApproved : messages.requestFor,
                { username: editRequest?.requestedBy.displayName ?? '' }
              )}
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      loading={
        (!data && !detailsError) ||
        (!quota && !quotaError) ||
        (!services && !servicesError)
      }
      backgroundClickable
      onCancel={onCancel}
      title={intl.formatMessage(messages.request)}
      subTitle={data?.title ?? adultId}
      onOk={() => void sendRequest()}
      okDisabled={
        isUpdating ||
        !canRequest ||
        !categoryEnabled ||
        detailsUnavailable ||
        isQuotaRestricted ||
        !quota ||
        quotaUnavailable ||
        !services ||
        destinationSatisfied ||
        serviceUnavailable
      }
      okText={intl.formatMessage(messages.request)}
      okButtonType="primary"
      cancelText={intl.formatMessage(globalMessages.close)}
    >
      <div className="app-card-inset refreshed-inset-surface space-y-3">
        <h2 className="font-semibold text-white">{data?.title ?? adultId}</h2>
        <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
          {data?.studio && (
            <>
              <dt className="refreshed-detail-text-muted">
                {intl.formatMessage(messages.studio)}
              </dt>
              <dd className="refreshed-detail-text">{data.studio}</dd>
            </>
          )}
          {data?.year && (
            <>
              <dt className="refreshed-detail-text-muted">
                {intl.formatMessage(messages.year)}
              </dt>
              <dd className="refreshed-detail-text">{data.year}</dd>
            </>
          )}
          <dt className="refreshed-detail-text-muted">
            {intl.formatMessage(messages.service)}
          </dt>
          <dd className="refreshed-detail-text">
            {displayedService?.name ??
              data?.serviceName ??
              intl.formatMessage(messages.noService)}
          </dd>
        </dl>
        {canUseAdvancedOptions && (services?.length ?? 0) > 1 && (
          <label className="form-row">
            <span>{intl.formatMessage(messages.service)}</span>
            <select
              className="request-form-control compact-control"
              value={selectedServerId ?? ''}
              onChange={(event) =>
                setSelectedServerId(
                  event.target.value === ''
                    ? undefined
                    : Number(event.target.value)
                )
              }
            >
              <option value="">
                {defaultService
                  ? intl.formatMessage(messages.defaultService, {
                      name: defaultService.name,
                    })
                  : intl.formatMessage(messages.noService)}
              </option>
              {services?.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {destinationSatisfied && (
        <div className="mt-3">
          <Alert type="info">
            {intl.formatMessage(
              isAvailable ? messages.available : messages.processing
            )}
          </Alert>
        </div>
      )}
      {serviceUnavailable && (
        <div className="mt-3">
          <Alert type="warning">
            {intl.formatMessage(messages.serviceUnavailable)}
          </Alert>
        </div>
      )}
      {detailsUnavailable && (
        <div className="mt-3">
          <Alert type="warning">
            {intl.formatMessage(messages.detailsUnavailable)}
          </Alert>
        </div>
      )}
      {quotaUnavailable && (
        <div className="mt-3">
          <Alert type="warning">
            {intl.formatMessage(messages.quotaUnavailable)}
          </Alert>
        </div>
      )}
      {!canRequest ? (
        <div className="mt-3">
          <Alert type="warning">
            {intl.formatMessage(messages.permission)}
          </Alert>
        </div>
      ) : !categoryEnabled ? (
        <div className="mt-3">
          <Alert type="warning">
            {intl.formatMessage(messages.categoryDisabled)}
          </Alert>
        </div>
      ) : (
        quota?.adult?.limit !== undefined &&
        quota.adult.limit > 0 && (
          <div className="mt-3">
            <QuotaDisplay mediaType="adult" quota={quota.adult} />
          </div>
        )
      )}
    </Modal>
  );
};

export default AdultRequestModal;
