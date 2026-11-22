import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { requestMovie, requestSeries, tmdbImg, type TitleResult } from '../api';
import { useAuth, useMediaServerName } from '../auth';
import { StatLabel, statusOf } from '../components/cards';
import { canManageRequests, Pill } from '../components/detail';
import { ServiceNote } from '../components/extra';
import {
  isQuotaDenial,
  RequestSheet,
  streamingOverrideMessage,
  useAsksRequestOptions,
  useOffers4k,
} from '../components/requestSheet';
import { Avatar } from '../components/Shell';
import { useToast } from '../components/toast';
import {
  discoveryVisibility,
  showDiscoveryTitle,
} from '../discoveryVisibility';
import { friendlyError } from '../errors';
import { usePaged, usePublicSettings } from '../hooks';
import { useLumenLocale } from '../i18n';
import { Icon } from '../icons';
import { seriesRequestSummary } from '../seriesRequestSummary';
import { useVideoAvailability } from '../videoAvailability';

// upcoming movies and series, grouped by month, requestable ahead of release
export default function Soon() {
  const { locale, t } = useLumenLocale();
  const { user } = useAuth();
  const serverName = useMediaServerName();
  const availability = useVideoAvailability();
  const [params] = useSearchParams();
  const scope = params.get('media');
  const showMovies = scope !== 'tv';
  const showTv = scope !== 'movie';
  const movieList = usePaged<TitleResult>(
    showMovies ? '/discover/movies/upcoming' : null
  );
  const tvList = usePaged<TitleResult>(showTv ? '/discover/tv/upcoming' : null);
  const lists = [
    {
      label: t('lumen.soon.movies', 'upcoming movies'),
      visible: showMovies,
      list: movieList,
    },
    {
      label: t('lumen.soon.series', 'upcoming series'),
      visible: showTv,
      list: tvList,
    },
  ].filter(({ visible }) => visible);
  const loading = lists.some(({ list }) => !list.page && !list.error);
  const allSelectedListsLoaded = lists.every(
    ({ list }) => list.page > 0 && list.done && !list.error
  );
  const visibility = discoveryVisibility(
    usePublicSettings(),
    user?.permissions
  );
  const toast = useToast();
  const [asked, setAsked] = useState<Set<string>>(new Set());
  const asks = useAsksRequestOptions();
  const offers4kMovie = useOffers4k('movie');
  const offers4kTv = useOffers4k('tv');
  const [choice, setChoice] = useState<{
    title: TitleResult;
    quotaDenied?: boolean;
    streamingDenial?: string;
  }>();
  const choosing = choice?.title;
  const items = [
    ...(showMovies ? movieList.items : []).map((m) => ({
      ...m,
      mediaType: 'movie' as const,
      date: m.releaseDate || '',
    })),
    ...(showTv ? tvList.items : []).map((t) => ({
      ...t,
      mediaType: 'tv' as const,
      date: t.firstAirDate || '',
    })),
  ]
    .filter((x) => x.date && showDiscoveryTitle(x, visibility))
    .sort((a, b) => a.date.localeCompare(b.date));
  const months = new Map<string, typeof items>();
  for (const it of items) {
    const k = it.date.slice(0, 7);
    months.set(k, [...(months.get(k) || []), it]);
  }
  // rows flip to Requested as soon as you tap (the lists are cached, so their status lags)
  const req = async (it: (typeof items)[number]) => {
    const key = it.mediaType + it.id;
    const unask = () =>
      setAsked((a) => {
        const n = new Set(a);
        n.delete(key);
        return n;
      });
    setAsked((a) => new Set(a).add(key));
    try {
      const title = it.title || it.name || 'this title';
      if (it.mediaType === 'tv') {
        toast(seriesRequestSummary(title, await requestSeries(it.id)));
      } else {
        await requestMovie(it.id);
        toast(
          t(
            'lumen.soon.requestedMovie',
            'Requested {title}. It downloads when it’s out.',
            { title }
          )
        );
      }
    } catch (e) {
      unask();
      const streamingDenial = streamingOverrideMessage(e);
      if (streamingDenial !== undefined)
        setChoice((current) => current ?? { title: it, streamingDenial });
      else if (user && !canManageRequests(user.permissions) && isQuotaDenial(e))
        setChoice((current) => current ?? { title: it, quotaDenied: true });
      else
        toast(
          friendlyError(e, t('lumen.soon.requestFailed', 'Request failed'))
        );
    }
  };

  return (
    <>
      <header className="ph">
        <div className="ph-row">
          <div>
            <h1>{t('lumen.soon.title', 'Coming soon')}</h1>
          </div>
          <Avatar className="avatar ph-only-avatar" />
        </div>
        <p className="sub">
          {t(
            'lumen.soon.description',
            'Request ahead and it downloads the day it’s out.'
          )}
        </p>
        <nav
          className="toolbar"
          aria-label={t('lumen.soon.media', 'Upcoming Media')}
        >
          <Link
            className="chip"
            aria-current={showMovies && showTv ? 'page' : undefined}
            to="/soon"
          >
            {t('lumen.soon.all', 'All')}
          </Link>
          <Link
            className="chip"
            aria-current={!showTv ? 'page' : undefined}
            to="/soon?media=movie"
          >
            {t('lumen.soon.movieTitle', 'Movies')}
          </Link>
          <Link
            className="chip"
            aria-current={!showMovies ? 'page' : undefined}
            to="/soon?media=tv"
          >
            {t('lumen.soon.seriesTitle', 'Series')}
          </Link>
        </nav>
      </header>
      {loading && (
        <p className="note" role="status">
          {t('lumen.soon.loading', 'Loading upcoming titles…')}
        </p>
      )}
      {lists.map(({ label, list }) => (
        <ServiceNote
          key={label}
          error={list.error}
          what={label}
          retry={list.retry}
        />
      ))}
      {allSelectedListsLoaded && !months.size && (
        <p className="note">
          {t('lumen.soon.empty', 'No upcoming titles found.')}
        </p>
      )}
      {choosing && (
        <RequestSheet
          it={choosing}
          quotaDenied={choice?.quotaDenied}
          streamingDenial={choice?.streamingDenial}
          onClose={() => setChoice(undefined)}
          onDone={(is4k, series, quotaException) => {
            setAsked((a) => new Set(a).add(choosing.mediaType + choosing.id));
            toast(
              quotaException
                ? t(
                    'lumen.soon.approvalRequested',
                    'Approval requested for {title}',
                    { title: choosing.title || choosing.name || '' }
                  )
                : choosing.mediaType === 'tv'
                  ? seriesRequestSummary(
                      choosing.name || 'this series',
                      series,
                      is4k
                    )
                  : t(
                      'lumen.soon.requestedMovie',
                      'Requested {title}. It downloads when it’s out.',
                      { title: choosing.title || choosing.name || '' }
                    )
            );
            setChoice(undefined);
          }}
        />
      )}
      {[...months].map(([k, list]) => (
        <section className="month" key={k}>
          <h2>
            {new Intl.DateTimeFormat(locale, { month: 'long' }).format(
              new Date(Number(k.slice(0, 4)), Number(k.slice(5, 7)) - 1, 1)
            )}{' '}
            {k.slice(0, 4)}
          </h2>
          <div className="sl">
            {list.map((it) => {
              const s =
                statusOf(it.mediaInfo, false, serverName) ||
                (asked.has(it.mediaType + it.id)
                  ? ({
                      k: 'wait',
                      word: t('lumen.soon.requested', 'Requested'),
                      ico: 'clock',
                    } as const)
                  : null);
              const visible =
                s?.k === 'ok'
                  ? statusOf(it.mediaInfo, false, serverName, availability)
                  : s;
              return (
                <div className="si" key={it.mediaType + it.id}>
                  <div className="date">
                    <small>
                      {new Intl.DateTimeFormat(locale, { month: 'short' })
                        .format(
                          new Date(
                            Number(it.date.slice(0, 4)),
                            Number(it.date.slice(5, 7)) - 1,
                            1
                          )
                        )
                        .toLocaleUpperCase(locale)}
                    </small>
                    <b>{+it.date.slice(8)}</b>
                  </div>
                  <div className="art">
                    {it.backdropPath && (
                      <img
                        src={tmdbImg(it.backdropPath, 'w500')}
                        alt=""
                        loading="lazy"
                      />
                    )}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div className="tt">
                      <Link to={`/${it.mediaType}/${it.id}`}>
                        {it.title || it.name}
                      </Link>
                    </div>
                    <div className="sub">
                      {it.mediaType === 'tv'
                        ? t('lumen.soon.seriesTitle', 'Series')
                        : t('lumen.soon.movie', 'Movie')}
                    </div>
                    <div className="act">
                      {s ? (
                        visible && (
                          <Pill k={visible.k} icon={visible.ico}>
                            <StatLabel s={visible} />
                          </Pill>
                        )
                      ) : (
                        <button
                          className="btn btn-sm btn-tonal"
                          data-label-wrap
                          onClick={() =>
                            asks ||
                            (it.mediaType === 'tv' ? offers4kTv : offers4kMovie)
                              ? setChoice({ title: it })
                              : req(it)
                          }
                        >
                          <Icon name="plus" size="sm" />
                          {t('lumen.soon.request', 'Request')}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
      {lists.map(({ label, list }) =>
        list.page > 0 && !list.done ? (
          <div className="more-scroll" key={label}>
            <button
              className="btn btn-tonal"
              disabled={list.loading}
              onClick={list.more}
            >
              {list.loading
                ? t('lumen.soon.loading', 'Loading…')
                : t('lumen.soon.showMore', 'Show more {media}', {
                    media: label,
                  })}
            </button>
          </div>
        ) : null
      )}
      <div className="more-scroll">
        <Link className="btn btn-quiet" to="/calendar">
          {t('lumen.me.releaseCalendar', 'Release Calendar')}
        </Link>
      </div>
    </>
  );
}
