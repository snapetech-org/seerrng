import { useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import AnimeContinuation from '../components/AnimeContinuation';
import { Section } from '../components/cards';
import { ExtraHeader, ServiceNote } from '../components/extra';
import FollowButton from '../components/FollowButton';
import { useToast } from '../components/toast';
import { friendlyError } from '../errors';
import { canViewFollowing } from '../followPermissions';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';

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
const bookshelfId = /^bookshelf:\d+:[A-Za-z0-9_-]+$/;
const validGameId = (id: string) =>
  /^[1-9]\d{0,15}$/.test(id) && Number.isSafeInteger(Number(id));
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
  anilistId?: number;
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
  if (item.mediaType === 'game' && item.href.startsWith('/game/game/')) {
    const id = item.href.slice('/game/game/'.length);
    if (validGameId(id)) return item.href;
  }
  if (item.href.startsWith('/search?')) {
    const query = new URLSearchParams(item.href.slice('/search?'.length));
    return `/search?${new URLSearchParams({ q: query.get('q') || query.get('query') || item.title })}`;
  }
  if (
    /^\/book\/bookshelf(?::|%3a)\d+(?::|%3a)[A-Za-z0-9_-]+$/i.test(item.href) ||
    /^\/(movie|tv|book|music|artist|comic|collection|franchise)(?:\/[A-Za-z0-9_-]+){1,2}$/.test(
      item.href
    )
  )
    return item.href;
  return `/search?${new URLSearchParams({ q: item.title })}`;
}

export default function Franchise() {
  const { id = '' } = useParams();
  const { pathname } = useLocation();
  const mediaType = pathname.split('/')[2] || '';
  return (
    <FranchiseTitle key={`${mediaType}:${id}`} mediaType={mediaType} id={id} />
  );
}

