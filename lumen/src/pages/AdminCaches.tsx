import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatBytes } from '../../../src/utils/numberHelpers';
import { api } from '../api';
import { Section } from '../components/cards';
import { ConfirmSheet } from '../components/ConfirmSheet';
import { ServiceNote } from '../components/extra';
import { friendlyError } from '../errors';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';

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
  size: 'lumen.adminCaches.metric.size',
  cacheMaxEntries: 'lumen.adminCaches.metric.cacheMaxEntries',
  hits: 'cachehits',
  misses: 'dnscachemisses',
  failures: 'failures',
  ipv4Fallbacks: 'ipv4Fallbacks',
  hitRate: 'hitRate',
};

function formatAge(milliseconds: number, locale: string) {
  const seconds = Math.max(0, milliseconds) / 1000;
  const magnitude = seconds;
  const unit: Intl.RelativeTimeFormatUnit =
    magnitude < 60
      ? 'second'
      : magnitude < 3600
        ? 'minute'
        : magnitude < 86400
          ? 'hour'
          : 'day';
  const divisor =
    unit === 'second'
      ? 1
      : unit === 'minute'
        ? 60
        : unit === 'hour'
          ? 3600
          : 86400;
  return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(
    -Math.round(seconds / divisor),
    unit
  );
}

interface Selection {
  kind: 'api' | 'dns';
  id: string;
  name: string;
}

