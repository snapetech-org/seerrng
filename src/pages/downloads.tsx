import ApiMessageText from '@app/components/Common/ApiMessageText';
import Button from '@app/components/Common/Button';
import PageTitle from '@app/components/Common/PageTitle';
import { Permission, useUser } from '@app/hooks/useUser';
import defineMessages from '@app/utils/defineMessages';
import type { projectIntervention } from '@server/lib/queueInterventions';
import axios from 'axios';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('downloads', {
  title: 'Download Inbox',
  description:
    'Review acquisition warnings, select files for manual import, and reject unwanted downloads.',
  denied: 'Manage Downloads permission is required.',
  loading: 'Loading download warnings…',
  actions: 'Action history',
  actor: 'User {id}',
  clientKept: 'Client files kept',
  clientRemoved: 'Client removal requested',
  blocklisted: 'Blocklist requested',
  notBlocklisted: 'Release not blocklisted',
  active: 'Active warnings',
  history: 'History',
  empty: 'No download warnings in this view.',
  failed: 'The inbox could not be loaded.',
  refresh: 'Refresh',
  partial:
    'Some acquisition services could not be checked. Their warnings may be missing or out of date.',
  truncated: 'Only the first 20 acquisition services were checked.',
  preview: 'Preview files',
  reject: 'Reject download',
  cancel: 'Cancel',
  confirm: 'Confirm rejection',
  blocklist: 'Blocklist this release to avoid downloading it again',
  remove: 'Remove the download and files from its download client',
  rejection:
    'Rejecting removes this item from the acquisition queue. Review the options before confirming.',
  import: 'Import selected files',
  copy: 'Copy or hardlink (keep source files)',
  move: 'Move (remove source files)',
  importMode: 'Import mode',
  importWarning:
    'Confirm the target and review all rejection reasons. The acquisition service determines file quality and episode matching.',
  targetLabel: 'Library match',
  targetHelp:
    'Search titles already in this acquisition service. Choosing a match does not add a new title.',
  targetQuery: 'Movie, series, album, or book',
  targetChoose: 'Choose a library match',
  targetSelected: 'Selected match: {title}{subtitle}',
  targetNoResults: 'No matching titles were found in this service library.',
  targetRequired: 'Choose a library match before importing files.',
  search: 'Search',
  noFiles: 'No files with a confirmed library target were found.',
  ineligible: 'No confirmed match — cannot import',
  pending: 'Action accepted. Refresh to check the backend outcome.',
  outcome: 'Action could not be confirmed. Refresh and review before retrying.',
  previous: 'Previous page',
  next: 'Next page',
  select: 'Select {name}',
  activeState: 'Needs attention',
  failedState: 'Needs review',
  importingState: 'Import pending',
  rejectingState: 'Rejection pending',
  resolvedState: 'Resolved',
  imported: 'Manually imported',
  rejected: 'Manually rejected',
  blocked: 'Manually blocklisted',
  recovered: 'Recovered',
  disappeared: 'No longer in the queue',
  changed: 'Service configuration changed',
  importFailed: 'Import failed',
  importReview: 'Import completed without a confirmed file import',
  unknownImport: 'Import outcome unknown',
  unknownReject: 'Rejection outcome unknown',
});
type Warning = ReturnType<typeof projectIntervention>;
type Candidate = {
  id: number;
  name: string;
  size: number;
  eligible: boolean;
  rejections: string[];
};
type Target = { id: number; title: string; subtitle: string };
const base = '/api/v1/downloads/interventions';
export default function DownloadsPage() {
  const intl = useIntl();
  const { hasPermission } = useUser();
  const allowed = hasPermission(Permission.MANAGE_DOWNLOADS);
  const [scope, setScope] = useState('active');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Warning | null>(null);
  const [operation, setOperation] = useState<'reject' | 'import' | null>(null);
  const [files, setFiles] = useState<Candidate[] | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const [targets, setTargets] = useState<Target[]>([]);
  const [targetQuery, setTargetQuery] = useState('');
  const [ids, setIds] = useState<number[]>([]);
  const [fingerprint, setFingerprint] = useState('');
  const [mode, setMode] = useState<'copy' | 'move'>('copy');
  const [blocklist, setBlocklist] = useState(true);
  const [remove, setRemove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const requestErrorMessage = (error: unknown) => {
    const message =
      axios.isAxiosError(error) &&
      typeof error.response?.data?.message === 'string'
        ? error.response.data.message
        : undefined;
    return message && message.length <= 400
      ? message
      : intl.formatMessage(messages.outcome);
  };
  const { data, error, isLoading, mutate } = useSWR<{
    results: Warning[];
    total: number;
    partialSources: unknown[];
    truncated: boolean;
  }>(allowed ? `${base}?scope=${scope}&page=${page}` : null, {
    revalidateOnFocus: false,
    dedupingInterval: 30000,
  });
  const close = () => {
    setSelected(null);
    setOperation(null);
    setFiles(null);
    setTarget(null);
    setTargets([]);
    setTargetQuery('');
    setIds([]);
  };
  const loadPreview = async (warning: Warning, targetId?: number) => {
    const response = await axios.get<{
      target: Target | null;
      candidates: Candidate[];
      fingerprint: string;
    }>(`${base}/${warning.id}/preview`, {
      params: targetId ? { targetId } : undefined,
    });
    setTarget(response.data.target);
    setFiles(response.data.candidates);
    setFingerprint(response.data.fingerprint);
    setIds([]);
  };
  const preview = async (warning: Warning) => {
    setNotice('');
    setSelected(warning);
    setOperation('import');
    setFiles(null);
    setTarget(null);
    setTargets([]);
    setTargetQuery(warning.title);
    setIds([]);
    setMode('copy');
    setBusy(true);
    try {
      await loadPreview(warning);
    } catch (error) {
      setNotice(requestErrorMessage(error));
      close();
    } finally {
      setBusy(false);
    }
  };
  const searchTargets = async () => {
    if (!selected || busy) return;
    setBusy(true);
    setNotice('');
    try {
      const response = await axios.get<Target[]>(
        `${base}/${selected.id}/targets`,
        { params: { query: targetQuery } }
      );
      setTargets(response.data);
      if (response.data.length === 0)
        setNotice(intl.formatMessage(messages.targetNoResults));
    } catch (error) {
      setNotice(requestErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  const selectTarget = async (targetId: number) => {
    if (!selected || busy) return;
    const selectedTarget = targets.find((result) => result.id === targetId);
    if (!selectedTarget) return;
    setBusy(true);
    setNotice('');
    setTarget(null);
    setFiles(null);
    setFingerprint('');
    setIds([]);
    try {
      await loadPreview(selected, targetId);
    } catch (error) {
      setNotice(requestErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  const apply = async () => {
    if (!selected || busy) return;
    if (operation === 'import' && !target) {
      setNotice(intl.formatMessage(messages.targetRequired));
      return;
    }
    setBusy(true);
    setNotice('');
    try {
      const result = await axios.post<Warning>(
        `${base}/${selected.id}/${operation === 'reject' ? 'reject' : 'import'}`,
        operation === 'reject'
          ? { blocklist, removeFromClient: remove }
          : {
              candidateIds: ids,
              importMode: mode,
              fingerprint,
              targetId: target?.id,
            }
      );
      setNotice(
        intl.formatMessage(
          result.data.state === 'failed' ? messages.outcome : messages.pending
        )
      );
      close();
      await mutate();
    } catch (error) {
      setNotice(requestErrorMessage(error));
      close();
      await mutate();
    } finally {
      setBusy(false);
    }
  };
  const stateMessages = {
    active: messages.activeState,
    failed: messages.failedState,
    importing: messages.importingState,
    rejecting: messages.rejectingState,
    resolved: messages.resolvedState,
  };
  const resolutions: Record<string, typeof messages.imported> = {
    'manual-import': messages.imported,
    'manual-rejection': messages.rejected,
    'manual-blocklist': messages.blocked,
    recovered: messages.recovered,
    'no-longer-in-queue': messages.disappeared,
    'configuration-changed': messages.changed,
    'import-failed': messages.importFailed,
    'import-needs-review': messages.importReview,
    'import-outcome-unknown': messages.unknownImport,
    'rejection-outcome-unknown': messages.unknownReject,
  };
  return (
    <div className="text-gray-100">
      <PageTitle title={intl.formatMessage(messages.title)} />
      <h1 className="heading">{intl.formatMessage(messages.title)}</h1>
      <p className="description mb-6">
        {intl.formatMessage(messages.description)}
      </p>
      {!allowed ? (
        <p>{intl.formatMessage(messages.denied)}</p>
      ) : (
        <>
          <div className="mb-5 flex flex-wrap gap-3">
            {(['active', 'history'] as const).map((value) => (
              <Button
                key={value}
                buttonType={scope === value ? 'primary' : 'default'}
                onClick={() => {
                  setScope(value);
                  setPage(1);
                  close();
                }}
                disabled={busy}
              >
                {intl.formatMessage(messages[value])}
              </Button>
            ))}
            <Button onClick={() => void mutate()} disabled={busy || isLoading}>
              {intl.formatMessage(messages.refresh)}
            </Button>
          </div>
          {notice && (
            <p role="status" className="mb-4 rounded-md bg-gray-800 p-4">
              {<ApiMessageText>{notice}</ApiMessageText>}
            </p>
          )}
          {error && <p role="alert">{intl.formatMessage(messages.failed)}</p>}
          {!!data?.partialSources.length && (
            <p role="status" className="mb-4 text-yellow-300">
              {intl.formatMessage(messages.partial)}
            </p>
          )}
          {data?.truncated && <p>{intl.formatMessage(messages.truncated)}</p>}
          {isLoading && (
            <p role="status">{intl.formatMessage(messages.loading)}</p>
          )}
          {data?.results.length === 0 && (
            <p>{intl.formatMessage(messages.empty)}</p>
          )}
          <div className="space-y-4" aria-busy={isLoading || busy}>
            {data?.results.map((warning) => (
              <article
                key={warning.id}
                className="rounded-lg border border-gray-700 bg-gray-800 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-semibold break-words">
                      {warning.title}
                    </h2>
                    <p className="text-sm text-gray-400">
                      {warning.serviceName} · {warning.serviceType}
                    </p>
                  </div>
                  <span className="text-sm">
                    {intl.formatMessage(stateMessages[warning.state])}
                  </span>
                </div>
                <ul className="my-3 space-y-1 text-sm break-words text-yellow-200">
                  {warning.warnings.map((text: string, index: number) => (
                    <li key={index}>
                      {<ApiMessageText>{text}</ApiMessageText>}
                    </li>
                  ))}
                </ul>
                {warning.resolution && resolutions[warning.resolution] && (
                  <p className="mb-3 text-sm">
                    {intl.formatMessage(resolutions[warning.resolution])}
                  </p>
                )}
                {!!warning.actions?.length && (
                  <details className="mb-4 text-sm">
                    <summary className="cursor-pointer">
                      {intl.formatMessage(messages.actions)}
                    </summary>
                    <ol className="mt-3 space-y-3">
                      {warning.actions.map((action, index) => (
                        <li key={index} className="rounded-md bg-gray-900 p-3">
                          <p>
                            {intl.formatDate(new Date(action.at), {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            })}{' '}
                            ·{' '}
                            {intl.formatMessage(messages.actor, {
                              id: action.actorId,
                            })}
                          </p>
                          <p>
                            {intl.formatMessage(
                              action.action === 'import'
                                ? messages.import
                                : messages.reject
                            )}{' '}
                            ·{' '}
                            {intl.formatMessage(
                              resolutions[action.state] ??
                                stateMessages[
                                  action.state as keyof typeof stateMessages
                                ] ??
                                messages.failedState
                            )}
                          </p>
                          {action.action === 'reject' && (
                            <p className="text-gray-400">
                              {intl.formatMessage(
                                action.options.blocklist
                                  ? messages.blocklisted
                                  : messages.notBlocklisted
                              )}{' '}
                              ·{' '}
                              {intl.formatMessage(
                                action.options.removeFromClient
                                  ? messages.clientRemoved
                                  : messages.clientKept
                              )}
                            </p>
                          )}
                          {action.action === 'import' && (
                            <p className="text-gray-400">
                              {intl.formatMessage(
                                action.options.importMode === 'move'
                                  ? messages.move
                                  : messages.copy
                              )}
                            </p>
                          )}
                        </li>
                      ))}
                    </ol>
                  </details>
                )}
                {['active', 'failed'].includes(warning.state) && (
                  <div className="flex flex-wrap gap-3">
                    {warning.manualImportCapable && (
                      <Button
                        onClick={() => void preview(warning)}
                        disabled={busy}
                      >
                        {intl.formatMessage(messages.preview)}
                      </Button>
                    )}
                    <Button
                      buttonType="warning"
                      disabled={busy}
                      onClick={() => {
                        setSelected(warning);
                        setOperation('reject');
                        setBlocklist(true);
                        setRemove(false);
                        setNotice('');
                      }}
                    >
                      {intl.formatMessage(messages.reject)}
                    </Button>
                  </div>
                )}
                {selected?.id === warning.id && (
                  <section
                    aria-label={intl.formatMessage(
                      operation === 'reject'
                        ? messages.reject
                        : messages.preview
                    )}
                    className="mt-4 space-y-4 rounded-md border border-gray-600 p-4"
                  >
                    {operation === 'reject' ? (
                      <>
                        <p>{intl.formatMessage(messages.rejection)}</p>
                        <label className="flex items-start gap-2">
                          <input
                            type="checkbox"
                            checked={blocklist}
                            onChange={(event) =>
                              setBlocklist(event.target.checked)
                            }
                            disabled={busy}
                          />
                          <span>{intl.formatMessage(messages.blocklist)}</span>
                        </label>
                        <label className="flex items-start gap-2">
                          <input
                            type="checkbox"
                            checked={remove}
                            onChange={(event) =>
                              setRemove(event.target.checked)
                            }
                            disabled={busy}
                          />
                          <span>{intl.formatMessage(messages.remove)}</span>
                        </label>
                      </>
                    ) : (
                      <>
                        <p>{intl.formatMessage(messages.importWarning)}</p>
                        <div className="space-y-3 rounded-md bg-gray-900 p-3">
                          <div>
                            <p className="font-medium">
                              {intl.formatMessage(messages.targetLabel)}
                            </p>
                            <p className="text-sm text-gray-400">
                              {intl.formatMessage(messages.targetHelp)}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <input
                              className="input input-lite min-w-0 flex-1"
                              type="search"
                              maxLength={120}
                              aria-label={intl.formatMessage(
                                messages.targetQuery
                              )}
                              value={targetQuery}
                              disabled={busy}
                              onChange={(event) =>
                                setTargetQuery(event.target.value)
                              }
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                  event.preventDefault();
                                  void searchTargets();
                                }
                              }}
                            />
                            <Button
                              disabled={busy || targetQuery.trim().length < 2}
                              onClick={() => void searchTargets()}
                            >
                              {intl.formatMessage(messages.search)}
                            </Button>
                          </div>
                          {targets.length > 0 && (
                            <label className="block">
                              {intl.formatMessage(messages.targetChoose)}
                              <select
                                className="input input-lite mt-1 block w-full"
                                value=""
                                disabled={busy}
                                onChange={(event) =>
                                  void selectTarget(Number(event.target.value))
                                }
                              >
                                <option value="">
                                  {intl.formatMessage(messages.targetChoose)}
                                </option>
                                {targets.map((result) => (
                                  <option key={result.id} value={result.id}>
                                    {result.title}
                                    {result.subtitle
                                      ? ` — ${result.subtitle}`
                                      : ''}
                                  </option>
                                ))}
                              </select>
                            </label>
                          )}
                          {target && (
                            <p className="text-sm text-green-300">
                              {intl.formatMessage(messages.targetSelected, {
                                title: target.title,
                                subtitle: target.subtitle
                                  ? ` — ${target.subtitle}`
                                  : '',
                              })}
                            </p>
                          )}
                        </div>
                        {files?.length === 0 && (
                          <p>{intl.formatMessage(messages.noFiles)}</p>
                        )}
                        {files?.map((file) => (
                          <label
                            key={file.id}
                            className="flex items-start gap-3 rounded-md bg-gray-900 p-3"
                          >
                            <input
                              type="checkbox"
                              disabled={!file.eligible || busy}
                              aria-label={intl.formatMessage(messages.select, {
                                name: file.name,
                              })}
                              checked={ids.includes(file.id)}
                              onChange={(event) =>
                                setIds((previous) =>
                                  event.target.checked
                                    ? [...previous, file.id].slice(0, 50)
                                    : previous.filter((id) => id !== file.id)
                                )
                              }
                            />
                            <span className="min-w-0 break-words">
                              <span className="block">{file.name}</span>
                              <span className="text-xs text-gray-400">
                                {intl.formatNumber(file.size / 1048576, {
                                  maximumFractionDigits: 1,
                                })}{' '}
                                MB
                              </span>
                              {!file.eligible && (
                                <span className="block text-yellow-300">
                                  {intl.formatMessage(messages.ineligible)}
                                </span>
                              )}
                              {file.rejections.map((reason, index) => (
                                <span
                                  key={index}
                                  className="block text-sm text-yellow-200"
                                >
                                  <ApiMessageText>{reason}</ApiMessageText>
                                </span>
                              ))}
                            </span>
                          </label>
                        ))}
                        <label className="block">
                          {intl.formatMessage(messages.importMode)}
                          <select
                            className="mt-2 block w-full"
                            value={mode}
                            disabled={busy}
                            onChange={(event) =>
                              setMode(event.target.value as 'copy' | 'move')
                            }
                          >
                            <option value="copy">
                              {intl.formatMessage(messages.copy)}
                            </option>
                            <option value="move">
                              {intl.formatMessage(messages.move)}
                            </option>
                          </select>
                        </label>
                      </>
                    )}
                    <div className="flex flex-wrap gap-3">
                      <Button
                        buttonType={
                          operation === 'reject' ? 'warning' : 'primary'
                        }
                        disabled={
                          busy ||
                          (operation === 'import' && (!ids.length || !target))
                        }
                        onClick={() => void apply()}
                      >
                        {intl.formatMessage(
                          operation === 'reject'
                            ? messages.confirm
                            : messages.import
                        )}
                      </Button>
                      <Button disabled={busy} onClick={close}>
                        {intl.formatMessage(messages.cancel)}
                      </Button>
                    </div>
                  </section>
                )}
              </article>
            ))}
          </div>
          <div className="mt-6 flex gap-3">
            <Button
              disabled={page <= 1 || busy}
              onClick={() => {
                setPage((value) => value - 1);
                close();
              }}
            >
              {intl.formatMessage(messages.previous)}
            </Button>
            <Button
              disabled={!data || page * 25 >= data.total || busy}
              onClick={() => {
                setPage((value) => value + 1);
                close();
              }}
            >
              {intl.formatMessage(messages.next)}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
