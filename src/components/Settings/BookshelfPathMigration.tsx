import Button from '@app/components/Common/Button';
import PageTitle from '@app/components/Common/PageTitle';
import SettingsField from '@app/components/Settings/SettingsField';
import defineMessages from '@app/utils/defineMessages';
import { formatBytes } from '@app/utils/numberHelpers';
import type {
  ReadarrMediaMoveBatchPreview,
  ReadarrMediaMoveCommand,
  ReadarrMediaType,
} from '@server/api/servarr/readarr';
import type { ReadarrSettings } from '@server/lib/settings';
import axios from 'axios';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.Settings.BookshelfPathMigration', {
  title: 'Bookshelf Library Path Migration',
  description:
    'Move book or audiobook files to another root folder managed by the selected BookshelfNG instance.',
  safety:
    'SeerrNG asks BookshelfNG to preview every selected author before a move. The preview reports files, conflicts, missing files, and required disk space. Starting a move requires a fresh preview token.',
  consolidation:
    'Moves run inside one BookshelfNG database. To consolidate an old split deployment, first merge or import its library into the BookshelfNG instance you will keep, then use this page to move the selected format. This page does not copy files or database records between separate BookshelfNG instances.',
  documentation: 'Read the Bookshelf migration guide',
  service: 'Bookshelf service',
  serviceHelp:
    'Choose the BookshelfNG database that owns these authors. If ebook and audiobook entries point to one combined BookshelfNG instance, either entry reaches that same library.',
  servicePlaceholder: 'Choose a configured Bookshelf service',
  format: 'Media format',
  ebook: 'Book',
  audiobook: 'Audiobooks',
  source: 'Current folder',
  allSource: 'All current folders',
  destination: 'Destination root folder',
  destinationHelp:
    'Only accessible root folders from this BookshelfNG instance are available. BookshelfNG checks conflicts and disk space again when the move starts.',
  destinationPlaceholder: 'Choose an accessible root folder',
  search: 'Filter authors',
  selectAll: 'Select all matching authors',
  selectionHelp:
    'Bulk moves are limited to 1,000 authors. Select all adds up to the first 1,000 matches; use the folder and name filters to narrow the batch.',
  clear: 'Clear selection',
  selected: '{count} authors selected',
  author: 'Author',
  selectAuthor: 'Select {author}',
  currentPath: 'Current format path',
  registeredFiles: '{count} registered files',
  noAuthors: 'No authors match the selected format and folder.',
  truncated:
    'BookshelfNG returned the first 10,000 authors. Filter the list before selecting a batch.',
  pageOf: 'Page {page} of {pages}',
  previousPage: 'Previous page',
  nextPage: 'Next page',
  commandStatusError:
    'Move status could not be refreshed. The command may still be running.',
  batchLimit:
    'BookshelfNG accepts at most 1,000 authors per move. Select a smaller batch.',
  preview: 'Preview move',
  previewing: 'Building preview…',
  previewReady: 'Move preview',
  authorsCount: '{count} authors',
  mediaFiles: '{count} media files',
  sidecarFiles: '{count} sidecar files',
  missingFiles: '{count} missing files will be skipped',
  authorFileCounts:
    '{mediaCount, plural, one {# media file} other {# media files}}, {sidecarCount, plural, one {# sidecar file} other {# sidecar files}}, {missingCount, plural, one {# missing file will be skipped} other {# missing files will be skipped}}',
  requiredCopy: 'Required copy space: {size}',
  availableSpace: 'Available destination space: {size}',
  noSpaceEstimate: 'BookshelfNG could not report destination free space.',
  warnings: 'Warnings',
  conflicts: 'Conflicts',
  authorDetails: 'Review authors and destination paths',
  fileStatusReady: 'Ready to move',
  fileStatusMissing: 'Missing; will be skipped',
  fileStatusAlreadyAtDestination: 'Already at destination',
  fileStatusConflict: 'Conflict',
  noPreviewFiles: 'BookshelfNG did not include individual file entries.',
  sourceDestination: '{source} → {destination}',
  confirmation:
    'I reviewed this preview and want BookshelfNG to move these files.',
  start: 'Start move',
  starting: 'Starting move…',
  queued: 'BookshelfNG queued move command {id}.',
  commandStatus: 'Move command status: {status}',
  completed: 'BookshelfNG completed the media move.',
  failed: 'BookshelfNG reported that the media move failed.',
  settingsLoading: 'Loading Bookshelf services…',
  configurationLoading: 'Loading Bookshelf library…',
  noServices:
    'Add a BookshelfNG service under Settings → Services before migrating paths.',
  configurationError:
    'Bookshelf library details could not be loaded. Confirm the service connection and retry.',
  previewError: 'BookshelfNG could not preview this move.',
  startError: 'BookshelfNG could not start this move.',
});

