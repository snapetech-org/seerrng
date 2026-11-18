import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { Section } from '../components/cards';
import { ConfirmSheet } from '../components/ConfirmSheet';
import { ServiceNote } from '../components/extra';
import { friendlyError } from '../errors';
import { useApi } from '../hooks';

interface CacheResponse {
  apiCaches: {
    id: string;
    name: string;
    stats: {
      hits: number;
      misses: number;
      keys: number;
      ksize: number;
      vsize: number;
    };
  }[];
  imageCache: Record<'tmdb' | 'avatar', { size: number; imageCount: number }>;
  dnsCache?: {
    entries?: Record<
      string,
      { activeAddress: string; hits: number; misses: number; age: number }
    >;
    stats?: Record<string, number>;
  };
}

const dnsMetrics = {
  size: 'Size',
  hits: 'Hits',
  misses: 'Misses',
  failures: 'Failures',
  ipv4Fallbacks: 'IPv4 Fallbacks',
  hitRate: 'Hit Rate',
};

interface Selection {
  kind: 'api' | 'dns';
  id: string;
  name: string;
}

export default function AdminCaches() {
  const { data, error, reload } = useApi<CacheResponse>('/settings/cache', {
    keepDuringRefresh: true,
  });
  const { data: config } = useApi<{ appDataPath?: string }>(
    data ? '/status/appdata' : null,
    { currentPathOnly: true }
  );
  const [selection, setSelection] = useState<Selection>();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const [notice, setNotice] = useState('');
  const working = useRef(false);

  async function flush() {
    if (!selection || working.current) return;
    const path = `/settings/cache/${selection.kind === 'dns' ? 'dns/' : ''}${encodeURIComponent(selection.id)}/flush`;
    working.current = true;
    setBusy(true);
    setFailure('');
    setNotice('');
    try {
      await api(path, { method: 'POST' }, 'empty');
      setNotice(`Flushed ${selection.name}.`);
    } catch (error) {
      setFailure(friendlyError(error, 'Could not flush this cache.'));
    } finally {
      working.current = false;
      setBusy(false);
      setSelection(undefined);
      reload();
    }
  }

  const dnsEntries = Object.entries(data?.dnsCache?.entries ?? {});
  const dnsAvailable = !!(data?.dnsCache?.entries || data?.dnsCache?.stats);
  return (
    <>
      <header className="ph">
        <h1>System Caches</h1>
      </header>
      <div className="toolbar">
        <Link className="btn btn-quiet btn-sm" to="/admin/jobs">
          Scheduled Jobs
        </Link>
        <button
          className="btn btn-quiet btn-sm"
          disabled={busy}
          onClick={reload}
        >
          Refresh
        </button>
      </div>
      <ServiceNote error={error} what="system caches" retry={reload} />
      {failure && (
        <p className="note" role="alert">
          {failure}
        </p>
      )}
      {notice && (
        <p className="note" role="status">
          {notice}
        </p>
      )}
      {!data && !error && (
        <p className="note" role="status">
          Loading system caches…
        </p>
      )}
      {data && (
        <>
          <Section title="API Caches">
            {!data.apiCaches.length && <p className="note">No API caches.</p>}
            {!!data.apiCaches.length && (
              <ul className="setlist">
                {data.apiCaches.map(({ id, name, stats }) => (
                  <li className="set" key={id}>
                    <div>
                      <b>{name}</b>
                      <small>
                        {stats.hits} hits · {stats.misses} misses · {stats.keys}{' '}
                        keys
                      </small>
                      <small>
                        {stats.ksize.toLocaleString()} key bytes ·{' '}
                        {stats.vsize.toLocaleString()} value bytes
                      </small>
                    </div>
                    <button
                      className="btn btn-tonal btn-sm"
                      disabled={busy}
                      onClick={() => setSelection({ kind: 'api', id, name })}
                    >
                      Flush Cache
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Section>
          <Section title="Image Caches">
            {config?.appDataPath && (
              <p className="note">
                Disk cache location{' '}
                <code>
                  {config.appDataPath.replace(/[\\/]+$/, '')}/cache/images
                </code>
              </p>
            )}
            <ul className="setlist">
              {Object.entries(data.imageCache).map(([id, cache]) => (
                <li className="set" key={id}>
                  <b>{id === 'tmdb' ? 'TMDB Images' : 'Avatars'}</b>
                  <small>
                    {cache.imageCount.toLocaleString()} images ·{' '}
                    {cache.size.toLocaleString()} bytes
                  </small>
                </li>
              ))}
            </ul>
          </Section>
          <Section title="DNS Cache">
            {data.dnsCache?.stats && (
              <ul className="setlist">
                {Object.entries(dnsMetrics).map(([key, label]) => {
                  const value = data.dnsCache?.stats?.[key];
                  return value === undefined ? null : (
                    <li className="set" key={key}>
                      <b>{label}</b>
                      <small>
                        {key === 'hitRate'
                          ? value.toLocaleString(undefined, {
                              style: 'percent',
                              maximumFractionDigits: 2,
                            })
                          : value.toLocaleString()}
                      </small>
                    </li>
                  );
                })}
              </ul>
            )}
            {!dnsAvailable && (
              <p className="note">DNS cache data is unavailable.</p>
            )}
            {dnsAvailable && !dnsEntries.length && (
              <p className="note">No DNS cache entries.</p>
            )}
            {!!dnsEntries.length && (
              <ul className="setlist">
                {dnsEntries.map(([hostname, entry]) => (
                  <li className="set" key={hostname}>
                    <div>
                      <b>{hostname}</b>
                      <small>
                        {entry.activeAddress} ·{' '}
                        {Math.floor(entry.age / 1000).toLocaleString()}s old
                      </small>
                      <small>
                        {entry.hits} hits · {entry.misses} misses
                      </small>
                    </div>
                    <button
                      className="btn btn-tonal btn-sm"
                      disabled={busy}
                      onClick={() =>
                        setSelection({
                          kind: 'dns',
                          id: hostname,
                          name: hostname,
                        })
                      }
                    >
                      Flush DNS Entry
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </>
      )}
      {data && selection && (
        <ConfirmSheet
          title="Flush Cache?"
          body={selection.name}
          confirm="Flush"
          cancel="Go Back"
          busy={busy}
          onConfirm={() => void flush()}
          onClose={() => {
            if (!working.current) setSelection(undefined);
          }}
        />
      )}
    </>
  );
}
