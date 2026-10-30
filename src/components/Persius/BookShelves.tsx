import CachedImage from '@app/components/Common/CachedImage';
import TitleCard from '@app/components/TitleCard';
import type { BookResult } from '@server/models/Book';
import Link from 'next/link';
import { useIntl } from 'react-intl';
import { avatarTone, duration, initials } from './format';
import messages from './messages';

export function BookShelves({ books, audiobook }: { books: BookResult[]; audiobook: boolean }) {
  const intl = useIntl();
  const narrators = new Map<string, Set<string>>();
  const series = new Map<string, { title: string; books: BookResult[] }>();
  for (const book of books) {
    for (const narrator of book.narrators ?? []) {
      const titles = narrators.get(narrator) ?? new Set<string>();
      titles.add(book.id); narrators.set(narrator, titles);
    }
    for (const entry of book.series ?? []) {
      const group = series.get(entry.id) ?? { title: entry.title, books: [] };
      if (!group.books.some((item) => item.id === book.id)) group.books.push(book);
      series.set(entry.id, group);
    }
  }
  // A multi-narrator recording is not necessarily a full-cast production.
  const fullCast = books.filter((book) => book.narrators?.some((name) => /\bfull[- ]cast\b|\bgraphic ?audio\b/i.test(name)));
  return <>
    {audiobook && narrators.size > 0 && <section className="persius-section"><div className="persius-section-header"><h2 className="page-heading">{intl.formatMessage(messages.browseNarrator)}</h2></div><div className="persius-rail persius-narrators">
      {[...narrators].sort((a, b) => b[1].size - a[1].size).slice(0, 16).map(([name, titles]) => <Link href={`/discover/audiobooks?narrator=${encodeURIComponent(name)}`} className="persius-narrator" key={name} title={intl.formatMessage(messages.narratorCatalog)}><span className="persius-avatar" data-tone={avatarTone(name)}>{initials(name)}</span><strong>{name}</strong><small>{intl.formatMessage(messages.bookCount, { count: titles.size })}</small></Link>)}
    </div></section>}
    {!audiobook && series.size > 0 && <section className="persius-section"><div className="persius-section-header"><h2 className="page-heading">{intl.formatMessage(messages.seriesToBinge)}</h2></div><div className="persius-rail">
      {[...series].slice(0, 12).map(([id, group]) => <Link href={`/book-series?query=${encodeURIComponent(group.title)}&format=ebook`} className="persius-series-card" key={id}><div className="persius-book-stack">{group.books.slice(0, 5).map((book) => <div key={book.id}><CachedImage type="book" src={book.posterPath || '/images/seerr_poster_not_found.png'} alt="" fill sizes="80px" /></div>)}</div><strong>{group.title}</strong><small>{[group.books[0]?.author, intl.formatMessage(messages.bookCount, { count: group.books.length })].filter(Boolean).join(' · ')}</small></Link>)}
    </div></section>}
    {audiobook && fullCast.length > 0 && <section className="persius-section"><div className="persius-section-header"><h2 className="page-heading">{intl.formatMessage(messages.fullCast)}</h2></div><div className="persius-rail persius-audio-shelf">
      {fullCast.slice(0, 12).map((book) => <TitleCard key={book.id} id={book.id} title={book.title} image={book.posterPath} mediaType="book" artist={book.narrators?.join(', ')} captionMeta={duration(book.audiobookDuration ? book.audiobookDuration / 60 : undefined)} preferredBookFormat="audiobook" status={book.mediaInfo?.status} canExpand />)}
    </div></section>}
  </>;
}
