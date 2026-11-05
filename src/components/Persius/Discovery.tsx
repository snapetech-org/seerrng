import Button from '@app/components/Common/Button';
import CachedImage from '@app/components/Common/CachedImage';
import Header from '@app/components/Common/Header';
import useDiscover from '@app/hooks/useDiscover';
import useSettings from '@app/hooks/useSettings';
import { Permission, useUser } from '@app/hooks/useUser';
import {
  getUserServiceAvailability,
  isConfiguredMediaCategoryEnabled,
} from '@app/utils/serviceAvailability';
import { getViewerAvailabilityPresentation } from '@app/utils/viewerAvailabilityPresentation';
import {
  CalendarDaysIcon,
  CheckIcon,
  ClockIcon,
  FilmIcon,
  PlusIcon,
  TvIcon,
} from '@heroicons/react/24/outline';
import { MediaStatus } from '@server/constants/media';
import type { MovieResult, TvResult } from '@server/models/Search';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import { ClosedBookIcon, HeadphonesIcon } from './Icons';
import messages from './messages';

const RequestModal = dynamic(() => import('@app/components/RequestModal'), {
  ssr: false,
});

export function DiscoveryHeader() {
  const intl = useIntl();
  const { user, hasPermission } = useUser();
  const { currentSettings } = useSettings();
  const availability = getUserServiceAvailability(
    currentSettings,
    user?.settings?.enabledMediaCategories,
    hasPermission(Permission.ADMIN)
  );
  const links = [
    {
      href: '/discover/movies',
      label: messages.movies,
      icon: FilmIcon,
      type: 'movie',
    },
    { href: '/discover/tv', label: messages.series, icon: TvIcon, type: 'tv' },
    {
      href: '/discover/books',
      label: messages.books,
      icon: ClosedBookIcon,
      type: 'ebook',
    },
    {
      href: '/discover/audiobooks',
      label: messages.audiobooks,
      icon: HeadphonesIcon,
      type: 'audiobook',
    },
  ] as const;
  return (
    <>
      <p className="persius-date" suppressHydrationWarning>
        {intl.formatDate(new Date(), {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
        })}
      </p>
      <Header>{intl.formatMessage(messages.discover)}</Header>
      <nav
        className="persius-quick-links"
        aria-label={intl.formatMessage(messages.discover)}
      >
        {links
          .filter((link) =>
            isConfiguredMediaCategoryEnabled(link.type, availability)
          )
          .map(({ href, label, icon: Icon }) => (
            <Link className="persius-chip" href={href} key={href}>
              <Icon aria-hidden="true" />
              {intl.formatMessage(label)}
            </Link>
          ))}
        <Link className="persius-chip" href="/coming-soon">
          <CalendarDaysIcon aria-hidden="true" />
          {intl.formatMessage(messages.comingSoon)}
        </Link>
      </nav>
    </>
  );
}

