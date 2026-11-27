import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  api,
  type DownloadItem,
  type LibraryRemovalPlan,
  type MediaInfo,
} from '../api';
import { isAdministrator, useAuth } from '../auth';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';
import { ConfirmSheet } from './ConfirmSheet';
import { canManageRequests } from './detail';
import { ServiceNote } from './extra';
import { useToast } from './toast';

export type ManageableMediaType = 'book' | 'music' | 'comic' | 'magazine';

const mediaKindLabel = (
  mediaType: ManageableMediaType,
  t: (id: string, fallback: string) => string
) =>
  t(
    `lumen.manageMedia.type.${mediaType}`,
    mediaType === 'music'
      ? 'Music'
      : mediaType === 'comic'
        ? 'Comic'
        : mediaType === 'magazine'
          ? 'Magazine'
          : 'Book'
  );

const mediaTitle = (
  mediaType: ManageableMediaType,
  t: (id: string, fallback: string) => string
) =>
  t(
    `lumen.manageMedia.title.${mediaType}`,
    mediaType === 'music'
      ? 'Manage Music'
      : mediaType === 'comic'
        ? 'Manage Comic'
        : mediaType === 'magazine'
          ? 'Manage Magazine'
          : 'Manage Book'
  );

const safeUrl = (value?: string | null) => {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
};

function downloadRows(rows: DownloadItem[] | undefined, format: string) {
  return (rows ?? []).map((item, index) => ({
    ...item,
    format,
    key: `${format}:${item.downloadId ?? index}`,
  }));
}

