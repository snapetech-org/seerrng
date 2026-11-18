import { Link, useParams } from 'react-router-dom';
import type { TitleResult } from '../api';
import { GridSkeleton, MoreOnScroll, TitleCard } from '../components/cards';
import { ExtraHeader, ServiceNote } from '../components/extra';
import { useApi, usePaged } from '../hooks';

export function RelatedVideo({
  media,
  relation,
}: {
  media: 'movie' | 'tv';
  relation: 'recommendations' | 'similar';
}) {
  const { id } = useParams();
  const detailPath = `/${media}/${id}`;
  const title = useApi<TitleResult>(detailPath).data;
  const name = title?.title ?? title?.name;
  const heading =
    relation === 'recommendations'
      ? 'Recommendations'
      : media === 'movie'
        ? 'Similar Movies'
        : 'Similar Series';
  const list = usePaged<TitleResult>(`${detailPath}/${relation}`);
  const empty = list.items.length === 0;

  return (
    <>
      <ExtraHeader title={heading} sub={name}>
        <div className="toolbar">
          <Link className="chip" to={detailPath}>
            Back to Details
          </Link>
        </div>
      </ExtraHeader>
      {empty && (
        <ServiceNote
          error={list.error}
          what={heading.toLowerCase()}
          retry={list.retry}
        />
      )}
      {empty && list.loading && <GridSkeleton />}
      {empty && list.done && !list.error && (
        <div className="empty">
          <b>No titles found</b>
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
