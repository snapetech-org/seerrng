import Button from '@app/components/Common/Button';
import CachedImage from '@app/components/Common/CachedImage';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import ReaderGroupingAction from '@app/components/Common/ReaderGroupingAction';
import BulkRequestModal from '@app/components/RequestModal/BulkRequestModal';
import TitleCard from '@app/components/TitleCard';
import { Permission, useUser } from '@app/hooks/useUser';
import ErrorPage from '@app/pages/_error';
import { encodeApiPathSegment } from '@app/utils/apiPath';
import defineMessages from '@app/utils/defineMessages';
import { ArrowDownTrayIcon } from '@heroicons/react/24/solid';
import { MediaStatus } from '@server/constants/media';
import type { AuthorDetails as AuthorDetailsType } from '@server/models/Book';
import { useRouter } from 'next/router';
import { useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.AuthorDetails', {
  born: 'Born',
  died: 'Died',
  bibliography: 'Bibliography',
  requestbibliography: 'Request Bibliography',
});

const AuthorDetails = () => {
  const intl = useIntl();
  const router = useRouter();
  const { hasPermission } = useUser();
  const authorId = router.query.authorId as string | undefined;
  const [showBulkRequestModal, setShowBulkRequestModal] = useState(false);
  const { data, error, mutate } = useSWR<AuthorDetailsType>(
    authorId ? `/api/v1/author/${encodeApiPathSegment(authorId)}` : null
  );

  const bulkItems = useMemo(
    () =>
      (data?.works ?? []).map((work) => ({
        id: work.id,
        title: work.title,
        year: work.firstPublishYear,
        image: work.posterPath,
        artist: data?.name,
        isbn13: work.isbn13,
        editionId: work.editionId,
        authorId: data?.id,
        mediaInfo: work.mediaInfo,
      })),
    [data]
  );

  if (!data && !error) {
    return <LoadingSpinner />;
  }

  if (!data) {
    return <ErrorPage statusCode={404} />;
  }

  return (
    <>
      <PageTitle title={data.name} />
      {showBulkRequestModal && (
        <BulkRequestModal
          show={showBulkRequestModal}
          mediaType="book"
          authorId={data.id}
          title={data.name}
          initialItems={bulkItems}
          initialTotalItems={data.pagination.totalItems}
          onCancel={() => setShowBulkRequestModal(false)}
          onComplete={() => mutate()}
        />
      )}
      <div className="relative z-10 mt-4 mb-10 flex flex-col items-center gap-6 text-gray-300 lg:flex-row lg:items-start">
        {data.posterPath && (
          <div className="relative h-36 w-36 flex-shrink-0 overflow-hidden rounded-full ring-1 ring-gray-700 lg:h-44 lg:w-44">
            <CachedImage
              type="book"
              src={data.posterPath}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              fill
            />
          </div>
        )}
        <div className="min-w-0 text-center lg:text-start">
          <h1 className="text-3xl font-bold break-words text-white lg:text-5xl">
            {data.name}
          </h1>
          <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-2 text-sm lg:justify-start">
            {data.birthDate && (
              <span>
                {intl.formatMessage(messages.born)}: {data.birthDate}
              </span>
            )}
            {data.deathDate && (
              <span>
                {intl.formatMessage(messages.died)}: {data.deathDate}
              </span>
            )}
          </div>
          {data.biography && (
            <p className="mt-4 max-w-4xl text-sm leading-6 whitespace-pre-line lg:text-base">
              {data.biography}
            </p>
          )}
          {hasPermission([Permission.REQUEST, Permission.REQUEST_BOOK], {
            type: 'or',
          }) && (
            <div className="mt-5">
              <Button
                buttonType="primary"
                onClick={() => setShowBulkRequestModal(true)}
              >
                <ArrowDownTrayIcon />
                <span>{intl.formatMessage(messages.requestbibliography)}</span>
              </Button>
            </div>
          )}
          <div className="mt-5">
            <ReaderGroupingAction
              target={{ type: 'author', id: data.id, name: data.name }}
            />
          </div>
        </div>
      </div>
      <section>
        <div className="slider-header">
          <div className="page-heading">
            {intl.formatMessage(messages.bibliography)}
            <span className="ms-2 text-sm text-gray-400">
              ({data.pagination.totalItems})
            </span>
          </div>
        </div>
        <ul className="cards-vertical">
          {data.works.map((work) => (
            <li key={`work-${work.id}`}>
              <TitleCard
                id={work.id}
                title={work.title}
                year={work.firstPublishYear?.toString()}
                image={work.posterPath}
                mediaType="book"
                artist={data.name}
                status={work.mediaInfo?.status ?? MediaStatus.UNKNOWN}
                inProgress={(work.mediaInfo?.downloadStatus ?? []).length > 0}
                canExpand
              />
            </li>
          ))}
        </ul>
      </section>
    </>
  );
};

export default AuthorDetails;
