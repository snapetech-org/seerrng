import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api';
import { friendlyError } from '../errors';
import { useLumenLocale } from '../i18n';
import { sessionGeneration } from '../sessionState';
import { useDialog } from './useDialog';

export const DOWNLOAD_INBOX_PATH = '/downloads/interventions';

interface LibraryMatch {
  id: number;
  title: string;
  subtitle?: string;
}

interface DownloadPreview {
  target: LibraryMatch | null;
  candidates: {
    id: number;
    name: string;
    size: number;
    eligible: boolean;
    rejections: string[];
  }[];
  fingerprint: string;
}

export function DownloadActionSheet({
  warning,
  operation,
  close,
  finished,
}: {
  warning: { id: number; title: string; serviceName: string };
  operation: 'import' | 'reject';
  close: () => void;
  finished: (message: string) => void;
}) {
  const { t } = useLumenLocale();
  const dialog = useRef<HTMLDivElement>(null);
  const writing = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState(warning.title.slice(0, 120));
  const [targets, setTargets] = useState<LibraryMatch[]>();
  const [targetId, setTargetId] = useState<number>();
  const [searching, setSearching] = useState(false);
  const [preview, setPreview] = useState<DownloadPreview>();
  const [previewError, setPreviewError] = useState('');
  const [previewAttempt, setPreviewAttempt] = useState(0);
  const [files, setFiles] = useState<number[]>([]);
  const [mode, setMode] = useState<'copy' | 'move'>('copy');
  const [blocklist, setBlocklist] = useState(true);
  const [remove, setRemove] = useState(false);
  const importing = operation === 'import';
  const heading = importing
    ? t('downloads.preview', 'Preview files')
    : t('downloads.reject', 'Reject download');
  const path = `${DOWNLOAD_INBOX_PATH}/${warning.id}`;

  const dismiss = () => {
    if (!writing.current) close();
  };
  useDialog(dialog, dismiss);

  useEffect(() => {
    if (!importing) return;
    const controller = new AbortController();
    const params = targetId === undefined ? '' : `?targetId=${targetId}`;
    void api<DownloadPreview>(`${path}/preview${params}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then((result) => {
        if (!controller.signal.aborted) setPreview(result);
      })
      .catch((failure) => {
        if (!controller.signal.aborted)
          setPreviewError(
            friendlyError(
              failure,
              t(
                'lumen.downloads.previewFailed',
                'Could not preview these files.'
              )
            )
          );
      });
    return () => controller.abort();
  }, [importing, path, targetId, previewAttempt, t]);

  const target = preview?.target;
  const canImport =
    !searching &&
    !!target &&
    Number.isSafeInteger(target.id) &&
    target.id > 0 &&
    target.id <= 2147483647 &&
    (targetId === undefined || target.id === targetId) &&
    !!preview &&
    /^[a-f0-9]{64}$/.test(preview.fingerprint) &&
    files.length > 0;

  function chooseTarget(next: number) {
    setPreview(undefined);
    setPreviewError('');
    setFiles([]);
    setTargetId(next);
  }

  async function searchTargets() {
    const term = query.trim();
    if (term.length < 2 || searching || writing.current) return;
    setSearching(true);
    setError('');
    setTargets(undefined);
    try {
      const matches = await api<LibraryMatch[]>(
        `${path}/targets?query=${encodeURIComponent(term)}`,
        { cache: 'no-store' }
      );
      setTargets(matches);
    } catch (failure) {
      setError(
        friendlyError(
          failure,
          t(
            'lumen.downloads.searchFailed',
            'Could not search this service library.'
          )
        )
      );
    } finally {
      setSearching(false);
    }
  }

  async function apply() {
    if (writing.current || searching || (importing && !canImport)) return;
    writing.current = true;
    setBusy(true);
    const session = sessionGeneration();
    const body = importing
      ? {
          candidateIds: files,
          importMode: mode,
          fingerprint: preview?.fingerprint,
          targetId: target?.id,
        }
      : { blocklist, removeFromClient: remove };
    try {
      const result = await api<{ id: number; state: string }>(
        `${path}/${operation}`,
        {
          method: 'POST',
          body: JSON.stringify(body),
        }
      );
      if (sessionGeneration() === session)
        finished(
          result?.id === warning.id &&
            [importing ? 'importing' : 'rejecting', 'resolved'].includes(
              result.state
            )
            ? t('downloads.pending')
            : t('downloads.outcome')
        );
    } catch (failure) {
      if (sessionGeneration() === session) {
        const message = friendlyError(failure, t('downloads.outcome'));
        finished(
          t(
            'lumen.downloads.actionFailed',
            'Could not confirm the action: {message} Check the current warning before retrying.',
            { message }
          )
        );
      }
    } finally {
      writing.current = false;
      setBusy(false);
    }
  }

  return createPortal(
    <div className="sheet-wrap open">
      <div className="sheet-scrim" aria-hidden="true" onClick={dismiss} />
      <div
        className="sheet"
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={heading}
      >
        <div className="grab" />
        <div className="pk">
          <header>
            <h2>{heading}</h2>
            <p className="note">
              {warning.title} · {warning.serviceName}
            </p>
          </header>
          {importing ? (
            <>
              <p className="note">{t('downloads.importWarning')}</p>
              <form
                className="toolbar"
                onSubmit={(event) => {
                  event.preventDefault();
                  void searchTargets();
                }}
              >
                <label className="search">
                  <input
                    type="search"
                    aria-label={t('downloads.targetQuery')}
                    value={query}
                    maxLength={120}
                    disabled={busy || searching}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </label>
                <button
                  className="btn btn-tonal btn-sm"
                  type="submit"
                  disabled={busy || searching || query.trim().length < 2}
                >
                  {t('downloads.search')}
                </button>
              </form>
              {error && (
                <p className="note" role="alert">
                  {error}
                </p>
              )}
              {targets?.length === 0 && (
                <p className="note">{t('downloads.targetNoResults')}</p>
              )}
              {!!targets?.length && (
                <ul className="setlist">
                  {targets.map((match) => (
                    <li className="set" key={match.id}>
                      <span>
                        <b>{match.title}</b>
                        {match.subtitle && <small>{match.subtitle}</small>}
                      </span>
                      <button
                        type="button"
                        className="btn btn-quiet btn-sm"
                        disabled={busy || targetId === match.id}
                        aria-label={`${t('downloads.targetChoose')} ${match.title}`}
                        onClick={() => chooseTarget(match.id)}
                      >
                        {t('downloads.targetChoose')}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {target && (
                <p className="note">
                  {t(
                    'downloads.targetSelected',
                    'Selected match: {title}{subtitle}',
                    {
                      title: target.title,
                      subtitle: target.subtitle ? ` · ${target.subtitle}` : '',
                    }
                  )}
                </p>
              )}
              {!preview && !previewError && (
                <p className="note" role="status">
                  {t('lumen.downloads.previewLoading', 'Loading file preview…')}
                </p>
              )}
              {previewError && (
                <div className="toolbar">
                  <p className="note" role="alert">
                    {previewError}
                  </p>
                  <button
                    type="button"
                    className="btn btn-quiet btn-sm"
                    onClick={() => {
                      setPreviewError('');
                      setPreviewAttempt((attempt) => attempt + 1);
                    }}
                  >
                    {t('downloads.refresh')}
                  </button>
                </div>
              )}
              {preview?.candidates.length === 0 && (
                <p className="note">{t('downloads.noFiles')}</p>
              )}
              {!!preview?.candidates.length && (
                <ul className="setlist">
                  {preview.candidates.map((file) => (
                    <li className="set" key={file.id}>
                      <label>
                        <input
                          type="checkbox"
                          aria-label={t('downloads.select', 'Select {name}', {
                            name: file.name,
                          })}
                          checked={files.includes(file.id)}
                          disabled={
                            busy ||
                            !file.eligible ||
                            (!files.includes(file.id) && files.length >= 50)
                          }
                          onChange={(event) => {
                            const selected = event.target.checked;
                            setFiles((previous) =>
                              selected
                                ? [...previous, file.id]
                                : previous.filter((id) => id !== file.id)
                            );
                          }}
                        />{' '}
                        <b>{file.name}</b>
                        <small>
                          {(file.size / 1048576).toLocaleString(undefined, {
                            maximumFractionDigits: 1,
                          })}{' '}
                          MB
                        </small>
                        {!file.eligible && (
                          <small>{t('downloads.ineligible')}</small>
                        )}
                        {file.rejections.map((reason, index) => (
                          <small key={index}>{reason}</small>
                        ))}
                      </label>
                    </li>
                  ))}
                </ul>
              )}
              <label className="sel" data-layout="stacked">
                <span className="lbl">{t('downloads.importMode')}</span>
                <select
                  value={mode}
                  disabled={busy}
                  onChange={(event) =>
                    setMode(event.target.value === 'move' ? 'move' : 'copy')
                  }
                >
                  <option value="copy">{t('downloads.copy')}</option>
                  <option value="move">{t('downloads.move')}</option>
                </select>
              </label>
              {mode === 'move' && <p className="note">{t('downloads.move')}</p>}
            </>
          ) : (
            <>
              <p className="note">{t('downloads.rejection')}</p>
              <label>
                <input
                  type="checkbox"
                  checked={blocklist}
                  disabled={busy}
                  onChange={(event) => setBlocklist(event.target.checked)}
                />{' '}
                {t('downloads.blocklist')}
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={remove}
                  disabled={busy}
                  onChange={(event) => setRemove(event.target.checked)}
                />{' '}
                {t('downloads.remove')}
              </label>
            </>
          )}
          <div className="pk-foot">
            <button
              type="button"
              data-autofocus
              className="btn btn-quiet"
              disabled={busy}
              onClick={dismiss}
            >
              {t('downloads.cancel')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || searching || (importing && !canImport)}
              onClick={() => void apply()}
            >
              {importing ? t('downloads.import') : t('downloads.confirm')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
