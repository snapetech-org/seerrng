import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { api, ApiError, MediaStatus, type MediaInfo } from '../api';
import { useAuth } from '../auth';
import { useApi } from '../hooks';
import { canCreateIssues, canManageIssues } from '../issuePermissions';
import { ServiceNote } from './extra';
import { useDialog } from './useDialog';

type MediaType = 'movie' | 'tv' | 'book' | 'comic' | 'magazine' | 'music';
interface Season {
  seasonNumber: number;
  status?: number;
  status4k?: number;
}
interface Scope {
  seasonNumber: number;
  episodeNumbers?: number[];
}
interface IssueReporter {
  id: number;
  displayName: string;
}

const TYPES = { 4: 'Other', 2: 'Audio', 1: 'Video', 3: 'Subtitles' };
const REASONS = {
  book: [
    'missing_content',
    'wrong_edition',
    'damaged_file',
    'incorrect_metadata',
    'other',
  ],
  comic: [
    'missing_issue',
    'wrong_edition',
    'damaged_file',
    'incorrect_metadata',
    'other',
  ],
  magazine: [
    'missing_issue',
    'wrong_issue',
    'damaged_file',
    'incorrect_metadata',
    'other',
  ],
};
const REASON_LABELS: Record<string, string> = {
  missing_content: 'Missing content',
  missing_issue: 'Missing issue',
  wrong_edition: 'Wrong edition or variant',
  wrong_issue: 'Wrong issue or date',
  damaged_file: 'Damaged or unreadable file',
  incorrect_metadata: 'Incorrect title or metadata',
  other: 'Other',
};

const eligible = (status: number | undefined, type: MediaType) =>
  status === MediaStatus.AVAILABLE ||
  (status === MediaStatus.PARTIAL && type !== 'movie' && type !== 'music') ||
  (status === MediaStatus.PROCESSING && (type === 'movie' || type === 'tv'));

function Episodes({
  tvId,
  scope,
  change,
  disabled,
}: {
  tvId: number;
  scope: Scope;
  change: (numbers?: number[]) => void;
  disabled: boolean;
}) {
  const { data, error, reload } = useApi<{
    episodes: { episodeNumber: number; name: string }[];
  }>(`/tv/${tvId}/season/${scope.seasonNumber}`);
  return (
    <>
      <ServiceNote error={error} what="season episodes" retry={reload} />
      {!data && !error && (
        <p className="note" role="status">
          Loading episodes…
        </p>
      )}
      {data && (
        <ul className="setlist">
          {data.episodes
            .filter((episode) => episode.episodeNumber > 0)
            .map(({ episodeNumber, name }) => (
              <li className="set" key={episodeNumber}>
                <label>
                  <input
                    type="checkbox"
                    disabled={disabled}
                    checked={
                      scope.episodeNumbers?.includes(episodeNumber) ?? false
                    }
                    onChange={(event) =>
                      change(
                        event.target.checked
                          ? [
                              ...(scope.episodeNumbers ?? []),
                              episodeNumber,
                            ].sort((a, b) => a - b)
                          : scope.episodeNumbers?.filter(
                              (number) => number !== episodeNumber
                            )
                      )
                    }
                  />{' '}
                  Episode {episodeNumber}
                  {name ? ` · ${name}` : ''}
                </label>
              </li>
            ))}
        </ul>
      )}
    </>
  );
}

