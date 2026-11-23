import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { useLumenLocale } from '../i18n';
import { Section } from './cards';

type ServiceType = 'radarr' | 'sonarr' | 'lidarr' | 'readarr';
type FolderGroup = {
  key: string;
  type: ServiceType | 'comic-kapowarr';
  media: 'movie' | 'series' | 'music' | 'books' | 'audiobooks' | 'comics';
  name: string;
  folders: string[];
  failed: boolean;
};
type RootFolders = Record<string, string>;

const services: ServiceType[] = ['radarr', 'sonarr', 'lidarr', 'readarr'];

async function loadGroups(): Promise<{
  groups: FolderGroup[];
  incomplete: boolean;
}> {
  const listed = await Promise.allSettled(
    services.map(async (type) => {
      const servers = await api<
        { id: number; name: string; serviceType?: string }[]
      >(`/service/${type}`);
      return servers.map((server) => ({ type, server }));
    })
  );
  const groups: FolderGroup[] = [];
  let incomplete = listed.some((result) => result.status === 'rejected');
  const targets = listed.flatMap((result) =>
    result.status === 'fulfilled' ? result.value : []
  );
  for (let offset = 0; offset < targets.length; offset += 5) {
    const batch = targets.slice(offset, offset + 5);
    const results = await Promise.allSettled(
      batch.map(async ({ type, server }) => {
        const detail = await api<{ rootFolders?: { path?: string }[] }>(
          `/service/${type}/${server.id}`
        );
        const media =
          type === 'radarr'
            ? 'movie'
            : type === 'sonarr'
              ? 'series'
              : type === 'lidarr'
                ? 'music'
                : server.serviceType === 'audiobook'
                  ? 'audiobooks'
                  : 'books';
        return {
          key: `${type}:${server.id}`,
          type,
          media,
          name: server.name,
          folders: (detail.rootFolders ?? []).flatMap((folder) =>
            folder.path ? [folder.path] : []
          ),
          failed: false,
        } satisfies FolderGroup;
      })
    );
    results.forEach((result, index) => {
      const source = batch[index];
      if (result.status === 'fulfilled') groups.push(result.value);
      else
        groups.push({
          key: `${source.type}:${source.server.id}`,
          type: source.type,
          media:
            source.type === 'radarr'
              ? 'movie'
              : source.type === 'sonarr'
                ? 'series'
                : source.type === 'lidarr'
                  ? 'music'
                  : source.server.serviceType === 'audiobook'
                    ? 'audiobooks'
                    : 'books',
          name: source.server.name,
          folders: [],
          failed: true,
        });
    });
  }
  try {
    const comics =
      await api<{ id: number; name: string; backendType: string }[]>(
        '/service/comic'
      );
    for (const service of comics.filter(
      (item) => item.backendType === 'kapowarr'
    )) {
      try {
        const detail = await api<{ rootFolders?: { path?: string }[] }>(
          `/service/comic/${service.id}/rootfolders`
        );
        groups.push({
          key: `comic-kapowarr:${service.id}`,
          type: 'comic-kapowarr',
          media: 'comics',
          name: service.name,
          folders: (detail.rootFolders ?? []).flatMap((folder) =>
            folder.path ? [folder.path] : []
          ),
          failed: false,
        });
      } catch {
        groups.push({
          key: `comic-kapowarr:${service.id}`,
          type: 'comic-kapowarr',
          media: 'comics',
          name: service.name,
          folders: [],
          failed: true,
        });
      }
    }
  } catch {
    incomplete = true;
  }
  return { groups, incomplete };
}

