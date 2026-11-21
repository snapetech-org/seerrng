import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { Section } from '../components/cards';
import { ConfirmSheet } from '../components/ConfirmSheet';
import { ServiceNote } from '../components/extra';
import { friendlyError } from '../errors';
import { useApi } from '../hooks';

const path = '/settings/reader-delivery';
const providers = { grimmory: 'Grimmory', bookorbit: 'BookOrbit' } as const;
type Provider = keyof typeof providers;
type ReaderFields = Record<
  `${Provider}${'Url' | 'Username' | 'Password'}`,
  string
>;
type Settings = ReaderFields & { preferredProvider: Provider };

interface Shelf {
  id: number;
  provider: Provider;
  groupName: string;
  targetName: string;
  isPublic: boolean;
  status: 'ready' | 'pending' | 'error';
  lastMatchCount: number;
  countVerified: boolean;
  lastError: string | null;
  syncToKobo: boolean;
  koboSyncStatus: 'disabled' | 'pending' | 'ready' | 'error';
  koboSyncError: string | null;
}

const statusLabel = {
  ready: 'Ready',
  pending: 'Updating',
  error: 'Needs attention',
};

function settingsDraft(settings: Settings): Settings {
  return { ...settings, grimmoryPassword: '', bookorbitPassword: '' };
}

function Connections({ initial }: { initial: Settings }) {
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(() => settingsDraft(initial));
  const [clear, setClear] = useState({ grimmory: false, bookorbit: false });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error?: boolean }>();
  const pending = useRef(false);
  const dirty =
    clear.grimmory ||
    clear.bookorbit ||
    JSON.stringify(draft) !== JSON.stringify(settingsDraft(saved));

  async function run(provider?: Provider) {
    if (pending.current || (provider ? dirty : !dirty)) return;
    pending.current = true;
    setBusy(true);
    setNotice(undefined);
    try {
      if (provider) {
        const result = await api<{ existingGroupingCount: number }>(
          path + '/connection-test',
          {
            method: 'POST',
            body: JSON.stringify({ provider }),
          }
        );
        setNotice({
          text: `${providers[provider]} connected. Existing shelves found: ${result.existingGroupingCount}.`,
        });
      } else {
        const { grimmoryPassword, bookorbitPassword, ...fields } = draft;
        const result = await api<Settings>(path, {
          method: 'PUT',
          body: JSON.stringify({
            ...fields,
            ...(grimmoryPassword && !clear.grimmory
              ? { grimmoryPassword }
              : {}),
            ...(bookorbitPassword && !clear.bookorbit
              ? { bookorbitPassword }
              : {}),
            clearGrimmoryCredentials: clear.grimmory,
            clearBookorbitCredentials: clear.bookorbit,
          }),
        });
        setSaved(result);
        setDraft(settingsDraft(result));
        setClear({ grimmory: false, bookorbit: false });
        setNotice({ text: 'Reader settings saved.' });
      }
    } catch (error) {
      setNotice({
        text: friendlyError(error, 'Reader service operation failed.'),
        error: true,
      });
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void run();
      }}
    >
      {(['grimmory', 'bookorbit'] as const).map((provider) => {
        const name = providers[provider];
        const url = draft[`${provider}Url`]
          .trim()
          .replace(/\/+$/, '')
          .replace(/\/(?:api\/v1\/opds|komga\/api)$/i, '');
        return (
          <Section key={provider} title={name}>
            <div className="setlist">
              {(['Url', 'Username', 'Password'] as const).map((field) => {
                const key = `${provider}${field}` as const;
                return (
                  <label className="set cfg-row" key={key}>
                    <span>
                      {name} {field === 'Url' ? 'URL' : field}
                    </span>
                    <input
                      className="cfg-input"
                      type={field === 'Password' ? 'password' : 'text'}
                      autoComplete={
                        field === 'Password' ? 'new-password' : undefined
                      }
                      inputMode={field === 'Url' ? 'url' : undefined}
                      maxLength={field === 'Username' ? 256 : 2048}
                      placeholder={
                        field === 'Password' && saved[key] ? 'Saved' : undefined
                      }
                      value={draft[key]}
                      disabled={busy || (field !== 'Url' && clear[provider])}
                      onChange={(event) => {
                        const value = event.target.value;
                        setDraft((previous) => ({ ...previous, [key]: value }));
                      }}
                    />
                  </label>
                );
              })}
              {!!(
                saved[`${provider}Username`] || saved[`${provider}Password`]
              ) && (
                <label className="set cfg-row">
                  <span>Remove Saved {name} Credentials</span>
                  <input
                    type="checkbox"
                    checked={clear[provider]}
                    disabled={busy}
                    onChange={(event) => {
                      const value = event.target.checked;
                      setClear((previous) => ({
                        ...previous,
                        [provider]: value,
                      }));
                    }}
                  />
                </label>
              )}
              {!!url && (
                <>
                  <label className="set cfg-row">
                    <span>{name} OPDS Catalog</span>
                    <input
                      className="cfg-input"
                      readOnly
                      value={url + '/api/v1/opds'}
                    />
                  </label>
                  {provider === 'grimmory' && (
                    <label className="set cfg-row">
                      <span>Komga Comic Reader</span>
                      <input
                        className="cfg-input"
                        readOnly
                        value={url + '/komga/api'}
                      />
                    </label>
                  )}
                </>
              )}
            </div>
            <div className="toolbar">
              <button
                type="button"
                className="btn btn-quiet btn-sm"
                disabled={dirty || busy || !saved[`${provider}Url`]}
                onClick={() => void run(provider)}
              >
                Test {name} Grouping Access
              </button>
            </div>
          </Section>
        );
      })}
      <Section title="Delivery Preferences">
        <div className="setlist">
          <label className="set cfg-row">
            <span>Preferred Reader App</span>
            <select
              className="cfg-select"
              value={draft.preferredProvider}
              disabled={busy}
              onChange={(event) => {
                const provider = event.target.value as Provider;
                setDraft((previous) => ({
                  ...previous,
                  preferredProvider: provider,
                }));
              }}
            >
              <option value="grimmory">Grimmory</option>
              <option value="bookorbit">BookOrbit</option>
            </select>
          </label>
        </div>
        {notice && (
          <p className="note" role={notice.error ? 'alert' : 'status'}>
            {notice.text}
          </p>
        )}
        <div className="toolbar">
          {dirty && (
            <button
              type="button"
              className="btn btn-quiet btn-sm"
              disabled={busy}
              onClick={() => {
                setDraft(settingsDraft(saved));
                setClear({ grimmory: false, bookorbit: false });
                setNotice(undefined);
              }}
            >
              Discard Changes
            </button>
          )}
          <button
            className="btn btn-primary btn-sm"
            type="submit"
            disabled={!dirty || busy}
          >
            Save Reader Settings
          </button>
        </div>
      </Section>
    </form>
  );
}

