import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  api,
  type BookDetails,
  type DownloadItem,
  type LibraryRemovalPlan,
} from '../api';
import { isAdministrator, useAuth } from '../auth';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';
import { ConfirmSheet } from './ConfirmSheet';
import { ServiceNote } from './extra';
import { useToast } from './toast';

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

function downloadRows(
  rows: DownloadItem[] | undefined,
  format: 'ebook' | 'audiobook'
) {
  return (rows ?? []).map((item, index) => ({
    ...item,
    format,
    key: `${format}:${item.downloadId ?? index}`,
  }));
}

export function ManageBookSheet({
  book,
  onClose,
  onUpdated,
}: {
  book: BookDetails;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const { t } = useLumenLocale();
  const { user } = useAuth();
  const toast = useToast();
  const admin = isAdministrator(user?.permissions);
  const media = book.mediaInfo;
  const library = useApi<LibraryRemovalPlan>(
    admin && media?.id ? `/media/${media.id}/library` : null,
    { keepDuringRefresh: true }
  );
  const [removing, setRemoving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string>();
  const requests = (media?.requests ?? []).filter(
    (request) => request.status !== 3
  );
  const downloads = [
    ...downloadRows(media?.downloadStatus, 'ebook'),
    ...downloadRows(media?.audiobookDownloadStatus, 'audiobook'),
  ];
  const serviceLinks = [
    {
      label: t('lumen.manageBook.openEbookService', 'Open Ebook in Bookshelf'),
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
  ].filter((link): link is typeof link & { href: string } => !!link.href);

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
      toast(t('lumen.manageBook.removed', 'Verified book copies removed.'));
      onUpdated();
      onClose();
    } catch {
      setFailure(
        t(
          'lumen.manageBook.removeFailed',
          'Could not remove the verified book copies. Refresh the plan and retry.'
        )
      );
      library.revalidate();
      onUpdated();
    } finally {
      setBusy(false);
    }
  };

  if (removing)
    return (
      <ConfirmSheet
        title={t('lumen.manageBook.confirmRemove', 'Delete Book Copies?')}
        body={t(
          'lumen.manageBook.confirmRemoveBody',
          'This permanently removes the verified book copies and their files. This cannot be undone.'
        )}
        confirm={t('lumen.manageBook.remove', 'Delete From Library')}
        cancel={t('lumen.manageBook.keep', 'Keep Copies')}
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
        aria-label={t('lumen.manageBook.title', 'Manage Book')}
      >
        <div className="grab" />
        <div className="pk">
          <header>
            <h3>{t('lumen.manageBook.title', 'Manage Book')}</h3>
            <span className="sub">{book.title}</span>
          </header>
          {media?.requests && (
            <section className="card" aria-labelledby="manage-book-requests">
              <h4 id="manage-book-requests">
                {t('lumen.manageBook.requests', 'Requests')}
              </h4>
              {requests.length ? (
                <ul className="setlist">
                  {requests.map((request) => (
                    <li className="set" key={request.id}>
                      <div>
                        <b>
                          {request.bookFormat === 'audiobook'
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
          <section className="card" aria-labelledby="manage-book-downloads">
            <h4 id="manage-book-downloads">
              {t('lumen.manageBook.downloads', 'Downloads')}
            </h4>
            {downloads.length ? (
              <ul className="setlist">
                {downloads.map((item) => (
                  <li className="set" key={item.key}>
                    <div>
                      <b>
                        {item.format === 'audiobook'
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
            <section className="card" aria-labelledby="manage-book-services">
              <h4 id="manage-book-services">
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
            <section className="card" aria-labelledby="manage-book-library">
              <h4 id="manage-book-library">
                {t('lumen.manageBook.library', 'Verified Library')}
              </h4>
              <ServiceNote
                error={library.error}
                what={t(
                  'lumen.manageBook.libraryPlan',
                  'verified library plan'
                )}
                title={t(
                  'lumen.manageBook.libraryFailed',
                  'Could not verify the book copies'
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
                    {t('lumen.manageBook.remove', 'Delete From Library')}
                  </button>
                </>
              ) : library.data ? (
                <p className="note">
                  {t(
                    'lumen.manageBook.noCopies',
                    'No verified service copies were found.'
                  )}
                </p>
              ) : (
                !library.error && (
                  <p className="note" role="status">
                    {t(
                      'lumen.manageBook.checking',
                      'Checking configured book services…'
                    )}
                  </p>
                )
              )}
            </section>
          )}
          <div className="pk-foot">
            <button className="btn btn-tonal" type="button" onClick={onClose}>
              {t('lumen.manageBook.close', 'Close')}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
