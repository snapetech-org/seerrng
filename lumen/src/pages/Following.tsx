import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { Section } from '../components/cards';
import { ServiceNote } from '../components/extra';
import { useToast } from '../components/toast';
import { friendlyError } from '../errors';
import { patchHref } from '../extras';
import { canViewFollowing } from '../followPermissions';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';

interface Subscription {
  id: number;
  kind: string;
  subjectLabel: string;
  conditions?: {
    ref?: { tmdbId?: unknown; genreId?: unknown; mediaType?: unknown };
  } | null;
  notify: boolean;
  autoRequest: boolean;
}

interface FollowEvent {
  id: number;
  title: string;
  seen: boolean;
  follow: Pick<Subscription, 'subjectLabel' | 'kind'>;
  reasonKey?: string;
  reasonValues?: Record<string, string>;
  target: { mediaType: string; id: string; variantKey?: string } | null;
}

const PAGE_SIZE = 30;
const BOOK_FOLLOW_KINDS = ['narrator', 'author', 'series-language', 'edition'];

const eventReasons = new Map(
  Object.entries({
    nextVolumeAnnounced:
      'The next volume of {series} is announced in {language}: {title}.',
    newVolumeReleased: 'A new {language} volume of {series} is out: {title}.',
    newNarrationAvailable:
      'A different narration of {title} exists: {narrators}.',
    fullCastProduction: 'A full-cast production of {title} exists.',
    newBookByNarrator: '{narrator} narrates a new audiobook: {title}.',
    newBookByAuthor: '{author} has a new work: {title}.',
    newExpansion: 'New content for {game}: {title}.',
    newPatchVersion: '{project} {version} is available for {game}.',
    newArtistRelease: '{artist} released {title}.',
    newFranchiseRelation: 'New connection in {franchise}: {relation}.',
    savedDiscoveryMatch: 'A new match for “{discovery}”: {attributes}.',
    collectorsAreSharing: 'Collectors you follow are sharing {title}.',
    newVideoTitle:
      'New movie or series title related to {subject}: {title} ({date}).',
    upcomingVideoTitle:
      'Upcoming movie or series related to {subject}: {title} ({date}).',
    videoReleaseDateReached:
      'The listed release date has passed for {title}, related to {subject} ({date}).',
  })
);

function eventReason(
  event: FollowEvent,
  t: ReturnType<typeof useLumenLocale>['t']
) {
  const source = event.reasonKey && eventReasons.get(event.reasonKey);
  const template = source
    ? t(`lumen.following.reason.${event.reasonKey}`, source)
    : undefined;
  if (!template) return undefined;

  const parameters: Record<string, string> = {
    title: event.title,
    ...event.reasonValues,
  };
  const placeholders = [...template.matchAll(/\{(\w+)\}/g)];
  if (placeholders.some(([, name]) => !parameters[name])) return undefined;

  return template.replace(/\{(\w+)\}/g, (_, name: string) =>
    name === 'relation'
      ? parameters[name].replaceAll('-', ' ')
      : parameters[name]
  );
}

