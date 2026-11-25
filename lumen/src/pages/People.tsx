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
import { useExtras } from '../extras';
import { canViewFollowing } from '../followPermissions';
import { useApi, usePublicSettings } from '../hooks';
import { useLumenLocale } from '../i18n';
import { Icon } from '../icons';
import { sessionGeneration } from '../sessionState';

export function PersonCard({ person }: { person: TitleResult }) {
  const { t } = useLumenLocale();
  const image = tmdbImg(person.profilePath);
  return (
    <ExtraCard
      href={`/person/${person.id}`}
      img={image || undefined}
      title={person.name || t('lumen.people.unknown', 'Unknown person')}
      icon="user"
    />
  );
}

interface PersonDetails {
  id: number;
  name: string;
  birthday?: string;
  deathday?: string;
  alsoKnownAs?: string[];
  profilePath?: string;
  biography?: string;
  knownForDepartment?: string;
  placeOfBirth?: string;
  imdbId?: string;
}

function formatPersonDate(value: string | undefined, locale: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(date.valueOf()) ||
    date.toISOString().slice(0, 10) !== value
  )
    return undefined;
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(date);
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

const creditCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
});

type VideoCredit = PersonCredit & { mediaType: 'movie' | 'tv' };

function creditTitles(
  credits: PersonCredit[],
  filter: string,
  sort: string,
  role: 'character' | 'job',
  movieEnabled: boolean,
  tvEnabled: boolean
) {
  const titles = new Map<string, { title: VideoCredit; roles: Set<string> }>();
  for (const credit of credits) {
    const { mediaType, id } = credit;
    if (
      (mediaType !== 'movie' && mediaType !== 'tv') ||
      (mediaType === 'movie' && !movieEnabled) ||
      (mediaType === 'tv' && !tvEnabled) ||
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
  movieEnabled,
  tvEnabled,
}: {
  credits: PersonCredits;
  acting: boolean;
  movieEnabled: boolean;
  tvEnabled: boolean;
}) {
  const { t } = useLumenLocale();
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('voteCount.desc');
  const creditSorts = [
    ['voteCount', t('lumen.people.votes', 'Votes')],
    ['popularity', t('lumen.people.popularity', 'Popularity')],
    ['date', t('lumen.people.releaseDate', 'Release Date')],
    ['voteAverage', t('lumen.people.rating', 'Rating')],
    ['title', t('lumen.people.title', 'Title')],
  ] as const;
  const groups = [
    {
      label: t('lumen.people.cast', 'Cast'),
      entries: creditTitles(
        credits.cast ?? [],
        filter,
        sort,
        'character',
        movieEnabled,
        tvEnabled
      ),
    },
    {
      label: t('lumen.people.crew', 'Crew'),
      entries: creditTitles(
        credits.crew ?? [],
        filter,
        sort,
        'job',
        movieEnabled,
        tvEnabled
      ),
    },
  ];
  if (!acting) groups.reverse();
  return (
    <Section title={t('lumen.people.credits', 'Credits')}>
      <div className="toolbar">
        <label className="sel">
          <span className="lbl">
            {t('lumen.people.mediaType', 'Media Type')}
          </span>
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            <option value="all">{t('lumen.people.all', 'All')}</option>
            {movieEnabled && (
              <option value="movie">
                {t('lumen.people.movies', 'Movies')}
              </option>
            )}
            {tvEnabled && (
              <option value="tv">{t('lumen.people.series', 'Series')}</option>
            )}
          </select>
        </label>
        <label className="sel">
          <span className="lbl">
            {t('lumen.people.sortCredits', 'Sort Credits')}
          </span>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value)}
          >
            {creditSorts.map(([key, label]) => (
              <optgroup key={key} label={label}>
                <option value={`${key}.desc`}>
                  {label} (
                  {key === 'title'
                    ? t('lumen.people.zToA', 'Z–A')
                    : key === 'date'
                      ? t('lumen.people.newest', 'Newest')
                      : t('lumen.people.highToLow', 'High to Low')}
                  )
                </option>
                <option value={`${key}.asc`}>
                  {label} (
                  {key === 'title'
                    ? t('lumen.people.aToZ', 'A–Z')
                    : key === 'date'
                      ? t('lumen.people.oldest', 'Oldest')
                      : t('lumen.people.lowToHigh', 'Low to High')}
                  )
                </option>
              </optgroup>
            ))}
          </select>
        </label>
      </div>
      {groups.every(({ entries }) => !entries.length) && (
        <p className="note">
          {t('lumen.people.noMatchingCredits', 'No matching credits.')}
        </p>
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
  const { t } = useLumenLocale();
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
        t('lumen.people.submitted', '{count} submitted', { count: created }),
        t('lumen.people.skipped', '{count} skipped', { count: skipped }),
        t('lumen.people.failed', '{count} failed', { count: failed }),
        unconfirmed
          ? t('lumen.people.unconfirmed', '{count} unconfirmed', {
              count: unconfirmed,
            })
          : '',
        notSubmitted
          ? t('lumen.people.notSubmitted', '{count} not submitted', {
              count: notSubmitted,
            })
          : '',
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
          {t('lumen.people.requestAllMovies', 'Request All Movies')}
        </button>
      </div>
      {summary && <p className="note">{summary}</p>}
      {selection && (
        <ConfirmSheet
          title={t('lumen.people.requestMoviesBy', 'Request Movies by {name}', {
            name,
          })}
          body={t(
            'lumen.people.requestConfirmation',
            'SeerrNG will check {count} credited movies for eligibility and request the eligible titles using your default movie settings.',
            { count: selection.length }
          )}
          confirm={t('lumen.people.requestAll', 'Request All')}
          cancel={t('lumen.people.cancel', 'Cancel')}
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
  const { t, locale } = useLumenLocale();
  const { id: rawId } = useParams();
  const { user } = useAuth();
  const extras = useExtras();
  const movieEnabled = extras.categoryEnabled('movie');
  const tvEnabled = extras.categoryEnabled('tv');
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

  if (!path)
    return (
      <div className="empty">
        {t('lumen.people.notFound', 'Person not found.')}
      </div>
    );

  return (
    <>
      <header className="ph">
        <div className="eyebrow">
          <Link to="/search">{t('lumen.people.people', 'People')}</Link>
        </div>
        <div className="ph-row">
          <h1>{person.data?.name || t('lumen.people.person', 'Person')}</h1>
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
          movieEnabled &&
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
        what={t('lumen.people.personDetails', 'person details')}
        retry={person.reload}
      />
      {!person.data && !person.error && (
        <p className="note">
          {t('lumen.people.loadingPerson', 'Loading person…')}
        </p>
      )}
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
            {person.data.id > 0 && (
              <nav
                className="toolbar"
                aria-label={t('lumen.people.externalLinks', 'External links')}
              >
                <a
                  className="btn btn-quiet btn-sm"
                  href={`https://www.themoviedb.org/person/${person.data.id}?language=${encodeURIComponent(locale)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  TMDB
                </a>
                {person.data.imdbId && /^nm\d+$/.test(person.data.imdbId) && (
                  <a
                    className="btn btn-quiet btn-sm"
                    href={`https://www.imdb.com/name/${person.data.imdbId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    IMDb
                  </a>
                )}
              </nav>
            )}
            {person.data.knownForDepartment && (
              <p className="sub">{person.data.knownForDepartment}</p>
            )}
            {person.data.birthday &&
              (() => {
                const birthday = formatPersonDate(person.data.birthday, locale);
                const deathday = formatPersonDate(person.data.deathday, locale);
                if (!birthday) return null;
                return (
                  <p className="sub">
                    {birthday && deathday
                      ? t(
                          'components.PersonDetails.lifespan',
                          '{birthdate} – {deathdate}',
                          {
                            birthdate: birthday,
                            deathdate: deathday,
                          }
                        )
                      : t(
                          'components.PersonDetails.birthdate',
                          'Born {birthdate}',
                          {
                            birthdate: birthday,
                          }
                        )}
                  </p>
                );
              })()}
            {person.data.placeOfBirth && (
              <p className="sub">
                {t('lumen.people.bornIn', 'Born in {place}', {
                  place: person.data.placeOfBirth,
                })}
              </p>
            )}
            {!!person.data.alsoKnownAs?.length && (
              <p className="sub">
                {t(
                  'components.PersonDetails.alsoknownas',
                  'Also Known As: {names}',
                  {
                    names: new Intl.ListFormat(locale, {
                      style: 'long',
                      type: 'conjunction',
                    }).format(person.data.alsoKnownAs),
                  }
                )}
              </p>
            )}
            {person.data.biography && (
              <p className="ov long">{person.data.biography}</p>
            )}
          </div>
        </div>
      )}
      <ServiceNote
        error={credits.error}
        what={t('lumen.people.credits', 'credits')}
        retry={credits.reload}
      />
      {!credits.data && !credits.error && (
        <p className="note">
          {t('lumen.people.loadingCredits', 'Loading credits…')}
        </p>
      )}
      {credits.data && (
        <Filmography
          key={id}
          credits={credits.data}
          acting={person.data?.knownForDepartment === 'Acting'}
          movieEnabled={movieEnabled}
          tvEnabled={tvEnabled}
        />
      )}
    </>
  );
}
