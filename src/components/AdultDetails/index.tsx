import Alert from '@app/components/Common/Alert';
import Button from '@app/components/Common/Button';
import CachedImage from '@app/components/Common/CachedImage';
import Header from '@app/components/Common/Header';
import MediaTypeBadge from '@app/components/Common/MediaTypeBadge';
import PageTitle from '@app/components/Common/PageTitle';
import RequestModal from '@app/components/RequestModal';
import { Permission, useUser } from '@app/hooks/useUser';
import { encodeApiPathSegment } from '@app/utils/apiPath';
import defineMessages from '@app/utils/defineMessages';
import { ArrowLeftIcon } from '@heroicons/react/24/solid';
import { MediaStatus } from '@server/constants/media';
import type { WhisparrServiceOption } from '@server/interfaces/api/serviceInterfaces';
import type { AdultDetails as AdultDetailsModel } from '@server/models/Adult';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.AdultDetails', {
  notFound: 'This scene could not be found in Whisparr.',
  unavailable: 'Adult scene details are unavailable right now.',
  retryDetails: 'Try again',
  request: 'Request scene',
  requestOnServer: 'Request on {server}',
  requestAnotherService: 'Request on another Whisparr server',
  activeRequest: 'Manage your request',
  backToResults: 'Back to Adult results',
  browseAdult: 'Browse Adult scenes',
  available: 'This scene is already available on this Whisparr server.',
  processing: 'This scene is already being processed on this server.',
  noPermission: 'You do not have permission to request adult media.',
  studio: 'Studio',
  performers: 'Performers',
  year: 'Year',
  server: 'Whisparr server',
  searchPerformer: 'Search scenes with {performer}',
  searchStudio: 'Search scenes from {studio}',
});