export default function AdminCaches() {
  const { locale, t } = useLumenLocale();
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
    let succeeded = false;
    try {
      await api(path, { method: 'POST' }, 'empty');
      succeeded = true;
      setNotice(
        selection.kind === 'dns'
          ? t('lumen.adminCaches.dnsFlushed', 'Flushed {name}.', {
              name: selection.name,
            })
          : t('lumen.adminCaches.cacheFlushed', 'Flushed {name}.', {
              name: selection.name,
            })
      );
    } catch (error) {
      setFailure(
        friendlyError(
          error,
          t('lumen.adminCaches.flushFailure', 'Could not flush this cache.')
        )
      );
    } finally {
      working.current = false;
      setBusy(false);
      if (succeeded) setSelection(undefined);
      reload();
    }
  }

  const dnsEntries = Object.entries(data?.dnsCache?.entries ?? {});
  const dnsAvailable = !!(data?.dnsCache?.entries || data?.dnsCache?.stats);
  return (
    <>
      <header className="ph">
        <h1>{t('lumen.adminCaches.title', 'System Caches')}</h1>
      </header>
      <div className="toolbar">
        <Link className="btn btn-quiet btn-sm" to="/admin/jobs">
          {t('lumen.adminCaches.scheduledJobs', 'Scheduled Jobs')}
        </Link>
        <button
          className="btn btn-quiet btn-sm"
          disabled={busy}
          onClick={reload}
        >
          {t('lumen.adminCaches.refresh', 'Refresh')}
        </button>
      </div>
      <ServiceNote
        error={error}
        what={t('lumen.adminCaches.systemCaches', 'system caches')}
        retry={reload}
      />
      {failure && !selection && (
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
          {t('lumen.adminCaches.loading', 'Loading system caches…')}
        </p>
      )}
      {data && (
        <>
          <Section title={t('lumen.adminCaches.apiCaches', 'API Caches')}>
            <p className="note">
              {t(
                'lumen.adminCaches.apiDescription',
                'SeerrNG caches responses from external API endpoints to improve performance and reduce repeated calls.'
              )}
            </p>
            {!data.apiCaches.length && (
              <p className="note">
                {t('lumen.adminCaches.noApiCaches', 'No API caches.')}
              </p>
            )}
            {!!data.apiCaches.length && (
              <ul className="setlist">
                {data.apiCaches.map(({ id, name, stats }) => (
                  <li className="set" key={id}>
                    <div>
                      <b>{name}</b>
                      <small>
                        {stats.hits.toLocaleString(locale)}{' '}
                        {t(
                          'components.Settings.SettingsJobsCache.cachehits',
                          'hits'
                        )}{' '}
                        · {stats.misses.toLocaleString(locale)}{' '}
                        {t(
                          'components.Settings.SettingsJobsCache.cachemisses',
                          'misses'
                        )}{' '}
                        · {stats.keys.toLocaleString(locale)}{' '}
                        {t(
                          'components.Settings.SettingsJobsCache.cachekeys',
                          'keys'
                        )}
                      </small>
                      <small>
                        {formatBytes(stats.ksize, 2, locale)} ·{' '}
                        {formatBytes(stats.vsize, 2, locale)}
                      </small>
                    </div>
                    <button
                      className="btn btn-tonal btn-sm"
                      disabled={busy}
                      onClick={() => setSelection({ kind: 'api', id, name })}
                    >
                      {t(
                        'components.Settings.SettingsJobsCache.flushcache',
                        'Flush Cache'
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Section>
          <Section title={t('lumen.adminCaches.imageCaches', 'Image Caches')}>
            <p className="note">
              {t(
                'lumen.adminCaches.imageDescription',
                'Cached images are stored in SeerrNG application storage.'
              )}
            </p>
            {config?.appDataPath && (
              <p className="note">
                {t('lumen.adminCaches.diskLocation', 'Disk cache location')}{' '}
                <code>
                  {config.appDataPath.replace(/[\\/]+$/, '')}/cache/images
                </code>
              </p>
            )}
            <ul className="setlist">
              {Object.entries(data.imageCache).map(([id, cache]) => (
                <li className="set" key={id}>
                  <b>
                    {id === 'tmdb'
                      ? t('lumen.adminCaches.tmdbImages', 'TMDB Images')
                      : t('lumen.adminCaches.avatars', 'Avatars')}
                  </b>
                  <small>
                    {cache.imageCount.toLocaleString(locale)}{' '}
                    {t(
                      'components.Settings.SettingsJobsCache.imagecachecount',
                      'images cached'
                    )}{' '}
                    · {formatBytes(cache.size, 2, locale)}
                  </small>
                </li>
              ))}
            </ul>
          </Section>
          <Section
            title={t(
              'components.Settings.SettingsJobsCache.dnsCache',
              'DNS Cache'
            )}
          >
            <p className="note">
              {t(
                'lumen.adminCaches.dnsDescription',
                'SeerrNG caches DNS lookups to reduce repeated requests when connecting to services.'
              )}
            </p>
            {data.dnsCache?.stats && (
              <p className="note">
                {t(
                  'lumen.adminCaches.dnsStatsDescription',
                  'These statistics are aggregated across all DNS cache entries.'
                )}
              </p>
            )}
            {data.dnsCache?.stats && (
              <ul className="setlist">
                {Object.entries(dnsMetrics).map(([key, message]) => {
                  const value = data.dnsCache?.stats?.[key];
                  return value === undefined ? null : (
                    <li className="set" key={key}>
                      <b>
                        {t(
                          message.startsWith('lumen.')
                            ? message
                            : `components.Settings.SettingsJobsCache.${message}`,
                          key
                        )}
                      </b>
                      <small>
                        {key === 'hitRate'
                          ? value.toLocaleString(locale, {
                              style: 'percent',
                              maximumFractionDigits: 2,
                            })
                          : value.toLocaleString(locale)}
                      </small>
                    </li>
                  );
                })}
              </ul>
            )}
            {!dnsAvailable && (
              <p className="note">
                {t(
                  'lumen.adminCaches.dnsUnavailable',
                  'DNS cache data is unavailable.'
                )}
              </p>
            )}
            {dnsAvailable && !dnsEntries.length && (
              <p className="note">
                {t('lumen.adminCaches.noDnsEntries', 'No DNS cache entries.')}
              </p>
            )}
            {!!dnsEntries.length && (
              <ul className="setlist">
                {dnsEntries.map(([hostname, entry]) => (
                  <li className="set" key={hostname}>
                    <div>
                      <b>{hostname}</b>
                      <small>
                        {entry.activeAddress} · {formatAge(entry.age, locale)}
                      </small>
                      <small>
                        {entry.hits.toLocaleString(locale)}{' '}
                        {t(
                          'components.Settings.SettingsJobsCache.dnscachehits',
                          'hits'
                        )}{' '}
                        · {entry.misses.toLocaleString(locale)}{' '}
                        {t(
                          'components.Settings.SettingsJobsCache.dnscachemisses',
                          'misses'
                        )}
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
                      {t('lumen.adminCaches.flushDnsEntry', 'Flush DNS Entry')}
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
          title={t('lumen.adminCaches.confirmFlush', 'Flush Cache?')}
          body={selection.name}
          confirm={t('lumen.adminCaches.flush', 'Flush')}
          cancel={t('lumen.adminJobs.goBack', 'Go Back')}
          busy={busy}
          onConfirm={() => void flush()}
          onClose={() => {
            if (!working.current) setSelection(undefined);
          }}
        >
          {failure && (
            <p className="note" role="alert">
              {failure}
            </p>
          )}
        </ConfirmSheet>
      )}
    </>
  );
}
