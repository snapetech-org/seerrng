import AuthorWorkCard, {
  getBookFormatState,
} from '@app/components/AuthorDetails/AuthorWorkCard';
import BookSeriesSummaryCard from '@app/components/BookSeriesDetails/BookSeriesSummaryCard';
import CollectionAssociationsButton from '@app/components/CollectionDetails/CollectionAssociationsButton';
import Alert from '@app/components/Common/Alert';
import FormatRequestControl from '@app/components/Common/FormatRequestControl';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import ReaderGroupingAction from '@app/components/Common/ReaderGroupingAction';
import ThreeItemScroll from '@app/components/Common/ThreeItemScroll';
import {
  CompactRatingSelect,
  CompactSelect,
  FilterResetButton,
  type CompactSelectOption,
  type RatingOption,
} from '@app/components/Discover/FilterPanel/CompactFilterSelect';
import {
  BOOK_GENRES,
  BOOK_LANGUAGES,
} from '@app/components/Discover/FilterPanel/libraryFilterUtils';
import MediaFilterOption from '@app/components/Discover/MediaFilterOption';
import { SeriesNarratorPlanner } from '@app/components/EditionCompare';
import MediaDetailArtwork from '@app/components/MediaDetails/MediaDetailArtwork';
import BulkRequestModal from '@app/components/RequestModal/BulkRequestModal';
import useMediaFilterPin from '@app/hooks/useMediaFilterPin';
import { Permission, useUser } from '@app/hooks/useUser';
import ErrorPage from '@app/pages/_error';
import { encodeApiPathSegment } from '@app/utils/apiPath';
import defineMessages from '@app/utils/defineMessages';
import {
  BookOpenIcon,
  SpeakerWaveIcon,
  Squares2X2Icon,
} from '@heroicons/react/24/outline';
import type { ServiceCommonServer } from '@server/interfaces/api/serviceInterfaces';
import type {
  BookResult,
  BookSeriesDetails as BookSeriesDetailsType,
} from '@server/models/Book';
import { readarrServiceSupportsFormat } from '@server/utils/readarrService';
import { useRouter } from 'next/router';
import { useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.BookSeriesDetails', {
  collection: 'Collection',
  requestCollection: 'Request Collection',
  mediaType: 'Media Type',
  allBooks: 'All Books',
  books: 'Books',
  audiobooks: 'Audiobooks',
  clearFilters: 'Clear Filters',
  firstPublished: 'First Published',
  genres: 'Genres',
  rating: 'Rating',
  language: 'Language',
  any: 'Any',
  empty: 'No books match the current filters.',
});

type DisplayFormat = 'all' | 'ebook' | 'audiobook';
const displayFormats: readonly DisplayFormat[] = ['all', 'ebook', 'audiobook'];

const normalizeSeriesTitle = (title: string) =>
  title
    .toLocaleLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const sortSeriesBooks = (books: BookResult[], title: string) => {
  const seriesTitle = normalizeSeriesTitle(title);
  return [...books].sort((left, right) => {
    const position = (book: BookResult) =>
      Number(
        book.series?.find(
          (series) => normalizeSeriesTitle(series.title) === seriesTitle
        )?.position
      );
    const leftPosition = position(left);
    const rightPosition = position(right);
    const leftHasPosition = Number.isFinite(leftPosition);
    const rightHasPosition = Number.isFinite(rightPosition);
    if (leftHasPosition && rightHasPosition && leftPosition !== rightPosition) {
      return leftPosition - rightPosition;
    }
    if (leftHasPosition !== rightHasPosition) return leftHasPosition ? -1 : 1;
    return left.title.localeCompare(right.title, undefined, { numeric: true });
  });
};

