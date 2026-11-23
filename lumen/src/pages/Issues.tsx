import { useEffect, useRef, useState } from 'react';
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
import { useLumenLocale } from '../i18n';
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

interface IssueMediaTitle {
  title?: string;
  name?: string;
  releaseDate?: string;
  firstAirDate?: string;
  firstPublishYear?: number;
  startYear?: string;
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

function IssueMediaTitle({ media }: { media?: IssueMedia }) {
  const { t } = useLumenLocale();
  const anchor = useRef<HTMLSpanElement>(null);
  const [nearView, setNearView] = useState(false);
  const destination = issueTitleLink(media);
  useEffect(() => {
    if (!destination || nearView || !anchor.current) return;
    if (typeof IntersectionObserver === 'undefined') {
      setNearView(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setNearView(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(anchor.current);
    return () => observer.disconnect();
  }, [destination?.path, nearView]);
  const { data, error } = useApi<IssueMediaTitle>(
    nearView && destination ? destination.path : null,
    { currentPathOnly: true }
  );
  const title = data?.title || data?.name;
  const year =
    (data?.releaseDate || data?.firstAirDate || '').match(/\d{4}/)?.[0] ||
    data?.firstPublishYear ||
    data?.startYear;
  if (!destination || error) return null;
  return (
    <small ref={anchor}>
      {title ? (
        <Link to={destination.path}>
          {title}
          {year ? ` (${year})` : ''}
        </Link>
      ) : nearView ? (
        t('lumen.issues.loadingTitle', 'Loading title…')
      ) : (
        ' '
      )}
    </small>
  );
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

function timestamp(value: string, locale: string) {
  const date = new Date(value);
  return Number.isFinite(date.valueOf())
    ? new Intl.DateTimeFormat(locale, {
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(date)
    : '';
}

function IssueStatus({ status }: { status: number }) {
  const { t } = useLumenLocale();
  return (
    <Pill k={status === 2 ? 'ok' : 'wait'}>
      {status === 2
        ? t('lumen.issues.resolved', 'Resolved')
        : t('lumen.issues.open', 'Open')}
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
  {
    key: 'sort',
    label: 'Sort Issues',
    options: {
      all: 'Date Reported',
      modified: 'Last Updated',
      status: 'Status',
    },
  },
  {
    key: 'sortDirection',
    label: 'Sort Direction',
    options: { all: 'Descending', asc: 'Ascending' },
  },
];

const issueMetadata = [
  {
    key: 'releaseYear',
    label: 'Release Year',
    media: ['movie', 'tv', 'music', 'book'],
  },
  { key: 'genre', label: 'Genre', media: ['movie', 'tv', 'music', 'book'] },
  { key: 'studio', label: 'Studio', media: ['movie'] },
  { key: 'network', label: 'Network', media: ['tv'] },
  { key: 'albumType', label: 'Album Type', media: ['music'] },
] as const;

function IssueList() {
  const { locale, t } = useLumenLocale();
  const [bookmark, setBookmark] = useSearchParams();
  const [expandedIssue, setExpandedIssue] = useState<number>();
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
  });
  // SeerrNG rejects an empty search parameter, so only send one with text
  if (submitted) params.set('search', submitted);
  for (const { key, options } of issueFilters) {
    const value = bookmark.get(key);
    if (value && value !== 'all' && Object.hasOwn(options, value))
      params.set(key, value);
  }
  const media = params.get('mediaType') ?? 'all';
  const metadata = issueMetadata.filter(({ media: types }) =>
    (types as readonly string[]).includes(media)
  );
  for (const { key } of metadata) {
    const value = (bookmark.get(key) ?? '').trim().slice(0, 128);
    if (value && (key !== 'releaseYear' || /^(\d{4}|before-1970)$/.test(value)))
      params.set(key, value);
  }
  function update(key: string, value: string) {
    const next = new URLSearchParams(bookmark);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key === 'mediaType') {
      for (const { key: metadataKey, media: types } of issueMetadata) {
        if (!(types as readonly string[]).includes(value))
          next.delete(metadataKey);
      }
    }
    if (key !== 'page') next.delete('page');
    setBookmark(next);
  }
  const { data, error, reload } = useApi<IssuePage>(
    '/issue?' + params.toString(),
    { currentPathOnly: true }
  );
  const pages = data?.pageInfo.pages;
  useEffect(() => {
    if (pages === undefined || page <= Math.max(1, pages)) return;
    setBookmark(
      (current) => {
        const next = new URLSearchParams(current);
        if (pages > 1) next.set('page', String(pages));
        else next.delete('page');
        return next;
      },
      { replace: true }
    );
  }, [page, pages, setBookmark]);
  return (
    <>
      <form
        className="toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const next = new URLSearchParams(bookmark);
          for (const key of ['search', ...metadata.map(({ key }) => key)]) {
            const value = String(form.get(key) ?? '').trim();
            if (value) next.set(key, value);
            else next.delete(key);
          }
          next.delete('page');
          setBookmark(next);
        }}
      >
        {issueFilters.map(({ key, label, options }) => (
          <label className="sel" key={key}>
            <select
              aria-label={t(`lumen.issues.filter.${key}`, label)}
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
                  {t(`lumen.issues.option.${key}.${value}`, name)}
                </option>
              ))}
            </select>
          </label>
        ))}
        <label className="search">
          <input
            type="search"
            aria-label={t('lumen.issues.searchLabel', 'Search Issues')}
            placeholder={t('lumen.issues.searchPlaceholder', 'Search issues')}
            maxLength={512}
            key={submitted}
            name="search"
            defaultValue={submitted}
          />
        </label>
        {metadata.map(({ key, label }) => (
          <label className="sel" key={`${key}:${bookmark.get(key) ?? ''}`}>
            <span className="lbl">
              {t(`lumen.issues.metadata.${key}`, label)}
            </span>
            {key === 'albumType' ? (
              <select name={key} defaultValue={params.get(key) ?? ''}>
                <option value="">
                  {t('lumen.issues.anyAlbumType', 'Any Album Type')}
                </option>
                <option value="album">
                  {t('lumen.issues.album', 'Album')}
                </option>
                <option value="ep">{t('lumen.issues.ep', 'EP')}</option>
                <option value="single">
                  {t('lumen.issues.single', 'Single')}
                </option>
              </select>
            ) : (
              <input
                className="cfg-json"
                name={key}
                defaultValue={params.get(key) ?? ''}
                maxLength={key === 'releaseYear' ? 11 : 128}
                pattern={
                  key === 'releaseYear' ? '[0-9]{4}|before-1970' : undefined
                }
                placeholder={
                  key === 'releaseYear'
                    ? t('lumen.issues.yearPlaceholder', 'YYYY or before-1970')
                    : undefined
                }
              />
            )}
          </label>
        ))}
        <button className="btn btn-tonal btn-sm">
          {t('lumen.issues.search', 'Search')}
        </button>
      </form>
      <ServiceNote error={error} what="issues" retry={reload} />
      {!data && !error && (
        <p className="note" role="status">
          {t('lumen.issues.loading', 'Loading issues…')}
        </p>
      )}
      {data?.results.length === 0 && (
        <p className="note">
          {t('lumen.issues.noMatches', 'No issues match this view.')}
        </p>
      )}
      {!!data?.results.length && (
        <ul className="setlist">
          {data.results.map((issue) => (
            <li
              className={`set${expandedIssue === issue.id ? 'set-expanded' : ''}`}
              key={issue.id}
            >
              <div className="set-body">
                <IssueMediaTitle media={issue.media} />
                <Link
                  to={{
                    pathname: `/issues/${issue.id}`,
                    search: bookmark.toString(),
                  }}
                >
                  <b>
                    {t(
                      `lumen.issues.type.${issue.issueType}`,
                      TYPES[issue.issueType] ?? 'Issue'
                    )}{' '}
                    #{issue.id}
                  </b>
                </Link>
                <button
                  className="btn btn-quiet btn-sm"
                  type="button"
                  aria-expanded={expandedIssue === issue.id}
                  aria-controls={`issue-inline-${issue.id}`}
                  onClick={() =>
                    setExpandedIssue((current) =>
                      current === issue.id ? undefined : issue.id
                    )
                  }
                >
                  {expandedIssue === issue.id
                    ? t('lumen.issues.hideDetails', 'Hide Details')
                    : t('lumen.issues.viewDetails', 'View Details')}
                </button>
                {issue.comments?.[0] && (
                  <small>{issue.comments[0].message.slice(0, 160)}</small>
                )}
                {issue.problemEpisodeSelections?.length ? (
                  <small>
                    {issue.problemEpisodeSelections
                      .map(({ seasonNumber, episodeNumbers }) => {
                        const season = t(
                          'lumen.issues.season',
                          'Season {season}',
                          {
                            season: seasonNumber,
                          }
                        );
                        return episodeNumbers?.length
                          ? `${season} · ${t('lumen.issues.episodes', 'Episodes {episodes}', { episodes: episodeNumbers.join(', ') })}`
                          : season;
                      })
                      .join(', ')}
                  </small>
                ) : (
                  !!(
                    issue.problemSeason ||
                    issue.problemEpisode ||
                    issue.problemEpisodes?.length
                  ) && (
                    <small>
                      {t('lumen.issues.season', 'Season {season}', {
                        season: issue.problemSeason ?? 0,
                      })}
                      {issue.problemEpisodes?.length
                        ? ` · ${t('lumen.issues.episodes', 'Episodes {episodes}', { episodes: issue.problemEpisodes.join(', ') })}`
                        : issue.problemEpisode
                          ? ` · ${t('lumen.issues.episode', 'Episode {episode}', { episode: issue.problemEpisode })}`
                          : ''}
                    </small>
                  )
                )}
                <small>
                  {issue.createdBy.displayName ??
                    t('lumen.issues.reporter', 'Reporter')}{' '}
                  · {timestamp(issue.createdAt, locale)}
                </small>
                <section
                  id={`issue-inline-${issue.id}`}
                  className="setlist"
                  aria-label={t('lumen.issues.issueDetails', 'Issue Details')}
                  hidden={expandedIssue !== issue.id}
                >
                  {expandedIssue === issue.id && (
                    <Discussion id={issue.id} embedded />
                  )}
                </section>
              </div>
              <IssueStatus status={issue.status} />
            </li>
          ))}
        </ul>
      )}
      {!!data && (page > 1 || data.pageInfo.pages > 1) && (
        <nav
          className="toolbar"
          aria-label={t('lumen.issues.pages', 'Issue Pages')}
        >
          <button
            className="btn btn-quiet btn-sm"
            disabled={page <= 1}
            onClick={() => update('page', page > 2 ? String(page - 1) : '')}
          >
            {t('lumen.issues.previousPage', 'Previous Page')}
          </button>
          <span>{t('lumen.issues.page', 'Page {page}', { page })}</span>
          <button
            className="btn btn-quiet btn-sm"
            disabled={page >= data.pageInfo.pages}
            onClick={() => update('page', String(page + 1))}
          >
            {t('lumen.issues.nextPage', 'Next Page')}
          </button>
        </nav>
      )}
    </>
  );
}

