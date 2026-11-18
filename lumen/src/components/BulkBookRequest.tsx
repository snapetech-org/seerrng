import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, bookMediaForFormat, MediaStatus, type BookResult } from '../api';
import { isAdministrator, useAuth } from '../auth';
import { friendlyError } from '../errors';
import { dropBookStates, usePublicSettings } from '../hooks';
import { useDialog } from './useDialog';

const limit = 100;
type Format = 'ebook' | 'audiobook';
type Source = { id: string; books: BookResult[]; nextOffset?: number };
interface Outcome {
  mediaId: string;
  title?: string;
  reason: string;
}
interface Result {
  created: unknown[];
  skipped: Outcome[];
  failed: Outcome[];
}

function RequestSheet({
  source,
  formats,
  close,
  onComplete,
}: {
  source: Source;
  formats: Format[];
  close: () => void;
  onComplete: () => void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const pending = useRef(false);
  const [books, setBooks] = useState(source.books);
  const [offset, setOffset] = useState(source.nextOffset);
  const [format, setFormat] = useState(formats[0]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<Result>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  useDialog(dialog, finish);

  const eligible = (book: BookResult) => {
    const status = bookMediaForFormat(book.mediaInfo, format)?.status;
    return status === undefined || status === MediaStatus.UNKNOWN;
  };

  async function loadMore() {
    if (offset === undefined || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(undefined);
    try {
      const page = await api<{
        works: BookResult[];
        pagination: { nextOffset: number; totalItems: number };
      }>(
        `/author/${encodeURIComponent(source.id)}/works?limit=50&offset=${offset}`
      );
      setBooks((previous) => {
        const ids = new Set(previous.map((book) => book.id));
        return [...previous, ...page.works.filter((book) => !ids.has(book.id))];
      });
      const next = page.pagination.nextOffset;
      setOffset(
        next > offset && next < page.pagination.totalItems ? next : undefined
      );
    } catch (failure) {
      setError(friendlyError(failure, 'Could not load more books.'));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  async function submit() {
    if (!selected.size || pending.current || result) return;
    const items = books
      .filter((book) => selected.has(book.id) && eligible(book))
      .map((book) => ({
        mediaId: book.id,
        title: book.title,
        authorId: book.authorId,
        isbn13: book.isbn13,
        editionId: book.editionId,
      }));
    if (!items.length) return;
    pending.current = true;
    setBusy(true);
    setError(undefined);
    try {
      setResult(
        await api<Result>('/request/bulk', {
          method: 'POST',
          body: JSON.stringify({ mediaType: 'book', format, items }),
        })
      );
      dropBookStates();
    } catch (failure) {
      setError(friendlyError(failure, 'Could not submit the bulk request.'));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  function finish() {
    if (pending.current) return;
    if (result) onComplete();
    close();
  }

  function toggle(book: BookResult, checked: boolean) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (!checked) next.delete(book.id);
      else if (next.size < limit) next.add(book.id);
      return next;
    });
  }

  return createPortal(
    <div className="sheet-wrap open">
      <div className="sheet-scrim" aria-hidden="true" onClick={finish} />
      <div
        className="sheet"
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Request Books"
      >
        <div className="grab" />
        <div className="pk">
          <header>
            <h3>Request Books</h3>
          </header>
          {result ? (
            <>
              <p role="status">
                {result.created.length} requested, {result.skipped.length}{' '}
                skipped, {result.failed.length} failed.
              </p>
              {!!(result.skipped.length + result.failed.length) && (
                <ul className="slist">
                  {[...result.skipped, ...result.failed].map((item) => (
                    <li key={item.mediaId}>
                      {item.title || item.mediaId} · {item.reason}
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <>
              <label className="sel">
                <span className="lbl">Format</span>
                <select
                  disabled={busy}
                  value={format}
                  onChange={(event) => {
                    setFormat(event.target.value as Format);
                    setSelected(new Set());
                    setError(undefined);
                  }}
                >
                  {formats.includes('ebook') && (
                    <option value="ebook">Ebook</option>
                  )}
                  {formats.includes('audiobook') && (
                    <option value="audiobook">Audiobook</option>
                  )}
                </select>
              </label>
              <div className="setlist">
                {books.map((book) => {
                  const requestable = eligible(book);
                  const checked = selected.has(book.id);
                  return (
                    <label className="set cfg-row" key={book.id}>
                      <span>
                        {book.title}
                        {!requestable && (
                          <small>In library, requested, or blocked</small>
                        )}
                      </span>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={
                          busy ||
                          !requestable ||
                          (!checked && selected.size >= limit)
                        }
                        onChange={(event) => toggle(book, event.target.checked)}
                      />
                    </label>
                  );
                })}
              </div>
              {offset !== undefined && (
                <div className="toolbar">
                  <button
                    className="btn btn-tonal btn-sm"
                    type="button"
                    disabled={busy}
                    onClick={() => void loadMore()}
                  >
                    Load More Books
                  </button>
                </div>
              )}
              <p className="note" role="status">
                {selected.size} of {limit} selected
              </p>
              {error && (
                <p className="note" role="alert">
                  {error}
                </p>
              )}
            </>
          )}
          <div className="pk-foot">
            {!result && (
              <button
                className="btn btn-primary"
                type="button"
                disabled={busy || !selected.size}
                onClick={() => void submit()}
              >
                Request Selected Books
              </button>
            )}
            <button
              className="btn btn-quiet"
              type="button"
              disabled={busy}
              onClick={finish}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function BulkBookRequest({
  source,
  onComplete,
}: {
  source: Source;
  onComplete: () => void;
}) {
  const { user } = useAuth();
  const settings = usePublicSettings();
  const [open, setOpen] = useState(false);
  const permissions = user?.permissions;
  const canRequest =
    isAdministrator(permissions) ||
    (typeof permissions === 'number' &&
      Number.isSafeInteger(permissions) &&
      permissions >= 0 &&
      (BigInt(permissions) & (32n | (1n << 35n))) !== 0n);
  const formats: Format[] = [];
  if (
    settings?.ebookServiceEnabled &&
    settings.enabledMediaCategories?.book !== false
  )
    formats.push('ebook');
  if (
    settings?.audiobookServiceEnabled &&
    settings.enabledMediaCategories?.audiobook !== false
  )
    formats.push('audiobook');
  if (
    !canRequest ||
    !formats.length ||
    (!source.books.length && source.nextOffset === undefined)
  )
    return null;
  return (
    <>
      <button
        className="btn btn-tonal btn-sm"
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        Request Books
      </button>
      {open && (
        <RequestSheet
          source={source}
          formats={formats}
          close={() => setOpen(false)}
          onComplete={onComplete}
        />
      )}
    </>
  );
}
