import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, bookMediaForFormat, MediaStatus, type BookResult } from '../api';
import { isAdministrator, useAuth } from '../auth';
import { friendlyError } from '../errors';
import { dropBookStates, useApi, usePublicSettings } from '../hooks';
import { canRequestAs } from './detail';
import { ServiceNote } from './extra';
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

interface Destination {
  serverId?: number;
  profileId?: number;
  metadataProfileId?: number;
  rootFolder?: string;
  tags?: number[];
  userId?: number;
}
interface BookService {
  id: number;
  name: string;
  backend?: 'readarr' | 'bindery' | 'bookorbit';
  serviceType?: Format | 'both';
  activeTags?: number[];
}
interface BookServiceDetails {
  server: BookService;
  profiles: { id: number; name: string }[];
  metadataProfiles?: { id: number; name: string }[];
  rootFolders: { path?: string }[];
  tags: { id: number; label: string }[];
}

function mayChooseDestination(permissions: unknown) {
  return (
    isAdministrator(permissions) ||
    (typeof permissions === 'number' &&
      Number.isSafeInteger(permissions) &&
      permissions >= 0 &&
      (BigInt(permissions) & (16n | 8192n)) !== 0n)
  );
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
  const { user } = useAuth();
  const dialog = useRef<HTMLDivElement>(null);
  const pending = useRef(false);
  const [books, setBooks] = useState(source.books);
  const [offset, setOffset] = useState(source.nextOffset);
  const [format, setFormat] = useState(formats[0]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<Result>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [destination, setDestination] = useState<Destination>({});
  const allowed = mayChooseDestination(user?.permissions);
  const asAllowed = canRequestAs(user?.permissions);
  const servers = useApi<BookService[]>(
    advanced && allowed ? '/service/readarr' : null
  );
  const details = useApi<BookServiceDetails>(
    allowed && destination.serverId !== undefined
      ? `/service/readarr/${destination.serverId}`
      : null,
    { currentPathOnly: true }
  );
  const users = useApi<{ results: { id: number; displayName: string }[] }>(
    advanced && asAllowed ? '/user?take=100&skip=0&sort=displayname' : null
  );
  const available = (servers.data ?? []).filter(
    (server) =>
      (server.serviceType === 'both' && server.backend !== 'readarr') ||
      (server.serviceType === 'audiobook' ? 'audiobook' : 'ebook') === format
  );
  const chosen =
    details.data?.server.id === destination.serverId ? details.data : null;
  const destinationReady =
    !allowed || destination.serverId === undefined || !!chosen;
  const tags = destination.tags ?? chosen?.server.activeTags ?? [];
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
    if (!selected.size || pending.current || result || !destinationReady)
      return;
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
          body: JSON.stringify({
            mediaType: 'book',
            format,
            items,
            ...(allowed ? destination : {}),
            userId: asAllowed ? destination.userId : undefined,
          }),
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
                    setDestination((current) => ({ userId: current.userId }));
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
              {allowed && (
                <details
                  className="adv"
                  onToggle={(event) => {
                    if (event.currentTarget.open) setAdvanced(true);
                  }}
                >
                  <summary>Advanced Request Options</summary>
                  <div className="adv-grid">
                    {asAllowed && !!users.data?.results?.length && (
                      <label className="sel">
                        <span className="lbl">Request As</span>
                        <select
                          value={destination.userId ?? ''}
                          disabled={busy}
                          onChange={(event) => {
                            const value = event.target.value;
                            setDestination((current) => ({
                              ...current,
                              userId: value ? Number(value) : undefined,
                            }));
                          }}
                        >
                          <option value="">Me</option>
                          {users.data.results
                            .filter((person) => person.id !== user?.id)
                            .map((person) => (
                              <option key={person.id} value={person.id}>
                                {person.displayName}
                              </option>
                            ))}
                        </select>
                      </label>
                    )}
                    <label className="sel">
                      <span className="lbl">Book Service</span>
                      <select
                        value={destination.serverId ?? ''}
                        disabled={busy}
                        onChange={(event) => {
                          const value = event.target.value;
                          setDestination((current) => ({
                            userId: current.userId,
                            serverId: value ? Number(value) : undefined,
                          }));
                        }}
                      >
                        <option value="">Use Default</option>
                        {available.map((server) => (
                          <option key={server.id} value={server.id}>
                            {server.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    {(
                      [
                        ['profileId', 'Quality Profile', chosen?.profiles],
                        [
                          'metadataProfileId',
                          'Metadata Profile',
                          chosen?.metadataProfiles,
                        ],
                      ] as const
                    ).map(
                      ([key, label, options]) =>
                        !!options?.length && (
                          <label className="sel" key={key}>
                            <span className="lbl">{label}</span>
                            <select
                              value={destination[key] ?? ''}
                              disabled={busy}
                              onChange={(event) => {
                                const value = event.target.value;
                                setDestination((current) => ({
                                  ...current,
                                  [key]: value ? Number(value) : undefined,
                                }));
                              }}
                            >
                              <option value="">Use Default</option>
                              {options.map((option) => (
                                <option key={option.id} value={option.id}>
                                  {option.name}
                                </option>
                              ))}
                            </select>
                          </label>
                        )
                    )}
                    {!!chosen?.rootFolders.length && (
                      <label className="sel">
                        <span className="lbl">Root Folder</span>
                        <select
                          value={destination.rootFolder ?? ''}
                          disabled={busy}
                          onChange={(event) => {
                            const value = event.target.value;
                            setDestination((current) => ({
                              ...current,
                              rootFolder: value || undefined,
                            }));
                          }}
                        >
                          <option value="">Use Default</option>
                          {chosen.rootFolders.map(
                            ({ path }) =>
                              path && (
                                <option key={path} value={path}>
                                  {path}
                                </option>
                              )
                          )}
                        </select>
                      </label>
                    )}
                  </div>
                  {!!chosen?.tags.length && (
                    <div
                      className="setlist"
                      role="group"
                      aria-label="Request Tags"
                    >
                      {chosen.tags.map((tag) => (
                        <label className="set cfg-row" key={tag.id}>
                          <span>{tag.label}</span>
                          <input
                            type="checkbox"
                            checked={tags.includes(tag.id)}
                            disabled={busy}
                            onChange={(event) => {
                              const next = event.target.checked
                                ? [...tags, tag.id]
                                : tags.filter((id) => id !== tag.id);
                              setDestination((current) => ({
                                ...current,
                                tags: next,
                              }));
                            }}
                          />
                        </label>
                      ))}
                    </div>
                  )}
                  <ServiceNote
                    what="book services"
                    error={servers.error}
                    retry={servers.reload}
                  />
                  <ServiceNote
                    what="book service options"
                    error={details.error}
                    retry={details.reload}
                  />
                  {!destinationReady && !details.error && (
                    <p className="note" role="status">
                      Loading book service options…
                    </p>
                  )}
                </details>
              )}
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
                disabled={busy || !selected.size || !destinationReady}
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
  fixedFormat,
}: {
  source: Source;
  onComplete: () => void;
  fixedFormat?: Format;
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
    fixedFormat !== 'audiobook' &&
    settings?.ebookServiceEnabled &&
    settings.enabledMediaCategories?.ebook !== false &&
    settings.enabledMediaCategories?.book !== false
  )
    formats.push('ebook');
  if (
    fixedFormat !== 'ebook' &&
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
