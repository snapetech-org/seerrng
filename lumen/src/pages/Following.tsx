import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { Section } from '../components/cards';
import { ServiceNote } from '../components/extra';
import { useToast } from '../components/toast';
import { friendlyError } from '../errors';
import { canViewFollowing } from '../followPermissions';
import { useApi } from '../hooks';

interface Subscription {
  id: number;
  kind: string;
  subjectLabel: string;
  notify: boolean;
  autoRequest: boolean;
}

interface FollowEvent {
  id: number;
  title: string;
  seen: boolean;
  follow: Pick<Subscription, 'subjectLabel'>;
  target: { mediaType: string; id: string; variantKey?: string } | null;
}

const PAGE_SIZE = 30;
const BOOK_FOLLOW_KINDS = ['narrator', 'author', 'series-language', 'edition'];

function eventHref({ target, title }: FollowEvent) {
  if (target && ['movie', 'tv', 'book', 'album'].includes(target.mediaType)) {
    const kind = target.mediaType === 'album' ? 'music' : target.mediaType;
    const format = kind === 'book' && target.variantKey ? '?f=audio' : '';
    return `/${kind}/${encodeURIComponent(target.id)}${format}`;
  }
  return `/search?q=${encodeURIComponent(title)}`;
}

export default function Following() {
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
      toast(friendlyError(error, 'Couldn’t save the change'));
    } finally {
      setSaving(false);
    }
  }

  const rows = events.data?.results;
  return (
    <>
      <header className="ph">
        <h1>Following</h1>
      </header>
      {!allowed ? (
        <p className="note">Request access is required to use Following.</p>
      ) : (
        <>
          <Section
            title="Updates"
            action={
              Boolean(count.data?.unseen) && (
                <button
                  className="btn btn-tonal btn-sm"
                  disabled={saving}
                  onClick={() =>
                    void save('/follow/events/seen', 'POST', { all: true })
                  }
                >
                  Mark All Seen ({count.data?.unseen})
                </button>
              )
            }
          >
            <ServiceNote
              error={events.error}
              what="updates"
              retry={events.reload}
            />
            {!events.data && !events.error && (
              <p className="note" role="status">
                Loading updates…
              </p>
            )}
            {rows?.length === 0 && (
              <p className="note">No updates on this page.</p>
            )}
            {!!rows?.length && (
              <ul className="setlist">
                {rows.map((event) => (
                  <li className="set" key={event.id}>
                    <span>
                      <Link className="go" to={eventHref(event)}>
                        {event.title}
                      </Link>
                      <small>From {event.follow.subjectLabel}</small>
                    </span>
                    {!event.seen && (
                      <button
                        className="btn btn-quiet btn-sm"
                        aria-label={`Mark Seen: ${event.title}`}
                        disabled={saving}
                        onClick={() =>
                          void save('/follow/events/seen', 'POST', {
                            ids: [event.id],
                          })
                        }
                      >
                        Mark Seen
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {page > 0 && (
              <button
                className="btn btn-quiet btn-sm"
                disabled={saving}
                onClick={() => setPage(page - 1)}
              >
                Previous Page
              </button>
            )}
            {(events.data?.total ?? 0) > (page + 1) * PAGE_SIZE && (
              <button
                className="btn btn-quiet btn-sm"
                disabled={saving}
                onClick={() => setPage(page + 1)}
              >
                Next Page
              </button>
            )}
          </Section>
          <Section title="What You Follow">
            <ServiceNote
              error={subscriptions.error}
              what="subscriptions"
              retry={subscriptions.reload}
            />
            {!subscriptions.data && !subscriptions.error && (
              <p className="note" role="status">
                Loading subscriptions…
              </p>
            )}
            {subscriptions.data?.results.length === 0 && (
              <p className="note">You haven’t followed anything yet.</p>
            )}
            {!!subscriptions.data?.results.length && (
              <ul className="setlist">
                {subscriptions.data.results.map((subscription) => {
                  const path = `/follow/${subscription.id}`;
                  return (
                    <li className="set" key={subscription.id}>
                      <b>{subscription.subjectLabel}</b>
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
                        />
                        Notify Me
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
                          />
                          Request Automatically
                        </label>
                      )}
                      <button
                        className="btn btn-quiet btn-sm"
                        disabled={saving}
                        aria-label={`Stop Following: ${subscription.subjectLabel}`}
                        onClick={() => void save(path, 'DELETE')}
                      >
                        Stop Following
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