export function RequestRootFolders({
  userId,
  permissions,
}: {
  userId: number;
  permissions: number;
}) {
  const { t } = useLumenLocale();
  const [saved, setSaved] = useState<RootFolders>({});
  const [draft, setDraft] = useState<RootFolders>({});
  const [groups, setGroups] = useState<FolderGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [retryableLoadError, setRetryableLoadError] = useState(false);
  const [folderMapReady, setFolderMapReady] = useState(false);
  const canEdit = (permissions & (16 | 8192 | 2)) !== 0;
  const base = `/user/${userId}/settings`;
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setRetryableLoadError(false);
    setFolderMapReady(false);
    const [foldersResult, groupsResult] = await Promise.allSettled([
      api<RootFolders>(`${base}/request-root-folders`),
      loadGroups(),
    ]);
    if (foldersResult.status === 'fulfilled') {
      setSaved(foldersResult.value);
      setDraft(foldersResult.value);
      setFolderMapReady(true);
    } else
      setError(
        t(
          'lumen.account.rootFoldersLoadFailure',
          'Could not load request folder settings.'
        )
      );
    if (groupsResult.status === 'fulfilled') {
      const { groups: configured, incomplete } = groupsResult.value;
      const configuredKeys = new Set(configured.map((group) => group.key));
      const savedFolders =
        foldersResult.status === 'fulfilled' ? foldersResult.value : {};
      const unavailable = Object.entries(savedFolders)
        .filter(([key]) => !configuredKeys.has(key))
        .map(([key]) => ({
          key,
          type: 'comic-kapowarr' as const,
          media: 'comics' as const,
          name: key,
          folders: [],
          failed: true,
        }));
      setGroups([...configured, ...unavailable]);
      if (incomplete)
        setError(
          t(
            'lumen.account.rootFoldersOptionsFailure',
            'Could not load service folder options.'
          )
        );
      if (incomplete || foldersResult.status === 'rejected')
        setRetryableLoadError(true);
    } else
      setError(
        t(
          'lumen.account.rootFoldersOptionsFailure',
          'Could not load service folder options.'
        )
      );
    if (
      groupsResult.status === 'rejected' ||
      foldersResult.status === 'rejected'
    )
      setRetryableLoadError(true);
    setLoading(false);
  }, [base, t]);
  useEffect(() => {
    void load();
  }, [load]);
  if (!canEdit) return null;
  const serialize = (value: RootFolders) =>
    JSON.stringify(
      Object.fromEntries(
        Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
      )
    );
  const changed = folderMapReady && serialize(saved) !== serialize(draft);
  const labels = {
    movie: 'Movies',
    series: 'Series',
    music: 'Music',
    books: 'Books',
    audiobooks: 'Audiobooks',
    comics: 'Comics',
  };
  async function save() {
    setBusy(true);
    setError('');
    setRetryableLoadError(false);
    try {
      await api(`${base}/main`, {
        method: 'POST',
        body: JSON.stringify({ requestRootFolders: draft }),
      });
      const confirmed = await api<RootFolders>(`${base}/request-root-folders`);
      setSaved(confirmed);
      setDraft(confirmed);
      if (serialize(confirmed) !== serialize(draft))
        setError(
          t(
            'lumen.account.rootFoldersMismatch',
            'Saved folders did not match. Review the current values.'
          )
        );
    } catch {
      setError(
        t(
          'lumen.account.rootFoldersSaveFailure',
          'Could not save request folder settings.'
        )
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Section
      title={t('lumen.account.rootFoldersTitle', 'Default Request Folders')}
    >
      <p className="note">
        {t(
          'lumen.account.rootFoldersDescription',
          'Choose a default destination folder for requests on each service. Unset folders use the service default.'
        )}
      </p>
      {loading ? (
        <p className="note" role="status">
          {t('lumen.account.loading', 'Loading…')}
        </p>
      ) : (
        <div className="setlist">
          {groups.map((group) => (
            <label className="set" key={group.key}>
              <span>
                {t(
                  `lumen.account.rootFolder.${group.media}`,
                  labels[group.media]
                )}{' '}
                · {group.name}
              </span>
              <select
                className="cfg-json"
                value={draft[group.key] ?? ''}
                disabled={busy || !folderMapReady}
                onChange={(event) =>
                  setDraft((current) => {
                    const next = { ...current };
                    if (event.target.value)
                      next[group.key] = event.target.value;
                    else delete next[group.key];
                    return next;
                  })
                }
              >
                <option value="">
                  {t('lumen.account.rootFolderDefault', 'Use service default')}
                </option>
                {draft[group.key] &&
                  !group.folders.includes(draft[group.key]) && (
                    <option value={draft[group.key]}>
                      {t(
                        'lumen.account.rootFolderUnavailable',
                        'Saved folder (not currently offered)'
                      )}
                    </option>
                  )}
                {group.folders.map((folder) => (
                  <option key={folder} value={folder}>
                    {folder}
                  </option>
                ))}
              </select>
              {group.failed && (
                <small>
                  {t(
                    'lumen.account.rootFolderServiceFailure',
                    'Could not load folders for this service.'
                  )}
                </small>
              )}
            </label>
          ))}
          {!groups.length && (
            <p className="note">
              {t(
                'lumen.account.rootFolderNoServices',
                'No request services are configured.'
              )}
            </p>
          )}
        </div>
      )}
      {error && (
        <p className="note" role="alert">
          {error}
          {retryableLoadError && !changed && (
            <button
              className="btn btn-quiet btn-sm"
              type="button"
              onClick={() => void load()}
            >
              {t('lumen.account.retry', 'Retry')}
            </button>
          )}
        </p>
      )}
      <div className="toolbar">
        <button
          className="btn btn-primary btn-sm"
          type="button"
          disabled={busy || loading || !folderMapReady || !changed}
          onClick={() => void save()}
        >
          {busy
            ? t('lumen.account.saving', 'Saving…')
            : t('lumen.account.saveRootFolders', 'Save Request Folders')}
        </button>
      </div>
    </Section>
  );
}
