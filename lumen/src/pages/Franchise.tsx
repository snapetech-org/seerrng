import { useRef, useState } from 'react';
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
