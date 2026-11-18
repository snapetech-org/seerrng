import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, tmdbImg, type TitleResult } from '../api';
import { forget } from '../apiCache';
import { useAuth } from '../auth';
import { Section, TitleCard } from '../components/cards';
import { ConfirmSheet } from '../components/ConfirmSheet';
import { canRequestMovies } from '../components/detail';
import { ExtraCard, ServiceNote } from '../components/extra';
import FollowButton from '../components/FollowButton';
import { useToast } from '../components/toast';
import { canViewFollowing } from '../followPermissions';
import { useApi, usePublicSettings } from '../hooks';
import { Icon } from '../icons';
import { sessionGeneration } from '../sessionState';

export function PersonCard({ person }: { person: TitleResult }) {
  const image = tmdbImg(person.profilePath);
  return (
    <ExtraCard
      href={`/person/${person.id}`}
      img={image || undefined}
      title={person.name || 'Unknown person'}
      icon="user"
    />
  );
}

interface PersonDetails {
  id: number;
  name: string;
  profilePath?: string;
  biography?: string;
  knownForDepartment?: string;
  placeOfBirth?: string;
}

type PersonCredit = Omit<TitleResult, 'mediaType'> & {
  mediaType?: string;
  popularity?: number;
  voteCount?: number;
  character?: string;
  job?: string;
};

interface PersonCredits {
  cast: PersonCredit[];
  crew: PersonCredit[];
}

const creditSorts = [
  ['voteCount', 'Votes'],
  ['popularity', 'Popularity'],
  ['date', 'Release Date'],
  ['voteAverage', 'Rating'],
  ['title', 'Title'],
] as const;

const creditCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
});

type VideoCredit = PersonCredit & { mediaType: 'movie' | 'tv' };

function creditTitles(
  credits: PersonCredit[],
  filter: string,
  sort: string,
  role: 'character' | 'job'
) {
  const titles = new Map<string, { title: VideoCredit; roles: Set<string> }>();
  for (const credit of credits) {
    const { mediaType, id } = credit;
    if (
      (mediaType !== 'movie' && mediaType !== 'tv') ||
      (filter !== 'all' && filter !== mediaType)
    )
      continue;
    if (!Number.isSafeInteger(id) || id <= 0) continue;
    const key = `${mediaType}:${id}`;
    const entry = titles.get(key) ?? {
      title: { ...credit, mediaType },
      roles: new Set<string>(),
    };
    if (credit[role]?.trim()) entry.roles.add(credit[role].trim());
    titles.set(key, entry);
  }
  const descending = sort.endsWith('.desc');
  const field = sort.split('.')[0];
  const value = (credit: VideoCredit) => {
    switch (field) {
      case 'title':
        return (
          (credit.mediaType === 'movie' ? credit.title : credit.name)?.trim() ||
          undefined
        );
      case 'date':
        return Date.parse(
          (credit.mediaType === 'movie'
            ? credit.releaseDate
            : credit.firstAirDate) ?? ''
        );
      case 'popularity':
        return credit.popularity;
      case 'voteAverage':
        return credit.voteAverage;
      default:
        return credit.voteCount;
    }
  };
  return [...titles.values()].sort((left, right) => {
    const a = value(left.title);
    const b = value(right.title);
    const hasA = typeof a === 'string' || Number.isFinite(a);
    const hasB = typeof b === 'string' || Number.isFinite(b);
    if (!hasA || !hasB) return Number(hasB) - Number(hasA);
    const order =
      typeof a === 'number' && typeof b === 'number'
        ? a - b
        : creditCollator.compare(String(a), String(b));
    return descending ? -order : order;
  });
}

function Filmography({
  credits,
  acting,
}: {
  credits: PersonCredits;
  acting: boolean;
}) {
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('voteCount.desc');
  const groups = [
    {
      label: 'Cast',
      entries: creditTitles(credits.cast ?? [], filter, sort, 'character'),
    },
    {
      label: 'Crew',
      entries: creditTitles(credits.crew ?? [], filter, sort, 'job'),
    },
  ];
  if (!acting) groups.reverse();
  return (
    <Section title="Credits">
      <div className="toolbar">
        <label className="sel">
          <span className="lbl">Media Type</span>
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            <option value="all">All</option>
            <option value="movie">Movies</option>
            <option value="tv">Series</option>
          </select>
        </label>
        <label className="sel">
          <span className="lbl">Sort Credits</span>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value)}
          >
            {creditSorts.map(([key, label]) => (
              <optgroup key={key} label={label}>
                <option value={`${key}.desc`}>
                  {label} (
                  {key === 'title'
                    ? 'Z–A'
                    : key === 'date'
                      ? 'Newest'
                      : 'High to Low'}
                  )
                </option>
                <option value={`${key}.asc`}>
                  {label} (
                  {key === 'title'
                    ? 'A–Z'
                    : key === 'date'
                      ? 'Oldest'
                      : 'Low to High'}
                  )
                </option>
              </optgroup>
            ))}
          </select>
        </label>
      </div>
      {groups.every(({ entries }) => !entries.length) && (
        <p className="note">No matching credits.</p>
      )}
      {groups.map(
        ({ label, entries }) =>
          entries.length > 0 && (
            <Section title={label} key={label}>
              <div className="grid">
                {entries.map(({ title, roles }) => (
                  <TitleCard
                    key={`${title.mediaType}:${title.id}`}
                    it={title}
                    meta={[...roles].join(' · ') || undefined}
                  />
                ))}
              </div>
            </Section>
          )
      )}
    </Section>
  );
}

