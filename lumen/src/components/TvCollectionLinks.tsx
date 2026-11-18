import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../hooks';
import { ServiceNote } from './extra';

export default function TvCollectionLinks({ id }: { id: number }) {
  const [expanded, setExpanded] = useState(false);
  const { data, error, reload } = useApi<{
    collections: { id: number; name: string }[];
  }>(expanded ? `/collection-catalog/tv/for-series/${id}` : null);
  return (
    <details
      className="adv"
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary>Series Collections</summary>
      <ServiceNote what="series collections" error={error} retry={reload} />
      {!data && !error && expanded && (
        <p className="note" role="status">
          Loading series collections…
        </p>
      )}
      {data && !data.collections.length && (
        <p className="note">This series has no catalog collections.</p>
      )}
      {!!data?.collections.length && (
        <div className="toolbar">
          {data.collections.map((group) => (
            <Link
              className="btn btn-tonal btn-sm"
              key={group.id}
              to={`/collections/tv/${group.id}`}
            >
              {group.name}
            </Link>
          ))}
        </div>
      )}
    </details>
  );
}
