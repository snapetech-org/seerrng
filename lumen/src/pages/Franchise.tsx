import { useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { Section } from '../components/cards';
import { ExtraHeader, ServiceNote } from '../components/extra';
import FollowButton from '../components/FollowButton';
import { useToast } from '../components/toast';
import { friendlyError } from '../errors';
import { canViewFollowing } from '../followPermissions';
import { useApi } from '../hooks';

const groups = {
  source: 'Source Material',
  adaptation: 'Adaptations',
  prequel: 'Prequels',
  sequel: 'Sequels',
  'side-story': 'Side Stories',
  soundtrack: 'Soundtracks',
  related: 'Related Titles',
};

const relations = {
  'source-material': 'Source Material',
  adaptation: 'Adaptation',
  prequel: 'Prequel',
  sequel: 'Sequel',
  'side-story': 'Side Story',
  soundtrack: 'Soundtrack',
  'same-franchise': 'Same Franchise',
};
const targetTypes = {
  anime: 'Anime',
  manga: 'Manga',
  novel: 'Novel',
  movie: 'Movie',
  tv: 'Series',
  game: 'Game',
  album: 'Album',
  book: 'Book',
};
const targetRoutes: Record<string, string> = {
  movie: '/movie',
  tv: '/tv',
  anime: '/franchise/anime',
  album: '/music',
  book: '/book',
};

interface FranchiseItem {
  group: keyof typeof groups;
  title: string;
  href: string;
  mediaType: string;
  format?: string;
  year?: number;
  confidence: 'high' | 'moderate' | 'low';
  evidence?: string;
  verified: boolean;
  relationId?: number;
}

interface FranchiseData {
  anchor: { title: string };
  items: FranchiseItem[];
  notes: string[];
  canCurate: boolean;
}

function itemHref(item: FranchiseItem) {
  if (
    /^\/(movie|tv|book|music|artist|comic|collection|franchise)(?:\/[A-Za-z0-9_-]+){1,2}$/.test(
      item.href
    ) ||
    /^\/search\?[^#]*$/.test(item.href)
  )
    return item.href;
  return `/search?${new URLSearchParams({ q: item.title })}`;
}

export default function Franchise() {
  const { mediaType = '', id = '' } = useParams();
  const { user } = useAuth();
  const valid =
    (mediaType === 'tv' || mediaType === 'anime') && /^\d{1,10}$/.test(id);
  const { data, error, reload } = useApi<FranchiseData>(
    valid ? `/franchise/${mediaType}/${id}` : null
  );
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const pending = useRef(false);
  const toast = useToast();

  async function curate(relationId: number, action: 'verified' | 'rejected') {
    if (pending.current || !data?.canCurate) return;
    pending.current = true;
    setBusy(true);
    try {
      await api(`/franchise/relations/${relationId}`, {
        method: 'PATCH',
        body: JSON.stringify({ [action]: true }),
      });
      reload();
    } catch (cause) {
      toast(friendlyError(cause, 'Couldn’t update the relationship'));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  async function addRelationship(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || !data?.canCurate || !valid) return;
    const form = new FormData(event.currentTarget);
    const toType = String(form.get('toType') ?? '');
    const toId = String(form.get('toId') ?? '').trim();
    const relation = String(form.get('relation') ?? '');
    const title = String(form.get('title') ?? '').trim();
    const evidence = String(form.get('evidence') ?? '').trim();
    if (
      !Object.hasOwn(targetTypes, toType) ||
      !Object.hasOwn(relations, relation) ||
      !toId ||
      !title
    ) {
      toast(
        'Choose a relationship and enter the related title and catalogue ID.'
      );
      return;
    }
    const route = Object.hasOwn(targetRoutes, toType)
      ? targetRoutes[toType]
      : '';
    const href =
      route && /^[A-Za-z0-9_-]{1,128}$/.test(toId)
        ? `${route}/${toId}`
        : undefined;
    pending.current = true;
    setBusy(true);
    try {
      await api('/franchise/relations', {
        method: 'POST',
        body: JSON.stringify({
          fromType: mediaType,
          fromId: id,
          toType,
          toId,
          relation,
          title,
          evidence: evidence || undefined,
          href,
        }),
      });
      setAdding(false);
      reload();
    } catch (cause) {
      toast(friendlyError(cause, 'Couldn’t add the relationship'));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <ExtraHeader
        title={
          data?.anchor.title
            ? `Franchise for ${data.anchor.title}`
            : 'Franchise'
        }
      >
        <div className="toolbar">
          {valid && mediaType === 'tv' && (
            <Link className="chip" to={`/tv/${id}`}>
              Back to Series
            </Link>
          )}
          {data?.canCurate && !adding && (
            <button
              type="button"
              className="chip"
              disabled={busy}
              onClick={() => setAdding(true)}
            >
              Add Relationship
            </button>
          )}
          {data && canViewFollowing(user?.permissions) && (
            <FollowButton
              subject={{
                kind: 'franchise',
                subjectKey: `${mediaType}:${id}`,
                subjectLabel: data.anchor.title || id,
                conditions: { ref: { anchorId: id, anchorType: mediaType } },
              }}
            />
          )}
        </div>
      </ExtraHeader>
      {!valid && (
        <p className="note" role="alert">
          Invalid franchise title.
        </p>
      )}
      <ServiceNote error={error} what="franchise" retry={reload} />
      {valid && !data && !error && (
        <p className="note" role="status">
          Loading franchise…
        </p>
      )}
      {data?.canCurate && adding && (
        <Section title="Add a Relationship">
          <form onSubmit={(event) => void addRelationship(event)}>
            <fieldset className="setlist" disabled={busy}>
              <label className="set cfg-row">
                <b>Related Title</b>
                <input name="title" required maxLength={255} />
              </label>
              <label className="set cfg-row">
                <b>Catalogue ID</b>
                <input name="toId" required maxLength={128} />
              </label>
              <label className="set cfg-row">
                <b>Media Type</b>
                <select name="toType" aria-label="Media Type" defaultValue="tv">
                  {Object.entries(targetTypes).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="set cfg-row">
                <b>Relationship</b>
                <select
                  name="relation"
                  aria-label="Relationship"
                  defaultValue="sequel"
                >
                  {Object.entries(relations).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="set cfg-row">
                <b>Evidence</b>
                <input name="evidence" maxLength={512} />
              </label>
              <div className="toolbar">
                <button className="btn btn-tonal btn-sm" type="submit">
                  Save Relationship
                </button>
                <button
                  className="btn btn-quiet btn-sm"
                  type="button"
                  onClick={() => setAdding(false)}
                >
                  Cancel
                </button>
              </div>
            </fieldset>
          </form>
        </Section>
      )}
      {data?.notes.includes('no-anilist-match') && (
        <p className="note">
          No AniList match was found. Curated links may still be available.
        </p>
      )}
      {data?.items.length === 0 && (
        <p className="note">No franchise relationships found.</p>
      )}
      {data &&
        Object.entries(groups).map(([group, label]) => {
          const items = data.items.filter((item) => item.group === group);
          return (
            items.length > 0 && (
              <Section key={group} title={label}>
                <ul className="setlist">
                  {items.map((item) => (
                    <li
                      className="set"
                      key={`${item.mediaType}:${item.href}:${item.title}`}
                    >
                      <div>
                        <Link className="go" to={itemHref(item)}>
                          {item.title}
                        </Link>
                        <small>
                          {[
                            item.format || item.mediaType,
                            item.year,
                            item.verified
                              ? 'Verified'
                              : `${item.confidence} confidence`,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </small>
                        {item.evidence && <small>{item.evidence}</small>}
                      </div>
                      {data.canCurate && item.relationId && (
                        <div className="toolbar">
                          {!item.verified && (
                            <button
                              className="btn btn-tonal btn-sm"
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void curate(item.relationId!, 'verified')
                              }
                            >
                              Confirm
                            </button>
                          )}
                          <button
                            className="btn btn-quiet btn-sm"
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void curate(item.relationId!, 'rejected')
                            }
                          >
                            Hide
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </Section>
            )
          );
        })}
    </>
  );
}
