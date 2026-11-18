import { useEffect, useRef, useState } from 'react';
import type { Paged, TitleResult } from '../api';
import { useApi, usePublicSettings } from '../hooks';
import { Rail, RailSkeleton, Section, TitleCard } from './cards';

// DiscoverSliderType.TMDB_LIST in SeerrNG's settings API.
const TMDB_LIST = 28;

interface DiscoverSlider {
  id: number;
  type: number;
  order: number;
  enabled: boolean;
  title?: string;
  data?: string;
}

interface TmdbListPage extends Paged<TitleResult> {
  list: { name: string };
}

function ListShelf({
  id,
  title,
  listId,
}: {
  id: number;
  title?: string;
  listId: string;
}) {
  const anchor = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const { data, error, reload } = useApi<TmdbListPage>(
    visible ? `/discover/list/${listId}?page=1` : null
  );

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

  if (data && !data.results.length) return null;

  return (
    <div ref={anchor}>
      <Section
        title={title || data?.list.name || 'TMDB List'}
        link={['See all', `/list/${listId}`]}
      >
        {data ? (
          <Rail restoreId={`tmdb-list-${id}`}>
            {data.results.map((item) => (
              <TitleCard key={`${item.mediaType}:${item.id}`} it={item} />
            ))}
          </Rail>
        ) : error ? (
          <div className="empty">
            <span>Couldn’t load this list</span>
            <button
              type="button"
              className="btn btn-tonal btn-sm"
              onClick={reload}
            >
              Retry
            </button>
          </div>
        ) : (
          <RailSkeleton />
        )}
      </Section>
    </div>
  );
}

export function TmdbListShelves() {
  const settings = usePublicSettings();
  const categories = settings?.enabledMediaCategories;
  const visible = categories?.movie !== false || categories?.tv !== false;
  const { data } = useApi<DiscoverSlider[]>(
    visible ? '/settings/discover' : null
  );
  if (!visible || !Array.isArray(data)) return null;

  return data
    .filter((slider) => slider.enabled && slider.type === TMDB_LIST)
    .sort((a, b) => a.order - b.order)
    .map(({ id, title, data: listId }) =>
      listId &&
      /^[1-9]\d{0,9}$/.test(listId) &&
      Number(listId) <= 2_147_483_647 ? (
        <ListShelf key={id} id={id} title={title} listId={listId} />
      ) : null
    );
}
