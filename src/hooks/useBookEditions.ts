import type { EditionComparison } from '@server/lib/editionCompare';
import useSWR from 'swr';

export interface BookEditionQuery {
  bookId?: string;
  mediaId?: number;
  serverId?: number;
  format: 'ebook' | 'audiobook';
  title: string;
  author?: string;
  foreignBookId?: string;
}

export const bookEditionQuery = (book?: BookEditionQuery): string | null => {
  if (!book) return null;
  const params = new URLSearchParams({
    format: book.format,
    title: book.title.slice(0, 256),
    term: [book.title, book.author].filter(Boolean).join(' ').slice(0, 256),
  });
  if (book.bookId) params.set('bookId', book.bookId);
  if (book.mediaId) params.set('mediaId', String(book.mediaId));
  if (book.serverId !== undefined) params.set('serverId', String(book.serverId));
  if (book.author) params.set('author', book.author.slice(0, 256));
  if (book.foreignBookId) params.set('foreignBookId', book.foreignBookId);
  return `/api/v1/editions/book?${params}`;
};

export default function useBookEditions(book?: BookEditionQuery) {
  return useSWR<EditionComparison>(bookEditionQuery(book), {
    revalidateOnFocus: false,
  });
}
