import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { Section } from '../components/cards';
import { ServiceNote } from '../components/extra';
import { friendlyError } from '../errors';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';
import { sessionGeneration } from '../sessionState';

type Format = 'ebook' | 'audiobook';
type Service = {
  id: number;
  name: string;
  serviceType?: Format;
  backend?: string;
};
type Author = {
  id: number;
  name: string;
  path: string;
  currentFormatPath: string;
  bookFileCount: number;
};
type Configuration = {
  authors: Author[];
  rootFolders: { id: number; path: string; accessible: boolean }[];
  truncated: boolean;
};
type FilePreview = {
  fileType: string;
  status: string;
  sourcePath: string;
  destinationPath: string;
};
type Preview = {
  previewToken: string;
  authorCount: number;
  mediaFileCount: number;
  sidecarFileCount: number;
  missingFileCount: number;
  requiredCopyBytes: number;
  availableSpace?: number;
  canMove: boolean;
  conflicts: string[];
  warnings: string[];
  authors: {
    authorId: number;
    authorName: string;
    sourcePath: string;
    destinationPath: string;
    mediaFileCount: number;
    sidecarFileCount: number;
    missingFileCount: number;
    files: FilePreview[];
  }[];
};
type Command = { id: number; status: string; progress?: number };

const servicesPath = '/settings/readarr';
const batchLimit = 1000;
const pageSize = 100;
const terminalStatuses = new Set([
  'completed',
  'failed',
  'aborted',
  'cancelled',
  'orphaned',
]);

function normalizePath(path: string) {
  const normalized = path.replaceAll('\\', '/').replace(/\/+$/, '') || '/';
  return /^[a-z]:\//i.test(normalized) ? normalized.toLowerCase() : normalized;
}