function RequestPersonMovies({
  name,
  ids,
  onSubmitted,
}: {
  name: string;
  ids: number[];
  onSubmitted: () => void;
}) {
  const [selection, setSelection] = useState<number[]>();
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [summary, setSummary] = useState('');
  const toast = useToast();

  async function submit() {
    if (!selection || pending.current) return;
    pending.current = true;
    setBusy(true);
    const generation = sessionGeneration();
    let created = 0;
    let skipped = 0;
    let failed = 0;
    let unconfirmed = 0;
    let notSubmitted = 0;
    try {
      for (let offset = 0; offset < selection.length; offset += 100) {
        if (generation !== sessionGeneration()) return;
        const batch = selection.slice(offset, offset + 100);
        try {
          const result = await api<{
            created: number[];
            skipped: { movieId: number }[];
            failed: { movieId: number }[];
            stoppedReason?: string;
          }>('/request/person-movies', {
            method: 'POST',
            body: JSON.stringify({ movieIds: batch }),
          });
          const skippedIds = result.skipped.map(({ movieId }) => movieId);
          const failedIds = result.failed.map(({ movieId }) => movieId);
          const remaining = new Set(batch);
          const count = (ids: number[]) =>
            ids.filter((id) => remaining.delete(id)).length;
          created += count(result.created);
          skipped += count(skippedIds);
          failed += count(failedIds);
          unconfirmed += remaining.size;
          if (result.stoppedReason || remaining.size) {
            notSubmitted = selection.length - offset - batch.length;
            break;
          }
        } catch {
          unconfirmed += batch.length;
          notSubmitted = selection.length - offset - batch.length;
          break;
        }
      }
      if (generation !== sessionGeneration()) return;
      const result = [
        `${created} submitted`,
        `${skipped} skipped`,
        `${failed} failed`,
        unconfirmed ? `${unconfirmed} unconfirmed` : '',
        notSubmitted ? `${notSubmitted} not submitted` : '',
      ]
        .filter(Boolean)
        .join(' · ');
      setSummary(result);
      setSelection(undefined);
      toast(result);
      forget('/request');
      onSubmitted();
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="toolbar">
        <button
          className="btn btn-primary btn-sm"
          type="button"
          disabled={!ids.length}
          onClick={() => setSelection(ids)}
        >
          Request All Movies
        </button>
      </div>
      {summary && <p className="note">{summary}</p>}
      {selection && (
        <ConfirmSheet
          title={`Request Movies by ${name}`}
          body={`SeerrNG will check ${selection.length} credited movies for eligibility and request the eligible titles using your default movie settings.`}
          confirm="Request All"
          cancel="Cancel"
          busy={busy}
          onConfirm={() => void submit()}
          onClose={() => {
            if (!pending.current) setSelection(undefined);
          }}
        />
      )}
    </div>
  );
}

export default function PersonDetail() {
  const { id: rawId } = useParams();
  const { user } = useAuth();
  const settings = usePublicSettings();
  const id = Number(rawId);
  const path =
    Number.isInteger(id) && id > 0 && id <= 1_000_000_000
      ? `/person/${id}`
      : null;
  const person = useApi<PersonDetails>(path);
  const credits = useApi<PersonCredits>(
    path ? `${path}/combined_credits` : null
  );

  const movieIds = [
    ...new Set(
      [...(credits.data?.cast ?? []), ...(credits.data?.crew ?? [])]
        .filter(
          ({ mediaType, id }) =>
            mediaType === 'movie' &&
            Number.isSafeInteger(id) &&
            id > 0 &&
            id <= 1_000_000_000
        )
        .map(({ id }) => id)
    ),
  ];

  if (!path) return <div className="empty">Person not found.</div>;

  return (
    <>
      <header className="ph">
        <div className="eyebrow">
          <Link to="/search">People</Link>
        </div>
        <div className="ph-row">
          <h1>{person.data?.name || 'Person'}</h1>
          {canViewFollowing(user?.permissions) &&
            person.data?.id === id &&
            person.data.name && (
              <FollowButton
                key={id}
                subject={{
                  kind: 'tmdb-person',
                  subjectKey: `tmdb:person:${id}`,
                  subjectLabel: person.data.name,
                  conditions: { ref: { tmdbId: id } },
                }}
              />
            )}
        </div>
        {settings?.personMovieBulkRequestsEnabled === true &&
          settings.enabledMediaCategories?.movie !== false &&
          canRequestMovies(user?.permissions) &&
          person.data?.id === id &&
          !!movieIds.length && (
            <RequestPersonMovies
              key={id}
              name={person.data.name}
              ids={movieIds}
              onSubmitted={credits.refresh}
            />
          )}
      </header>
      <ServiceNote
        error={person.error}
        what="person details"
        retry={person.reload}
      />
      {!person.data && !person.error && <p className="note">Loading person…</p>}
      {person.data && (
        <div className="person-overview">
          <div className="portrait">
            {tmdbImg(person.data.profilePath) ? (
              <img
                src={tmdbImg(person.data.profilePath)}
                alt=""
                loading="lazy"
              />
            ) : (
              <span className="art-ph">
                <Icon name="user" />
              </span>
            )}
          </div>
          <div>
            {person.data.knownForDepartment && (
              <p className="sub">{person.data.knownForDepartment}</p>
            )}
            {person.data.placeOfBirth && (
              <p className="sub">Born in {person.data.placeOfBirth}</p>
            )}
            {person.data.biography && (
              <p className="ov long">{person.data.biography}</p>
            )}
          </div>
        </div>
      )}
      <ServiceNote
        error={credits.error}
        what="credits"
        retry={credits.reload}
      />
      {!credits.data && !credits.error && (
        <p className="note">Loading credits…</p>
      )}
      {credits.data && (
        <Filmography
          key={id}
          credits={credits.data}
          acting={person.data?.knownForDepartment === 'Acting'}
        />
      )}
    </>
  );
}
