import { useRef, useState } from 'react';
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { ConfirmSheet } from '../components/ConfirmSheet';
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
interface IssueMedia {
  mediaType: string;
  tmdbId?: number;
  mbId?: string | null;
  identifiers?: { provider: string; value: string }[];
}

function issueTitleLink(media?: IssueMedia) {
  if (!media) return;
  const { mediaType, tmdbId } = media;
  if (mediaType === 'movie' || mediaType === 'tv') {
    if (!tmdbId || !Number.isSafeInteger(tmdbId) || tmdbId < 1) return;
    return {
      path: `/${mediaType}/${tmdbId}`,
      label: mediaType === 'tv' ? 'Series' : 'Movie',
    };
  }
  const idFor = (provider: string) =>
    media.identifiers?.find((id) => id.provider === provider)?.value;
  const openLibrary = idFor('openlibrary');
  const bookshelf = idFor('bookshelf');
  const id =
    mediaType === 'book'
      ? openLibrary || bookshelf
      : mediaType === 'music'
        ? media.mbId || idFor('musicbrainz')
        : mediaType === 'comic'
          ? idFor('comicvine')
          : mediaType === 'magazine'
            ? idFor('lazylibrarian')
            : undefined;
  if (!id || id === '.' || id === '..') return;
  const labels: Record<string, string> = {
    book: 'Book',
    music: 'Album',
    comic: 'Comic',
    magazine: 'Magazine',
  };
  return {
    path: `/${mediaType}/${encodeURIComponent(id)}`,
    label: labels[mediaType],
  };
}

interface Issue {
  id: number;
  status: number;
  issueType: number;
  issueSubtype?: string;
  createdAt: string;
  createdBy: Reporter;
  media?: IssueMedia;
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

const issueFilters = [
  {
    key: 'filter',
    label: 'Issue Status',
    options: { all: 'All Statuses', open: 'Open', resolved: 'Resolved' },
  },
  {
    key: 'mediaType',
    label: 'Media Type',
    options: {
      all: 'All Media',
      movie: 'Movies',
      tv: 'Series',
      music: 'Music',
      book: 'Books',
      comic: 'Comics',
      magazine: 'Magazines',
    },
  },
  {
    key: 'issueType',
    label: 'Issue Type',
    options: {
      all: 'All Issue Types',
      video: 'Video',
      audio: 'Audio',
      subtitle: 'Subtitles',
      other: 'Other',
    },
  },
  {
    key: 'timeFrame',
    label: 'Reported Within',
    options: {
      all: 'Any Time',
      '7d': '7 Days',
      '14d': '14 Days',
      '30d': '30 Days',
      '6m': '6 Months',
    },
  },
];

function IssueList() {
  const [bookmark, setBookmark] = useSearchParams();
  const submitted = (bookmark.get('search') ?? '').trim().slice(0, 512);
  const parsedPage = Number(bookmark.get('page'));
  const page =
    Number.isSafeInteger(parsedPage) && parsedPage >= 1
      ? Math.min(parsedPage, 1000)
      : 1;
  const params = new URLSearchParams({
    take: String(PAGE_SIZE),
    skip: String((page - 1) * PAGE_SIZE),
    filter: 'all',
    search: submitted,
  });
  for (const { key, options } of issueFilters) {
    const value = bookmark.get(key);
    if (value && value !== 'all' && Object.hasOwn(options, value))
      params.set(key, value);
  }
  function update(key: string, value: string) {
    const next = new URLSearchParams(bookmark);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setBookmark(next);
  }
  const { data, error, reload } = useApi<IssuePage>(
    '/issue?' + params.toString(),
    { currentPathOnly: true }
  );
  return (
    <>
      <form
        className="toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          const search = new FormData(event.currentTarget).get('search');
          update('search', typeof search === 'string' ? search.trim() : '');
        }}
      >
        {issueFilters.map(({ key, label, options }) => (
          <label className="sel" key={key}>
            <select
              aria-label={label}
              value={params.get(key) ?? 'all'}
              onChange={(event) =>
                update(
                  key,
                  event.target.value === 'all' ? '' : event.target.value
                )
              }
            >
              {Object.entries(options).map(([value, name]) => (
                <option key={value} value={value}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        ))}
        <label className="search">
          <input
            type="search"
            aria-label="Search Issues"
            placeholder="Search issues"
            maxLength={512}
            key={submitted}
            name="search"
            defaultValue={submitted}
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
            onClick={() => update('page', page > 2 ? String(page - 1) : '')}
          >
            Previous Page
          </button>
          <span>Page {page}</span>
          <button
            className="btn btn-quiet btn-sm"
            disabled={page >= data.pageInfo.pages}
            onClick={() => update('page', String(page + 1))}
          >
            Next Page
          </button>
        </nav>
      )}
    </>
  );
}

type IssueAction =
  | { kind: 'comment' | 'resolved' | 'open' | 'delete-issue' }
  | { kind: 'edit-comment' | 'delete-comment'; commentId: number };

