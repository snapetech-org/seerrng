import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, connectionHostsPath, type Host } from '../api';
import { Section } from '../components/cards';
import { ServiceNote } from '../components/extra';
import { friendlyError } from '../errors';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';
import { sessionGeneration } from '../sessionState';

function formatSaveError(
  error: unknown,
  t: ReturnType<typeof useLumenLocale>['t']
) {
  if (error instanceof ApiError) {
    const validation: Record<string, [string, string]> = {
      'Settings body must be an object.': [
        'lumen.adminConnectionHosts.invalidPayload',
        'The saved hosts are invalid.',
      ],
      'hosts must be an array with at most 16 entries.': [
        'lumen.adminConnectionHosts.maximumHosts',
        'Save at most 16 connection hosts.',
      ],
      'Each saved host must include a name and hostname.': [
        'lumen.adminConnectionHosts.requiredFields',
        'Each saved host needs a name and hostname.',
      ],
      'Each saved host needs a name up to 64 characters and a hostname or IP address without a scheme or port.':
        [
          'lumen.adminConnectionHosts.invalidHost',
          'Enter a host name up to 64 characters and a hostname or IP address without a scheme or port.',
        ],
      'Saved hostnames must not include a port.': [
        'lumen.adminConnectionHosts.portIncluded',
        'Saved hostnames must not include a port.',
      ],
      'Each saved hostname or IP address must be valid.': [
        'lumen.adminConnectionHosts.invalidAddress',
        'Enter a valid saved hostname or IP address.',
      ],
      'Saved host names must be unique.': [
        'lumen.adminConnectionHosts.duplicateName',
        'Saved host names must be unique.',
      ],
    };
    const message = validation[error.message];
    if (message) return t(message[0], message[1]);
  }
  return friendlyError(
    error,
    t(
      'lumen.adminConnectionHosts.saveFailure',
      'Could not save connection hosts.'
    ),
    t
  );
}

function HostEditor({
  initial,
  t,
}: {
  initial: Host[];
  t: ReturnType<typeof useLumenLocale>['t'];
}) {
  // Row keys stay stable while names are edited or rows are removed.
  const nextKey = useRef(initial.length);
  const [saved, setSaved] = useState(initial);
  const [rows, setRows] = useState(() =>
    initial.map((host, key) => ({ ...host, key }))
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const pending = useRef(false);
  const hosts = rows.map(({ name, hostname }) => ({ name, hostname }));
  const dirty = JSON.stringify(hosts) !== JSON.stringify(saved);

  function reset(hosts: Host[]) {
    setRows(hosts.map((host) => ({ ...host, key: nextKey.current++ })));
    setError('');
    setMessage('');
  }

  async function save() {
    if (!dirty || pending.current) return;
    pending.current = true;
    setBusy(true);
    setMessage('');
    setError('');
    const generation = sessionGeneration();
    try {
      const result = await api<Host[]>(connectionHostsPath, {
        method: 'PUT',
        body: JSON.stringify({ hosts }),
      });
      if (generation !== sessionGeneration()) return;
      setSaved(result);
      reset(result);
      setMessage(
        t('lumen.adminConnectionHosts.saved', 'Connection hosts saved.')
      );
    } catch (failure) {
      if (generation === sessionGeneration())
        setError(formatSaveError(failure, t));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <Section
      title={t('lumen.adminConnectionHosts.sectionTitle', 'Saved Hosts')}
    >
      <p className="note">
        {t(
          'lumen.adminConnectionHosts.description',
          'Save hostnames or IP addresses to reuse in service settings. Enter the address without a scheme or port.'
        )}
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        {rows.length === 0 && (
          <p className="note">
            {t(
              'lumen.adminConnectionHosts.empty',
              'No connection hosts saved.'
            )}
          </p>
        )}
        {rows.map((row, index) => (
          <div className="setlist" key={row.key}>
            {(['name', 'hostname'] as const).map((field) => (
              <label className="set cfg-row" key={field}>
                <span>
                  {field === 'name'
                    ? t('lumen.adminConnectionHosts.name', 'Name')
                    : t('lumen.adminConnectionHosts.hostname', 'Hostname')}
                </span>
                <input
                  className="cfg-input"
                  required
                  maxLength={field === 'name' ? 64 : 255}
                  disabled={busy}
                  value={row[field]}
                  onChange={(event) =>
                    setRows(
                      rows.map((item) =>
                        item.key === row.key
                          ? { ...item, [field]: event.target.value }
                          : item
                      )
                    )
                  }
                />
              </label>
            ))}
            <div className="toolbar">
              <button
                type="button"
                className="btn btn-quiet btn-sm"
                disabled={busy}
                aria-label={t(
                  'lumen.adminConnectionHosts.removeHost',
                  'Remove host {index}',
                  { index: index + 1 }
                )}
                onClick={() =>
                  setRows(rows.filter((item) => item.key !== row.key))
                }
              >
                {t('lumen.adminConnectionHosts.remove', 'Remove Host')}
              </button>
            </div>
          </div>
        ))}
        {error && (
          <p className="note" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="note" role="status">
            {message}
          </p>
        )}
        <div className="toolbar">
          <button
            type="button"
            className="btn btn-quiet btn-sm"
            disabled={busy || rows.length >= 16}
            onClick={() =>
              setRows([
                ...rows,
                { key: nextKey.current++, name: '', hostname: '' },
              ])
            }
          >
            {t('lumen.adminConnectionHosts.add', 'Add Host')}
          </button>
          <button
            type="submit"
            className="btn btn-primary btn-sm"
            disabled={busy || !dirty}
          >
            {t('lumen.adminConnectionHosts.save', 'Save Changes')}
          </button>
          <button
            type="button"
            className="btn btn-quiet btn-sm"
            disabled={busy || !dirty}
            onClick={() => reset(saved)}
          >
            {t('lumen.adminConnectionHosts.discard', 'Discard Changes')}
          </button>
        </div>
      </form>
    </Section>
  );
}

export default function AdminConnectionHosts() {
  const { t } = useLumenLocale();
  const hosts = useApi<Host[]>(connectionHostsPath);
  return (
    <>
      <h1>{t('lumen.adminConnectionHosts.title', 'Connection Hosts')}</h1>
      <div className="toolbar">
        <Link className="btn btn-quiet btn-sm" to="/admin">
          {t('lumen.admin.title', 'Administration')}
        </Link>
      </div>
      <ServiceNote
        what={t('lumen.adminConnectionHosts.what', 'connection hosts')}
        title={t(
          'lumen.adminConnectionHosts.loadFailureTitle',
          'Could not load connection hosts'
        )}
        retryLabel={t('lumen.adminConnectionHosts.retry', 'Retry')}
        error={hosts.error}
        retry={hosts.reload}
      />
      {hosts.data ? (
        <HostEditor initial={hosts.data} t={t} />
      ) : (
        !hosts.error && (
          <p className="note" role="status">
            {t(
              'lumen.adminConnectionHosts.loading',
              'Loading connection hosts…'
            )}
          </p>
        )
      )}
    </>
  );
}