function ReportSheet({
  title,
  type,
  mediaId,
  qualities,
  seasons,
  tvId,
  close,
}: {
  title: string;
  type: MediaType;
  mediaId: number;
  qualities: boolean[];
  seasons: Season[];
  tvId?: number;
  close: () => void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const submitting = useRef(false);
  const navigate = useNavigate();
  const { user } = useAuth();
  const [is4k, setIs4k] = useState(qualities[0] ?? false);
  const [issueType, setIssueType] = useState(4);
  const [reason, setReason] = useState('other');
  const [scopes, setScopes] = useState<Scope[]>([]);
  const [message, setMessage] = useState('');
  const [reporterSearch, setReporterSearch] = useState('');
  const [reporterQuery, setReporterQuery] = useState('');
  const [reporter, setReporter] = useState<IssueReporter>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const manageIssues = canManageIssues(user?.permissions);
  useEffect(() => {
    const timer = setTimeout(
      () => setReporterQuery(reporterSearch.trim()),
      300
    );
    return () => clearTimeout(timer);
  }, [reporterSearch]);
  const reporterPath =
    manageIssues && reporterQuery.length >= 2
      ? `/issue/reporters?q=${encodeURIComponent(reporterQuery)}`
      : null;
  const reporterResults = useApi<{ results: IssueReporter[] }>(reporterPath, {
    currentPathOnly: true,
  });
  const dismiss = () => {
    if (!submitting.current) close();
  };
  useDialog(dialog, dismiss);
  const types =
    type === 'movie' || type === 'tv'
      ? ([4, 2, 1, 3] as const)
      : type === 'music'
        ? ([4, 2] as const)
        : ([4] as const);
  const reasons =
    type === 'book' || type === 'comic' || type === 'magazine'
      ? REASONS[type]
      : [];
  const reportableSeasons = seasons.filter((season) =>
    eligible(is4k ? season.status4k : season.status, 'tv')
  );
  const validScopes =
    type !== 'tv' ||
    (scopes.length > 0 &&
      scopes.length <= 100 &&
      scopes.every(
        ({ seasonNumber, episodeNumbers }) =>
          reportableSeasons.some(
            (season) => season.seasonNumber === seasonNumber
          ) && episodeNumbers?.length !== 0
      ) &&
      scopes.reduce(
        (total, scope) => total + (scope.episodeNumbers?.length ?? 0),
        0
      ) <= 500);
  const valid = message.trim().length > 0 && validScopes;

  async function submit() {
    if (submitting.current || !valid) return;
    submitting.current = true;
    setBusy(true);
    setError('');
    const selections = [...scopes].sort(
      (a, b) => a.seasonNumber - b.seasonNumber
    );
    try {
      const created = await api<{ id: number }>('/issue', {
        method: 'POST',
        body: JSON.stringify({
          mediaId,
          issueType,
          message: message.trim(),
          is4k,
          ...(reporter ? { userId: reporter.id } : {}),
          ...(reasons.length ? { issueSubtype: reason } : {}),
          ...(type === 'tv'
            ? {
                problemSeason: selections[0].seasonNumber,
                problemEpisode: selections[0].episodeNumbers?.[0] ?? 0,
                problemEpisodes: selections[0].episodeNumbers ?? [],
                problemEpisodeSelections: selections,
              }
            : {}),
        }),
      });
      if (!Number.isSafeInteger(created.id) || created.id <= 0)
        throw new Error();
      close();
      navigate(`/issues/${created.id}`);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status >= 400 && err.status < 500
          ? err.message
          : 'Could not confirm the report. Check Issues before submitting again.'
      );
    } finally {
      submitting.current = false;
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
        aria-label="Report an Issue"
      >
        <div className="grab" />
        <form
          className="pk"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <header>
            <h2>Report an Issue</h2>
            <p className="note">{title}</p>
          </header>
          <div className="toolbar">
            {qualities.length > 0 && (
              <label className="sel">
                <span className="lbl">Quality</span>
                <select
                  aria-label="Quality"
                  disabled={busy}
                  value={is4k ? '4k' : 'hd'}
                  onChange={(event) => {
                    setIs4k(event.target.value === '4k');
                    setScopes([]);
                  }}
                >
                  {qualities.map((quality) => (
                    <option key={String(quality)} value={quality ? '4k' : 'hd'}>
                      {quality ? '4K' : 'HD'}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="sel">
              <span className="lbl">Issue Type</span>
              <select
                aria-label="Issue Type"
                disabled={busy}
                value={issueType}
                onChange={(event) => setIssueType(Number(event.target.value))}
              >
                {types.map((option) => (
                  <option key={option} value={option}>
                    {TYPES[option]}
                  </option>
                ))}
              </select>
            </label>
            {reasons.length > 0 && (
              <label className="sel">
                <span className="lbl">Reason</span>
                <select
                  aria-label="Reason"
                  disabled={busy}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                >
                  {reasons.map((option) => (
                    <option key={option} value={option}>
                      {REASON_LABELS[option]}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          {manageIssues && (
            <div className="toolbar">
              <label className="sel">
                <span className="lbl">Search</span>
                <input
                  className="cfg-input"
                  type="search"
                  aria-label="Search users"
                  autoComplete="off"
                  maxLength={128}
                  placeholder="User name"
                  value={reporterSearch}
                  disabled={busy}
                  onChange={(event) => setReporterSearch(event.target.value)}
                />
              </label>
              <label className="sel">
                <span className="lbl">Report for</span>
                <select
                  aria-label="Report for"
                  value={reporter?.id ?? ''}
                  disabled={busy}
                  onChange={(event) => {
                    const id = Number(event.target.value);
                    setReporter(
                      reporterResults.data?.results.find(
                        (candidate) => candidate.id === id
                      ) ?? (reporter?.id === id ? reporter : undefined)
                    );
                  }}
                >
                  <option value="">My account</option>
                  {reporter &&
                    !reporterResults.data?.results.some(
                      (candidate) => candidate.id === reporter.id
                    ) && (
                      <option value={reporter.id}>
                        {reporter.displayName}
                      </option>
                    )}
                  {reporterResults.data?.results.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.displayName}
                    </option>
                  ))}
                </select>
              </label>
              <ServiceNote
                error={reporterPath ? reporterResults.error : null}
                what="reporters"
                retry={reporterResults.reload}
              />
            </div>
          )}
          {type === 'tv' && (
            <p className="note">Choose the affected seasons or episodes.</p>
          )}
          {type === 'tv' && reportableSeasons.length === 0 && (
            <p className="note">No reportable seasons for this quality.</p>
          )}
          {type === 'tv' && reportableSeasons.length > 0 && (
            <ul className="setlist">
              {reportableSeasons.map(({ seasonNumber }) => {
                const scope = scopes.find(
                  (item) => item.seasonNumber === seasonNumber
                );
                const updateEpisodes = (episodeNumbers?: number[]) =>
                  setScopes((current) =>
                    current.map((item) =>
                      item.seasonNumber === seasonNumber
                        ? { seasonNumber, episodeNumbers }
                        : item
                    )
                  );
                return (
                  <li className="set" key={seasonNumber}>
                    <div>
                      <label>
                        <input
                          type="checkbox"
                          checked={!!scope}
                          disabled={busy}
                          onChange={(event) =>
                            setScopes((current) =>
                              event.target.checked
                                ? [...current, { seasonNumber }]
                                : current.filter(
                                    (item) => item.seasonNumber !== seasonNumber
                                  )
                            )
                          }
                        />{' '}
                        Season {seasonNumber}
                      </label>
                      {scope && tvId && (
                        <>
                          <div className="toolbar">
                            <button
                              type="button"
                              className="btn btn-quiet btn-sm"
                              disabled={busy}
                              onClick={() =>
                                updateEpisodes(
                                  scope.episodeNumbers ? undefined : []
                                )
                              }
                            >
                              {scope.episodeNumbers
                                ? 'Use Whole Season'
                                : 'Choose Episodes'}
                            </button>
                          </div>
                          {scope.episodeNumbers && (
                            <Episodes
                              tvId={tvId}
                              scope={scope}
                              change={updateEpisodes}
                              disabled={busy}
                            />
                          )}
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {error && (
            <p className="note" role="alert">
              {error}
            </p>
          )}
          <textarea
            className="cfg-json"
            aria-label="Issue Description"
            placeholder="Describe the issue"
            rows={4}
            maxLength={10000}
            disabled={busy}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />
          <div className="pk-foot">
            <button
              type="button"
              className="btn btn-quiet"
              disabled={busy}
              onClick={dismiss}
            >
              Cancel
            </button>
            <button className="btn btn-primary" disabled={busy || !valid}>
              Submit Report
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

export default function ReportIssueButton({
  title,
  type,
  media,
  allow4k = false,
  tvId,
}: {
  title?: string;
  type: MediaType;
  media?: MediaInfo & { seasons?: Season[] };
  allow4k?: boolean;
  tvId?: number;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const video = type === 'movie' || type === 'tv';
  const mediaId = media?.id;
  if (!canCreateIssues(user?.permissions)) return null;
  const qualities: boolean[] = [];
  if (video && eligible(media?.status, type)) qualities.push(false);
  if (video && allow4k && eligible(media?.status4k, type)) qualities.push(true);
  const available =
    !!mediaId &&
    Number.isSafeInteger(mediaId) &&
    mediaId > 0 &&
    (video ? qualities.length > 0 : eligible(media?.status, type));
  return (
    <>
      <button
        className="btn btn-quiet btn-sm"
        disabled={!available}
        onClick={() => setOpen(true)}
      >
        Report an Issue
      </button>
      {open && available && (
        <ReportSheet
          key={mediaId}
          title={title ?? 'Media'}
          type={type}
          mediaId={mediaId}
          qualities={qualities}
          seasons={media?.seasons ?? []}
          tvId={tvId}
          close={() => setOpen(false)}
        />
      )}
    </>
  );
}
