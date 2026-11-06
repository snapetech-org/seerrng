import Badge from '@app/components/Common/Badge';
import Button from '@app/components/Common/Button';
import CoverImage from '@app/components/Common/CoverImage';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import RelatedTools from '@app/components/Common/RelatedTools';
import {
  targetHref,
  type FollowTarget,
} from '@app/components/Following/targetHref';
import useFollows, { type FollowView } from '@app/hooks/useFollows';
import useToasts from '@app/hooks/useToasts';
import defineMessages from '@app/utils/defineMessages';
import axios from 'axios';
import Link from 'next/link';
import { useIntl } from 'react-intl';
import useSWRInfinite from 'swr/infinite';

interface FollowEventView {
  id: number;
  reasonKey: string;
  reasonValues: Record<string, string>;
  title: string;
  imageUrl: string | null;
  target: FollowTarget | null;
  seen: boolean;
  createdAt: string;
  follow: {
    id: number;
    kind: string;
    subjectLabel: string;
    autoRequest: boolean;
  };
}

const validTmdbId = (value: unknown): number | undefined =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  value > 0 &&
  value <= 1_000_000_000
    ? value
    : undefined;

const tmdbBrowseHref = (follow: FollowView): string | undefined => {
  const ref = follow.conditions?.ref;
  if (!ref || typeof ref !== 'object' || Array.isArray(ref)) {
    return undefined;
  }
  const values = ref as Record<string, unknown>;
  if (follow.kind === 'tmdb-person') {
    const id = validTmdbId(values.tmdbId);
    return id ? `/person/${id}` : undefined;
  }
  if (follow.kind === 'tmdb-studio') {
    const id = validTmdbId(values.tmdbId);
    return id ? `/discover/movies/studio/${id}` : undefined;
  }
  if (follow.kind === 'tmdb-network') {
    const id = validTmdbId(values.tmdbId);
    return id ? `/discover/tv/network/${id}` : undefined;
  }
  if (follow.kind === 'tmdb-genre') {
    const id = validTmdbId(values.genreId);
    const mediaType = values.mediaType;
    return id && (mediaType === 'movie' || mediaType === 'tv')
      ? `/discover/${mediaType}/genre/${id}`
      : undefined;
  }
  return undefined;
};