const BookSeriesDetails = ({ series }: { series?: BookSeriesDetailsType }) => {
  const intl = useIntl();
  const router = useRouter();
  const { hasPermission } = useUser();
  const seriesId =
    typeof router.query.seriesId === 'string' ? router.query.seriesId : '';
  const [showRequest, setShowRequest] = useState(false);
  const [requestFormat, setRequestFormat] = useState<'ebook' | 'audiobook'>(
    'ebook'
  );
  const [displayFormat, setDisplayFormat] = useState<DisplayFormat>('all');
  const [firstPublished, setFirstPublished] = useState('');
  const [genre, setGenre] = useState('');
  const [rating, setRating] = useState('');
  const [language, setLanguage] = useState('');
  const pin = useMediaFilterPin<DisplayFormat>({
    scope: 'books',
    selected: displayFormat,
    values: displayFormats,
    restore: setDisplayFormat,
  });
  const { data, error, mutate } = useSWR<BookSeriesDetailsType>(
    seriesId ? `/api/v1/series/${encodeApiPathSegment(seriesId)}` : null,
    { fallbackData: series }
  );
  const { data: bookServices } = useSWR<ServiceCommonServer[]>(
    '/api/v1/service/readarr'
  );

  const sortedBooks = useMemo(
    () => sortSeriesBooks(data?.books ?? [], data?.title ?? ''),
    [data?.books, data?.title]
  );
  const visibleBooks = useMemo(
    () =>
      sortedBooks.filter((book) => {
        if (displayFormat !== 'all') {
          const ebook = getBookFormatState(book, 'ebook') !== 'unavailable';
          const audio = getBookFormatState(book, 'audiobook') !== 'unavailable';
          if (displayFormat === 'ebook' ? !ebook && audio : !audio && ebook) {
            return false;
          }
        }
        if (
          firstPublished &&
          (firstPublished === 'before-1970'
            ? !book.firstPublishYear || book.firstPublishYear >= 1970
            : book.firstPublishYear?.toString() !== firstPublished)
        ) {
          return false;
        }
        if (
          genre &&
          !book.subjects?.some((subject) =>
            subject.toLowerCase().includes(genre.replace(/_/g, ' '))
          )
        ) {
          return false;
        }
        if (rating && (book.ratingsAverage ?? 0) < Number(rating)) return false;
        if (language && !book.languages?.includes(language)) return false;
        return true;
      }),
    [displayFormat, firstPublished, genre, language, rating, sortedBooks]
  );
  const bulkItems = useMemo(
    () =>
      sortedBooks.map((book) => ({
        id: book.id,
        title: book.title,
        year: book.firstPublishYear,
        image: book.posterPath,
        artist: book.author,
        isbn13: book.isbn13,
        editionId: book.editionId,
        authorId: book.authorId,
        mediaInfo: book.mediaInfo,
        subjects: book.subjects,
        languages: book.languages,
        ratingsAverage: book.ratingsAverage,
      })),
    [sortedBooks]
  );

  if (!data && !error) return <LoadingSpinner />;
  if (!data) return <ErrorPage statusCode={404} />;

  const yearOptions: CompactSelectOption[] = [
    { label: intl.formatMessage(messages.any), value: '' },
    ...Array.from({ length: new Date().getFullYear() - 1969 }, (_, index) => {
      const year = new Date().getFullYear() - index;
      return { label: year.toString(), value: year.toString() };
    }),
    { label: '<1970', value: 'before-1970' },
  ];
  const genreOptions: CompactSelectOption[] = [
    { label: intl.formatMessage(messages.any), value: '' },
    ...BOOK_GENRES.map(([value, label]) => ({ value, label })),
  ];
  const ratingOptions: RatingOption[] = [
    { label: intl.formatMessage(messages.any), value: '' },
    ...Array.from({ length: 9 }, (_, index) => {
      const score = 1 + index * 0.5;
      return { label: score.toFixed(1) + '+', value: score.toFixed(1), score };
    }),
  ];
  const languageOptions: CompactSelectOption[] = [
    { label: intl.formatMessage(messages.any), value: '' },
    ...BOOK_LANGUAGES.map(([value, label]) => ({ value, label })),
  ];
  const hasEbookServer = (bookServices ?? []).some((service) =>
    readarrServiceSupportsFormat(service, 'ebook')
  );
  const hasAudiobookServer = (bookServices ?? []).some((service) =>
    readarrServiceSupportsFormat(service, 'audiobook')
  );
  const canRequest = hasPermission(
    [Permission.REQUEST, Permission.REQUEST_BOOK],
    { type: 'or' }
  );

  return (
    <>
      <PageTitle title={`${data.title} Collection`} />
      {showRequest && (
        <BulkRequestModal
          show={showRequest}
          mediaType="book"
          seriesId={data.id}
          title={data.title}
          initialBookFormat={requestFormat}
          initialItems={bulkItems}
          initialTotalItems={bulkItems.length}
          onCancel={() => setShowRequest(false)}
          onComplete={() => {
            setShowRequest(false);
            void mutate();
          }}
        />
      )}
      <article className="media-detail-card app-card-main refreshed-card-surface refreshed-detail-text relative overflow-hidden rounded-xl border border-gray-700 p-3 shadow-lg shadow-gray-950/20">
        {sortedBooks[0]?.posterPath && (
          <MediaDetailArtwork type="book" src={sortedBooks[0].posterPath} />
        )}
        <div className="card-stack relative z-10">
          <BookSeriesSummaryCard
            seriesId={data.id}
            title={data.title}
            initialData={data}
            standalone
          />
          <div className="media-primary-action-row">
            <ReaderGroupingAction
              target={{
                type: 'book-series',
                id: data.id,
                name: data.title,
              }}
            />
            <nav
              aria-label={intl.formatMessage(messages.mediaType)}
              className="flex flex-wrap gap-2"
            >
              {displayFormats.map((value) => {
                const label = intl.formatMessage(
                  value === 'all'
                    ? messages.allBooks
                    : value === 'ebook'
                      ? messages.books
                      : messages.audiobooks
                );
                const Icon =
                  value === 'all'
                    ? Squares2X2Icon
                    : value === 'ebook'
                      ? BookOpenIcon
                      : SpeakerWaveIcon;
                return (
                  <MediaFilterOption
                    key={value}
                    pin={pin}
                    value={value}
                    label={label}
                    selected={displayFormat === value}
                  >
                    <button
                      type="button"
                      aria-pressed={displayFormat === value}
                      onClick={() => setDisplayFormat(value)}
                      className="flex h-full items-center gap-1.5 px-2"
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                      <span>{label}</span>
                    </button>
                  </MediaFilterOption>
                );
              })}
            </nav>
            <CollectionAssociationsButton
              parts={sortedBooks}
              mediaType="book"
            />
            {canRequest && sortedBooks.length > 0 && (
              <FormatRequestControl
                label={intl.formatMessage(messages.requestCollection)}
                options={(
                  [
                    ['ebook', messages.books, hasEbookServer],
                    ['audiobook', messages.audiobooks, hasAudiobookServer],
                  ] as const
                ).map(([value, label, enabled]) => ({
                  id: value,
                  label: intl.formatMessage(label),
                  disabled: !enabled,
                  onClick: () => {
                    setRequestFormat(value);
                    setShowRequest(true);
                  },
                }))}
              />
            )}
          </div>
          <div className="card-spacing-before flex flex-wrap gap-2">
            <FilterResetButton
              label={intl.formatMessage(messages.clearFilters)}
              selected={!firstPublished && !genre && !rating && !language}
              onClick={() => {
                setFirstPublished('');
                setGenre('');
                setRating('');
                setLanguage('');
              }}
            />
            <CompactSelect
              label={intl.formatMessage(messages.firstPublished)}
              value={firstPublished}
              options={yearOptions}
              onChange={setFirstPublished}
            />
            <CompactSelect
              label={intl.formatMessage(messages.genres)}
              value={genre}
              options={genreOptions}
              onChange={setGenre}
            />
            <CompactRatingSelect
              label={intl.formatMessage(messages.rating)}
              value={rating}
              options={ratingOptions}
              maxScore={5}
              onChange={setRating}
            />
            <CompactSelect
              label={intl.formatMessage(messages.language)}
              value={language}
              options={languageOptions}
              onChange={setLanguage}
            />
          </div>
          <section className="card-spacing-before">
            <h2 className="page-heading">
              {intl.formatMessage(messages.collection)}
              <span className="refreshed-detail-text-muted ms-2 text-sm">
                ({visibleBooks.length})
              </span>
            </h2>
            {visibleBooks.length > 0 ? (
              <ThreeItemScroll label={intl.formatMessage(messages.collection)}>
                {visibleBooks.map((book) => (
                  <AuthorWorkCard
                    key={book.id}
                    work={book}
                    author={book.author ?? ''}
                  />
                ))}
              </ThreeItemScroll>
            ) : (
              <Alert type="info">{intl.formatMessage(messages.empty)}</Alert>
            )}
          </section>
        </div>
      </article>
      {hasAudiobookServer && <SeriesNarratorPlanner title={data.title} />}
    </>
  );
};

export default BookSeriesDetails;
