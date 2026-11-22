import { Link, useParams } from 'react-router-dom';
import type { TitleResult } from '../api';
import { GridSkeleton, MoreOnScroll, TitleCard } from '../components/cards';
import { ExtraHeader, ServiceNote } from '../components/extra';
import { useApi, usePaged } from '../hooks';
import { useLumenLocale } from '../i18n';

export function RelatedVideo({
  media,
  relation,
}: {
  media: 'movie' | 'tv';
  relation: 'recommendations' | 'similar';
}) {
  const { t } = useLumenLocale();
  const { id } = useParams();
  const detailPath = `/${media}/${id}`;
  const title = useApi<TitleResult>(detailPath).data;
  const name = title?.title ?? title?.name;
  const heading =
    relation === 'recommendations'
      ? t('lumen.relatedVideo.recommendations', 'Recommendations')
      : media === 'movie'
        ? t('lumen.relatedVideo.similarMovies', 'Similar Movies')
        : t('lumen.relatedVideo.similarSeries', 'Similar Series');
  const list = usePaged<TitleResult>(`${detailPath}/${relation}`);
  const empty = list.items.length === 0;

  return (
    <>
      <ExtraHeader title={heading} sub={name}>
        <div className="toolbar">
          <Link className="chip" to={detailPath}>
            {t('lumen.relatedVideo.backToDetails', 'Back to Details')}
          </Link>
        </div>
      </ExtraHeader>
      {empty && (
        <ServiceNote
          error={list.error}
          what={t('lumen.relatedVideo.what', 'related titles')}
          retry={list.retry}
        />
      )}
      {empty && list.loading && <GridSkeleton />}
      {empty && list.done && !list.error && (
        <div className="empty">
          <b>{t('lumen.relatedVideo.empty', 'No titles found')}</b>
        </div>
      )}
      <div className="grid">
        {list.items.map((item) => (
          <TitleCard key={item.id} it={{ ...item, mediaType: media }} />
        ))}
      </div>
      <MoreOnScroll
        done={list.done}
        loading={list.loading}
        more={list.more}
        error={empty ? null : list.error}
        retry={list.retry}
      />
    </>
  );
}
