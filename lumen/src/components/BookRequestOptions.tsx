import { useEffect, useState } from 'react';
import type { RequestOptions } from '../api';
import { useAuth } from '../auth';
import { friendlyError } from '../errors';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';
import { canChooseRequestOptions, canRequestAs } from './detail';

type Format = 'ebook' | 'audiobook';
interface BookService {
  id: number;
  name: string;
  backend?: 'readarr' | 'bindery' | 'bookorbit';
  serviceType?: Format | 'both';
}
interface ServiceDetails {
  server: {
    activeProfileId: number;
    activeMetadataProfileId?: number;
    activeDirectory: string;
    activeTags?: number[];
  };
  profiles: { id: number; name: string }[];
  metadataProfiles?: { id: number; name: string }[];
  rootFolders: { path?: string }[];
  tags: { id: number; label: string }[];
}
interface UserOption {
  id: number;
  displayName: string;
}

const serviceSupports = (service: BookService, format: Format) =>
  (service.serviceType === 'both' && service.backend !== 'readarr') ||
  (service.serviceType === 'audiobook' ? 'audiobook' : 'ebook') === format;

export default function BookRequestOptions({
  format,
  onChange,
  onReady,
  disabled = false,
}: {
  format: Format;
  onChange: (options: RequestOptions) => void;
  onReady: (ready: boolean) => void;
  disabled?: boolean;
}) {
  const { t } = useLumenLocale();
  const { user } = useAuth();
  const allowed = canChooseRequestOptions(user?.permissions);
  const canChooseUser = canRequestAs(user?.permissions);
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<RequestOptions>({});
  const [loadedServerId, setLoadedServerId] = useState<number>();
  const services = useApi<BookService[]>(
    open && allowed ? '/service/readarr' : null
  );
  const users = useApi<{ results: UserOption[] }>(
    open && canChooseUser ? '/user?take=100&skip=0&sort=displayname' : null
  );
  const details = useApi<ServiceDetails>(
    allowed && options.serverId !== undefined
      ? `/service/readarr/${options.serverId}`
      : null,
    { currentPathOnly: true }
  );
  const available = (services.data ?? []).filter((service) =>
    serviceSupports(service, format)
  );
  const selected = details.data;
  useEffect(() => {
    if (selected && options.serverId !== undefined)
      setLoadedServerId(options.serverId);
  }, [selected, options.serverId]);
  const ready =
    options.serverId === undefined || loadedServerId === options.serverId;

  useEffect(() => onReady(ready), [onReady, ready]);

  useEffect(() => {
    if (options.serverId === undefined || !services.data) return;
    if (
      !services.data.some(
        (service) =>
          service.id === options.serverId && serviceSupports(service, format)
      )
    ) {
      const next = { userId: options.userId };
      setOptions(next);
      onChange(next);
    }
  }, [format, services.data, options.serverId, options.userId, onChange]);

  function update(patch: Partial<RequestOptions>) {
    const next = { ...options, ...patch };
    setOptions(next);
    onChange(next);
  }

  const serviceError = services.error || details.error;
  const retryServices = () => {
    if (services.error) void services.reload();
    else void details.reload();
  };
  if (!allowed && !canChooseUser) return null;

  return (
    <details
      className="adv"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        {t('lumen.bulkBooks.advancedOptions', 'Advanced Request Options')}
      </summary>
      <div className="adv-grid">
        {allowed &&
          options.serverId !== undefined &&
          !selected &&
          !details.error && (
            <p className="note" aria-busy="true">
              {t(
                'lumen.bulkBooks.loadingServiceOptions',
                'Loading book service options…'
              )}
            </p>
          )}
        {canChooseUser && (
          <label className="sel">
            <span className="lbl">
              {t('lumen.bulkBooks.requestAs', 'Request As')}
            </span>
            <select
              value={options.userId ?? ''}
              disabled={disabled}
              onChange={(event) =>
                update({
                  userId: event.target.value
                    ? Number(event.target.value)
                    : undefined,
                })
              }
            >
              <option value="">{t('lumen.bulkBooks.me', 'Me')}</option>
              {(users.data?.results ?? [])
                .filter((person) => person.id !== user?.id)
                .map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.displayName}
                  </option>
                ))}
            </select>
          </label>
        )}
        {allowed && (
          <>
            <label className="sel">
              <span className="lbl">
                {t('lumen.bulkBooks.bookService', 'Book Service')}
              </span>
              <select
                value={options.serverId ?? ''}
                disabled={disabled}
                onChange={(event) => {
                  const serverId = event.target.value
                    ? Number(event.target.value)
                    : undefined;
                  update({
                    serverId,
                    profileId: undefined,
                    metadataProfileId: undefined,
                    rootFolder: undefined,
                    tags: undefined,
                  });
                }}
              >
                <option value="">
                  {t('lumen.bulkBooks.useDefault', 'Use Default')}
                </option>
                {available.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.name}
                  </option>
                ))}
              </select>
            </label>
            {serviceError && (
              <p className="note" role="alert">
                {friendlyError(
                  serviceError,
                  t(
                    'lumen.bulkBooks.optionsLoadFailed',
                    'Could not load book request options.'
                  )
                )}{' '}
                <button className="chip" type="button" onClick={retryServices}>
                  {t('lumen.common.retry', 'Retry')}
                </button>
              </p>
            )}
            {options.serverId !== undefined && selected && (
              <>
                {!!selected.profiles.length && (
                  <label className="sel">
                    <span className="lbl">
                      {t('lumen.bulkBooks.qualityProfile', 'Quality Profile')}
                    </span>
                    <select
                      value={
                        options.profileId ?? selected.server.activeProfileId
                      }
                      disabled={disabled}
                      onChange={(event) =>
                        update({ profileId: Number(event.target.value) })
                      }
                    >
                      {selected.profiles.map((profile) => (
                        <option key={profile.id} value={profile.id}>
                          {profile.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {!!selected.metadataProfiles?.length && (
                  <label className="sel">
                    <span className="lbl">
                      {t('lumen.bulkBooks.metadataProfile', 'Metadata Profile')}
                    </span>
                    <select
                      value={
                        options.metadataProfileId ??
                        selected.server.activeMetadataProfileId ??
                        selected.metadataProfiles[0].id
                      }
                      disabled={disabled}
                      onChange={(event) =>
                        update({
                          metadataProfileId: Number(event.target.value),
                        })
                      }
                    >
                      {selected.metadataProfiles.map((profile) => (
                        <option key={profile.id} value={profile.id}>
                          {profile.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {!!selected.rootFolders.length && (
                  <label className="sel">
                    <span className="lbl">
                      {t('lumen.bulkBooks.rootFolder', 'Root Folder')}
                    </span>
                    <select
                      value={
                        options.rootFolder ?? selected.server.activeDirectory
                      }
                      disabled={disabled}
                      onChange={(event) =>
                        update({ rootFolder: event.target.value })
                      }
                    >
                      {selected.rootFolders
                        .filter(
                          (folder): folder is { path: string } =>
                            typeof folder.path === 'string'
                        )
                        .map((folder) => (
                          <option key={folder.path} value={folder.path}>
                            {folder.path}
                          </option>
                        ))}
                    </select>
                  </label>
                )}
                {!!selected.tags.length && (
                  <fieldset className="sel">
                    <legend className="lbl">
                      {t('lumen.bulkBooks.requestTags', 'Request Tags')}
                    </legend>
                    {selected.tags.map((tag) => (
                      <label key={tag.id}>
                        <input
                          type="checkbox"
                          disabled={disabled}
                          checked={(
                            options.tags ??
                            selected.server.activeTags ??
                            []
                          ).includes(tag.id)}
                          onChange={(event) => {
                            const current =
                              options.tags ?? selected.server.activeTags ?? [];
                            update({
                              tags: event.target.checked
                                ? [...current, tag.id]
                                : current.filter((id) => id !== tag.id),
                            });
                          }}
                        />
                        {tag.label}
                      </label>
                    ))}
                  </fieldset>
                )}
              </>
            )}
          </>
        )}
      </div>
    </details>
  );
}
