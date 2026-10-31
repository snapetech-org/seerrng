import ApiMessageText from '@app/components/Common/ApiMessageText';
import Button from '@app/components/Common/Button';
import defineMessages from '@app/utils/defineMessages';
import { MAX_SAVED_CONNECTION_HOSTS } from '@server/constants/connectionHosts';
import type { SavedConnectionHost } from '@server/lib/settings';
import axios from 'axios';
import { useState, type FormEvent } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const SETTINGS_PATH = '/api/v1/settings/connection-hosts';

const messages = defineMessages('components.Settings.SavedServiceHosts', {
  title: 'Saved hosts',
  description:
    'Save a hostname or IP address once, then reuse it in service connection forms. Entries are shared by this SeerrNG instance; do not include a scheme or port.',
  name: 'Name',
  hostname: 'Hostname or IP address',
  add: 'Add host',
  empty: 'No saved hosts yet.',
  remove: 'Remove {name}',
  limit: 'You can save up to {count} hosts.',
  loadError: 'Saved hosts could not be loaded.',
  saveError: 'Saved hosts could not be updated.',
});

const SavedServiceHosts = () => {
  const intl = useIntl();
  const { data, error, mutate } = useSWR<SavedConnectionHost[]>(SETTINGS_PATH, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });
  const [name, setName] = useState('');
  const [hostname, setHostname] = useState('');
  const [saveError, setSaveError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const hosts = data ?? [];

  const saveHosts = async (nextHosts: SavedConnectionHost[]) => {
    setIsSaving(true);
    setSaveError('');
    try {
      const response = await axios.put<SavedConnectionHost[]>(SETTINGS_PATH, {
        hosts: nextHosts,
      });
      await mutate(response.data, { revalidate: false });
      return true;
    } catch (caught) {
      setSaveError(
        axios.isAxiosError(caught) &&
          typeof caught.response?.data?.message === 'string'
          ? caught.response.data.message
          : intl.formatMessage(messages.saveError)
      );
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const addHost = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!data || error) return;
    const nextName = name.trim();
    const nextHostname = hostname.trim();
    if (!nextName || !nextHostname) return;

    if (
      await saveHosts([...hosts, { name: nextName, hostname: nextHostname }])
    ) {
      setName('');
      setHostname('');
    }
  };

  const removeHost = async (hostToRemove: SavedConnectionHost) => {
    const nextHosts = hosts.filter(
      (host) =>
        host.name !== hostToRemove.name ||
        host.hostname !== hostToRemove.hostname
    );
    await saveHosts(nextHosts);
  };

  return (
    <section className="mt-6 border-t border-gray-700 pt-5">
      <h3 className="heading">{intl.formatMessage(messages.title)}</h3>
      <p className="description">{intl.formatMessage(messages.description)}</p>
      {error && (
        <p className="description" role="alert">
          {intl.formatMessage(messages.loadError)}
        </p>
      )}
      {hosts.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-2">
          {hosts.map((host) => (
            <li
              key={`${host.name}:${host.hostname}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-gray-700 bg-gray-900/50 px-3 py-2"
            >
              <span className="min-w-0 text-sm break-all text-white">
                <strong>{host.name}</strong>
                <span className="ms-2 text-gray-400">{host.hostname}</span>
              </span>
              <Button
                type="button"
                buttonType="default"
                buttonSize="sm"
                disabled={isSaving}
                aria-label={intl.formatMessage(messages.remove, {
                  name: host.name,
                  hostname: host.hostname,
                })}
                onClick={() => void removeHost(host)}
              >
                {intl.formatMessage(messages.remove, {
                  name: host.name,
                  hostname: host.hostname,
                })}
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        !error && (
          <p className="description mt-3">
            {intl.formatMessage(messages.empty)}
          </p>
        )
      )}
      <form
        className="mt-4 grid max-w-4xl gap-3 sm:grid-cols-2"
        onSubmit={addHost}
      >
        <label className="text-sm text-gray-200">
          {intl.formatMessage(messages.name)}
          <input
            className="input input-lite mt-1 w-full"
            value={name}
            maxLength={64}
            autoComplete="off"
            disabled={
              isSaving ||
              !data ||
              !!error ||
              hosts.length >= MAX_SAVED_CONNECTION_HOSTS
            }
            onChange={(event) => setName(event.currentTarget.value)}
          />
        </label>
        <label className="text-sm text-gray-200">
          {intl.formatMessage(messages.hostname)}
          <input
            className="input input-lite mt-1 w-full"
            value={hostname}
            maxLength={255}
            autoComplete="off"
            disabled={
              isSaving ||
              !data ||
              !!error ||
              hosts.length >= MAX_SAVED_CONNECTION_HOSTS
            }
            onChange={(event) => setHostname(event.currentTarget.value)}
          />
        </label>
        <div className="sm:col-span-2">
          <Button
            type="submit"
            buttonType="default"
            buttonSize="standard"
            disabled={
              isSaving ||
              !data ||
              !!error ||
              !name.trim() ||
              !hostname.trim() ||
              hosts.length >= MAX_SAVED_CONNECTION_HOSTS
            }
          >
            {intl.formatMessage(messages.add)}
          </Button>
          {hosts.length >= MAX_SAVED_CONNECTION_HOSTS && (
            <p className="description mt-2">
              {intl.formatMessage(messages.limit, {
                count: MAX_SAVED_CONNECTION_HOSTS,
              })}
            </p>
          )}
        </div>
      </form>
      {saveError && (
        <p className="description mt-2" role="alert">
          {<ApiMessageText>{saveError}</ApiMessageText>}
        </p>
      )}
    </section>
  );
};

export default SavedServiceHosts;
