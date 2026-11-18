import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { canViewFollowing } from '../followPermissions';
import { useApi } from '../hooks';
import { Section } from './cards';
import { ServiceNote } from './extra';
import FollowButton from './FollowButton';

interface Position {
  volume?: number;
  chapter?: number;
}

interface Source {
  anilistId: number;
  kind: 'manga' | 'novel';
  title: string;
  confidence: string;
  evidence: string[];
  end?: Position;
  continuation?: Position;
  continuationBasis?: 'documented' | 'derived';
  volumeApproximate?: boolean;
  novel?: {
    ranobedbId: number;
    language: string;
    continuationVolume?: { title: string };
    translationPending: boolean;
  };
  targets: {
    label: 'start' | 'continuation' | 'series';
    href: string;
    title: string;
    exact: boolean;
  }[];
}

const positionText = (position?: Position) =>
  [
    position?.volume != null ? `Volume ${position.volume}` : '',
    position?.chapter != null ? `Chapter ${position.chapter}` : '',
  ]
    .filter(Boolean)
    .join(', ');

const targetLabels = {
  start: 'Start From the Beginning',
  continuation: 'Open Continuation Volume',
  series: 'Open Source',
};

interface ContinuationResult {
  available: boolean;
  seasonMapping?: string;
  sources?: Source[];
  seasons?: { number: number; title?: string }[];
}

export default function AnimeContinuation({
  source,
  id,
  seasons,
}: {
  source: 'tv' | 'anilist';
  id: number;
  seasons?: { seasonNumber: number; name?: string }[];
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [season, setSeason] = useState<number>();
  const language = document.documentElement.lang.slice(0, 2) || 'en';
  const path = `/continuation/${source}/${id}?${new URLSearchParams({ language })}`;
  const latest = useApi<ContinuationResult>(open ? path : null, {
    currentPathOnly: true,
  });
  const selected = useApi<ContinuationResult>(
    open && season !== undefined ? `${path}&season=${season}` : null,
    { currentPathOnly: true }
  );
  const continuation = season === undefined ? latest : selected;
  const seasonOptions =
    seasons ??
    latest.data?.seasons?.map(({ number, title }) => ({
      seasonNumber: number,
      name: title,
    })) ??
    [];

  return (
    <Section
      title="Manga and Novel Continuations"
      action={
        <button
          className="btn btn-tonal btn-sm"
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? 'Hide Sources' : 'Find Sources'}
        </button>
      }
    >
      {open && (
        <>
          {seasonOptions.length > 0 && (
            <label className="sel">
              <span className="lbl">Season</span>
              <select
                aria-label="Continuation season"
                value={season ?? ''}
                onChange={(event) =>
                  setSeason(
                    event.target.value ? Number(event.target.value) : undefined
                  )
                }
              >
                <option value="">Latest Season</option>
                {seasonOptions.map(({ seasonNumber, name }) => (
                  <option key={seasonNumber} value={seasonNumber}>
                    {name || `Season ${seasonNumber}`}
                  </option>
                ))}
              </select>
            </label>
          )}
          <ServiceNote
            error={continuation.error}
            what="source material"
            retry={continuation.reload}
          />
          {!continuation.data && !continuation.error && (
            <p className="note" role="status">
              Looking for source material…
            </p>
          )}
          {continuation.data && !continuation.data.sources?.length && (
            <p className="note">No source material found for this season.</p>
          )}
          {continuation.data?.seasonMapping === 'ordered' && (
            <p className="note">Season matches are based on release order.</p>
          )}
          {!!continuation.data?.sources?.length && (
            <ul className="setlist">
              {continuation.data.sources.map((source) => {
                const end = positionText(source.end);
                const next = positionText(source.continuation);
                const novel = source.novel;
                const volume = novel?.continuationVolume;
                const languageName =
                  novel &&
                  new Intl.DisplayNames(['en'], {
                    type: 'language',
                    fallback: 'code',
                  }).of(novel.language);
                return (
                  <li className="set" key={source.anilistId}>
                    <div>
                      <b>{source.title}</b>
                      <small>
                        {source.kind === 'novel' ? 'Novel' : 'Manga'} ·{' '}
                        {source.confidence} confidence
                      </small>
                      <small>
                        {end
                          ? `Season ends at ${end}.`
                          : 'Season end position unknown.'}
                      </small>
                      {next && (
                        <small>
                          {source.volumeApproximate ||
                          source.continuationBasis === 'derived'
                            ? 'Estimated continuation'
                            : 'Continue at'}{' '}
                          · {next}
                        </small>
                      )}
                      {volume && (
                        <small>
                          {volume.title} ·{' '}
                          {novel?.translationPending
                            ? 'Translation pending'
                            : 'Available'}{' '}
                          in {languageName}
                        </small>
                      )}
                      {!!source.evidence.length && (
                        <details>
                          <summary>Match evidence</summary>
                          <ul>
                            {source.evidence.map((line) => (
                              <li key={line}>{line}</li>
                            ))}
                          </ul>
                        </details>
                      )}
                      <div className="dacts">
                        {source.targets.map((target) => {
                          const exact =
                            target.exact &&
                            /^\/(?:book|comic)\/[^/?#\\]+$/.test(target.href);
                          const searchTerm = target.href.startsWith('/search?')
                            ? new URLSearchParams(
                                target.href.slice('/search?'.length)
                              ).get('query')
                            : undefined;
                          return (
                            <Link
                              className="btn btn-quiet btn-sm"
                              key={target.label}
                              to={
                                exact
                                  ? target.href
                                  : `/search?${new URLSearchParams({ q: searchTerm || target.title })}`
                              }
                            >
                              {exact
                                ? targetLabels[target.label]
                                : `Search for ${target.title}`}
                            </Link>
                          );
                        })}
                        {novel && canViewFollowing(user?.permissions) && (
                          <FollowButton
                            key={`${novel.ranobedbId}:${novel.language}`}
                            label="Follow Future Volumes"
                            subject={{
                              kind: 'series-language',
                              subjectKey: `ranobedb:${novel.ranobedbId}:${novel.language}`,
                              subjectLabel: source.title,
                              conditions: {
                                language: novel.language,
                                ref: { ranobedbId: novel.ranobedbId },
                              },
                            }}
                          />
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </Section>
  );
}
