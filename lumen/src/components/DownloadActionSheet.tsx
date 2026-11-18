import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api';
import { friendlyError } from '../errors';
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
  const heading = importing ? 'Preview Download Files' : 'Reject Download';
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
          setPreviewError(friendlyError(failure, 'Couldn’t preview files'));
      });
    return () => controller.abort();
  }, [importing, path, targetId, previewAttempt]);

  const target = preview?.target;
  const canImport =
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
      setError(friendlyError(failure, 'Couldn’t search this service library'));
    } finally {
      setSearching(false);
    }
  }

  async function apply() {
    if (writing.current || (importing && !canImport)) return;
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
            ? 'Action accepted. Refresh to check the acquisition service outcome.'
            : 'The action needs review. Check the current warning before retrying.'
        );
    } catch (failure) {
      if (sessionGeneration() === session) {
        const message = friendlyError(failure, 'Couldn’t confirm the action');
        finished(`${message} Check the current warning before retrying.`);
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
              <p className="note">
                Choose a library match and select eligible files. The
                acquisition service checks quality and episode matching.
              </p>
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
                    aria-label="Search This Service Library"
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
                  Search Library
                </button>
              </form>
              {error && (
                <p className="note" role="alert">
                  {error}
                </p>
              )}
              {targets?.length === 0 && (
                <p className="note">
                  No matching titles in this service library.
                </p>
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
                        aria-label={`Choose Match: ${match.title}`}
                        onClick={() => chooseTarget(match.id)}
                      >
                        Choose Match
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {target && (
                <p className="note">
                  Selected match: {target.title}
                  {target.subtitle ? ` · ${target.subtitle}` : ''}
                </p>
              )}
              {!preview && !previewError && (
                <p className="note" role="status">
                  Loading file preview…
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
                    Retry Preview
                  </button>
                </div>
              )}
              {preview?.candidates.length === 0 && (
                <p className="note">
                  No files with a confirmed library match were found.
                </p>
              )}
              {!!preview?.candidates.length && (
                <ul className="setlist">
                  {preview.candidates.map((file) => (
                    <li className="set" key={file.id}>
                      <label>
                        <input
                          type="checkbox"
                          aria-label={`Select ${file.name}`}
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
                          <small>Cannot import this file.</small>
                        )}
                        {file.rejections.map((reason, index) => (
                          <small key={index}>{reason}</small>
                        ))}
                      </label>
                    </li>
                  ))}
                </ul>
              )}
              <label className="sel">
                <span className="lbl">Import Mode</span>
                <select
                  value={mode}
                  disabled={busy}
                  onChange={(event) =>
                    setMode(event.target.value === 'move' ? 'move' : 'copy')
                  }
                >
                  <option value="copy">Copy or Hardlink</option>
                  <option value="move">Move</option>
                </select>
              </label>
              {mode === 'move' && (
                <p className="note">
                  Move removes successfully imported source files.
                </p>
              )}
            </>
          ) : (
            <>
              <p className="note">
                Rejecting removes this item from the acquisition queue.
              </p>
              <label>
                <input
                  type="checkbox"
                  checked={blocklist}
                  disabled={busy}
                  onChange={(event) => setBlocklist(event.target.checked)}
                />{' '}
                Blocklist This Release
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={remove}
                  disabled={busy}
                  onChange={(event) => setRemove(event.target.checked)}
                />{' '}
                Remove the Download and Files From Its Client
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
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || (importing && !canImport)}
              onClick={() => void apply()}
            >
              {importing ? 'Import Selected Files' : 'Confirm Rejection'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