const messages = defineMessages('components.Following', {
  title: 'Following',
  loadError: 'Following updates could not be loaded.',
  retry: 'Try Again',
  description:
    'Personal news about the people, production companies, networks, genres, narrators, series, games, artists, and projects you follow. Each item explains why it appeared.',
  news: 'New for You',
  markAllSeen: 'Mark All Seen',
  nothingNew:
    'Nothing new yet. Follow a person, production company, network, genre, series, narrator, game, or artist and updates will show up here.',
  following: 'What You Follow',
  nothingFollowed:
    'You are not following anything. Use Follow on a person, production company, network, genre, series, book, game, or artist.',
  open: 'Open',
  browse: 'Browse',
  request: 'Request',
  notify: 'Notify Me',
  autoRequest: 'Request Automatically',
  autoRequestHelp:
    'Books only. Requests still follow your quota and approval rules.',
  stopFollowing: 'Stop Following',
  loadMore: 'Load More',
  new: 'New',
  markSeen: 'Mark Seen',
  failed: 'This could not be saved.',
  howHeading: 'How Following Works',
  howBody:
    'Press Follow on a person, production company, network, genre, narrator, series, game, artist, or patch project. The first check can show up to three current upcoming titles per media type; later checks add new recent or upcoming items. SeerrNG checks about every 30 minutes. A listed release date does not confirm library availability. Nothing is requested for you unless you turn on Request Automatically, which is limited to books.',
  startFollowing: 'Places to start following',
  unreadAnnounce:
    '{count, plural, =0 {No unread updates.} one {# unread update.} other {# unread updates.}}',
  kindNarrator: 'Narrator',
  kindAuthor: 'Author',
  kindSeries: 'Series Language',
  kindEdition: 'Edition',
  kindExpansion: 'Game Content',
  kindArtist: 'Artist',
  kindPatch: 'Patch Project',
  kindFranchise: 'Franchise',
  kindTmdbPerson: 'TMDB Person',
  kindTmdbStudio: 'Production Company',
  kindTmdbNetwork: 'TV Network',
  kindTmdbGenre: 'Genre',
  nextVolumeAnnounced:
    'The next volume of {series} is announced in {language}: {title}.',
  newVolumeReleased: 'A new {language} volume of {series} is out: {title}.',
  newNarrationAvailable:
    'A different narration of {title} exists: {narrators}.',
  fullCastProduction: 'A full-cast production of {title} exists.',
  newBookByNarrator: '{narrator} narrates a new audiobook: {title}.',
  newBookByAuthor: '{author} has a new work: {title}.',
  newExpansion: 'New content for {game}: {title}.',
  newPatchVersion: '{project} {version} is available for {game}.',
  newArtistRelease: '{artist} released {title}.',
  newFranchiseRelation: 'New connection in {franchise}: {relation}.',
  savedDiscoveryMatch: 'A new match for “{discovery}”: {attributes}.',
  collectorsAreSharing: 'Collectors you follow are sharing {title}.',
  newVideoTitle:
    'New movie or series title related to {subject}: {title} ({date}).',
  upcomingVideoTitle:
    'Upcoming movie or series related to {subject}: {title} ({date}).',
  videoReleaseDateReached:
    'The listed release date has passed for {title}, related to {subject} ({date}).',
  fallbackReason: 'Something changed for {label}.',
});

const kindMessages = {
  narrator: messages.kindNarrator,
  author: messages.kindAuthor,
  'series-language': messages.kindSeries,
  edition: messages.kindEdition,
  expansion: messages.kindExpansion,
  'artist-release-type': messages.kindArtist,
  'patch-project': messages.kindPatch,
  franchise: messages.kindFranchise,
  'tmdb-person': messages.kindTmdbPerson,
  'tmdb-studio': messages.kindTmdbStudio,
  'tmdb-network': messages.kindTmdbNetwork,
  'tmdb-genre': messages.kindTmdbGenre,
} as const;

const reasonMessages: Record<string, { id: string; defaultMessage: string }> = {
  nextVolumeAnnounced: messages.nextVolumeAnnounced,
  newVolumeReleased: messages.newVolumeReleased,
  newNarrationAvailable: messages.newNarrationAvailable,
  fullCastProduction: messages.fullCastProduction,
  newBookByNarrator: messages.newBookByNarrator,
  newBookByAuthor: messages.newBookByAuthor,
  newExpansion: messages.newExpansion,
  newPatchVersion: messages.newPatchVersion,
  newArtistRelease: messages.newArtistRelease,
  newFranchiseRelation: messages.newFranchiseRelation,
  savedDiscoveryMatch: messages.savedDiscoveryMatch,
  collectorsAreSharing: messages.collectorsAreSharing,
  newVideoTitle: messages.newVideoTitle,
  upcomingVideoTitle: messages.upcomingVideoTitle,
  videoReleaseDateReached: messages.videoReleaseDateReached,
};

const PAGE_SIZE = 30;

