import Ellipsis from '@app/assets/ellipsis.svg';
import Button from '@app/components/Common/Button';
import CachedImage from '@app/components/Common/CachedImage';
import ImageFader from '@app/components/Common/ImageFader';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import Modal from '@app/components/Common/Modal';
import PageTitle from '@app/components/Common/PageTitle';
import {
  CompactSelect,
  type CompactSelectOption,
} from '@app/components/Discover/FilterPanel/CompactFilterSelect';
import ExternalLinkBlock from '@app/components/ExternalLinkBlock';
import TitleCard from '@app/components/TitleCard';
import { SettingsContext } from '@app/context/SettingsContext';
import useToasts from '@app/hooks/useToasts';
import { Permission, useUser } from '@app/hooks/useUser';
import globalMessages from '@app/i18n/globalMessages';
import ErrorPage from '@app/pages/_error';
import defineMessages from '@app/utils/defineMessages';
import type { PersonCombinedCreditsResponse } from '@server/interfaces/api/personInterfaces';
import type { PersonMovieBulkRequestResponse } from '@server/interfaces/api/requestInterfaces';
import type {
  PersonCredit,
  PersonDetails as PersonDetailsType,
} from '@server/models/Person';
import axios from 'axios';
import { useRouter } from 'next/router';
import { useContext, useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import TruncateMarkup from 'react-truncate-markup';
import useSWR, { mutate } from 'swr';

const messages = defineMessages('components.PersonDetails', {
  birthdate: 'Born {birthdate}',
  lifespan: '{birthdate} – {deathdate}',
  alsoknownas: 'Also Known As: {names}',
  appearsin: 'Appearances',
  crewmember: 'Crew',
  ascharacter: 'as {character}',
  mediaTypeFilter: 'Media type',
  creditSort: 'Sort credits',
  sortPopularityDesc: 'Popularity (high)',
  sortPopularityAsc: 'Popularity (low)',
  sortReleaseDateDesc: 'Release date (newest)',
  sortReleaseDateAsc: 'Release date (oldest)',
  sortRatingDesc: 'Rating (highest)',
  sortRatingAsc: 'Rating (lowest)',
  sortTitleAsc: 'Title (A–Z)',
  sortTitleDesc: 'Title (Z–A)',
  sortVoteCountDesc: 'Votes (most)',
  sortVoteCountAsc: 'Votes (fewest)',
  requestAllMovies: 'Request All Movies',
  requestAllMoviesTitle: 'Request All Movies by {person}',
  requestAllMoviesDescription:
    'Submit requests for {count} movies by {person}. Existing requests and blocklisted movies are skipped. Normal permissions and request quotas apply.',
  requestAllMoviesConfirm: 'Request All',
  requestAllMoviesSuccess:
    'Submitted {created} movie requests. {skipped} skipped; {failed} failed.',
  requestAllMoviesFailure: 'Could not request movies by this person.',
});

type MediaType = 'all' | 'movie' | 'tv';
type CreditSortOption =
  | 'popularity.asc'
  | 'popularity.desc'
  | 'release_date.asc'
  | 'release_date.desc'
  | 'vote_average.asc'
  | 'vote_average.desc'
  | 'title.asc'
  | 'title.desc'
  | 'vote_count.asc'
  | 'vote_count.desc';

const sortPersonCredits = <T extends PersonCredit>(
  credits: T[],
  sortOption: CreditSortOption,
  locale: string
): T[] => {
  const ascending = sortOption.endsWith('.asc');
  const direction = ascending ? 1 : -1;
  const field = sortOption.slice(0, sortOption.lastIndexOf('.'));
  const collator = new Intl.Collator(locale, {
    sensitivity: 'base',
    numeric: true,
  });

  return [...credits].sort((left, right) => {
    if (field === 'title') {
      const leftTitle = left.mediaType === 'movie' ? left.title : left.name;
      const rightTitle = right.mediaType === 'movie' ? right.title : right.name;
      const leftHasTitle = Boolean(leftTitle?.trim());
      const rightHasTitle = Boolean(rightTitle?.trim());
      // Keep incomplete metadata after known values in either sort direction.
      if (leftHasTitle !== rightHasTitle) return leftHasTitle ? -1 : 1;
      if (!leftHasTitle) return 0;
      return direction * collator.compare(leftTitle, rightTitle);
    }

    if (field === 'release_date') {
      const leftDate = Date.parse(
        left.mediaType === 'movie' ? left.releaseDate : left.firstAirDate
      );
      const rightDate = Date.parse(
        right.mediaType === 'movie' ? right.releaseDate : right.firstAirDate
      );
      const leftHasDate = Number.isFinite(leftDate);
      const rightHasDate = Number.isFinite(rightDate);
      // An unknown release date is not an old or future release.
      if (leftHasDate !== rightHasDate) return leftHasDate ? -1 : 1;
      if (!leftHasDate) return 0;
      return direction * (leftDate - rightDate);
    }

    const leftValue =
      field === 'popularity'
        ? left.popularity
        : field === 'vote_average'
          ? left.voteAverage
          : left.voteCount;
    const rightValue =
      field === 'popularity'
        ? right.popularity
        : field === 'vote_average'
          ? right.voteAverage
          : right.voteCount;
    const leftHasValue = Number.isFinite(leftValue);
    const rightHasValue = Number.isFinite(rightValue);
    // Keep missing provider values last instead of treating them as zero.
    if (leftHasValue !== rightHasValue) return leftHasValue ? -1 : 1;
    if (!leftHasValue) return 0;
    return direction * (leftValue - rightValue);
  });
};

const groupById = <T extends { id: number | string }>(items: T[]) =>
  items.reduce<Record<string, T[]>>((groups, item) => {
    const key = item.id.toString();
    groups[key] = [...(groups[key] ?? []), item];
    return groups;
  }, {});

const PersonDetails = () => {
  const intl = useIntl();
  const router = useRouter();
  const { currentSettings } = useContext(SettingsContext);
  const { hasPermission } = useUser();
  const { addToast } = useToasts();
  const [currentMediaType, setCurrentMediaType] = useState<MediaType>('all');
  const [creditSort, setCreditSort] =
    useState<CreditSortOption>('vote_count.desc');
  const [showRequestAllMovies, setShowRequestAllMovies] = useState(false);
  const [requestingAllMovies, setRequestingAllMovies] = useState(false);
  const personId =
    typeof router.query.personId === 'string' ? router.query.personId : '';
  const { data, error } = useSWR<PersonDetailsType>(
    personId ? `/api/v1/person/${personId}` : null
  );
  const [showBio, setShowBio] = useState(false);

  const { data: combinedCredits, error: errorCombinedCredits } =
    useSWR<PersonCombinedCreditsResponse>(
      personId ? `/api/v1/person/${personId}/combined_credits` : null
    );

  const sortedCast = useMemo(() => {
    const filtered = (combinedCredits?.cast ?? []).filter(
      (media) =>
        currentMediaType === 'all' || media.mediaType === currentMediaType
    );
    const grouped = groupById(filtered);

    const reduced = Object.values(grouped).map((objs) => ({
      ...objs[0],
      character: objs.map((pos) => pos.character).join(', '),
    }));

    return sortPersonCredits(reduced, creditSort, intl.locale);
  }, [combinedCredits, currentMediaType, creditSort, intl.locale]);

  const sortedCrew = useMemo(() => {
    const filtered = (combinedCredits?.crew ?? []).filter(
      (media) =>
        currentMediaType === 'all' || media.mediaType === currentMediaType
    );
    const grouped = groupById(filtered);

    const reduced = Object.values(grouped).map((objs) => ({
      ...objs[0],
      job: objs.map((pos) => pos.job).join(', '),
    }));

    return sortPersonCredits(reduced, creditSort, intl.locale);
  }, [combinedCredits, currentMediaType, creditSort, intl.locale]);

  const movieIds = useMemo(() => {
    const movies = [
      ...(combinedCredits?.cast ?? []),
      ...(combinedCredits?.crew ?? []),
    ].filter((credit) => credit.mediaType === 'movie');

    return Object.values(groupById(movies))
      .map((credits) => Number(credits[0].id))
      .filter((id) => Number.isSafeInteger(id) && id > 0);
  }, [combinedCredits]);

  const canRequestAllMovies =
    currentSettings.personMovieBulkRequestsEnabled &&
    hasPermission([Permission.REQUEST, Permission.REQUEST_MOVIE], {
      type: 'or',
    }) &&
    movieIds.length > 0;

  const requestAllMovies = async () => {
    setRequestingAllMovies(true);
    try {
      const result: PersonMovieBulkRequestResponse = {
        created: [],
        skipped: [],
        failed: [],
      };
      const batchSize = 100;
      for (let offset = 0; offset < movieIds.length; offset += batchSize) {
        const batch = movieIds.slice(offset, offset + batchSize);
        try {
          const { data: response } =
            await axios.post<PersonMovieBulkRequestResponse>(
              '/api/v1/request/person-movies',
              { movieIds: batch }
            );
          result.created.push(...response.created);
          result.skipped.push(...response.skipped);
          result.failed.push(...response.failed);

          if (response.stoppedReason) {
            result.failed.push(
              ...movieIds.slice(offset + batch.length).map((movieId) => ({
                movieId,
                reason: response.stoppedReason!,
              }))
            );
            break;
          }
        } catch {
          result.failed.push(
            ...movieIds.slice(offset).map((movieId) => ({
              movieId,
              reason: 'Unable to process this movie.',
            }))
          );
          break;
        }
      }
      setShowRequestAllMovies(false);
      addToast(
        intl.formatMessage(messages.requestAllMoviesSuccess, {
          created: result.created.length,
          skipped: result.skipped.length,
          failed: result.failed.length,
        }),
        {
          autoDismiss: true,
          appearance: result.failed.length > 0 ? 'error' : 'success',
        }
      );
      void mutate('/api/v1/request/count');
      void mutate('/api/v1/request?filter=all&take=10&sort=modified&skip=0');
      void mutate(`/api/v1/person/${personId}/combined_credits`);
    } catch {
      addToast(intl.formatMessage(messages.requestAllMoviesFailure), {
        autoDismiss: true,
        appearance: 'error',
      });
    } finally {
      setRequestingAllMovies(false);
    }
  };

  if (!data && !error) {
    return <LoadingSpinner />;
  }

  if (!data) {
    return <ErrorPage statusCode={404} />;
  }

  const personAttributes: string[] = [];

  if (data.birthday) {
    if (data.deathday) {
      personAttributes.push(
        intl.formatMessage(messages.lifespan, {
          birthdate: intl.formatDate(data.birthday, {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            timeZone: 'UTC',
          }),
          deathdate: intl.formatDate(data.deathday, {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            timeZone: 'UTC',
          }),
        })
      );
    } else {
      personAttributes.push(
        intl.formatMessage(messages.birthdate, {
          birthdate: intl.formatDate(data.birthday, {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            timeZone: 'UTC',
          }),
        })
      );
    }
  }

  if (data.placeOfBirth) {
    personAttributes.push(data.placeOfBirth);
  }

  const isLoading = !combinedCredits && !errorCombinedCredits;

  const mediaTypeOptions: CompactSelectOption[] = [
    {
      label: intl.formatMessage(globalMessages.all),
      value: 'all',
    },
    {
      label: intl.formatMessage(globalMessages.movies),
      value: 'movie',
    },
    {
      label: intl.formatMessage(globalMessages.tvshows),
      value: 'tv',
    },
  ];
  const creditSortOptions: CompactSelectOption[] = [
    {
      label: intl.formatMessage(messages.sortVoteCountDesc),
      value: 'vote_count.desc',
    },
    {
      label: intl.formatMessage(messages.sortVoteCountAsc),
      value: 'vote_count.asc',
    },
    {
      label: intl.formatMessage(messages.sortPopularityDesc),
      value: 'popularity.desc',
    },
    {
      label: intl.formatMessage(messages.sortPopularityAsc),
      value: 'popularity.asc',
    },
    {
      label: intl.formatMessage(messages.sortReleaseDateDesc),
      value: 'release_date.desc',
    },
    {
      label: intl.formatMessage(messages.sortReleaseDateAsc),
      value: 'release_date.asc',
    },
    {
      label: intl.formatMessage(messages.sortRatingDesc),
      value: 'vote_average.desc',
    },
    {
      label: intl.formatMessage(messages.sortRatingAsc),
      value: 'vote_average.asc',
    },
    {
      label: intl.formatMessage(messages.sortTitleAsc),
      value: 'title.asc',
    },
    {
      label: intl.formatMessage(messages.sortTitleDesc),
      value: 'title.desc',
    },
  ];
  const creditFilters = (
    <div className="app-filter-row">
      <CompactSelect
        label={intl.formatMessage(messages.mediaTypeFilter)}
        value={currentMediaType}
        options={mediaTypeOptions}
        onChange={(value) => setCurrentMediaType(value as MediaType)}
        defaultValue="all"
      />
      <CompactSelect
        label={intl.formatMessage(messages.creditSort)}
        value={creditSort}
        options={creditSortOptions}
        onChange={(value) => setCreditSort(value as CreditSortOption)}
        defaultValue="vote_count.desc"
      />
    </div>
  );

  const cast = (sortedCast ?? []).length > 0 && (
    <>
      <div className="slider-header">
        <div className="page-heading">
          <span>{intl.formatMessage(messages.appearsin)}</span>
        </div>
      </div>
      <ul className="cards-vertical">
        {sortedCast?.map((media, index) => {
          return (
            <li key={`list-cast-item-${media.id}-${index}`}>
              <TitleCard
                key={media.id}
                id={media.id}
                title={media.mediaType === 'movie' ? media.title : media.name}
                userScore={media.voteAverage}
                voteCount={media.voteCount}
                year={
                  media.mediaType === 'movie'
                    ? media.releaseDate
                    : media.firstAirDate
                }
                image={media.posterPath}
                summary={media.overview}
                mediaType={media.mediaType as 'movie' | 'tv'}
                status={media.mediaInfo?.status}
                status4k={media.mediaInfo?.status4k}
                viewerRequestCoverage={media.mediaInfo?.viewerRequestCoverage}
                inProgress={(media.mediaInfo?.downloadStatus ?? []).length > 0}
                inProgress4k={
                  (media.mediaInfo?.downloadStatus4k ?? []).length > 0
                }
                canExpand
              />
              {media.character && (
                <div className="mt-2 w-full truncate text-center text-xs text-gray-300">
                  {intl.formatMessage(messages.ascharacter, {
                    character: media.character,
                  })}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );

  const crew = (sortedCrew ?? []).length > 0 && (
    <>
      <div className="slider-header">
        <div className="page-heading">
          <span>{intl.formatMessage(messages.crewmember)}</span>
        </div>
      </div>
      <ul className="cards-vertical">
        {sortedCrew?.map((media, index) => {
          return (
            <li key={`list-crew-item-${media.id}-${index}`}>
              <TitleCard
                key={media.id}
                id={media.id}
                title={media.mediaType === 'movie' ? media.title : media.name}
                userScore={media.voteAverage}
                voteCount={media.voteCount}
                year={
                  media.mediaType === 'movie'
                    ? media.releaseDate
                    : media.firstAirDate
                }
                image={media.posterPath}
                summary={media.overview}
                mediaType={media.mediaType as 'movie' | 'tv'}
                status={media.mediaInfo?.status}
                status4k={media.mediaInfo?.status4k}
                viewerRequestCoverage={media.mediaInfo?.viewerRequestCoverage}
                inProgress={(media.mediaInfo?.downloadStatus ?? []).length > 0}
                inProgress4k={
                  (media.mediaInfo?.downloadStatus4k ?? []).length > 0
                }
                canExpand
              />
              {media.job && (
                <div className="mt-2 w-full truncate text-center text-xs text-gray-300">
                  {media.job}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );

  return (
    <>
      <PageTitle title={data.name} />
      {(sortedCrew || sortedCast) && (
        <div className="absolute top-0 right-0 left-0 z-0 h-96">
          <ImageFader
            isDarker
            backgroundImages={[...(sortedCast ?? []), ...(sortedCrew ?? [])]
              .filter((media) => media.backdropPath)
              .map(
                (media) =>
                  `https://image.tmdb.org/t/p/w1920_and_h800_multi_faces/${media.backdropPath}`
              )
              .slice(0, 6)}
          />
        </div>
      )}
      <div
        className={`relative z-10 mt-4 mb-8 flex flex-col items-center lg:flex-row ${
          data.biography ? 'lg:items-start' : ''
        }`}
      >
        {data.profilePath && (
          <div className="relative mr-0 mb-6 h-36 w-36 flex-shrink-0 overflow-hidden rounded-full ring-1 ring-gray-700 lg:mr-6 lg:mb-0 lg:h-44 lg:w-44">
            <CachedImage
              type="tmdb"
              src={`https://image.tmdb.org/t/p/w600_and_h900_bestv2${data.profilePath}`}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              fill
            />
          </div>
        )}
        <div className="w-full text-center text-gray-300 lg:text-left">
          <div className="flex w-full items-center justify-center lg:justify-between">
            <h1 className="text-3xl text-white lg:text-4xl">{data.name}</h1>
            <div className="hidden flex-shrink-0 lg:block">{creditFilters}</div>
          </div>
          <div className="flex w-full items-center justify-center lg:justify-between">
            <div className="mt-3 mb-3">
              <ExternalLinkBlock
                mediaType="person"
                tmdbId={data.id}
                imdbId={data.imdbId}
              />
            </div>
          </div>
          <div className="mt-1 mb-2 space-y-1 text-xs text-white sm:text-sm lg:text-base">
            <div>{personAttributes.join(' | ')}</div>
            {(data.alsoKnownAs ?? []).length > 0 && (
              <div>
                {intl.formatMessage(messages.alsoknownas, {
                  names: (data.alsoKnownAs ?? []).reduce((prev, curr) =>
                    intl.formatMessage(globalMessages.delimitedlist, {
                      a: prev,
                      b: curr,
                    })
                  ),
                })}
              </div>
            )}
          </div>
          <div className="lg:hidden">{creditFilters}</div>
          {data.biography && (
            <div className="relative text-left">
              {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events */}
              <div
                className="group ring-0 outline-none"
                onClick={() => setShowBio((show) => !show)}
                role="button"
                tabIndex={-1}
              >
                <TruncateMarkup
                  lines={showBio ? 200 : 6}
                  ellipsis={
                    <Ellipsis className="relative -top-0.5 ml-2 inline-block opacity-70 transition duration-300 group-hover:opacity-100" />
                  }
                >
                  <p className="pt-2 text-sm lg:text-base">{data.biography}</p>
                </TruncateMarkup>
              </div>
            </div>
          )}
        </div>
      </div>
      {canRequestAllMovies && (
        <div className="app-action-row" data-action-placement="leading">
          <Button
            buttonType="primary"
            onClick={() => setShowRequestAllMovies(true)}
          >
            {intl.formatMessage(messages.requestAllMovies)}
          </Button>
        </div>
      )}
      {showRequestAllMovies && canRequestAllMovies && (
        <Modal
          title={intl.formatMessage(messages.requestAllMoviesTitle, {
            person: data.name,
          })}
          onCancel={() =>
            !requestingAllMovies && setShowRequestAllMovies(false)
          }
          onOk={() => void requestAllMovies()}
          cancelText={intl.formatMessage(globalMessages.cancel)}
          okText={intl.formatMessage(messages.requestAllMoviesConfirm)}
          okDisabled={requestingAllMovies}
          loading={requestingAllMovies}
          backgroundClickable={!requestingAllMovies}
        >
          <p>
            {intl.formatMessage(messages.requestAllMoviesDescription, {
              count: movieIds.length,
              person: data.name,
            })}
          </p>
        </Modal>
      )}
      {data.knownForDepartment === 'Acting' ? [cast, crew] : [crew, cast]}
      {isLoading && <LoadingSpinner />}
    </>
  );
};

export default PersonDetails;