function tmdbSourceHref(subscription: Subscription) {
  const ref = subscription.conditions?.ref;
  const id = subscription.kind === 'tmdb-genre' ? ref?.genreId : ref?.tmdbId;
  if (
    typeof id !== 'number' ||
    !Number.isSafeInteger(id) ||
    id < 1 ||
    id > 1_000_000_000
  )
    return undefined;

  switch (subscription.kind) {
    case 'tmdb-person':
      return `/person/${id}`;
    case 'tmdb-studio':
      return `/movies?studio=${id}`;
    case 'tmdb-network':
      return `/series?network=${id}`;
    case 'tmdb-genre':
      if (ref?.mediaType === 'movie') return `/movies?genre=${id}`;
      if (ref?.mediaType === 'tv') return `/series?genre=${id}`;
  }
}
function eventHref({ target, title }: FollowEvent) {
  if (target?.mediaType === 'patch') {
    const patch = patchHref(target.id, target.variantKey);
    if (patch) return patch;
  }
  if (target?.mediaType === 'anime' && /^\d{1,10}$/.test(target.id)) {
    return `/franchise/anime/${target.id}`;
  }
  if (
    target?.mediaType === 'game' &&
    /^[1-9]\d{0,15}$/.test(target.id) &&
    Number.isSafeInteger(Number(target.id))
  ) {
    return `/game/game/${target.id}`;
  }
  if (
    target &&
    [
      'movie',
      'tv',
      'book',
      'album',
      'artist',
      'comic',
      'collection',
      'person',
    ].includes(target.mediaType)
  ) {
    const kind = target.mediaType === 'album' ? 'music' : target.mediaType;
    const format = kind === 'book' && target.variantKey ? '?f=audio' : '';
    if (target.id && target.id !== '.' && target.id !== '..')
      return `/${kind}/${encodeURIComponent(target.id)}${format}`;
  }
  const query = target?.mediaType === 'search' ? target.id || title : title;
  return `/search?q=${encodeURIComponent(query)}`;
}

