import Button from '@app/components/Common/Button';
import PageTitle from '@app/components/Common/PageTitle';
import defineMessages from '@app/utils/defineMessages';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import BookSeriesSearchResults from './Results';

const messages = defineMessages('components.BookSeriesSearch', {
  title: 'Search Book Series',
  query: 'Series name',
  search: 'Search',
  format: 'Format',
  all: 'All formats',
  ebook: 'Books',
  audiobook: 'Audiobooks',
  hint: 'Find series by name in your book library and supported catalogs.',
  media: 'Back to media search',
});

export default function BookSeriesSearch() {
  const intl = useIntl();
  const router = useRouter();
  const query =
    typeof router.query.query === 'string' ? router.query.query.trim() : '';
  const format =
    router.query.format === 'ebook' || router.query.format === 'audiobook'
      ? router.query.format
      : '';
  const [input, setInput] = useState('');
  const [inputFormat, setInputFormat] = useState('');
  const [routeReady, setRouteReady] = useState(false);
  useEffect(() => {
    if (!router.isReady) return;
    setRouteReady(true);
    setInput(query);
    setInputFormat(format);
  }, [format, query, router.isReady]);
  return (
    <>
      <PageTitle title={intl.formatMessage(messages.title)} />
      <h1 className="mt-6 mb-3 text-3xl font-bold text-white">
        {intl.formatMessage(messages.title)}
      </h1>
      <p className="mb-5 text-gray-300">{intl.formatMessage(messages.hint)}</p>
      <form
        className="mb-6 flex flex-wrap items-end gap-3 text-gray-300"
        onSubmit={(event) => {
          event.preventDefault();
          void router.push({
            pathname: '/book-series',
            query: {
              query: input.trim(),
              ...(inputFormat ? { format: inputFormat } : {}),
            },
          });
        }}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <label htmlFor="series-query">
            {intl.formatMessage(messages.query)}
          </label>
          <input
            id="series-query"
            className="rounded-md border border-gray-600 bg-gray-800 px-3 py-2 text-white"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            minLength={2}
            maxLength={200}
            required
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="series-format">
            {intl.formatMessage(messages.format)}
          </label>
          <select
            id="series-format"
            className="rounded-md border border-gray-600 bg-gray-800 px-3 py-2 text-white"
            value={inputFormat}
            onChange={(e) => setInputFormat(e.target.value)}
          >
            <option value="">{intl.formatMessage(messages.all)}</option>
            <option value="ebook">{intl.formatMessage(messages.ebook)}</option>
            <option value="audiobook">
              {intl.formatMessage(messages.audiobook)}
            </option>
          </select>
        </div>
        <Button
          buttonType="primary"
          type="submit"
          disabled={input.trim().length < 2}
        >
          {intl.formatMessage(messages.search)}
        </Button>
      </form>
      <Link
        className="text-indigo-300 hover:underline"
        href={{ pathname: '/search', query: { query } }}
      >
        {intl.formatMessage(messages.media)}
      </Link>
      {routeReady && (
        <BookSeriesSearchResults query={query} format={format || undefined} />
      )}
    </>
  );
}
