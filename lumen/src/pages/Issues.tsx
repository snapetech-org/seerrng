import { useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { Pill } from '../components/detail';
import { ServiceNote } from '../components/extra';
import { useApi } from '../hooks';
import {
  canCreateIssues,
  canManageIssues,
  canReadIssues,
} from '../issuePermissions';

interface Reporter {
  id: number;
  displayName?: string;
}
interface Issue {
  id: number;
  status: number;
  issueType: number;
  issueSubtype?: string;
  createdAt: string;
  createdBy: Reporter;
  media?: { mediaType: string; tmdbId?: number };
  is4k?: boolean;
  problemSeason?: number;
  problemEpisode?: number;
  problemEpisodes?: number[];
  problemEpisodeSelections?: {
    seasonNumber: number;
    episodeNumbers?: number[];
  }[];
  comments?: {
    id: number;
    message: string;
    user?: Reporter;
    createdAt: string;
  }[];
}
interface IssuePage {
  results: Issue[];
  pageInfo: { page: number; pages: number };
}

const TYPES = ['Issue', 'Video', 'Audio', 'Subtitles', 'Other'];
const PAGE_SIZE = 10;

function timestamp(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.valueOf()) ? date.toLocaleString() : '';
}

function IssueStatus({ status }: { status: number }) {
  return (
    <Pill k={status === 2 ? 'ok' : 'wait'}>
      {status === 2 ? 'Resolved' : 'Open'}
    </Pill>
  );
}

function IssueList() {
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [page, setPage] = useState(1);
  const params = new URLSearchParams({
    take: String(PAGE_SIZE),
    skip: String((page - 1) * PAGE_SIZE),
    filter,
    search: submitted,
  });
  const { data, error, reload } = useApi<IssuePage>(
    '/issue?' + params.toString()
  );
  return (
    <>
      <form
        className="toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setSubmitted(query.trim());
        }}
      >
        <label className="sel">
          <select
            aria-label="Issue Status"
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value);
              setPage(1);
            }}
          >
            <option value="all">All Statuses</option>
            <option value="open">Open</option>
            <option value="resolved">Resolved</option>
          </select>
        </label>
        <label className="search">
          <input
            type="search"
            aria-label="Search Issues"
            placeholder="Search issues"
            maxLength={512}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <button className="btn btn-tonal btn-sm">Search</button>
      </form>
      <ServiceNote error={error} what="issues" retry={reload} />
      {!data && !error && (
        <p className="note" role="status">
          Loading issues…
        </p>
      )}
      {data?.results.length === 0 && (
        <p className="note">No issues match this view.</p>
      )}
      {!!data?.results.length && (
        <ul className="setlist">
          {data.results.map((issue) => (
            <li className="set" key={issue.id}>
              <div>
                <Link to={`/issues/${issue.id}`}>
                  <b>
                    {TYPES[issue.issueType] ?? 'Issue'} #{issue.id}
                  </b>
                </Link>
                {issue.comments?.[0] && (
                  <small>{issue.comments[0].message.slice(0, 160)}</small>
                )}
                <small>
                  {issue.createdBy.displayName ?? 'Reporter'} ·{' '}
                  {timestamp(issue.createdAt)}
                </small>
              </div>
              <IssueStatus status={issue.status} />
            </li>
          ))}
        </ul>
      )}
      {!!data && (page > 1 || data.pageInfo.pages > 1) && (
        <nav className="toolbar" aria-label="Issue Pages">
          <button
            className="btn btn-quiet btn-sm"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            Previous Page
          </button>
          <span>Page {page}</span>
          <button
            className="btn btn-quiet btn-sm"
            disabled={page >= data.pageInfo.pages}
            onClick={() => setPage(page + 1)}
          >
            Next Page
          </button>
        </nav>
      )}
    </>
  );
}

