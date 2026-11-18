import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, connectionHostsPath, type Host } from '../api';
import { Section } from '../components/cards';
import { ServiceNote } from '../components/extra';
import { useApi } from '../hooks';
import { sessionGeneration } from '../sessionState';

function HostEditor({ initial }: { initial: Host[] }) {
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
      setMessage('Connection hosts saved.');
    } catch (failure) {
      if (generation === sessionGeneration())
        setError(
          failure instanceof ApiError
            ? failure.message
            : 'Could not save connection hosts.'
        );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <Section title="Saved Hosts">
      <p className="note">
        Save hostnames or IP addresses to reuse in service settings. Enter the
        address without a scheme or port.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        {rows.length === 0 && (
          <p className="note">No connection hosts saved.</p>
        )}
        {rows.map((row, index) => (
          <div className="setlist" key={row.key}>
            {(['name', 'hostname'] as const).map((field) => (
              <label className="set cfg-row" key={field}>
                <span>{field === 'name' ? 'Name' : 'Hostname'}</span>
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
                aria-label={`Remove Host ${index + 1}`}
                onClick={() =>
                  setRows(rows.filter((item) => item.key !== row.key))
                }
              >
                Remove Host
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
            Add Host
          </button>
          <button
            type="submit"
            className="btn btn-primary btn-sm"
            disabled={busy || !dirty}
          >
            Save Changes
          </button>
          <button
            type="button"
            className="btn btn-quiet btn-sm"
            disabled={busy || !dirty}
            onClick={() => reset(saved)}
          >
            Discard Changes
          </button>
        </div>
      </form>
    </Section>
  );
}

export default function AdminConnectionHosts() {
  const hosts = useApi<Host[]>(connectionHostsPath);
  return (
    <>
      <h1>Connection Hosts</h1>
      <div className="toolbar">
        <Link className="btn btn-quiet btn-sm" to="/me">
          Back to Account
        </Link>
      </div>
      <ServiceNote
        what="connection hosts"
        error={hosts.error}
        retry={hosts.reload}
      />
      {hosts.data ? (
        <HostEditor initial={hosts.data} />
      ) : (
        !hosts.error && (
          <p className="note" role="status">
            Loading connection hosts…
          </p>
        )
      )}
    </>
  );
}
