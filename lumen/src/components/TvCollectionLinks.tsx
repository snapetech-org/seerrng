import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';
import { ServiceNote } from './extra';

export default function TvCollectionLinks({ id }: { id: number }) {
  const { t } = useLumenLocale();
  const [expanded, setExpanded] = useState(false);
  const { data, error, reload } = useApi<{
    collections: { id: number; name: string }[];
  }>(expanded ? `/collection-catalog/tv/for-series/${id}` : null);
  return (
    <details
      className="adv"
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary>{t('lumen.tv.collections.title', 'Series Collections')}</summary>
      <ServiceNote
        what={t('lumen.tv.collections.what', 'series collections')}
        error={error}
        retry={reload}
      />
      {!data && !error && expanded && (
        <p className="note" role="status">
          {t('lumen.tv.collections.loading', 'Loading series collections…')}
        </p>
      )}
      {data && !data.collections.length && (
        <p className="note">
          {t(
            'lumen.tv.collections.empty',
            'This series has no catalog collections.'
          )}
        </p>
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
