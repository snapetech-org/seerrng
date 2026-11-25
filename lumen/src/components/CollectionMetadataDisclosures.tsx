import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { MovieDetails, Person, SubjectTag } from '../api';
import { cachedApi } from '../hooks';
import { useLumenLocale } from '../i18n';
import { sessionGeneration } from '../sessionState';
import { People, VideoDisclosure } from './detail';

type CollectionCreditKind = 'cast' | 'crew';

function CollectionMetadataPanel({
  ids,
  kind,
}: {
  ids: number[];
  kind: CollectionCreditKind | 'subjectTags';
}) {
  const { t } = useLumenLocale();
  const [details, setDetails] = useState<MovieDetails[]>([]);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const generation = sessionGeneration();
    setDetails([]);
    setFailed(false);
    setLoading(true);

    async function load() {
      const loaded: MovieDetails[] = [];
      let didFail = false;
      for (let offset = 0; offset < ids.length; offset += 5) {
        if (cancelled || generation !== sessionGeneration()) return;
        const results = await Promise.allSettled(
          ids
            .slice(offset, offset + 5)
            .map((id) => cachedApi<MovieDetails>(`/movie/${id}`))
        );
        results.forEach((result) => {
          if (result.status === 'fulfilled') loaded.push(result.value);
          else didFail = true;
        });
      }
      if (cancelled || generation !== sessionGeneration()) return;
      setDetails(loaded);
      setFailed(didFail);
      setLoading(false);
    }

    void load().catch(() => {
      if (cancelled || generation !== sessionGeneration()) return;
      setFailed(true);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [attempt, ids]);

  if (loading)
    return (
      <p className="note" role="status">
        {t('lumen.collectionMetadata.loading', 'Loading collection details…')}
      </p>
    );

  if (failed && details.length === 0)
    return (
      <div className="note" role="alert">
        {t(
          'lumen.collectionMetadata.loadFailure',
          'Could not load collection details.'
        )}{' '}
        <button
          className="chip"
          onClick={() => setAttempt((value) => value + 1)}
          type="button"
        >
          {t('lumen.collectionMetadata.retry', 'Retry')}
        </button>
      </div>
    );

  const people = new Map<number, Person>();
  const tags = new Map<number, SubjectTag>();
  for (const movie of details) {
    if (kind === 'cast' || kind === 'crew') {
      const credits = movie.credits?.[kind] ?? [];
      for (const person of credits) {
        if (!people.has(person.id)) people.set(person.id, person);
      }
    } else {
      for (const tag of movie.keywords ?? []) {
        if (!tags.has(tag.id)) tags.set(tag.id, tag);
      }
    }
  }

  return (
    <>
      {failed && (
        <p className="note" role="status">
          {t(
            'lumen.collectionMetadata.partialFailure',
            'Some movie details could not be loaded.'
          )}{' '}
          <button
            className="chip"
            onClick={() => setAttempt((value) => value + 1)}
            type="button"
          >
            {t('lumen.collectionMetadata.retry', 'Retry')}
          </button>
        </p>
      )}
      {kind === 'cast' || kind === 'crew' ? (
        people.size > 0 ? (
          <div className="collection-credits">
            <People list={[...people.values()]} full />
          </div>
        ) : (
          <p className="note">
            {t('lumen.collectionMetadata.noCredits', 'No credits available.')}
          </p>
        )
      ) : tags.size > 0 ? (
        <div className="toolbar">
          {[...tags.values()].map((tag) => (
            <Link
              className="chip"
              key={tag.id}
              to={`/movies?keywords=${tag.id}`}
            >
              {tag.name}
            </Link>
          ))}
        </div>
      ) : (
        <p className="note">
          {t('lumen.collectionMetadata.noTags', 'No subject tags available.')}
        </p>
      )}
    </>
  );
}

export function CollectionMetadataDisclosures({
  parts,
}: {
  parts: { id: number }[];
}) {
  const { t } = useLumenLocale();
  const ids = useMemo(
    () =>
      [...new Set(parts.map(({ id }) => id))].filter(
        (id) => Number.isSafeInteger(id) && id > 0 && id <= 1_000_000_000
      ),
    [parts]
  );
  if (!ids.length) return null;

  return (
    <>
      <VideoDisclosure
        media="movie"
        panel="cast"
        label={t('lumen.collectionMetadata.cast', 'Cast')}
        testId="collection-cast"
        deferChildrenUntilOpen
      >
        <CollectionMetadataPanel ids={ids} kind="cast" />
      </VideoDisclosure>
      <VideoDisclosure
        media="movie"
        panel="crew"
        label={t('lumen.collectionMetadata.crew', 'Crew')}
        testId="collection-crew"
        deferChildrenUntilOpen
      >
        <CollectionMetadataPanel ids={ids} kind="crew" />
      </VideoDisclosure>
      <VideoDisclosure
        media="movie"
        panel="subjectTags"
        label={t('lumen.collectionMetadata.subjectTags', 'Subject Tags')}
        testId="collection-subject-tags"
        deferChildrenUntilOpen
      >
        <CollectionMetadataPanel ids={ids} kind="subjectTags" />
      </VideoDisclosure>
    </>
  );
}