function diskSpace(bytes: number) {
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(bytes / 1024 ** 3)} GiB (${bytes.toLocaleString()} bytes)`;
}

function PreviewDetails({ preview }: { preview: Preview }) {
  const { t } = useLumenLocale();
  return (
    <>
      <p className="note">
        {t(
          'lumen.migration.previewCounts',
          '{authors} authors · {media} media files · {sidecars} sidecar files · {missing} missing files to skip',
          {
            authors: preview.authorCount,
            media: preview.mediaFileCount,
            sidecars: preview.sidecarFileCount,
            missing: preview.missingFileCount,
          }
        )}
      </p>
      <p className="note">
        {t('lumen.migration.requiredSpace', 'Required copy space: {space}.', {
          space: diskSpace(preview.requiredCopyBytes),
        })}
        {preview.availableSpace === undefined
          ? ` ${t('lumen.migration.spaceUnavailable', 'Destination free space was unavailable.')}`
          : ` ${t('lumen.migration.availableSpace', 'Available: {space}.', { space: diskSpace(preview.availableSpace) })}`}
      </p>
      <div className="setlist">
        {preview.warnings.map((warning, index) => (
          <div key={index} className="set">
            <small>
              {t('lumen.migration.warning', 'Warning: {message}', {
                message: warning,
              })}
            </small>
          </div>
        ))}
        {preview.conflicts.map((conflict, index) => (
          <div key={index} className="set">
            <small>
              {t('lumen.migration.conflict', 'Conflict: {message}', {
                message: conflict,
              })}
            </small>
          </div>
        ))}
      </div>
      <details>
        <summary>
          {t('lumen.migration.reviewAuthorsFiles', 'Review Authors and Files')}
        </summary>
        <div className="setlist">
          {preview.authors.map((author) => (
            <AuthorPreview key={author.authorId} author={author} />
          ))}
        </div>
      </details>
    </>
  );
}

function AuthorPreview({ author }: { author: Preview['authors'][number] }) {
  const { t } = useLumenLocale();
  const [open, setOpen] = useState(false);
  return (
    <details
      className="adv"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        <b>{author.authorName}</b>
      </summary>
      {open && (
        <div className="setlist">
          <div className="set">
            <small>
              {author.sourcePath} → {author.destinationPath}
            </small>
          </div>
          <div className="set">
            <small>
              {t(
                'lumen.migration.authorFileCounts',
                '{media} media · {sidecars} sidecar · {missing} missing',
                {
                  media: author.mediaFileCount,
                  sidecars: author.sidecarFileCount,
                  missing: author.missingFileCount,
                }
              )}
            </small>
          </div>
          {author.files.map((file, index) => (
            <div className="set" key={index}>
              <small>
                {file.status === 'alreadyAtDestination'
                  ? t(
                      'lumen.migration.alreadyAtDestination',
                      'Already at destination'
                    )
                  : file.status}{' '}
                ({file.fileType}): {file.sourcePath} → {file.destinationPath}
              </small>
            </div>
          ))}
          {author.files.length === 0 && (
            <p className="note">
              {t(
                'lumen.migration.noIndividualFiles',
                'BookshelfNG did not include individual files.'
              )}
            </p>
          )}
        </div>
      )}
    </details>
  );
}

function MigrationForm({ services }: { services: Service[] }) {
  const { t } = useLumenLocale();
  const preferred =
    services.find((service) => service.serviceType === 'audiobook') ??
    services[0];
  const [serviceId, setServiceId] = useState(preferred.id);
  const [format, setFormat] = useState<Format>(
    preferred.serviceType ?? 'ebook'
  );
  const [source, setSource] = useState('');
  const [destination, setDestination] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<number[]>([]);
  const [preview, setPreview] = useState<Preview>();
  const [confirmed, setConfirmed] = useState(false);
  const [command, setCommand] = useState<Command>();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const pending = useRef(false);
  const path = `${servicesPath}/${serviceId}/media-move`;
  const configuration = useApi<Configuration>(
    `${path}/configuration?format=${format}`,
    { currentPathOnly: true }
  );
  const commandId = command?.id;
  const commandStatus = command?.status.toLowerCase();
  const running =
    commandStatus !== undefined && !terminalStatuses.has(commandStatus);
  const status = useApi<{ command: Command }>(
    commandId && running ? `${path}/commands/${commandId}` : null,
    { currentPathOnly: true, keepDuringRefresh: true }
  );
  const refreshed = status.data?.command;
  const refreshConfiguration = configuration.reload;
  const refreshStatus = status.refresh;

  useEffect(() => {
    if (!running || !commandId) return;
    const timer = window.setInterval(refreshStatus, 2500);
    return () => window.clearInterval(timer);
  }, [commandId, refreshStatus, running]);

  useEffect(() => {
    if (!running || !refreshed || refreshed.id !== commandId) return;
    setCommand(refreshed);
  }, [commandId, refreshed, running]);

  useEffect(() => {
    if (commandStatus !== 'completed') return;
    setSelected([]);
    refreshConfiguration();
  }, [commandId, commandStatus, refreshConfiguration]);

  const disabled = busy || running;
  const roots =
    configuration.data?.rootFolders.filter((root) => root.accessible) ?? [];
  const destinationValid = roots.some((root) => root.path === destination);
  const authors = configuration.data?.authors ?? [];
  const sourcePaths = [
    ...new Set(
      authors.map((author) => author.currentFormatPath).filter(Boolean)
    ),
  ].sort((a, b) => a.localeCompare(b));
  const term = query.trim().toLocaleLowerCase();
  const filtered = authors.filter(
    (author) =>
      (!source ||
        normalizePath(author.currentFormatPath) === normalizePath(source)) &&
      author.name.toLocaleLowerCase().includes(term)
  );
  const selectedSet = new Set(selected);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visiblePage = Math.min(page, pageCount - 1);
  const canPreview =
    destinationValid && selected.length > 0 && selected.length <= batchLimit;
  const canStart =
    canPreview &&
    preview?.canMove &&
    preview.conflicts.length === 0 &&
    !!preview.previewToken;

  function invalidate() {
    setPreview(undefined);
    setConfirmed(false);
    setFailure('');
    setCommand(undefined);
  }

  function select(next: number[]) {
    setSelected(next);
    invalidate();
  }

  function resetLibrary() {
    setSource('');
    setDestination('');
    setPage(0);
    select([]);
  }

  async function submit(start: boolean) {
    if (
      pending.current ||
      disabled ||
      !canPreview ||
      (start && (!canStart || !confirmed))
    )
      return;
    const token = preview?.previewToken;
    const generation = sessionGeneration();
    pending.current = true;
    setBusy(true);
    invalidate();
    const body = {
      authorIds: selected,
      format,
      destinationRootPath: destination,
      ...(source ? { sourceRootPath: source } : {}),
    };
    try {
      if (start) {
        const result = await api<{ command: Command }>(`${path}/start`, {
          method: 'POST',
          body: JSON.stringify({ ...body, previewToken: token }),
        });
        if (generation === sessionGeneration()) setCommand(result.command);
      } else {
        const result = await api<Preview>(`${path}/preview`, {
          method: 'POST',
          body: JSON.stringify(body),
        });
        if (generation === sessionGeneration()) setPreview(result);
      }
    } catch (error) {
      if (generation === sessionGeneration())
        setFailure(
          friendlyError(
            error,
            start
              ? t(
                  'lumen.migration.startFailed',
                  'Could not start the move. Check BookshelfNG before submitting a new preview.'
                )
              : t(
                  'lumen.migration.previewFailed',
                  'Could not preview the move.'
                )
          )
        );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <Section
        title={t('lumen.migration.bookshelfLibrary', 'Bookshelf Library')}
      >
        <div className="setlist">
          <label className="set cfg-row">
            <span>
              {t('lumen.migration.bookshelfService', 'Bookshelf Service')}
            </span>
            <select
              className="cfg-select"
              value={serviceId}
              disabled={disabled}
              onChange={(event) => {
                const id = Number(event.target.value);
                setServiceId(id);
                setFormat(
                  services.find((service) => service.id === id)?.serviceType ??
                    'ebook'
                );
                resetLibrary();
              }}
            >
              {services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name}
                </option>
              ))}
            </select>
          </label>
          <label className="set cfg-row">
            <span>{t('lumen.migration.mediaFormat', 'Media Format')}</span>
            <select
              className="cfg-select"
              value={format}
              disabled={disabled}
              onChange={(event) => {
                setFormat(
                  event.target.value === 'audiobook' ? 'audiobook' : 'ebook'
                );
                resetLibrary();
              }}
            >
              <option value="ebook">
                {t('lumen.migration.books', 'Books')}
              </option>
              <option value="audiobook">
                {t('lumen.migration.audiobooks', 'Audiobooks')}
              </option>
            </select>
          </label>
          <label className="set cfg-row">
            <span>{t('lumen.migration.currentFolder', 'Current Folder')}</span>
            <select
              className="cfg-select"
              value={source}
              disabled={disabled || !configuration.data}
              onChange={(event) => {
                setSource(event.target.value);
                setPage(0);
                select([]);
              }}
            >
              <option value="">
                {t('lumen.migration.allCurrentFolders', 'All Current Folders')}
              </option>
              {sourcePaths.map((folder) => (
                <option key={folder}>{folder}</option>
              ))}
            </select>
          </label>
          <label className="set cfg-row">
            <span>
              {t(
                'lumen.migration.destinationRootFolder',
                'Destination Root Folder'
              )}
            </span>
            <select
              className="cfg-select"
              value={destination}
              disabled={disabled || !configuration.data}
              onChange={(event) => {
                setDestination(event.target.value);
                invalidate();
              }}
            >
              <option value="">
                {t('lumen.migration.chooseRootFolder', 'Choose a Root Folder')}
              </option>
              {roots.map((root) => (
                <option key={root.id}>{root.path}</option>
              ))}
            </select>
          </label>
          <label className="set cfg-row">
            <span>{t('lumen.migration.filterAuthors', 'Filter Authors')}</span>
            <input
              className="cfg-input"
              type="search"
              value={query}
              maxLength={200}
              disabled={disabled}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(0);
              }}
            />
          </label>
        </div>
        <ServiceNote
          error={configuration.error}
          what={t('lumen.migration.bookshelfLibrary', 'Bookshelf Library')}
          title={t(
            'lumen.migration.libraryLoadFailed',
            'Could not load the Bookshelf library'
          )}
          retryLabel={t('lumen.migration.retry', 'Retry')}
          retry={configuration.reload}
        />
        {!configuration.data && !configuration.error && (
          <p className="note" role="status">
            {t('lumen.migration.libraryLoading', 'Loading Bookshelf library…')}
          </p>
        )}
      </Section>
      {configuration.data && (
        <Section title={t('lumen.migration.authors', 'Authors')}>
          {configuration.data.truncated && (
            <p className="note">
              {t(
                'lumen.migration.tooManyAuthors',
                'BookshelfNG returned the first 10,000 authors. Narrow the list before selecting a batch.'
              )}
            </p>
          )}
          <p className="note" role="status">
            {t(
              'lumen.migration.selectedAuthors',
              '{count} authors selected. Each batch can include up to 1,000 authors.',
              { count: selected.length }
            )}
          </p>
          <div className="toolbar">
            <button
              className="btn btn-quiet btn-sm"
              disabled={disabled || !filtered.length}
              onClick={() =>
                select(filtered.slice(0, batchLimit).map(({ id }) => id))
              }
            >
              {t(
                'lumen.migration.selectMatchingAuthors',
                'Select Matching Authors'
              )}
            </button>
            <button
              className="btn btn-quiet btn-sm"
              disabled={disabled || !selected.length}
              onClick={() => select([])}
            >
              {t('lumen.migration.clearSelection', 'Clear Selection')}
            </button>
          </div>
          {!filtered.length && (
            <p className="note">
              {t(
                'lumen.migration.noAuthorsMatch',
                'No authors match these filters.'
              )}
            </p>
          )}
          <div className="setlist">
            {filtered
              .slice(visiblePage * pageSize, (visiblePage + 1) * pageSize)
              .map((author) => (
                <label className="set pick pick-row" key={author.id}>
                  <span>
                    <b>{author.name}</b>
                    <small>
                      {author.currentFormatPath || author.path} ·{' '}
                      {t(
                        'lumen.migration.registeredFiles',
                        '{count} registered files',
                        { count: author.bookFileCount }
                      )}
                    </small>
                  </span>
                  <input
                    type="checkbox"
                    aria-label={t(
                      'lumen.migration.selectAuthor',
                      'Select {name}',
                      { name: author.name }
                    )}
                    checked={selectedSet.has(author.id)}
                    disabled={
                      disabled ||
                      (!selectedSet.has(author.id) &&
                        selected.length >= batchLimit)
                    }
                    onChange={(event) =>
                      select(
                        event.target.checked
                          ? [...selected, author.id]
                          : selected.filter((id) => id !== author.id)
                      )
                    }
                  />
                </label>
              ))}
          </div>
          {pageCount > 1 && (
            <nav
              className="toolbar"
              aria-label={t('lumen.migration.authorPages', 'Author Pages')}
            >
              <button
                className="btn btn-quiet btn-sm"
                disabled={visiblePage === 0}
                onClick={() => setPage(visiblePage - 1)}
              >
                {t('lumen.migration.previousPage', 'Previous Page')}
              </button>
              <span>
                {t('lumen.migration.pageOf', 'Page {page} of {total}', {
                  page: visiblePage + 1,
                  total: pageCount,
                })}
              </span>
              <button
                className="btn btn-quiet btn-sm"
                disabled={visiblePage + 1 >= pageCount}
                onClick={() => setPage(visiblePage + 1)}
              >
                {t('lumen.migration.nextPage', 'Next Page')}
              </button>
            </nav>
          )}
          <div className="toolbar">
            <button
              className="btn btn-primary btn-sm"
              disabled={disabled || !canPreview}
              onClick={() => void submit(false)}
            >
              {t('lumen.migration.previewMove', 'Preview Move')}
            </button>
          </div>
        </Section>
      )}
      {preview && (
        <Section title={t('lumen.migration.movePreview', 'Move Preview')}>
          <PreviewDetails preview={preview} />
          {canStart ? (
            <>
              <label className="set cfg-row">
                <span>
                  {t(
                    'lumen.migration.confirmMove',
                    'I reviewed this preview and want BookshelfNG to move these files.'
                  )}
                </span>
                <input
                  type="checkbox"
                  checked={confirmed}
                  disabled={disabled}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />
              </label>
              <div className="toolbar">
                <button
                  className="btn btn-primary btn-sm"
                  disabled={disabled || !confirmed}
                  onClick={() => void submit(true)}
                >
                  {t('lumen.migration.startMove', 'Start Move')}
                </button>
              </div>
            </>
          ) : (
            <p className="note">
              {t(
                'lumen.migration.cannotStart',
                'This preview cannot be started. Review the reported conflicts and warnings.'
              )}
            </p>
          )}
        </Section>
      )}
      {busy && (
        <p className="note" role="status">
          {t('lumen.migration.contacting', 'Contacting BookshelfNG…')}
        </p>
      )}
      {command && (
        <p className="note" role="status">
          {t('lumen.migration.moveStatus', 'Move {id}: {status}', {
            id: command.id,
            status: command.status,
          })}
          {running && typeof command.progress === 'number'
            ? ` (${Math.max(0, Math.min(100, command.progress))}%)`
            : ''}
          .
        </p>
      )}
      {running && status.error && (
        <p className="note" role="status">
          {t(
            'lumen.migration.statusRefreshFailed',
            'Status refresh failed. BookshelfNG may still be moving files.'
          )}
        </p>
      )}
      {failure && (
        <p className="note" role="alert">
          {failure}
        </p>
      )}
    </>
  );
}

export default function AdminLibraryMigration() {
  const { t } = useLumenLocale();
  const settings = useApi<Service[]>(servicesPath);
  const services = settings.data?.filter(
    (service) =>
      service.backend !== 'bindery' && service.backend !== 'bookorbit'
  );
  return (
    <>
      <header className="ph">
        <h1>
          {t('lumen.migration.title', 'Bookshelf Library Path Migration')}
        </h1>
        <div className="toolbar">
          <Link className="btn btn-quiet btn-sm" to="/admin">
            {t('lumen.admin.title', 'Administration')}
          </Link>
        </div>
      </header>
      <p className="note">
        {t(
          'lumen.migration.description',
          'Move book or audiobook files between root folders in one BookshelfNG database. A preview checks files, conflicts, and disk space before you confirm the move.'
        )}
      </p>
      <ServiceNote
        error={settings.error}
        what={t('lumen.migration.bookshelfServices', 'Bookshelf services')}
        title={t(
          'lumen.migration.servicesLoadFailed',
          'Could not load Bookshelf services'
        )}
        retryLabel={t('lumen.migration.retry', 'Retry')}
        retry={settings.reload}
      />
      {!services && !settings.error && (
        <p className="note" role="status">
          {t('lumen.migration.servicesLoading', 'Loading Bookshelf services…')}
        </p>
      )}
      {services?.length === 0 && (
        <p className="note">
          {t(
            'lumen.migration.addServiceFirst',
            'Add a BookshelfNG service in SeerrNG Service Settings to migrate its library.'
          )}
        </p>
      )}
      {!!services?.length && <MigrationForm services={services} />}
    </>
  );
}