export function ManageMediaSheet({
  mediaType,
  title,
  media,
  onClose,
  onUpdated,
}: {
  mediaType: ManageableMediaType;
  title: string;
  media?: MediaInfo;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const { t } = useLumenLocale();
  const { user } = useAuth();
  const toast = useToast();
  const admin = isAdministrator(user?.permissions);
  const kindLabel = mediaKindLabel(mediaType, t);
  const titleLabel = mediaTitle(mediaType, t);
  const library = useApi<LibraryRemovalPlan>(
    admin && media?.id ? `/media/${media.id}/library` : null,
    { keepDuringRefresh: true }
  );
  const [removing, setRemoving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string>();
  const [requestToDelete, setRequestToDelete] = useState<number>();
  const [deletingRequest, setDeletingRequest] = useState(false);
  const [requestFailure, setRequestFailure] = useState<string>();
  const requests = (media?.requests ?? []).filter(
    (request) => request.status !== 3
  );
  const downloads =
    mediaType === 'book'
      ? [
          ...downloadRows(media?.downloadStatus, 'ebook'),
          ...downloadRows(media?.audiobookDownloadStatus, 'audiobook'),
        ]
      : downloadRows(media?.downloadStatus, mediaType);
  const serviceLinks = (
    mediaType === 'book'
      ? [
          {
            label: t(
              'lumen.manageBook.openEbookService',
              'Open Ebook in Bookshelf'
            ),
            href: safeUrl(media?.serviceUrl),
            key: 'ebook',
          },
          {
            label: t(
              'lumen.manageBook.openAudiobookService',
              'Open Audiobook in Bookshelf'
            ),
            href: safeUrl(media?.audiobookServiceUrl),
            key: 'audiobook',
          },
        ]
      : [
          {
            label: t(
              'lumen.manageMedia.openService',
              'Open configured service'
            ),
            href: safeUrl(media?.serviceUrl),
            key: mediaType,
          },
        ]
  ).filter((link): link is typeof link & { href: string } => !!link.href);

  const removeLibrary = async () => {
    if (
      !admin ||
      busy ||
      !media?.id ||
      !library.data?.token ||
      !library.data.targets.length
    )
      return;
    setBusy(true);
    setFailure(undefined);
    try {
      await api(
        `/media/${media.id}/library`,
        {
          method: 'DELETE',
          body: JSON.stringify({ token: library.data.token }),
        },
        'empty'
      );
      setRemoving(false);
      toast(
        t('lumen.manageMedia.removed', 'Verified {media} copies removed.', {
          media: kindLabel,
        })
      );
      onUpdated();
      onClose();
    } catch {
      setFailure(
        t(
          'lumen.manageMedia.removeFailed',
          'Could not remove the verified {media} copies. Refresh the plan and retry.',
          { media: kindLabel }
        )
      );
      library.revalidate();
      onUpdated();
    } finally {
      setBusy(false);
    }
  };

  const deleteRequest = async () => {
    if (
      !requestToDelete ||
      deletingRequest ||
      !canManageRequests(user?.permissions)
    )
      return;
    setDeletingRequest(true);
    setRequestFailure(undefined);
    try {
      await api(
        `/request/${requestToDelete}/status`,
        { method: 'DELETE' },
        'empty'
      );
      setRequestToDelete(undefined);
      toast(t('lumen.manageMedia.requestDeleted', 'Request entry deleted.'));
      onUpdated();
    } catch {
      setRequestFailure(
        t(
          'lumen.manageMedia.requestDeleteFailed',
          'Unable to delete this request entry.'
        )
      );
    } finally {
      setDeletingRequest(false);
    }
  };

  if (removing)
    return (
      <ConfirmSheet
        title={t('lumen.manageMedia.confirmRemove', 'Delete {media} Copies?', {
          media: kindLabel,
        })}
        body={t(
          'lumen.manageMedia.confirmRemoveBody',
          'This permanently removes the verified {media} copies and their files. This cannot be undone.',
          { media: kindLabel }
        )}
        confirm={t('lumen.manageMedia.remove', 'Delete From Library')}
        cancel={t('lumen.manageMedia.keep', 'Keep Copies')}
        busy={busy}
        onConfirm={() => void removeLibrary()}
        onClose={() => setRemoving(false)}
      >
        <ul className="card-list">
          {library.data?.targets.map((target) => (
            <li key={target.key}>
              <b>{target.service}</b>{' '}
              <span className="sub">{target.quality}</span>
            </li>
          ))}
        </ul>
        {failure && (
          <p className="note" role="alert">
            {failure}
          </p>
        )}
      </ConfirmSheet>
    );

  return (
    <div className="sheet-wrap open">
      <div className="sheet-scrim" aria-hidden="true" onClick={onClose} />
      <section
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={titleLabel}
      >
        <div className="grab" />
        <div className="pk">
          <header>
            <h3>{titleLabel}</h3>
            <span className="sub">{title}</span>
          </header>
          {media?.requests && (
            <section className="card" aria-labelledby="manage-media-requests">
              <h4 id="manage-media-requests">
                {t('lumen.manageBook.requests', 'Requests')}
              </h4>
              {requests.length ? (
                <ul className="setlist">
                  {requests.map((request) => (
                    <li className="set" key={request.id}>
                      <div>
                        <b>
                          {mediaType !== 'book'
                            ? kindLabel
                            : request.bookFormat === 'audiobook'
                              ? t('lumen.bookDetail.audiobook', 'Audiobook')
                              : request.bookFormat === 'both'
                                ? t(
                                    'lumen.manageBook.bothFormats',
                                    'Ebook and Audiobook'
                                  )
                                : t('lumen.bookDetail.ebook', 'Ebook')}
                        </b>
                        <small>
                          {request.requestedBy?.displayName ??
                            t(
                              'lumen.manageBook.unknownRequester',
                              'Unknown requester'
                            )}
                        </small>
                      </div>
                      <Link
                        className="go"
                        to={`/requests?requestId=${request.id}`}
                        onClick={onClose}
                      >
                        {t('lumen.manageBook.viewRequest', 'View Request')}
                      </Link>
                      <button
                        className="btn btn-danger btn-sm"
                        type="button"
                        onClick={() => {
                          setRequestFailure(undefined);
                          setRequestToDelete(request.id);
                        }}
                      >
                        {t('lumen.manageMedia.deleteRequest', 'Delete Request')}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="note">
                  {t('lumen.manageBook.noRequests', 'No active requests.')}
                </p>
              )}
            </section>
          )}
          <section className="card" aria-labelledby="manage-media-downloads">
            <h4 id="manage-media-downloads">
              {t('lumen.manageBook.downloads', 'Downloads')}
            </h4>
            {downloads.length ? (
              <ul className="setlist">
                {downloads.map((item) => (
                  <li className="set" key={item.key}>
                    <div>
                      <b>
                        {mediaType !== 'book'
                          ? kindLabel
                          : item.format === 'audiobook'
                            ? t('lumen.bookDetail.audiobook', 'Audiobook')
                            : t('lumen.bookDetail.ebook', 'Ebook')}
                      </b>
                      <small>
                        {item.status ||
                          t('lumen.manageBook.downloading', 'Downloading')}
                      </small>
                    </div>
                    {typeof item.percent === 'number' && (
                      <span>{Math.round(item.percent)}%</span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="note">
                {t('lumen.manageBook.noDownloads', 'No active downloads.')}
              </p>
            )}
          </section>
          {admin && serviceLinks.length > 0 && (
            <section className="card" aria-labelledby="manage-media-services">
              <h4 id="manage-media-services">
                {t('lumen.manageBook.services', 'Services')}
              </h4>
              <div className="toolbar">
                {serviceLinks.map((link) => (
                  <a
                    className="btn btn-ok btn-sm"
                    key={link.key}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {link.label}
                  </a>
                ))}
              </div>
            </section>
          )}
          {admin && media?.id && (
            <section className="card" aria-labelledby="manage-media-library">
              <h4 id="manage-media-library">
                {t('lumen.manageBook.library', 'Verified Library')}
              </h4>
              <ServiceNote
                error={library.error}
                what={t(
                  'lumen.manageMedia.libraryPlan',
                  'verified library plan'
                )}
                title={t(
                  'lumen.manageMedia.libraryFailed',
                  'Could not verify the media copies'
                )}
                retryLabel={t('lumen.manageBook.retry', 'Check Again')}
                retry={library.reload}
              />
              {library.data?.targets.length ? (
                <>
                  <ul className="card-list">
                    {library.data.targets.map((target) => (
                      <li key={target.key}>
                        <b>{target.service}</b>{' '}
                        <span className="sub">{target.quality}</span>
                      </li>
                    ))}
                  </ul>
                  <button
                    className="btn btn-danger btn-sm"
                    type="button"
                    onClick={() => setRemoving(true)}
                  >
                    {t('lumen.manageMedia.remove', 'Delete From Library')}
                  </button>
                </>
              ) : library.data ? (
                <p className="note">
                  {t(
                    'lumen.manageMedia.noCopies',
                    'No verified service copies were found.'
                  )}
                </p>
              ) : (
                !library.error && (
                  <p className="note" role="status">
                    {t(
                      'lumen.manageMedia.checking',
                      'Checking configured media services…'
                    )}
                  </p>
                )
              )}
            </section>
          )}
          <div className="pk-foot">
            <button className="btn btn-tonal" type="button" onClick={onClose}>
              {t('lumen.manageMedia.close', 'Close')}
            </button>
          </div>
        </div>
      </section>
      {requestToDelete !== undefined && (
        <ConfirmSheet
          title={t(
            'lumen.manageMedia.deleteRequestTitle',
            'Delete Request Entry?'
          )}
          body={t(
            'lumen.manageMedia.deleteRequestBody',
            'This cancels active work where possible and permanently removes the request entry and its history.'
          )}
          confirm={t('lumen.manageMedia.deleteRequest', 'Delete Request')}
          cancel={t('lumen.manageMedia.keepRequest', 'Keep Request')}
          busy={deletingRequest}
          onClose={() => {
            if (!deletingRequest) {
              setRequestToDelete(undefined);
              setRequestFailure(undefined);
            }
          }}
          onConfirm={deleteRequest}
        >
          {requestFailure && (
            <p className="note" role="alert">
              {requestFailure}
            </p>
          )}
        </ConfirmSheet>
      )}
    </div>
  );
}

export function ManageMediaAction({
  mediaType,
  title,
  media,
  onUpdated,
}: {
  mediaType: ManageableMediaType;
  title: string;
  media?: MediaInfo;
  onUpdated: () => void;
}) {
  const { user } = useAuth();
  const { t } = useLumenLocale();
  const [open, setOpen] = useState(false);
  if (!canManageRequests(user?.permissions) || !media || media.status === 1)
    return null;
  return (
    <>
      <button
        className="btn btn-tonal btn-sm"
        type="button"
        onClick={() => setOpen(true)}
      >
        {mediaTitle(mediaType, t)}
      </button>
      {open && (
        <ManageMediaSheet
          mediaType={mediaType}
          title={title}
          media={media}
          onClose={() => setOpen(false)}
          onUpdated={onUpdated}
        />
      )}
    </>
  );
}
