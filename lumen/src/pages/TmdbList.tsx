import { Link, useParams, useSearchParams } from 'react-router-dom';
import type { Paged, TitleResult } from '../api';
import { GridSkeleton, TitleCard } from '../components/cards';
import { ExtraHeader, ServiceNote } from '../components/extra';
import { useExtras } from '../extras';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';

interface PublicListPage extends Paged<TitleResult> {
  list: { name: string; description: string };
}

export default function TmdbList() {
  const { t } = useLumenLocale();
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const validId = /^[1-9]\d{0,9}$/.test(id) && Number(id) <= 2_147_483_647;
  const requestedPage = params.get('page') ?? '';
  const page = /^[1-9]\d{0,2}$/.test(requestedPage)
    ? Math.min(Number(requestedPage), 500)
    : 1;
  const { data, error, reload } = useApi<PublicListPage>(
    validId ? `/discover/list/${id}?page=${page}` : null
  );
  const extras = useExtras();
  const movieEnabled = extras.categoryEnabled('movie');
  const tvEnabled = extras.categoryEnabled('tv');
  const current = data?.page === page ? data : null;
  const results = current?.results.filter(
    (item) =>
      (item.mediaType === 'movie' && movieEnabled) ||
      (item.mediaType === 'tv' && tvEnabled)
  );

  function move(next: number) {
    setParams(next === 1 ? {} : { page: String(next) });
  }

  return (
    <>
      <ExtraHeader
        title={data?.list.name || t('lumen.tmdbList.title', 'TMDB List')}
        sub={data?.list.description}
      >
        <div className="toolbar">
          <Link className="chip" to="/">
            {t('lumen.tmdbList.discover', 'Discover')}
          </Link>
        </div>
      </ExtraHeader>
      {!validId && (
        <p className="note" role="alert">
          {t('lumen.tmdbList.invalidId', 'Invalid TMDB list ID.')}
        </p>
      )}
      <ServiceNote
        error={error}
        what={t('lumen.tmdbList.what', 'TMDB list')}
        title={t('lumen.tmdbList.loadFailed', 'Could not load TMDB list')}
        retryLabel={t('lumen.tmdbList.retry', 'Retry')}
        retry={reload}
      />
      {validId && !current && !error && <GridSkeleton />}
      {results?.length === 0 && (
        <p className="note">
          {t('lumen.tmdbList.empty', 'No titles on this page.')}
        </p>
      )}
      {!!results?.length && (
        <div className="grid">
          {results.map((item) => (
            <TitleCard key={`${item.mediaType}:${item.id}`} it={item} />
          ))}
        </div>
      )}
      {(page > 1 || (current?.totalPages ?? 0) > 1) && (
        <nav
          className="toolbar"
          aria-label={t('lumen.tmdbList.pages', 'TMDB List Pages')}
        >
          <button
            className="btn btn-quiet btn-sm"
            type="button"
            disabled={page <= 1}
            onClick={() => move(page - 1)}
          >
            {t('lumen.tmdbList.previousPage', 'Previous Page')}
          </button>
          <span className="note">
            {t('lumen.tmdbList.pageNumber', 'Page {page}', { page })}
          </span>
          <button
            className="btn btn-quiet btn-sm"
            type="button"
            disabled={page >= Math.min(current?.totalPages ?? 0, 500)}
            onClick={() => move(page + 1)}
          >
            {t('lumen.tmdbList.nextPage', 'Next Page')}
          </button>
        </nav>
      )}
    </>
  );
}