type PathMigrationConfiguration = {
  serviceId: number;
  serviceName: string;
  configuredFormat: ReadarrMediaType;
  format: ReadarrMediaType;
  truncated: boolean;
  authors: {
    id: number;
    name: string;
    path: string;
    currentFormatPath: string;
    bookFileCount: number;
  }[];
  rootFolders: { id: number; path: string; accessible: boolean }[];
};

type MoveCommandResponse = { command: ReadarrMediaMoveCommand };

const normalizePath = (value: string): string => {
  const normalized = value.replaceAll('\\', '/').replace(/\/+$/, '') || '/';
  return /^[a-z]:\//i.test(normalized) ? normalized.toLowerCase() : normalized;
};

const AUTHORS_PER_PAGE = 100;

const responseMessage = (error: unknown, fallback: string): string =>
  axios.isAxiosError<{ message?: string }>(error) &&
  typeof error.response?.data?.message === 'string'
    ? error.response.data.message
    : fallback;

const AuthorMovePreviewDetails = ({
  author,
}: {
  author: ReadarrMediaMoveBatchPreview['authors'][number];
}) => {
  const intl = useIntl();
  const [expanded, setExpanded] = useState(false);
  const statusMessages = {
    ready: messages.fileStatusReady,
    missing: messages.fileStatusMissing,
    alreadyAtDestination: messages.fileStatusAlreadyAtDestination,
    conflict: messages.fileStatusConflict,
  };

  return (
    <details onToggle={(event) => setExpanded(event.currentTarget.open)}>
      <summary className="cursor-pointer break-all">
        <strong>{author.authorName}</strong>:{' '}
        {intl.formatMessage(messages.sourceDestination, {
          source: author.sourcePath,
          destination: author.destinationPath,
        })}{' '}
        {' ('}
        {intl.formatMessage(messages.authorFileCounts, {
          mediaCount: author.mediaFileCount,
          sidecarCount: author.sidecarFileCount,
          missingCount: author.missingFileCount,
        })}
        {')'}
      </summary>
      {expanded && (
        <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto pl-5 text-xs">
          {author.files.map((file, index) => (
            <li
              key={`${author.authorId}-${index}-${file.sourcePath}`}
              className="break-all"
            >
              <span className="font-medium">
                {intl.formatMessage(statusMessages[file.status])}
              </span>{' '}
              <span className="text-gray-400">({file.fileType})</span>:{' '}
              {intl.formatMessage(messages.sourceDestination, {
                source: file.sourcePath,
                destination: file.destinationPath,
              })}
            </li>
          ))}
          {author.files.length === 0 && (
            <li className="text-gray-400">
              {intl.formatMessage(messages.noPreviewFiles)}
            </li>
          )}
        </ul>
      )}
    </details>
  );
};