const AdultDetails = () => {
  const intl = useIntl();
  const router = useRouter();
  const { hasPermission } = useUser();
  const [showRequestModal, setShowRequestModal] = useState(false);
  const sceneId =
    typeof router.query.sceneId === 'string' ? router.query.sceneId : '';
  const requestedServerId =
    typeof router.query.serverId === 'string'
      ? router.query.serverId
      : undefined;
  const { data: services } = useSWR<WhisparrServiceOption[]>(
    '/api/v1/service/whisparr'
  );
  const canChooseService = hasPermission(
    [Permission.REQUEST_ADVANCED, Permission.MANAGE_REQUESTS],
    { type: 'or' }
  );
  const defaultServiceId = services?.find((service) => service.isDefault)?.id;
  // The scene card identifies the library that supplied its metadata. Keep
  // that source for details even when the viewer can only request to default.
  const selectedServerId =
    requestedServerId ??
    (!canChooseService ? defaultServiceId?.toString() : undefined);
  const detailUrl = sceneId
    ? `/api/v1/adult/${encodeApiPathSegment(sceneId)}${
        selectedServerId
          ? `?serverId=${encodeURIComponent(selectedServerId)}`
          : ''
      }`
    : null;
  const { data, error, mutate } = useSWR<AdultDetailsModel>(detailUrl);
  const canRequest = hasPermission(
    [Permission.ADMIN, Permission.MANAGE_REQUESTS, Permission.REQUEST_ADULT],
    { type: 'or' }
  );
  const isOnDefaultServer = data?.serviceId === defaultServiceId;
  const activeRequestId =
    canChooseService || isOnDefaultServer
      ? data?.mediaInfo?.requestId
      : undefined;
  const isAvailable =
    data?.mediaInfo?.status === MediaStatus.AVAILABLE ||
    data?.mediaInfo?.status === MediaStatus.PARTIALLY_AVAILABLE;
  const isProcessing = data?.mediaInfo?.status === MediaStatus.PROCESSING;
  const isSatisfied = isAvailable || isProcessing;
  const isSatisfiedAtRequestDestination =
    isSatisfied && (canChooseService || isOnDefaultServer);
  const defaultServiceName = services?.find(
    (service) => service.id === defaultServiceId
  )?.name;
  const returnQuery =
    typeof router.query.fromQuery === 'string'
      ? router.query.fromQuery
      : undefined;
  const returnServerId =
    typeof router.query.fromServerId === 'string'
      ? router.query.fromServerId
      : undefined;
  const returnPage =
    typeof router.query.fromPage === 'string'
      ? router.query.fromPage
      : undefined;
  const returnHref = {
    pathname: '/discover/adult',
    query: {
      ...(returnQuery ? { query: returnQuery } : {}),
      ...(returnServerId ? { serverId: returnServerId } : {}),
      ...(returnPage ? { page: returnPage } : {}),
    },
  };

  if (error) {
    const status = (error as { response?: { status?: number } }).response
      ?.status;
    return (
      <Alert
        title={intl.formatMessage(
          status === 404 ? messages.notFound : messages.unavailable
        )}
        type="warning"
      >
        <div className="flex flex-wrap items-center gap-3">
          <Button
            buttonType="default"
            buttonSize="sm"
            buttonIcon="retry"
            onClick={() => void mutate()}
          >
            {intl.formatMessage(messages.retryDetails)}
          </Button>
          <Link
            href={returnHref}
            className="text-sm font-medium text-indigo-200 underline decoration-indigo-300/40 underline-offset-4 hover:text-white"
          >
            {intl.formatMessage(
              returnQuery || returnServerId || returnPage
                ? messages.backToResults
                : messages.browseAdult
            )}
          </Link>
        </div>
      </Alert>
    );
  }

  if (!data) {
    return (
      <div className="media-page grid animate-pulse grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <section className="space-y-5">
          <div className="h-5 w-36 rounded bg-gray-800" />
          <div className="h-10 w-3/4 rounded bg-gray-800" />
          <div className="h-24 max-w-3xl rounded bg-gray-800" />
          <div className="h-11 w-40 rounded bg-gray-800" />
        </section>
        <div className="mx-auto aspect-[2/3] w-full max-w-xs rounded-xl bg-gray-800 lg:max-w-none" />
      </div>
    );
  }

  const canOpenRequest = Boolean(
    activeRequestId ||
    (canRequest && (!isSatisfiedAtRequestDestination || canChooseService))
  );

  return (
    <>
      <PageTitle title={data.title} />
      <div className="media-page space-y-5">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
          <section className="order-2 space-y-5 lg:order-1">
            <Link
              href={returnHref}
              className="inline-flex min-h-10 items-center gap-2 rounded-md text-sm font-medium text-indigo-200 transition hover:text-white focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950"
            >
              <ArrowLeftIcon aria-hidden="true" className="h-4 w-4" />
              {intl.formatMessage(
                returnQuery || returnServerId || returnPage
                  ? messages.backToResults
                  : messages.browseAdult
              )}
            </Link>
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <MediaTypeBadge mediaType="adult" variant="compact" />
                {data.year && (
                  <span className="rounded-full border border-gray-700 bg-gray-900/70 px-3 py-1 text-sm text-gray-300">
                    {intl.formatMessage(messages.year)}: {data.year}
                  </span>
                )}
                <span className="rounded-full border border-gray-700 bg-gray-900/70 px-3 py-1 text-sm text-gray-300">
                  {intl.formatMessage(messages.server)}: {data.serviceName}
                </span>
              </div>
              <Header>{data.title}</Header>
            </div>

            {data.overview && (
              <p className="max-w-3xl text-base leading-relaxed whitespace-pre-line text-gray-200">
                {data.overview}
              </p>
            )}

            <dl className="grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-[9rem_minmax(0,1fr)]">
              {data.studio && (
                <>
                  <dt className="text-sm font-medium text-gray-400">
                    {intl.formatMessage(messages.studio)}
                  </dt>
                  <dd>
                    <Link
                      href={{
                        pathname: '/discover/adult',
                        query: {
                          query: data.studio,
                          serverId: returnServerId,
                        },
                      }}
                      className="text-sm text-indigo-200 underline decoration-indigo-300/40 underline-offset-4 hover:text-white"
                      aria-label={intl.formatMessage(messages.searchStudio, {
                        studio: data.studio,
                      })}
                    >
                      {data.studio}
                    </Link>
                  </dd>
                </>
              )}
              {(data.performers ?? []).length > 0 && (
                <>
                  <dt className="pt-1 text-sm font-medium text-gray-400">
                    {intl.formatMessage(messages.performers)}
                  </dt>
                  <dd className="flex flex-wrap gap-2">
                    {data.performers.map((performer) => (
                      <Link
                        key={performer}
                        href={{
                          pathname: '/discover/adult',
                          query: {
                            query: performer,
                            serverId: returnServerId,
                          },
                        }}
                        className="rounded-full border border-gray-700 bg-gray-900/70 px-3 py-1 text-sm text-gray-200 transition hover:border-indigo-400 hover:text-white"
                        aria-label={intl.formatMessage(
                          messages.searchPerformer,
                          { performer }
                        )}
                      >
                        {performer}
                      </Link>
                    ))}
                  </dd>
                </>
              )}
            </dl>

            {(isAvailable || (isProcessing && !activeRequestId)) && (
              <Alert type="info">
                {intl.formatMessage(
                  isAvailable ? messages.available : messages.processing
                )}
              </Alert>
            )}

            {canOpenRequest ? (
              <Button
                buttonType="primary"
                onClick={() => setShowRequestModal(true)}
              >
                {activeRequestId
                  ? intl.formatMessage(messages.activeRequest)
                  : isSatisfiedAtRequestDestination
                    ? intl.formatMessage(messages.requestAnotherService)
                    : !canChooseService &&
                        defaultServiceName &&
                        !isOnDefaultServer
                      ? intl.formatMessage(messages.requestOnServer, {
                          server: defaultServiceName,
                        })
                      : intl.formatMessage(messages.request)}
              </Button>
            ) : (
              <Alert type="info">
                {intl.formatMessage(messages.noPermission)}
              </Alert>
            )}
          </section>

          <div className="order-1 mx-auto w-full max-w-xs overflow-hidden rounded-xl border border-gray-700 bg-gray-900 shadow-xl lg:order-2 lg:max-w-none">
            <div className="relative aspect-[2/3]">
              <CachedImage
                src={data.posterPath ?? '/images/seerr_poster_not_found.png'}
                fallbackSrc={
                  data.posterPath
                    ? '/images/seerr_poster_not_found.png'
                    : undefined
                }
                type="adult"
                alt={data.title}
                fill
                sizes="(max-width: 1024px) 80vw, 18rem"
                className="object-cover"
                priority
              />
              <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-gray-950/80 to-transparent" />
              <div className="absolute start-3 bottom-3">
                <MediaTypeBadge mediaType="adult" variant="compact" />
              </div>
            </div>
          </div>
        </div>
        {showRequestModal && (
          <RequestModal
            type="adult"
            adultId={data.id}
            adultRequestId={activeRequestId}
            adultRequestStatus={
              activeRequestId ? data.mediaInfo?.requestStatus : undefined
            }
            initialServerId={data.serviceId}
            show
            onCancel={() => setShowRequestModal(false)}
            onComplete={() => {
              setShowRequestModal(false);
              void mutate();
            }}
          />
        )}
      </div>
    </>
  );
};

export default AdultDetails;