function Discussion({ id }: { id: number }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const path = '/issue/' + id;
  const { data, error, reload, refresh } = useApi<Issue>(path);
  const [message, setMessage] = useState('');
  const [edit, setEdit] = useState<{ id: number; message: string }>();
  const [confirmation, setConfirmation] = useState<
    { kind: 'delete-issue' } | { kind: 'delete-comment'; commentId: number }
  >();
  const [failure, setFailure] = useState('');
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const canCreate = canCreateIssues(user?.permissions);
  const manager = canManageIssues(user?.permissions);
  const editable =
    !!data && (manager || (canCreate && data.createdBy.id === user?.id));
  const canDeleteIssue =
    !!data &&
    (manager ||
      (editable && Array.isArray(data.comments) && data.comments.length <= 1));

  async function submit(action: IssueAction) {
    if (!data || submitting.current) return;
    let endpoint: string;
    let init: RequestInit;
    switch (action.kind) {
      case 'comment':
      case 'resolved':
      case 'open':
        if (!editable || (action.kind === 'comment' && !message.trim())) return;
        endpoint = `${path}/${action.kind}`;
        init = {
          method: 'POST',
          ...(action.kind === 'comment'
            ? { body: JSON.stringify({ message: message.trim() }) }
            : {}),
        };
        break;
      case 'edit-comment':
      case 'delete-comment': {
        const commentIndex =
          data.comments?.findIndex(
            (comment) => comment.id === action.commentId
          ) ?? -1;
        const comment = data.comments?.[commentIndex];
        if (!comment) return;
        const author = canCreate && comment.user?.id === user?.id;
        endpoint = `/issueComment/${comment.id}`;
        if (action.kind === 'edit-comment') {
          if (!author || edit?.id !== comment.id || !edit.message.trim())
            return;
          init = {
            method: 'PUT',
            body: JSON.stringify({ message: edit.message.trim() }),
          };
        } else {
          if (commentIndex === 0 || (!author && !manager)) return;
          init = { method: 'DELETE' };
        }
        break;
      }
      case 'delete-issue':
        if (!canDeleteIssue) return;
        endpoint = path;
        init = { method: 'DELETE' };
        break;
    }

    submitting.current = true;
    setBusy(true);
    setFailure('');
    try {
      await api(endpoint, init);
      if (action.kind === 'delete-issue') {
        navigate('/issues', { replace: true });
        return;
      }
      if (action.kind === 'comment') setMessage('');
      if (action.kind === 'edit-comment') setEdit(undefined);
      refresh();
    } catch {
      reload();
      setFailure(
        'Could not confirm the update. Check the discussion before trying again.'
      );
    } finally {
      setConfirmation(undefined);
      submitting.current = false;
      setBusy(false);
    }
  }

  const titleLink = issueTitleLink(data?.media);

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
      {failure && (
        <p className="note" role="alert">
          {failure}
        </p>
      )}
      {confirmation && (
        <ConfirmSheet
          title={
            confirmation.kind === 'delete-issue'
              ? 'Delete this issue?'
              : 'Delete this comment?'
          }
          body={
            confirmation.kind === 'delete-issue'
              ? 'The report and its discussion will be permanently removed.'
              : 'This comment will be permanently removed.'
          }
          confirm={
            confirmation.kind === 'delete-issue'
              ? 'Delete Issue'
              : 'Delete Comment'
          }
          busy={busy}
          onConfirm={() => void submit(confirmation)}
          onClose={() => {
            if (!submitting.current) setConfirmation(undefined);
          }}
        />
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
            {titleLink && (
              <Link className="btn btn-quiet btn-sm" to={titleLink.path}>
                Open {titleLink.label}
              </Link>
            )}
            {editable && (
              <button
                className="btn btn-quiet btn-sm"
                disabled={busy}
                onClick={() =>
                  void submit({ kind: data.status === 2 ? 'open' : 'resolved' })
                }
              >
                {data.status === 2 ? 'Reopen Issue' : 'Resolve Issue'}
              </button>
            )}
            {canDeleteIssue && (
              <button
                className="btn btn-quiet btn-sm"
                disabled={busy}
                onClick={() => setConfirmation({ kind: 'delete-issue' })}
              >
                Delete Issue
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
            {data.comments?.map((comment, index) => {
              const author = canCreate && comment.user?.id === user?.id;
              const editing = author && edit?.id === comment.id;
              return (
                <li className="set" key={comment.id}>
                  <div>
                    <b>{comment.user?.displayName ?? 'Reporter'}</b>
                    <small>{timestamp(comment.createdAt)}</small>
                    {editing ? (
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          void submit({
                            kind: 'edit-comment',
                            commentId: comment.id,
                          });
                        }}
                      >
                        <textarea
                          className="cfg-json"
                          aria-label={
                            index === 0
                              ? 'Edit Issue Description'
                              : 'Edit Comment'
                          }
                          rows={4}
                          maxLength={10000}
                          value={edit.message}
                          disabled={busy}
                          onChange={(event) =>
                            setEdit({
                              id: comment.id,
                              message: event.target.value,
                            })
                          }
                        />
                        <div className="toolbar">
                          <button
                            type="button"
                            className="btn btn-quiet btn-sm"
                            disabled={busy}
                            onClick={() => setEdit(undefined)}
                          >
                            Cancel Edit
                          </button>
                          <button
                            className="btn btn-tonal btn-sm"
                            disabled={
                              busy ||
                              !edit.message.trim() ||
                              edit.message.trim() === comment.message
                            }
                          >
                            Save Edit
                          </button>
                        </div>
                      </form>
                    ) : (
                      <p>{comment.message}</p>
                    )}
                  </div>
                  {!editing && (author || (index > 0 && manager)) && (
                    <div className="toolbar">
                      {author && (
                        <button
                          className="btn btn-quiet btn-sm"
                          disabled={busy || !!edit}
                          onClick={() =>
                            setEdit({
                              id: comment.id,
                              message: comment.message,
                            })
                          }
                        >
                          {index === 0 ? 'Edit Description' : 'Edit Comment'}
                        </button>
                      )}
                      {index > 0 && (author || manager) && (
                        <button
                          className="btn btn-quiet btn-sm"
                          disabled={busy || !!edit}
                          onClick={() =>
                            setConfirmation({
                              kind: 'delete-comment',
                              commentId: comment.id,
                            })
                          }
                        >
                          Delete Comment
                        </button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {editable && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void submit({ kind: 'comment' });
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