const BookshelfPathMigration = () => {
  const intl = useIntl();
  const [serviceId, setServiceId] = useState('');
  const [format, setFormat] = useState<ReadarrMediaType>('ebook');
  const [sourceRootPath, setSourceRootPath] = useState('');
  const [destinationRootPath, setDestinationRootPath] = useState('');
  const [query, setQuery] = useState('');
  const [authorPage, setAuthorPage] = useState(0);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [preview, setPreview] = useState<ReadarrMediaMoveBatchPreview | null>(
    null
  );
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [commandId, setCommandId] = useState<number>();
  const lastTerminalCommand = useRef<number | undefined>(undefined);

  const { data: services, error: servicesError } = useSWR<ReadarrSettings[]>(
    '/api/v1/settings/readarr'
  );
  const compatibleServices = useMemo(
    () => services?.filter((service) => service.backend !== 'bindery') ?? [],
    [services]
  );
  useEffect(() => {
    if (serviceId || !compatibleServices.length) return;
    const preferred =
      compatibleServices.find(
        (service) => service.serviceType === 'audiobook'
      ) ?? compatibleServices[0];
    setServiceId(String(preferred.id));
    setFormat(preferred.serviceType === 'audiobook' ? 'audiobook' : 'ebook');
  }, [serviceId, compatibleServices]);

  const configurationUrl = serviceId
    ? `/api/v1/settings/readarr/${serviceId}/media-move/configuration?format=${format}`
    : null;
  const {
    data: configuration,
    error: configurationError,
    isLoading: configurationLoading,
    mutate: refreshConfiguration,
  } = useSWR<PathMigrationConfiguration>(configurationUrl);
  const commandUrl =
    serviceId && commandId
      ? `/api/v1/settings/readarr/${serviceId}/media-move/commands/${commandId}`
      : null;
  const { data: commandResponse, error: commandError } =
    useSWR<MoveCommandResponse>(commandUrl, {
      dedupingInterval: 0,
      refreshInterval: (data) => {
        const status = data?.command.status.toLowerCase();
        return status &&
          ['completed', 'failed', 'aborted', 'cancelled', 'orphaned'].includes(
            status
          )
          ? 0
          : 2500;
      },
    });

  const sourcePaths = useMemo(() => {
    const paths = new Set(
      (configuration?.authors ?? [])
        .map((author) => author.currentFormatPath)
        .filter(Boolean)
    );
    return [...paths].sort((left, right) => left.localeCompare(right));
  }, [configuration?.authors]);
  const filteredAuthors = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return (configuration?.authors ?? []).filter((author) => {
      const sourceMatches =
        !sourceRootPath ||
        normalizePath(author.currentFormatPath) ===
          normalizePath(sourceRootPath);
      return (
        sourceMatches &&
        (!normalizedQuery ||
          author.name.toLocaleLowerCase().includes(normalizedQuery))
      );
    });
  }, [configuration?.authors, query, sourceRootPath]);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const command = commandResponse?.command;
  const commandStatus = command?.status.toLowerCase();
  const commandTerminal =
    !!commandStatus &&
    ['completed', 'failed', 'aborted', 'cancelled', 'orphaned'].includes(
      commandStatus
    );
  const commandRunning = Boolean(commandId && !commandTerminal);
  const authorPageCount = Math.max(
    1,
    Math.ceil(filteredAuthors.length / AUTHORS_PER_PAGE)
  );
  const pagedAuthors = filteredAuthors.slice(
    authorPage * AUTHORS_PER_PAGE,
    (authorPage + 1) * AUTHORS_PER_PAGE
  );

  useEffect(() => {
    if (
      !command ||
      !commandTerminal ||
      lastTerminalCommand.current === command.id
    )
      return;
    lastTerminalCommand.current = command.id;
    const complete = commandStatus === 'completed';
    setNotice(
      intl.formatMessage(complete ? messages.completed : messages.failed)
    );
    setConfirmed(false);
    if (complete) {
      setSelectedIds([]);
      setPreview(null);
      void refreshConfiguration();
    }
  }, [command, commandStatus, commandTerminal, intl, refreshConfiguration]);

  useEffect(() => {
    setAuthorPage(0);
  }, [format, query, serviceId, sourceRootPath]);

  const clearPreview = () => {
    setPreview(null);
    setConfirmed(false);
    setErrorMessage('');
    setNotice('');
    setCommandId(undefined);
  };

  const moveRequest = () => ({
    authorIds: selectedIds,
    format,
    destinationRootPath,
    ...(sourceRootPath ? { sourceRootPath } : {}),
  });

  const previewMove = async () => {
    setBusy(true);
    clearPreview();
    try {
      const response = await axios.post<ReadarrMediaMoveBatchPreview>(
        `/api/v1/settings/readarr/${serviceId}/media-move/preview`,
        moveRequest()
      );
      setPreview(response.data);
    } catch (error) {
      setErrorMessage(
        responseMessage(error, intl.formatMessage(messages.previewError))
      );
    } finally {
      setBusy(false);
    }
  };

  const startMove = async () => {
    if (!preview?.previewToken || !confirmed) return;
    setBusy(true);
    setErrorMessage('');
    try {
      const response = await axios.post<MoveCommandResponse>(
        `/api/v1/settings/readarr/${serviceId}/media-move/start`,
        { ...moveRequest(), previewToken: preview.previewToken }
      );
      setCommandId(response.data.command.id);
      setNotice(
        intl.formatMessage(messages.queued, { id: response.data.command.id })
      );
    } catch (error) {
      setErrorMessage(
        responseMessage(error, intl.formatMessage(messages.startError))
      );
    } finally {
      setBusy(false);
    }
  };

  const selectionChanged = (next: number[]) => {
    setSelectedIds(next);
    clearPreview();
  };

  return (
    <div className="text-gray-100">
      <PageTitle title={intl.formatMessage(messages.title)} />
      <h1 className="heading">{intl.formatMessage(messages.title)}</h1>
      <p className="description mb-4">
        {intl.formatMessage(messages.description)}
      </p>
      <div className="mb-4 space-y-2 rounded-lg border border-gray-700 bg-gray-800 p-4 text-sm">
        <p>{intl.formatMessage(messages.safety)}</p>
        <p>{intl.formatMessage(messages.consolidation)}</p>
        <Link
          href="https://github.com/snapetech-org/seerrng/blob/main/docs/using-seerr/bookshelf-media-path-migration.md"
          className="text-blue-400 hover:text-blue-300"
        >
          {intl.formatMessage(messages.documentation)}
        </Link>
      </div>

      {servicesError && (
        <p role="alert" className="mb-4 text-red-300">
          {intl.formatMessage(messages.configurationError)}
        </p>
      )}
      {!services && !servicesError && (
        <p role="status">{intl.formatMessage(messages.settingsLoading)}</p>
      )}
      {services && compatibleServices.length === 0 && (
        <p>{intl.formatMessage(messages.noServices)}</p>
      )}
      {services && compatibleServices.length > 0 && (
        <div className="space-y-4 rounded-lg border border-gray-700 bg-gray-800 p-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm">
                {intl.formatMessage(messages.service)}
              </span>
              <span className="mb-2 block text-xs text-gray-400">
                {intl.formatMessage(messages.serviceHelp)}
              </span>
              <select
                className="w-full"
                value={serviceId}
                disabled={busy || commandRunning}
                onChange={(event) => {
                  const next = compatibleServices.find(
                    (service) => String(service.id) === event.target.value
                  );
                  setServiceId(event.target.value);
                  if (next)
                    setFormat(
                      next.serviceType === 'audiobook' ? 'audiobook' : 'ebook'
                    );
                  setSelectedIds([]);
                  clearPreview();
                }}
              >
                <option value="">
                  {intl.formatMessage(messages.servicePlaceholder)}
                </option>
                {compatibleServices.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.name} · {service.serviceType ?? 'ebook'}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm">
                {intl.formatMessage(messages.format)}
              </span>
              <select
                className="w-full"
                value={format}
                disabled={busy || commandRunning}
                onChange={(event) => {
                  setFormat(event.target.value as ReadarrMediaType);
                  setSourceRootPath('');
                  setSelectedIds([]);
                  clearPreview();
                }}
              >
                <option value="ebook">
                  {intl.formatMessage(messages.ebook)}
                </option>
                <option value="audiobook">
                  {intl.formatMessage(messages.audiobook)}
                </option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm">
                {intl.formatMessage(messages.source)}
              </span>
              <select
                className="w-full"
                value={sourceRootPath}
                disabled={busy || commandRunning}
                onChange={(event) => {
                  setSourceRootPath(event.target.value);
                  setSelectedIds([]);
                  clearPreview();
                }}
              >
                <option value="">
                  {intl.formatMessage(messages.allSource)}
                </option>
                {sourcePaths.map((path) => (
                  <option key={path} value={path}>
                    {path}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm">
                {intl.formatMessage(messages.destination)}
              </span>
              <span className="mb-2 block text-xs text-gray-400">
                {intl.formatMessage(messages.destinationHelp)}
              </span>
              <select
                className="w-full"
                value={destinationRootPath}
                disabled={busy || commandRunning}
                onChange={(event) => {
                  setDestinationRootPath(event.target.value);
                  clearPreview();
                }}
              >
                <option value="">
                  {intl.formatMessage(messages.destinationPlaceholder)}
                </option>
                {(configuration?.rootFolders ?? [])
                  .filter((folder) => folder.accessible)
                  .map((folder) => (
                    <option key={folder.id} value={folder.path}>
                      {folder.path}
                    </option>
                  ))}
              </select>
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-sm">
              {intl.formatMessage(messages.search)}
            </span>
            <input
              className="w-full"
              maxLength={200}
              value={query}
              disabled={busy || commandRunning}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>

          {configurationLoading && (
            <p role="status">
              {intl.formatMessage(messages.configurationLoading)}
            </p>
          )}
          {configurationError && (
            <p role="alert" className="text-red-300">
              {responseMessage(
                configurationError,
                intl.formatMessage(messages.configurationError)
              )}
            </p>
          )}
          {configuration?.truncated && (
            <p role="status" className="text-yellow-200">
              {intl.formatMessage(messages.truncated)}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button
              disabled={!filteredAuthors.length || busy || commandRunning}
              onClick={() =>
                selectionChanged(
                  filteredAuthors.slice(0, 1000).map((author) => author.id)
                )
              }
            >
              {intl.formatMessage(messages.selectAll)}
            </Button>
            <Button
              disabled={!selectedIds.length || busy || commandRunning}
              onClick={() => selectionChanged([])}
            >
              {intl.formatMessage(messages.clear)}
            </Button>
            <span aria-live="polite" className="text-sm text-gray-300">
              {intl.formatMessage(messages.selected, {
                count: selectedIds.length,
              })}
            </span>
          </div>
          <p className="text-sm text-gray-400">
            {intl.formatMessage(messages.selectionHelp)}
          </p>

          {filteredAuthors.length === 0 ? (
            <p>{intl.formatMessage(messages.noAuthors)}</p>
          ) : (
            <div className="max-h-[28rem] space-y-2 overflow-y-auto rounded border border-gray-700 p-3">
              {pagedAuthors.map((author) => (
                <div
                  key={author.id}
                  className="flex min-w-0 gap-3 rounded border border-gray-700 p-3 hover:bg-gray-700"
                >
                  <SettingsField
                    type="checkbox"
                    id={`bookshelf-author-${author.id}`}
                    name={`bookshelf-author-${author.id}`}
                    label={intl.formatMessage(messages.selectAuthor, {
                      author: author.name,
                    })}
                    checked={selectedSet.has(author.id)}
                    disabled={
                      busy ||
                      commandRunning ||
                      (!selectedSet.has(author.id) &&
                        selectedIds.length >= 1000)
                    }
                    onCheckedChange={(checked) =>
                      selectionChanged(
                        checked
                          ? [...selectedIds, author.id]
                          : selectedIds.filter((id) => id !== author.id)
                      )
                    }
                  />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {author.name}
                    </span>
                    <span className="block text-xs break-all text-gray-400">
                      {intl.formatMessage(messages.currentPath)}:{' '}
                      {author.currentFormatPath || author.path}
                    </span>
                    <span className="block text-xs text-gray-400">
                      {intl.formatMessage(messages.registeredFiles, {
                        count: author.bookFileCount,
                      })}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}
          {filteredAuthors.length > AUTHORS_PER_PAGE && (
            <nav
              aria-label={intl.formatMessage(messages.search)}
              className="flex flex-wrap items-center gap-3"
            >
              <Button
                disabled={authorPage === 0}
                onClick={() => setAuthorPage((page) => Math.max(0, page - 1))}
              >
                {intl.formatMessage(messages.previousPage)}
              </Button>
              <span aria-live="polite" className="text-sm text-gray-300">
                {intl.formatMessage(messages.pageOf, {
                  page: authorPage + 1,
                  pages: authorPageCount,
                })}
              </span>
              <Button
                disabled={authorPage + 1 >= authorPageCount}
                onClick={() =>
                  setAuthorPage((page) =>
                    Math.min(authorPageCount - 1, page + 1)
                  )
                }
              >
                {intl.formatMessage(messages.nextPage)}
              </Button>
            </nav>
          )}

          {selectedIds.length > 1000 && (
            <p role="alert" className="text-red-300">
              {intl.formatMessage(messages.batchLimit)}
            </p>
          )}
          <Button
            disabled={
              busy ||
              commandRunning ||
              !serviceId ||
              !destinationRootPath ||
              selectedIds.length === 0 ||
              selectedIds.length > 1000
            }
            onClick={() => void previewMove()}
          >
            {busy
              ? intl.formatMessage(messages.previewing)
              : intl.formatMessage(messages.preview)}
          </Button>

          {preview && (
            <section
              aria-labelledby="bookshelf-move-preview"
              className="space-y-3 rounded-lg border border-blue-700 bg-gray-900 p-4"
            >
              <h2 id="bookshelf-move-preview" className="text-lg font-semibold">
                {intl.formatMessage(messages.previewReady)}
              </h2>
              <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
                <span>
                  {intl.formatMessage(messages.authorsCount, {
                    count: preview.authorCount,
                  })}
                </span>
                <span>
                  {intl.formatMessage(messages.mediaFiles, {
                    count: preview.mediaFileCount,
                  })}
                </span>
                <span>
                  {intl.formatMessage(messages.sidecarFiles, {
                    count: preview.sidecarFileCount,
                  })}
                </span>
                {!!preview.missingFileCount && (
                  <span className="text-yellow-200">
                    {intl.formatMessage(messages.missingFiles, {
                      count: preview.missingFileCount,
                    })}
                  </span>
                )}
                <span>
                  {intl.formatMessage(messages.requiredCopy, {
                    size: formatBytes(preview.requiredCopyBytes, 2, intl.locale),
                  })}
                </span>
                {preview.availableSpace !== undefined ? (
                  <span>
                    {intl.formatMessage(messages.availableSpace, {
                      size: formatBytes(preview.availableSpace, 2, intl.locale),
                    })}
                  </span>
                ) : (
                  <span>{intl.formatMessage(messages.noSpaceEstimate)}</span>
                )}
              </div>
              {preview.warnings.length > 0 && (
                <div>
                  <h3 className="font-semibold">
                    {intl.formatMessage(messages.warnings)}
                  </h3>
                  <ul className="list-disc pl-5 text-sm text-yellow-200">
                    {preview.warnings.map((warning, index) => (
                      <li key={`${index}-${warning}`}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}
              {preview.conflicts.length > 0 && (
                <div>
                  <h3 className="font-semibold text-red-300">
                    {intl.formatMessage(messages.conflicts)}
                  </h3>
                  <ul className="list-disc pl-5 text-sm text-red-200">
                    {preview.conflicts.map((conflict, index) => (
                      <li key={`${index}-${conflict}`}>{conflict}</li>
                    ))}
                  </ul>
                </div>
              )}
              <details>
                <summary className="cursor-pointer">
                  {intl.formatMessage(messages.authorDetails)}
                </summary>
                <ul className="mt-2 max-h-96 space-y-3 overflow-y-auto text-xs">
                  {preview.authors.map((author) => (
                    <li key={author.authorId} className="break-all">
                      <AuthorMovePreviewDetails author={author} />
                    </li>
                  ))}
                </ul>
              </details>
              {preview.canMove && preview.conflicts.length === 0 && (
                <>
                  <div className="flex items-start gap-2 text-sm">
                    <SettingsField
                      type="checkbox"
                      id="bookshelf-move-confirmation"
                      name="bookshelf-move-confirmation"
                      label={intl.formatMessage(messages.confirmation)}
                      checked={confirmed}
                      onCheckedChange={setConfirmed}
                    />
                    <span>{intl.formatMessage(messages.confirmation)}</span>
                  </div>
                  <Button
                    disabled={!confirmed || busy || !!commandId}
                    onClick={() => void startMove()}
                  >
                    {busy
                      ? intl.formatMessage(messages.starting)
                      : intl.formatMessage(messages.start)}
                  </Button>
                </>
              )}
            </section>
          )}
          {notice && (
            <p
              role="status"
              className={
                commandTerminal && commandStatus !== 'completed'
                  ? 'text-red-300'
                  : 'text-green-300'
              }
            >
              {notice}
            </p>
          )}
          {command && !commandTerminal && (
            <p role="status">
              {intl.formatMessage(messages.commandStatus, {
                status: command.status,
              })}
              {typeof command.progress === 'number'
                ? ` (${Math.max(0, Math.min(100, command.progress))}%)`
                : ''}
            </p>
          )}
          {commandError && (
            <p role="status" className="text-yellow-200">
              {intl.formatMessage(messages.commandStatusError)}
            </p>
          )}
          {errorMessage && (
            <p role="alert" className="text-red-300">
              {errorMessage}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default BookshelfPathMigration;