function ManagedShelves() {
  const shelves = useApi<Shelf[]>(path + '/groupings', {
    keepDuringRefresh: true,
  });
  const [selected, setSelected] = useState<Shelf>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const deleting = useRef(false);

  async function remove() {
    if (!selected || deleting.current) return;
    deleting.current = true;
    setBusy(true);
    setError(undefined);
    try {
      await api(path + '/groupings/' + selected.id, { method: 'DELETE' });
      setSelected(undefined);
      shelves.reload();
    } catch (failure) {
      setError(friendlyError(failure, 'Could not remove the managed shelf.'));
      setSelected(undefined);
    } finally {
      deleting.current = false;
      setBusy(false);
    }
  }

  return (
    <Section title="Managed Reader Shelves">
      <ServiceNote
        what="managed shelves"
        error={shelves.error}
        retry={shelves.reload}
      />
      {error && (
        <p className="note" role="alert">
          {error}
        </p>
      )}
      {!shelves.data && !shelves.error && (
        <p className="note" role="status">
          Loading shelves…
        </p>
      )}
      {shelves.data?.length === 0 && (
        <p className="note">No managed reader shelves.</p>
      )}
      {!!shelves.data?.length && (
        <div className="setlist">
          {shelves.data.map((shelf) => (
            <div className="set" key={shelf.id}>
              <span>
                <b>{shelf.groupName}</b>
                <small>
                  {providers[shelf.provider]} · {shelf.targetName} ·{' '}
                  {statusLabel[shelf.status]} ·{' '}
                  {shelf.isPublic ? 'Shared' : 'Private'}
                </small>
                <small>
                  {shelf.countVerified ? 'Items' : 'Preview matches'}:{' '}
                  {shelf.lastMatchCount}
                </small>
                {shelf.syncToKobo && (
                  <small>Kobo Collection: {shelf.koboSyncStatus}</small>
                )}
                {shelf.lastError && <small>{shelf.lastError}</small>}
                {shelf.koboSyncError && <small>{shelf.koboSyncError}</small>}
              </span>
              <button
                type="button"
                className="btn btn-quiet btn-sm"
                onClick={() => setSelected(shelf)}
              >
                Remove Shelf
              </button>
            </div>
          ))}
        </div>
      )}
      {selected && (
        <ConfirmSheet
          title={`Remove ${selected.groupName}?`}
          body={
            selected.syncToKobo
              ? 'This removes the reader shelf and its Kobo Collection. Library files are kept.'
              : 'This removes the reader shelf. Library files are kept.'
          }
          confirm="Remove Shelf"
          busy={busy}
          onConfirm={() => void remove()}
          onClose={() => {
            if (!deleting.current) setSelected(undefined);
          }}
        />
      )}
    </Section>
  );
}

export default function AdminReaderDelivery() {
  const settings = useApi<Settings>(path);
  return (
    <>
      <header className="ph">
        <h1>Reader Delivery</h1>
      </header>
      <div className="toolbar">
        <Link className="btn btn-quiet btn-sm" to="/admin">
          Administration
        </Link>
      </div>
      <ServiceNote
        what="reader settings"
        error={settings.error}
        retry={settings.reload}
      />
      {settings.data ? (
        <Connections initial={settings.data} />
      ) : (
        !settings.error && (
          <p className="note" role="status">
            Loading reader settings…
          </p>
        )
      )}
      <ManagedShelves />
    </>
  );
}
