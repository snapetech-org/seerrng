import { useSearchParams } from 'react-router-dom';
import type { TitleResult } from '../api';
import { GridSkeleton, MoreOnScroll, TitleCard } from '../components/cards';
import { CardTitleToggle } from '../components/CardTitleToggle';
import { ExtraHeader, ServiceNote } from '../components/extra';
import { usePaged } from '../hooks';
import { PersonCard } from './People';

const mediaOptions = [
  ['all', 'All'],
  ['movie', 'Movies'],
  ['tv', 'Series'],
] as const;
const windows = [
  ['day', 'Daily'],
  ['week', 'Weekly'],
] as const;
const identity = (item: TitleResult) => `${item.mediaType}:${item.id}`;

export default function Trending() {
  const [params, setParams] = useSearchParams();
  const media = params.get('mediaType');
  const mediaType = media === 'movie' || media === 'tv' ? media : 'all';
  const timeWindow = params.get('timeWindow') === 'week' ? 'week' : 'day';
  const query = new URLSearchParams({ mediaType, timeWindow });
  const list = usePaged<TitleResult>(`/discover/trending?${query}`, identity);
  const empty = list.items.length === 0;
  function select(key: string, value: string) {
    const next = new URLSearchParams(params);
    next.set(key, value);
    setParams(next);
  }

  return (
    <>
      <ExtraHeader title="Trending">
        <div className="toolbar">
          <div className="seg" role="group" aria-label="Trending Media">
            {mediaOptions.map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={mediaType === value}
                onClick={() => select('mediaType', value)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="seg" role="group" aria-label="Trending Time Window">
            {windows.map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={timeWindow === value}
                onClick={() => select('timeWindow', value)}
              >
                {label}
              </button>
            ))}
          </div>
          <CardTitleToggle
            kinds={mediaType === 'all' ? ['movie', 'tv'] : [mediaType]}
          />
        </div>
      </ExtraHeader>
      {empty && (
        <ServiceNote
          error={list.error}
          what="trending titles"
          retry={list.retry}
        />
      )}
      {empty && list.loading && <GridSkeleton />}
      {empty && list.done && !list.error && (
        <p className="note">No trending titles found.</p>
      )}
      <div className="grid">
        {list.items.map((item) =>
          item.mediaType === 'person' ? (
            <PersonCard key={identity(item)} person={item} />
          ) : (
            <TitleCard key={identity(item)} it={item} />
          )
        )}
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