type IssueAction =
  | { kind: 'comment' | 'resolved' | 'open' | 'delete-issue' }
  | { kind: 'edit-comment' | 'delete-comment'; commentId: number };

function Discussion({
  id,
  embedded = false,
}: {
  id: number;
  embedded?: boolean;
}) {
  const { locale, t } = useLumenLocale();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const listParams = new URLSearchParams(params);
  listParams.delete('issue');
  const listSearch = listParams.toString();
  const issueList = { pathname: '/issues', search: listSearch };
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
        navigate(issueList, { replace: true });
        return;
      }
      if (action.kind === 'comment') setMessage('');
      if (action.kind === 'edit-comment') setEdit(undefined);
      refresh();
    } catch {
      reload();
      setFailure(
        t(
          'lumen.issues.updateUnconfirmed',
          'Could not confirm the update. Check the discussion before trying again.'
        )
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
      {!embedded && (
        <div className="toolbar">
          <Link className="btn btn-quiet btn-sm" to={issueList}>
            {listSearch
              ? t('lumen.issues.backToIssues', 'Back to Issues')
              : t('lumen.issues.allIssues', 'All Issues')}
          </Link>
        </div>
      )}
      <ServiceNote error={error} what="the issue" retry={reload} />
      {!data && !error && (
        <p className="note" role="status">
          {t('lumen.issues.loadingIssue', 'Loading issue…')}
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
              ? t('lumen.issues.deleteIssueQuestion', 'Delete this issue?')
              : t('lumen.issues.deleteCommentQuestion', 'Delete this comment?')
          }
          body={
            confirmation.kind === 'delete-issue'
              ? t(
                  'lumen.issues.deleteIssueBody',
                  'The report and its discussion will be permanently removed.'
                )
              : t(
                  'lumen.issues.deleteCommentBody',
                  'This comment will be permanently removed.'
                )
          }
          confirm={
            confirmation.kind === 'delete-issue'
              ? t('lumen.issues.deleteIssue', 'Delete Issue')
              : t('lumen.issues.deleteComment', 'Delete Comment')
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
              {t(
                `lumen.issues.type.${data.issueType}`,
                TYPES[data.issueType] ?? 'Issue'
              )}
              {data.issueSubtype
                ? ' · ' + data.issueSubtype.replaceAll('_', ' ')
                : ''}
              {data.is4k ? ' · 4K' : ''}
            </span>
            {titleLink && (
              <Link className="btn btn-quiet btn-sm" to={titleLink.path}>
                {t('lumen.issues.openMedia', 'Open {media}', {
                  media: t(
                    `lumen.issues.media.${titleLink.label.toLowerCase()}`,
                    titleLink.label
                  ),
                })}
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
                {data.status === 2
                  ? t('lumen.issues.reopenIssue', 'Reopen Issue')
                  : t('lumen.issues.resolveIssue', 'Resolve Issue')}
              </button>
            )}
            {canDeleteIssue && (
              <button
                className="btn btn-quiet btn-sm"
                disabled={busy}
                onClick={() => setConfirmation({ kind: 'delete-issue' })}
              >
                {t('lumen.issues.deleteIssue', 'Delete Issue')}
              </button>
            )}
          </div>
          {data.problemEpisodeSelections?.length ? (
            <ul className="setlist">
              {data.problemEpisodeSelections.map(
                ({ seasonNumber, episodeNumbers }) => (
                  <li className="set" key={seasonNumber}>
                    {t('lumen.issues.season', 'Season {season}', {
                      season: seasonNumber,
                    })}
                    {episodeNumbers?.length
                      ? ` · ${t('lumen.issues.episodes', 'Episodes {episodes}', { episodes: episodeNumbers.join(', ') })}`
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
                {t('lumen.issues.season', 'Season {season}', {
                  season: data.problemSeason ?? 0,
                })}
                {data.problemEpisodes?.length
                  ? ` · ${t('lumen.issues.episodes', 'Episodes {episodes}', { episodes: data.problemEpisodes.join(', ') })}`
                  : data.problemEpisode
                    ? ` · ${t('lumen.issues.episode', 'Episode {episode}', { episode: data.problemEpisode })}`
                    : ''}
              </p>
            )
          )}
          <ul
            className="setlist"
            aria-label={t('lumen.issues.discussion', 'Issue Discussion')}
          >
            {data.comments?.map((comment, index) => {
              const author = canCreate && comment.user?.id === user?.id;
              const editing = author && edit?.id === comment.id;
              return (
                <li className="set" key={comment.id}>
                  <div>
                    <b>
                      {comment.user?.displayName ??
                        t('lumen.issues.reporter', 'Reporter')}
                    </b>
                    <small>{timestamp(comment.createdAt, locale)}</small>
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
                              ? t(
                                  'lumen.issues.editIssueDescription',
                                  'Edit Issue Description'
                                )
                              : t('lumen.issues.editComment', 'Edit Comment')
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
                            {t('lumen.issues.cancelEdit', 'Cancel Edit')}
                          </button>
                          <button
                            className="btn btn-tonal btn-sm"
                            disabled={
                              busy ||
                              !edit.message.trim() ||
                              edit.message.trim() === comment.message
                            }
                          >
                            {t('lumen.issues.saveEdit', 'Save Edit')}
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
                          {index === 0
                            ? t(
                                'lumen.issues.editDescription',
                                'Edit Description'
                              )
                            : t('lumen.issues.editComment', 'Edit Comment')}
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
                          {t('lumen.issues.deleteComment', 'Delete Comment')}
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
                aria-label={t('lumen.issues.comment', 'Comment')}
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
                  {t('lumen.issues.addComment', 'Add Comment')}
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
  const { t } = useLumenLocale();
  const { user } = useAuth();
  const { issueId } = useParams();
  const [params] = useSearchParams();
  const rawId = issueId ?? params.get('issue');
  const id = rawId && /^\d+$/.test(rawId) ? Number(rawId) : 0;
  const validId = Number.isSafeInteger(id) && id > 0;
  return (
    <>
      <header className="ph">
        <h1>
          {validId
            ? `${t('lumen.issues.issue', 'Issue')} #${id}`
            : t('lumen.issues.issues', 'Issues')}
        </h1>
      </header>
      {!canReadIssues(user?.permissions) ? (
        <p className="note">
          {t(
            'lumen.issues.noPermission',
            'You do not have permission to view issues.'
          )}
        </p>
      ) : rawId != null ? (
        validId ? (
          <Discussion key={id} id={id} />
        ) : (
          <p className="note">
            {t('lumen.issues.notFound', 'Issue not found.')}
          </p>
        )
      ) : (
        <IssueList />
      )}
    </>
  );
}
