import { useEffect, useRef, useState } from 'react';
import { api, type BookResult, type Paged } from '../api';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';
import { BookCard, Rail, RailSkeleton, Section } from './cards';

type Preference = { key: string; enabled: boolean };
type Audiobook = {
  asin: string;
  title: string;
  author: string;
  narrator?: string | null;
  coverArtUrl?: string | null;
  durationMinutes?: number | null;
};
type AudiobookRequest = { asin: string; status: string };
const options = [
  ['popular:ebook', 'Popular Books', 'ebook'],
  ['new:ebook', 'New Books', 'ebook'],
  ['popular:audiobook', 'Popular Audiobooks', 'audiobook'],
  ['new:audiobook', 'New Audiobooks', 'audiobook'],
  ['subject:fantasy:ebook', 'Fantasy Books', 'ebook', 'fantasy'],
  ['subject:mystery:ebook', 'Mystery Books', 'ebook', 'mystery'],
  ['subject:romance:ebook', 'Romance Books', 'ebook', 'romance'],
  [
    'subject:science_fiction:ebook',
    'Science Fiction Books',
    'ebook',
    'science_fiction',
  ],
  ['subject:history:ebook', 'History Books', 'ebook', 'history'],
  ['subject:biography:ebook', 'Biography Books', 'ebook', 'biography'],
  ['subject:fantasy:audiobook', 'Fantasy Audiobooks', 'audiobook', 'fantasy'],
  ['subject:mystery:audiobook', 'Mystery Audiobooks', 'audiobook', 'mystery'],
  ['subject:romance:audiobook', 'Romance Audiobooks', 'audiobook', 'romance'],
  [
    'subject:science_fiction:audiobook',
    'Science Fiction Audiobooks',
    'audiobook',
    'science_fiction',
  ],
  ['subject:history:audiobook', 'History Audiobooks', 'audiobook', 'history'],
  [
    'subject:biography:audiobook',
    'Biography Audiobooks',
    'audiobook',
    'biography',
  ],
] as const;

function useShelfVisible() {
  const anchor = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const element = anchor.current;
    if (visible || !element) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '300px' }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [visible]);
  return { anchor, visible };
}

function EbookShelf({ section }: { section: Preference }) {
  const { t } = useLumenLocale();
  const { anchor, visible } = useShelfVisible();
  const option = options.find(([key]) => key === section.key);
  const sortBy = section.key.startsWith('new:') ? 'newest' : 'ranked';
  const query = new URLSearchParams({ format: 'ebook', sortBy, page: '1' });
  if (option?.[3]) query.set('subject', option[3]);
  const shelf = useApi<Paged<BookResult>>(
    visible && option?.[2] === 'ebook' ? `/discover/books?${query}` : null
  );
  if (!option || option[2] !== 'ebook') return null;
  const cards =
    shelf.data?.results.filter((book) => book.mediaType === 'book') ?? [];
  if (shelf.data && cards.length === 0) return null;
  return (
    <div ref={anchor}>
      <Section
        title={t(`lumen.account.bookSections.option.${option[0]}`, option[1])}
        link={[t('components.Persius.seeAll', 'See All'), `/books?${query}`]}
      >
        {shelf.data ? (
          <Rail restoreId={`personal-book-${section.key}`}>
            {cards.map((book) => (
              <BookCard key={book.id} b={{ ...book, bookFormat: 'ebook' }} />
            ))}
          </Rail>
        ) : shelf.error ? (
          <div className="empty">
            <span>
              {t('components.Persius.failed', 'Could not load this shelf.')}
            </span>
            <button
              className="btn btn-tonal btn-sm"
              type="button"
              onClick={shelf.reload}
            >
              {t('components.Persius.retry', 'Retry')}
            </button>
          </div>
        ) : (
          <RailSkeleton />
        )}
      </Section>
    </div>
  );
}

