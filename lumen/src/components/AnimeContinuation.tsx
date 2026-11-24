import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { canViewFollowing } from '../followPermissions';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';
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
  const { locale, t } = useLumenLocale();
  const positionText = (position?: Position) =>
    [
      position?.volume != null
        ? t('lumen.continuation.volume', undefined, {
            number: position.volume,
          })
        : '',
      position?.chapter != null
        ? t('lumen.continuation.chapter', undefined, {
            number: position.chapter,
          })
        : '',
    ]
      .filter(Boolean)
      .join(locale.startsWith('ar') ? '، ' : ', ');
  const [open, setOpen] = useState(false);
  const [season, setSeason] = useState<number>();
  const chosenSeason = season ?? seasons?.at(-1)?.seasonNumber;
  const language = locale;
  const path = `/continuation/${source}/${id}?${new URLSearchParams({ language })}`;
  const latest = useApi<ContinuationResult>(
    open && (source === 'anilist' || chosenSeason === undefined) ? path : null,
    {
      currentPathOnly: true,
    }
  );
  const selected = useApi<ContinuationResult>(
    open && chosenSeason !== undefined
      ? `${path}&season=${chosenSeason}`
      : null,
    { currentPathOnly: true }
  );
  const continuation = chosenSeason === undefined ? latest : selected;
  const seasonOptions =
    seasons ??
    latest.data?.seasons?.map(({ number, title }) => ({
      seasonNumber: number,
      name: title,
    })) ??
    [];

  return (
    <Section
      title={t('lumen.continuation.title')}
      action={
        <button
          className="btn btn-tonal btn-sm"
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open
            ? t('lumen.continuation.hideSources')
            : t('lumen.continuation.findSources')}
        </button>
      }
    >
      {open && (
        <>
          {seasonOptions.length > 0 && (
            <label className="sel">
              <span className="lbl">{t('lumen.continuation.season')}</span>
              <select
                aria-label={t('lumen.continuation.seasonLabel')}
                value={chosenSeason ?? ''}
                onChange={(event) =>
                  setSeason(
                    event.target.value ? Number(event.target.value) : undefined
                  )
                }
              >
                {source === 'anilist' && (
                  <option value="">{t('lumen.continuation.thisEntry')}</option>
                )}
                {seasonOptions.map(({ seasonNumber, name }) => (
                  <option key={seasonNumber} value={seasonNumber}>
                    {name ||
                      t('lumen.continuation.seasonNumber', undefined, {
                        number: seasonNumber,
                      })}
                  </option>
                ))}
              </select>
            </label>
          )}
          <ServiceNote
            error={continuation.error}
            what={t('lumen.continuation.sourceMaterial')}
            retry={continuation.reload}
          />
          {!continuation.data && !continuation.error && (
            <p className="note" role="status">
              {t('lumen.continuation.searching')}
            </p>
          )}
          {continuation.data && !continuation.data.sources?.length && (
            <p className="note">{t('lumen.continuation.noSource')}</p>
          )}
          {continuation.data?.seasonMapping === 'ordered' && (
            <p className="note">{t('lumen.continuation.ordered')}</p>
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
                  new Intl.DisplayNames([locale], {
                    type: 'language',
                    fallback: 'code',
                  }).of(novel.language);
                return (
                  <li className="set" key={source.anilistId}>
                    <div>
                      <b>{source.title}</b>
                      <small>
                        {t(
                          source.kind === 'novel'
                            ? 'lumen.continuation.novel'
                            : 'lumen.continuation.manga'
                        )}{' '}
                        ·{' '}
                        {t('lumen.continuation.confidence', undefined, {
                          confidence: t(
                            `lumen.continuation.confidence.${source.confidence}`,
                            source.confidence
                          ),
                        })}
                      </small>
                      <small>
                        {end
                          ? t('lumen.continuation.seasonEndsAt', undefined, {
                              position: end,
                            })
                          : t('lumen.continuation.seasonEndUnknown')}
                      </small>
                      {next && (
                        <small>
                          {source.volumeApproximate ||
                          source.continuationBasis === 'derived'
                            ? t('lumen.continuation.estimated')
                            : t('lumen.continuation.continueAt')}{' '}
                          · {next}
                        </small>
                      )}
                      {next && source.continuationBasis === 'derived' && (
                        <small>{t('lumen.continuation.estimateHint')}</small>
                      )}
                      {next && source.volumeApproximate && (
                        <small>
                          {t('lumen.continuation.volumeUnconfirmed')}
                        </small>
                      )}
                      {volume && (
                        <small>
                          {volume.title} ·{' '}
                          {novel?.translationPending
                            ? t('lumen.continuation.translationPending')
                            : t('lumen.continuation.available')}{' '}
                          {t('lumen.continuation.inLanguage', undefined, {
                            language: languageName ?? novel?.language ?? '',
                          })}
                        </small>
                      )}
                      {!!source.evidence.length && (
                        <details>
                          <summary>{t('lumen.continuation.evidence')}</summary>
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
                                ? t(`lumen.continuation.target.${target.label}`)
                                : t('lumen.continuation.searchFor', undefined, {
                                    title: target.title,
                                  })}
                            </Link>
                          );
                        })}
                        {novel && canViewFollowing(user?.permissions) && (
                          <FollowButton
                            key={`${novel.ranobedbId}:${novel.language}`}
                            label={t(
                              'lumen.followButton.followFutureVolumes',
                              'Follow Future Volumes'
                            )}
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