function FranchiseTitle({ mediaType, id }: { mediaType: string; id: string }) {
  const { t } = useLumenLocale();
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
      toast(
        friendlyError(
          cause,
          t('lumen.franchise.updateError', 'Couldn’t update the relationship'),
          t
        )
      );
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
        t(
          'lumen.franchise.validationError',
          'Choose a relationship and enter the related title and catalogue ID.'
        )
      );
      return;
    }
    const route = Object.hasOwn(targetRoutes, toType)
      ? targetRoutes[toType]
      : '';
    const href =
      toType === 'game' && validGameId(toId)
        ? `/game/game/${toId}`
        : route &&
            (/^[A-Za-z0-9_-]{1,128}$/.test(toId) ||
              (toType === 'book' &&
                toId.length <= 128 &&
                bookshelfId.test(toId)))
          ? `${route}/${encodeURIComponent(toId)}`
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
      toast(
        friendlyError(
          cause,
          t('lumen.franchise.addError', 'Couldn’t add the relationship'),
          t
        )
      );
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
            ? t('lumen.franchise.forTitle', 'Franchise for {title}', {
                title: data.anchor.title,
              })
            : t('lumen.franchise.title', 'Franchise')
        }
      >
        <div className="toolbar">
          {valid && mediaType === 'tv' && (
            <Link className="chip" to={`/tv/${id}`}>
              {t('lumen.franchise.backToSeries', 'Back to Series')}
            </Link>
          )}
          {data?.canCurate && !adding && (
            <button
              type="button"
              className="chip"
              disabled={busy}
              onClick={() => setAdding(true)}
            >
              {t('lumen.franchise.addRelationship', 'Add Relationship')}
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
      {data &&
        mediaType === 'anime' &&
        Number(id) > 0 &&
        Number(id) <= 1_000_000_000 && (
          <AnimeContinuation source="anilist" id={Number(id)} />
        )}
      {!valid && (
        <p className="note" role="alert">
          {t('lumen.franchise.invalid', 'Invalid franchise title.')}
        </p>
      )}
      <ServiceNote
        error={error}
        what={t('lumen.franchise.what', 'franchise')}
        retry={reload}
      />
      {valid && !data && !error && (
        <p className="note" role="status">
          {t('lumen.franchise.loading', 'Loading franchise…')}
        </p>
      )}
      {data?.canCurate && adding && (
        <Section
          title={t('lumen.franchise.addRelationship', 'Add a Relationship')}
        >
          <form onSubmit={(event) => void addRelationship(event)}>
            <fieldset className="setlist" disabled={busy}>
              <label className="set cfg-row">
                <b>{t('lumen.franchise.relatedTitle', 'Related Title')}</b>
                <input name="title" required maxLength={255} />
              </label>
              <label className="set cfg-row">
                <b>{t('lumen.franchise.catalogueId', 'Catalogue ID')}</b>
                <input name="toId" required maxLength={128} />
              </label>
              <label className="set cfg-row">
                <b>{t('lumen.franchise.mediaType', 'Media Type')}</b>
                <select
                  name="toType"
                  aria-label={t('lumen.franchise.mediaType', 'Media Type')}
                  defaultValue="tv"
                >
                  {Object.entries(targetTypes).map(([value, label]) => (
                    <option key={value} value={value}>
                      {t(
                        `lumen.franchise.target.${value === 'tv' ? 'series' : value}`,
                        label
                      )}
                    </option>
                  ))}
                </select>
              </label>
              <label className="set cfg-row">
                <b>{t('lumen.franchise.relationship', 'Relationship')}</b>
                <select
                  name="relation"
                  aria-label={t('lumen.franchise.relationship', 'Relationship')}
                  defaultValue="sequel"
                >
                  {Object.entries(relations).map(([value, label]) => (
                    <option key={value} value={value}>
                      {t(
                        `lumen.franchise.relation.${value === 'source-material' ? 'sourceMaterial' : value === 'side-story' ? 'sideStory' : value === 'same-franchise' ? 'sameFranchise' : value}`,
                        label
                      )}
                    </option>
                  ))}
                </select>
              </label>
              <label className="set cfg-row">
                <b>{t('lumen.franchise.evidence', 'Evidence')}</b>
                <input name="evidence" maxLength={512} />
              </label>
              <div className="toolbar">
                <button className="btn btn-tonal btn-sm" type="submit">
                  {t('lumen.franchise.saveRelationship', 'Save Relationship')}
                </button>
                <button
                  className="btn btn-quiet btn-sm"
                  type="button"
                  onClick={() => setAdding(false)}
                >
                  {t('lumen.franchise.cancel', 'Cancel')}
                </button>
              </div>
            </fieldset>
          </form>
        </Section>
      )}
      {data?.notes.includes('no-anilist-match') && (
        <p className="note">
          {t(
            'lumen.franchise.noAniListMatch',
            'No AniList match was found. Curated links may still be available.'
          )}
        </p>
      )}
      {data?.items.length === 0 && (
        <p className="note">
          {t(
            'lumen.franchise.noRelationships',
            'No franchise relationships found.'
          )}
        </p>
      )}
      {data &&
        Object.entries(groups).map(([group, label]) => {
          const items = data.items.filter((item) => item.group === group);
          return (
            items.length > 0 && (
              <Section
                key={group}
                title={t(
                  `lumen.franchise.group.${group === 'side-story' ? 'sideStory' : group === 'soundtrack' ? 'soundtracks' : group}`,
                  label
                )}
              >
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
                            item.format === 'ebook'
                              ? t('lumen.franchise.format.ebook', 'Ebook')
                              : item.format === 'audiobook'
                                ? t(
                                    'lumen.franchise.format.audiobook',
                                    'Audiobook'
                                  )
                                : Object.hasOwn(targetTypes, item.mediaType)
                                  ? t(
                                      `lumen.franchise.target.${item.mediaType === 'tv' ? 'series' : item.mediaType}`,
                                      targetTypes[
                                        item.mediaType as keyof typeof targetTypes
                                      ]
                                    )
                                  : item.mediaType,
                            item.year,
                            item.verified
                              ? t('lumen.franchise.verified', 'Verified')
                              : t(
                                  `lumen.franchise.confidence.${item.confidence}`,
                                  `${item.confidence} confidence`
                                ),
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </small>
                        {item.evidence && <small>{item.evidence}</small>}
                        {item.mediaType === 'anime' &&
                          typeof item.anilistId === 'number' &&
                          Number.isSafeInteger(item.anilistId) &&
                          item.anilistId > 0 &&
                          item.anilistId <= 9_999_999_999 && (
                            <Link
                              className="btn btn-quiet btn-sm"
                              to={`/franchise/anime/${item.anilistId}`}
                              aria-label={`${t('lumen.providerDiscovery.exploreFranchise', 'Explore Franchise')}: ${item.title}`}
                            >
                              {t(
                                'lumen.providerDiscovery.exploreFranchise',
                                'Explore Franchise'
                              )}
                            </Link>
                          )}
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
                              {t('lumen.franchise.confirm', 'Confirm')}
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
                            {t('lumen.franchise.hide', 'Hide')}
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