const Following = () => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const {
    data: pages,
    mutate,
    isLoading,
    isValidating,
    error,
    size,
    setSize,
  } = useSWRInfinite<{
    total: number;
    results: FollowEventView[];
  }>((index, previous) =>
    previous && index * PAGE_SIZE >= previous.total
      ? null
      : `/api/v1/follow/events?take=${PAGE_SIZE}&skip=${index * PAGE_SIZE}`
  );
  const data = pages
    ? {
        total: pages.at(-1)?.total ?? 0,
        results: [
          ...new Map(
            pages
              .flatMap((page) => page.results)
              .map((event) => [event.id, event])
          ).values(),
        ],
      }
    : undefined;
  const { follows, unfollow, update } = useFollows();

  const markSeen = async (payload: { ids?: number[]; all?: boolean }) => {
    try {
      await axios.post('/api/v1/follow/events/seen', payload);
      await mutate();
    } catch {
      addToast(intl.formatMessage(messages.failed), {
        appearance: 'error',
        autoDismiss: true,
      });
    }
  };

  const unseen = data?.results.filter((event) => !event.seen).length ?? 0;

  return (
    <div className="page-layout">
      <PageTitle title={intl.formatMessage(messages.title)} />
      <div data-page-layout-part="content" data-page-flow="stack">
        <div className="page-title-row">
          <h1 className="page-title">{intl.formatMessage(messages.title)}</h1>
          {(isLoading || isValidating) && (
            <span className="page-status">
              <LoadingSpinner />
            </span>
          )}
        </div>
        <p className="card-body-text">
          {intl.formatMessage(messages.description)}
        </p>
        <details className="card-body-text">
          <summary>{intl.formatMessage(messages.howHeading)}</summary>
          <p>{intl.formatMessage(messages.howBody)}</p>
        </details>
        <p className="visually-hidden" role="status" aria-live="polite">
          {intl.formatMessage(messages.unreadAnnounce, { count: unseen })}
        </p>

        <div className="page-title-row">
          <h2 className="page-heading">{intl.formatMessage(messages.news)}</h2>
          {unseen > 0 && (
            <Button
              buttonType="default"
              buttonSize="sm"
              onClick={() => void markSeen({ all: true })}
            >
              {intl.formatMessage(messages.markAllSeen)}
            </Button>
          )}
        </div>
        {error && (
          <div
            className="app-card-main refreshed-card-surface card-stack"
            role="alert"
          >
            <p className="page-error-message">
              {intl.formatMessage(messages.loadError)}
            </p>
            <Button
              type="button"
              buttonType="default"
              buttonIcon="retry"
              onClick={() => void mutate()}
            >
              {intl.formatMessage(messages.retry)}
            </Button>
          </div>
        )}
        {data && data.results.length === 0 ? (
          <section className="app-card-main card-layout refreshed-card-surface card-stack">
            <p className="card-body-text">
              {intl.formatMessage(messages.nothingNew)}
            </p>
          </section>
        ) : (
          <ul className="card-list" data-list-layout="choices">
            {data?.results.map((event) => {
              const reason = reasonMessages[event.reasonKey];
              return (
                <li key={event.id}>
                  <article
                    className="app-card-sub card-layout media-choice-card"
                    data-choice-state={event.seen ? 'muted' : undefined}
                  >
                    <CoverImage
                      src={event.imageUrl}
                      alt=""
                      type={
                        event.target?.mediaType === 'movie' ||
                        event.target?.mediaType === 'tv'
                          ? 'tmdb'
                          : undefined
                      }
                    />
                    <div data-card-part="body">
                      <div className="media-fact-row">
                        <h3 className="card-title">{event.title}</h3>
                        {!event.seen && (
                          <Badge badgeType="primary">
                            {intl.formatMessage(messages.new)}
                          </Badge>
                        )}
                      </div>
                      <p className="card-body-text">
                        {reason
                          ? intl.formatMessage(reason, event.reasonValues)
                          : intl.formatMessage(messages.fallbackReason, {
                              label: event.follow.subjectLabel,
                            })}
                      </p>
                      <p className="card-subheading">
                        {intl.formatMessage(
                          kindMessages[
                            event.follow.kind as keyof typeof kindMessages
                          ] ?? messages.kindFranchise
                        )}{' '}
                        · {event.follow.subjectLabel}
                      </p>
                      <div className="app-action-row">
                        <Link
                          href={targetHref(event.target, event.title)}
                          legacyBehavior
                          passHref
                        >
                          <Button
                            as="a"
                            aria-label={`${intl.formatMessage(
                              event.target &&
                                event.target.mediaType !== 'search'
                                ? messages.request
                                : messages.open
                            )}: ${event.title}`}
                            buttonType="primary"
                            buttonSize="sm"
                            onClick={() => void markSeen({ ids: [event.id] })}
                          >
                            {intl.formatMessage(
                              event.target &&
                                event.target.mediaType !== 'search'
                                ? messages.request
                                : messages.open
                            )}
                          </Button>
                        </Link>
                        {!event.seen && (
                          <Button
                            aria-label={`${intl.formatMessage(messages.markSeen)}: ${event.title}`}
                            buttonType="default"
                            buttonSize="sm"
                            onClick={() => void markSeen({ ids: [event.id] })}
                          >
                            {intl.formatMessage(messages.markSeen)}
                          </Button>
                        )}
                      </div>
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        )}
        {data && data.total > size * PAGE_SIZE && (
          <div className="app-action-row">
            <Button
              buttonType="default"
              buttonSize="sm"
              disabled={isValidating}
              aria-busy={isValidating}
              onClick={() => void setSize(size + 1)}
            >
              {intl.formatMessage(messages.loadMore)}
            </Button>
          </div>
        )}

        <h2 className="page-heading">
          {intl.formatMessage(messages.following)}
        </h2>
        {follows && follows.length === 0 ? (
          <section className="app-card-main card-layout refreshed-card-surface card-stack">
            <p className="card-body-text">
              {intl.formatMessage(messages.nothingFollowed)}
            </p>
            <h3 className="card-subheading">
              {intl.formatMessage(messages.startFollowing)}
            </h3>
            <RelatedTools
              tools={[
                'bookRecommendations',
                'collectors',
                'gameFinder',
                'patches',
              ]}
            />
          </section>
        ) : (
          <ul className="card-list" data-list-layout="stacked">
            {follows?.map((follow) => {
              const browseHref = tmdbBrowseHref(follow);
              return (
                <li key={follow.id}>
                  <article className="app-card-sub card-layout refreshed-inset-surface card-stack">
                    <h3 className="card-title">{follow.subjectLabel}</h3>
                    <p className="card-subheading">
                      {intl.formatMessage(
                        kindMessages[
                          follow.kind as keyof typeof kindMessages
                        ] ?? messages.kindFranchise
                      )}
                    </p>
                    <div className="media-fact-row">
                      <label className="card-body-text">
                        <input
                          type="checkbox"
                          checked={follow.notify}
                          onChange={(event) =>
                            void update(follow.id, {
                              notify: event.currentTarget.checked,
                            })
                          }
                        />{' '}
                        {intl.formatMessage(messages.notify)}
                      </label>
                      {[
                        'narrator',
                        'author',
                        'series-language',
                        'edition',
                      ].includes(follow.kind) && (
                        <label
                          className="card-body-text"
                          title={intl.formatMessage(messages.autoRequestHelp)}
                        >
                          <input
                            type="checkbox"
                            checked={follow.autoRequest}
                            onChange={(event) =>
                              void update(follow.id, {
                                autoRequest: event.currentTarget.checked,
                              })
                            }
                          />{' '}
                          {intl.formatMessage(messages.autoRequest)}
                        </label>
                      )}
                    </div>
                    <div className="app-action-row">
                      {browseHref && (
                        <Link href={browseHref} legacyBehavior passHref>
                          <Button as="a" buttonType="default" buttonSize="sm">
                            {intl.formatMessage(messages.browse)}
                          </Button>
                        </Link>
                      )}
                      <Button
                        buttonType="danger"
                        buttonSize="sm"
                        onClick={() => void unfollow(follow.id)}
                      >
                        {intl.formatMessage(messages.stopFollowing)}
                      </Button>
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

export default Following;