export function HeroCard({
  item,
  onChanged,
}: {
  item: MovieResult | TvResult;
  onChanged?: () => void;
}) {
  const intl = useIntl();
  const { hasPermission } = useUser();
  const { currentSettings } = useSettings();
  const [requestOpen, setRequestOpen] = useState(false);
  const movie = item.mediaType === 'movie';
  const title = movie ? item.title : item.name;
  const date = movie ? item.releaseDate : item.firstAirDate;
  const href = `/${movie ? 'movie' : 'tv'}/${item.id}`;
  const availability = getViewerAvailabilityPresentation(
    item.mediaInfo?.status,
    currentSettings.otherUsersAvailability,
    item.mediaInfo?.viewerRequestCoverage?.standard
  );
  const available =
    item.mediaInfo?.status === MediaStatus.AVAILABLE && !availability.hidden;
  const requested =
    item.mediaInfo?.status === MediaStatus.PENDING ||
    item.mediaInfo?.status === MediaStatus.PROCESSING;
  return (
    <article className="persius-hero">
      <CachedImage
        type="tmdb"
        src={`https://image.tmdb.org/t/p/w1280${item.backdropPath || item.posterPath}`}
        alt=""
        fill
        sizes="(max-width: 767px) 84vw, 564px"
      />
      <div className="persius-hero-content">
        <span className="persius-hero-kicker">
          {intl.formatMessage(
            movie ? messages.popularMovies : messages.popularSeries
          )}
        </span>
        <Link href={href} className="persius-hero-title">
          {title}
        </Link>
        <div className="persius-hero-footer">
          <span>
            {[
              date?.slice(0, 4),
              item.voteCount > 0
                ? `★ ${intl.formatNumber(item.voteAverage, { maximumFractionDigits: 1 })}`
                : undefined,
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
          {available ? (
            <Link href={href} className="persius-chip">
              <CheckIcon aria-hidden="true" />
              {intl.formatMessage(
                availability.shared
                  ? messages.sharedLibrary
                  : messages.inLibrary
              )}
            </Link>
          ) : requested ? (
            <Link href={href} className="persius-chip">
              <ClockIcon aria-hidden="true" />
              {intl.formatMessage(messages.requested)}
            </Link>
          ) : item.mediaInfo?.status !== MediaStatus.BLOCKLISTED &&
            hasPermission(
              [
                Permission.REQUEST,
                movie ? Permission.REQUEST_MOVIE : Permission.REQUEST_TV,
                Permission.REQUEST_4K,
                movie ? Permission.REQUEST_4K_MOVIE : Permission.REQUEST_4K_TV,
              ],
              { type: 'or' }
            ) ? (
            <Button buttonType="primary" onClick={() => setRequestOpen(true)}>
              <PlusIcon aria-hidden="true" />
              {intl.formatMessage(messages.request)}
            </Button>
          ) : (
            <Link href={href} className="persius-chip">
              {intl.formatMessage(messages.details)}
            </Link>
          )}
        </div>
      </div>
      {requestOpen && (
        <RequestModal
          tmdbId={item.id}
          type={movie ? 'movie' : 'tv'}
          show
          onCancel={() => setRequestOpen(false)}
          onComplete={() => {
            setRequestOpen(false);
            onChanged?.();
          }}
        />
      )}
    </article>
  );
}

export function HeroShelf() {
  const intl = useIntl();
  const { user, hasPermission } = useUser();
  const { currentSettings } = useSettings();
  const availability = getUserServiceAvailability(
    currentSettings,
    user?.settings?.enabledMediaCategories,
    hasPermission(Permission.ADMIN)
  );
  const movieEnabled = isConfiguredMediaCategoryEnabled('movie', availability);
  const tvEnabled = isConfiguredMediaCategoryEnabled('tv', availability);
  const discover = useDiscover<MovieResult | TvResult>(
    '/api/v1/discover/trending',
    undefined,
    { hideAvailable: false, enabled: movieEnabled || tvEnabled }
  );
  const items = discover.titles
    .filter(
      (item) =>
        (item.mediaType === 'movie' && movieEnabled) ||
        (item.mediaType === 'tv' && tvEnabled)
    )
    .filter((item) => item.backdropPath || item.posterPath)
    .slice(0, 8);
  if (!movieEnabled && !tvEnabled) return null;
  return (
    <section
      className="persius-section"
      aria-label={intl.formatMessage(messages.popularNow)}
    >
      <div className="persius-section-header">
        <h2 className="page-heading">
          {intl.formatMessage(messages.popularNow)}
        </h2>
      </div>
      {discover.error ? (
        <div className="persius-feedback" role="alert">
          {intl.formatMessage(messages.failed)}{' '}
          <Button onClick={() => discover.mutate?.()}>
            {intl.formatMessage(messages.retry)}
          </Button>
        </div>
      ) : discover.isLoadingInitialData ? (
        <div
          className="persius-hero-placeholder"
          aria-busy="true"
          aria-label={intl.formatMessage(messages.loading)}
        />
      ) : items.length === 0 ? (
        <p role="status">{intl.formatMessage(messages.empty)}</p>
      ) : (
        <div className="persius-rail">
          {items.map((item) => (
            <HeroCard
              key={`${item.mediaType}:${item.id}`}
              item={item}
              onChanged={discover.mutate}
            />
          ))}
        </div>
      )}
    </section>
  );
}