function AudiobookShelf({ section }: { section: Preference }) {
  const { t } = useLumenLocale();
  const { anchor, visible } = useShelfVisible();
  const option = options.find(([key]) => key === section.key);
  const status = useApi<{ enabled: boolean }>(
    visible ? '/readmeabook/status' : null
  );
  const kind = section.key.startsWith('popular:')
    ? 'popular'
    : section.key.startsWith('new:')
      ? 'new'
      : 'subject';
  const params = new URLSearchParams({ section: kind });
  if (option?.[3]) params.set('subject', option[3]);
  const books = useApi<Audiobook[]>(
    visible && status.data?.enabled ? `/readmeabook/discover?${params}` : null
  );
  const requests = useApi<AudiobookRequest[]>(
    visible && status.data?.enabled ? '/readmeabook/requests' : null
  );
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  if (status.data?.enabled === false) return null;
  const title = option
    ? t(`lumen.account.bookSections.option.${option[0]}`, option[1])
    : '';
  async function request(book: Audiobook) {
    setBusy(book.asin);
    setNotice('');
    try {
      await api('/readmeabook/requests', {
        method: 'POST',
        body: JSON.stringify(book),
      });
      setNotice(
        t('lumen.discover.audiobookRequested', '{title} requested.', {
          title: book.title,
        })
      );
      await requests.reload();
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : t(
              'lumen.discover.audiobookRequestFailed',
              'The audiobook request could not be completed.'
            )
      );
    } finally {
      setBusy('');
    }
  }
  if (books.data && books.data.length === 0) return null;
  return (
    <div ref={anchor}>
      <Section
        title={title}
        link={[t('components.Persius.seeAll', 'See All'), '/audiobooks']}
      >
        {notice && (
          <p className="note" role="status">
            {notice}
          </p>
        )}
        {books.data ? (
          <div className="setlist">
            {books.data.map((book) => {
              const requested = requests.data?.some(
                (item) =>
                  item.asin === book.asin &&
                  !['failed', 'denied', 'cancelled'].includes(item.status)
              );
              return (
                <div className="set" key={book.asin}>
                  <span>
                    <strong>{book.title}</strong>
                    <small>
                      {book.author}
                      {book.narrator ? ` · ${book.narrator}` : ''}
                    </small>
                  </span>
                  <button
                    className="btn btn-primary btn-sm"
                    type="button"
                    disabled={requested || busy !== ''}
                    onClick={() => void request(book)}
                  >
                    {busy === book.asin
                      ? t('lumen.discover.requesting', 'Requesting…')
                      : requested
                        ? t('lumen.discover.requested', 'Requested')
                        : t('lumen.discover.request', 'Request')}
                  </button>
                </div>
              );
            })}
          </div>
        ) : books.error || status.error ? (
          <div className="empty">
            <span>
              {t(
                'lumen.discover.audiobookLoadFailed',
                'This audiobook section could not be loaded.'
              )}
            </span>
            <button
              className="btn btn-tonal btn-sm"
              type="button"
              onClick={books.error ? books.reload : status.reload}
            >
              {t('components.Persius.retry', 'Retry')}
            </button>
          </div>
        ) : (
          <p className="note" role="status">
            {t('lumen.account.loading', 'Loading…')}
          </p>
        )}
      </Section>
    </div>
  );
}

export function BookHomeShelves({
  userId,
  showEbooks,
  showAudiobooks,
}: {
  userId?: number;
  showEbooks: boolean;
  showAudiobooks: boolean;
}) {
  const { t } = useLumenLocale();
  const preferences = useApi<{ sections: Preference[] }>(
    userId ? `/user/${userId}/settings/discover-book-sections` : null
  );
  if (!userId || (!showEbooks && !showAudiobooks)) return null;
  if (preferences.error)
    return (
      <Section
        title={t(
          'lumen.account.bookSections.title',
          'Book and Audiobook Home Sections'
        )}
      >
        <div className="empty" role="alert">
          <span>
            {t(
              'lumen.discover.bookSectionsFailed',
              'Personal book shelves could not be loaded.'
            )}
          </span>
          <button
            className="btn btn-tonal btn-sm"
            type="button"
            onClick={preferences.reload}
          >
            {t('components.Persius.retry', 'Retry')}
          </button>
        </div>
      </Section>
    );
  const sections = preferences.data?.sections;
  if (!sections) return null;
  return (
    <>
      {sections
        .filter((section) => section.enabled)
        .map((section) => {
          const option = options.find(([key]) => key === section.key);
          if (
            !option ||
            (option[2] === 'ebook' && !showEbooks) ||
            (option[2] === 'audiobook' && !showAudiobooks)
          )
            return null;
          return option[2] === 'ebook' ? (
            <EbookShelf key={section.key} section={section} />
          ) : (
            <AudiobookShelf key={section.key} section={section} />
          );
        })}
    </>
  );
}