export default function Following() {
  const { t } = useLumenLocale();
  const { user } = useAuth();
  const allowed = canViewFollowing(user?.permissions);
  const [page, setPage] = useState(0);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const events = useApi<{ total: number; results: FollowEvent[] }>(
    allowed ? `/follow/events?take=${PAGE_SIZE}&skip=${page * PAGE_SIZE}` : null
  );
  const subscriptions = useApi<{ results: Subscription[] }>(
    allowed ? '/follow' : null
  );
  const count = useApi<{ unseen: number }>(
    allowed ? '/follow/events/count' : null
  );

  async function save(path: string, method: string, body?: object) {
    if (saving) return;
    setSaving(true);
    try {
      await api(path, { method, body: JSON.stringify(body) });
      events.refresh();
      subscriptions.refresh();
      count.refresh();
    } catch (error) {
      toast(
        friendlyError(
          error,
          t('lumen.following.saveFailure', 'Couldn’t save the change')
        )
      );
    } finally {
      setSaving(false);
    }
  }

  const rows = events.data?.results;
  return (
    <>
      <header className="ph">
        <h1>{t('components.Layout.Sidebar.following', 'Following')}</h1>
      </header>
      {!allowed ? (
        <p className="note">
          {t(
            'lumen.following.accessRequired',
            'Request access is required to use Following.'
          )}
        </p>
      ) : (
        <>
          <Section
            title={t('lumen.following.updates', 'Updates')}
            action={
              Boolean(count.data?.unseen) && (
                <button
                  className="btn btn-tonal btn-sm"
                  disabled={saving}
                  onClick={() =>
                    void save('/follow/events/seen', 'POST', { all: true })
                  }
                >
                  {t('lumen.following.markAllSeen', 'Mark All Seen ({count})', {
                    count: count.data?.unseen ?? 0,
                  })}
                </button>
              )
            }
          >
            <ServiceNote
              error={events.error}
              what={t('lumen.following.updates', 'updates')}
              retry={events.reload}
            />
            {!events.data && !events.error && (
              <p className="note" role="status">
                {t('lumen.following.loadingUpdates', 'Loading updates…')}
              </p>
            )}
            {rows?.length === 0 && (
              <p className="note">
                {t('lumen.following.noUpdates', 'No updates on this page.')}
              </p>
            )}
            {!!rows?.length && (
              <ul className="setlist">
                {rows.map((event) => {
                  const reason =
                    eventReason(event, t) ??
                    (event.follow.kind === 'franchise'
                      ? event.reasonValues?.relation?.replaceAll('-', ' ')
                      : undefined);
                  return (
                    <li className="set" key={event.id}>
                      <span>
                        <Link
                          className="go"
                          to={eventHref(event)}
                          onClick={(click) => {
                            if (
                              !event.seen &&
                              !click.defaultPrevented &&
                              click.button === 0 &&
                              !click.metaKey &&
                              !click.altKey &&
                              !click.ctrlKey &&
                              !click.shiftKey
                            ) {
                              void save('/follow/events/seen', 'POST', {
                                ids: [event.id],
                              });
                            }
                          }}
                        >
                          {event.title}
                        </Link>
                        <small>
                          {t('lumen.following.from', 'From {subject}', {
                            subject: event.follow.subjectLabel,
                          })}
                        </small>
                        {reason && <small>{reason}</small>}
                      </span>
                      {!event.seen && (
                        <button
                          className="btn btn-quiet btn-sm"
                          aria-label={t(
                            'lumen.following.markSeen',
                            'Mark Seen: {title}',
                            { title: event.title }
                          )}
                          disabled={saving}
                          onClick={() =>
                            void save('/follow/events/seen', 'POST', {
                              ids: [event.id],
                            })
                          }
                        >
                          {t('lumen.following.markSeenButton', 'Mark Seen')}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {page > 0 && (
              <button
                className="btn btn-quiet btn-sm"
                disabled={saving}
                onClick={() => setPage(page - 1)}
              >
                {t('lumen.following.previousPage', 'Previous Page')}
              </button>
            )}
            {(events.data?.total ?? 0) > (page + 1) * PAGE_SIZE && (
              <button
                className="btn btn-quiet btn-sm"
                disabled={saving}
                onClick={() => setPage(page + 1)}
              >
                {t('lumen.following.nextPage', 'Next Page')}
              </button>
            )}
          </Section>
          <Section
            title={t('lumen.following.whatYouFollow', 'What You Follow')}
          >
            <ServiceNote
              error={subscriptions.error}
              what={t('lumen.following.whatYouFollow', 'subscriptions')}
              retry={subscriptions.reload}
            />
            {!subscriptions.data && !subscriptions.error && (
              <p className="note" role="status">
                {t(
                  'lumen.following.loadingSubscriptions',
                  'Loading subscriptions…'
                )}
              </p>
            )}
            {subscriptions.data?.results.length === 0 && (
              <p className="note">
                {t(
                  'lumen.following.noSubscriptions',
                  'You haven’t followed anything yet.'
                )}
              </p>
            )}
            {!!subscriptions.data?.results.length && (
              <ul className="setlist">
                {subscriptions.data.results.map((subscription) => {
                  const path = `/follow/${subscription.id}`;
                  const sourceHref = tmdbSourceHref(subscription);
                  return (
                    <li className="set" key={subscription.id}>
                      {sourceHref ? (
                        <Link className="go" to={sourceHref}>
                          {subscription.subjectLabel}
                        </Link>
                      ) : (
                        <b>{subscription.subjectLabel}</b>
                      )}
                      <label>
                        <input
                          type="checkbox"
                          checked={subscription.notify}
                          disabled={saving}
                          onChange={(event) =>
                            void save(path, 'PATCH', {
                              notify: event.target.checked,
                            })
                          }
                        />{' '}
                        {t('lumen.following.notifyMe', 'Notify Me')}
                      </label>
                      {BOOK_FOLLOW_KINDS.includes(subscription.kind) && (
                        <label>
                          <input
                            type="checkbox"
                            checked={subscription.autoRequest}
                            disabled={saving}
                            onChange={(event) =>
                              void save(path, 'PATCH', {
                                autoRequest: event.target.checked,
                              })
                            }
                          />{' '}
                          {t(
                            'lumen.following.requestAutomatically',
                            'Request Automatically'
                          )}
                        </label>
                      )}
                      <button
                        className="btn btn-quiet btn-sm"
                        disabled={saving}
                        aria-label={t(
                          'lumen.following.stopFollowingSubject',
                          'Stop Following: {subject}',
                          { subject: subscription.subjectLabel }
                        )}
                        onClick={() => void save(path, 'DELETE')}
                      >
                        {t('lumen.following.stopFollowing', 'Stop Following')}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
        </>
      )}
    </>
  );
}