function Discussion({ id }: { id: number }) {
  const { user } = useAuth();
  const path = '/issue/' + id;
  const { data, error, reload, refresh } = useApi<Issue>(path);
  const [message, setMessage] = useState('');
  const [failure, setFailure] = useState('');
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const editable =
    !!data &&
    (canManageIssues(user?.permissions) ||
      (canCreateIssues(user?.permissions) && data.createdBy.id === user?.id));

  async function submit(action: 'comment' | 'resolved' | 'open') {
    if (
      !editable ||
      submitting.current ||
      (action === 'comment' && !message.trim())
    )
      return;
    submitting.current = true;
    setBusy(true);
    setFailure('');
    try {
      await api<Issue>(`${path}/${action}`, {
        method: 'POST',
        ...(action === 'comment'
          ? { body: JSON.stringify({ message: message.trim() }) }
          : {}),
      });
      if (action === 'comment') setMessage('');
    } catch {
      reload();
      setFailure(
        'Could not confirm the update. Check the discussion before trying again.'
      );
    } finally {
      refresh();
      submitting.current = false;
      setBusy(false);
    }
  }

  const media = data?.media;
  const mediaPath =
    media &&
    (media.mediaType === 'movie' || media.mediaType === 'tv') &&
    Number.isSafeInteger(media.tmdbId) &&
    (media.tmdbId ?? 0) > 0
      ? `/${media.mediaType}/${media.tmdbId}`
      : undefined;

  return (
    <>
      <div className="toolbar">
        <Link className="btn btn-quiet btn-sm" to="/issues">
          All Issues
        </Link>
      </div>
      <ServiceNote error={error} what="the issue" retry={reload} />
      {!data && !error && (
        <p className="note" role="status">
          Loading issue…
        </p>
      )}
      {data && (
        <>
          <div className="toolbar">
            <IssueStatus status={data.status} />
            <span>
              {TYPES[data.issueType] ?? 'Issue'}
              {data.issueSubtype
                ? ' · ' + data.issueSubtype.replaceAll('_', ' ')
                : ''}
              {data.is4k ? ' · 4K' : ''}
            </span>
            {mediaPath && (
              <Link className="btn btn-quiet btn-sm" to={mediaPath}>
                Open {media?.mediaType === 'tv' ? 'Series' : 'Movie'}
              </Link>
            )}
            {editable && (
              <button
                className="btn btn-quiet btn-sm"
                disabled={busy}
                onClick={() =>
                  void submit(data.status === 2 ? 'open' : 'resolved')
                }
              >
                {data.status === 2 ? 'Reopen Issue' : 'Resolve Issue'}
              </button>
            )}
          </div>
          {data.problemEpisodeSelections?.length ? (
            <ul className="setlist">
              {data.problemEpisodeSelections.map(
                ({ seasonNumber, episodeNumbers }) => (
                  <li className="set" key={seasonNumber}>
                    Season {seasonNumber}
                    {episodeNumbers?.length
                      ? ` · Episodes ${episodeNumbers.join(', ')}`
                      : ''}
                  </li>
                )
              )}
            </ul>
          ) : (
            !!(
              data.problemSeason ||
              data.problemEpisode ||
              data.problemEpisodes?.length
            ) && (
              <p className="note">
                Season {data.problemSeason ?? 0}
                {data.problemEpisodes?.length
                  ? ` · Episodes ${data.problemEpisodes.join(', ')}`
                  : data.problemEpisode
                    ? ` · Episode ${data.problemEpisode}`
                    : ''}
              </p>
            )
          )}
          <ul className="setlist" aria-label="Issue Discussion">
            {data.comments?.map((comment) => (
              <li className="set" key={comment.id}>
                <div>
                  <b>{comment.user?.displayName ?? 'Reporter'}</b>
                  <small>{timestamp(comment.createdAt)}</small>
                  <p>{comment.message}</p>
                </div>
              </li>
            ))}
          </ul>
          {failure && (
            <p className="note" role="alert">
              {failure}
            </p>
          )}
          {editable && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void submit('comment');
              }}
            >
              <textarea
                className="cfg-json"
                aria-label="Comment"
                maxLength={10000}
                rows={4}
                value={message}
                disabled={busy}
                onChange={(event) => setMessage(event.target.value)}
              />
              <div className="toolbar">
                <button
                  className="btn btn-tonal btn-sm"
                  disabled={busy || !message.trim()}
                >
                  Add Comment
                </button>
              </div>
            </form>
          )}
        </>
      )}
    </>
  );
}

export default function Issues() {
  const { user } = useAuth();
  const { issueId } = useParams();
  const [params] = useSearchParams();
  const rawId = issueId ?? params.get('issue');
  const id = rawId && /^\d+$/.test(rawId) ? Number(rawId) : 0;
  const validId = Number.isSafeInteger(id) && id > 0;
  return (
    <>
      <header className="ph">
        <h1>{validId ? `Issue #${id}` : 'Issues'}</h1>
      </header>
      {!canReadIssues(user?.permissions) ? (
        <p className="note">You do not have permission to view issues.</p>
      ) : rawId != null ? (
        validId ? (
          <Discussion key={id} id={id} />
        ) : (
          <p className="note">Issue not found.</p>
        )
      ) : (
        <IssueList />
      )}
    </>
  );
}
