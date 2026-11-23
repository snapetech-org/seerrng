import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { Section } from '../components/cards';
import { ConfirmSheet } from '../components/ConfirmSheet';
import { ServiceNote } from '../components/extra';
import { friendlyError } from '../errors';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';

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

function settingsDraft(settings: Settings): Settings {
  return { ...settings, grimmoryPassword: '', bookorbitPassword: '' };
}

function serviceUrl(value: string) {
  return value
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/(?:api\/v1\/opds|komga\/api)$/i, '');
}

function Connections({ initial }: { initial: Settings }) {
  const { t } = useLumenLocale();
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
          text: t(
            'lumen.adminReaderDelivery.connected',
            '{provider} connected. Existing shelves found: {count}.',
            {
              provider: providers[provider],
              count: result.existingGroupingCount,
            }
          ),
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
        const readback = await api<Settings>(path);
        const expected = {
          grimmoryUrl: serviceUrl(draft.grimmoryUrl),
          grimmoryUsername: clear.grimmory ? '' : draft.grimmoryUsername.trim(),
          grimmoryPassword: clear.grimmory
            ? ''
            : grimmoryPassword
              ? '[REDACTED]'
              : (saved.grimmoryPassword ?? ''),
          bookorbitUrl: serviceUrl(draft.bookorbitUrl),
          bookorbitUsername: clear.bookorbit
            ? ''
            : draft.bookorbitUsername.trim(),
          bookorbitPassword: clear.bookorbit
            ? ''
            : bookorbitPassword
              ? '[REDACTED]'
              : (saved.bookorbitPassword ?? ''),
          preferredProvider: draft.preferredProvider,
        };
        const confirmed = Object.entries(expected).every(
          ([field, value]) =>
            result[field as keyof Settings] === value &&
            readback[field as keyof Settings] === value
        );
        if (!confirmed) {
          setNotice({
            text: t(
              'lumen.adminReaderDelivery.saveFailure',
              'Reader settings could not be saved.'
            ),
            error: true,
          });
          return;
        }
        setSaved(readback);
        setDraft(settingsDraft(readback));
        setClear({ grimmory: false, bookorbit: false });
        setNotice({
          text: t(
            'lumen.adminReaderDelivery.settingsSaved',
            'Reader settings saved.'
          ),
        });
      }
    } catch (error) {
      setNotice({
        text: friendlyError(error, 'Reader service operation failed.', t),
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
                      {t(
                        `lumen.adminReaderDelivery.field.${field.toLowerCase()}`,
                        field === 'Url'
                          ? '{provider} URL'
                          : '{provider} ' + field,
                        { provider: name }
                      )}
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
                        field === 'Password' && saved[key]
                          ? t(
                              'lumen.adminReaderDelivery.savedCredential',
                              'Saved Credential'
                            )
                          : undefined
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
                  <span>
                    {t(
                      'lumen.adminReaderDelivery.removeSavedCredentials',
                      'Remove Saved {provider} Credentials',
                      { provider: name }
                    )}
                  </span>
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
                    <span>
                      {t(
                        'lumen.adminReaderDelivery.opdsCatalog',
                        '{provider} OPDS Catalog',
                        { provider: name }
                      )}
                    </span>
                    <input
                      className="cfg-input"
                      readOnly
                      value={url + '/api/v1/opds'}
                    />
                  </label>
                  {provider === 'grimmory' && (
                    <label className="set cfg-row">
                      <span>
                        {t(
                          'lumen.adminReaderDelivery.komgaReader',
                          'Komga Comic Reader'
                        )}
                      </span>
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
                {t(
                  'lumen.adminReaderDelivery.testGroupingAccess',
                  'Test {provider} Grouping Access',
                  { provider: name }
                )}
              </button>
            </div>
          </Section>
        );
      })}
      <Section
        title={t(
          'lumen.adminReaderDelivery.preferences',
          'Delivery Preferences'
        )}
      >
        <div className="setlist">
          <label className="set cfg-row">
            <span>
              {t(
                'lumen.adminReaderDelivery.preferredApp',
                'Preferred Reader App'
              )}
            </span>
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
              {t('lumen.adminReaderDelivery.discardChanges', 'Discard Changes')}
            </button>
          )}
          <button
            className="btn btn-primary btn-sm"
            type="submit"
            disabled={!dirty || busy}
          >
            {t(
              'lumen.adminReaderDelivery.saveSettings',
              'Save Reader Settings'
            )}
          </button>
        </div>
      </Section>
    </form>
  );
}

function ManagedShelves() {
  const { t } = useLumenLocale();
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
      setError(
        friendlyError(failure, 'Could not remove the managed shelf.', t)
      );
      setSelected(undefined);
    } finally {
      deleting.current = false;
      setBusy(false);
    }
  }

  return (
    <Section
      title={t(
        'lumen.adminReaderDelivery.managedShelves',
        'Managed Reader Shelves'
      )}
    >
      <ServiceNote
        what="managed shelves"
        title={t(
          'lumen.adminReaderDelivery.loadShelvesFailure',
          'Couldn’t Load Managed Reader Shelves'
        )}
        error={shelves.error}
        retryLabel={t('lumen.common.retry', 'Retry')}
        retry={shelves.reload}
      />
      {error && (
        <p className="note" role="alert">
          {error}
        </p>
      )}
      {!shelves.data && !shelves.error && (
        <p className="note" role="status">
          {t('lumen.adminReaderDelivery.loadingShelves', 'Loading shelves…')}
        </p>
      )}
      {shelves.data?.length === 0 && (
        <p className="note">
          {t(
            'lumen.adminReaderDelivery.noShelves',
            'No managed reader shelves.'
          )}
        </p>
      )}
      {!!shelves.data?.length && (
        <div className="setlist">
          {shelves.data.map((shelf) => (
            <div className="set" key={shelf.id}>
              <span>
                <b>{shelf.groupName}</b>
                <small>
                  {providers[shelf.provider]} · {shelf.targetName} ·{' '}
                  {t(
                    `lumen.adminReaderDelivery.status.${shelf.status}`,
                    {
                      ready: 'Ready',
                      pending: 'Updating',
                      error: 'Needs Attention',
                    }[shelf.status]
                  )}{' '}
                  ·{' '}
                  {shelf.isPublic
                    ? t('lumen.adminReaderDelivery.shared', 'Shared')
                    : t('lumen.adminReaderDelivery.private', 'Private')}
                </small>
                <small>
                  {t(
                    shelf.countVerified
                      ? 'lumen.adminReaderDelivery.items'
                      : 'lumen.adminReaderDelivery.previewMatches',
                    shelf.countVerified ? 'Items' : 'Preview Matches'
                  )}
                  : {shelf.lastMatchCount}
                </small>
                {shelf.syncToKobo && (
                  <small>
                    {t(
                      'lumen.adminReaderDelivery.koboCollection',
                      'Kobo Collection'
                    )}
                    :{' '}
                    {t(
                      `lumen.adminReaderDelivery.koboStatus.${shelf.koboSyncStatus}`,
                      {
                        disabled: 'Disabled',
                        pending: 'Updating',
                        ready: 'Ready',
                        error: 'Needs Attention',
                      }[shelf.koboSyncStatus]
                    )}
                  </small>
                )}
                {shelf.lastError && <small>{shelf.lastError}</small>}
                {shelf.koboSyncError && <small>{shelf.koboSyncError}</small>}
              </span>
              <button
                type="button"
                className="btn btn-quiet btn-sm"
                onClick={() => setSelected(shelf)}
              >
                {t('lumen.adminReaderDelivery.removeShelf', 'Remove Shelf')}
              </button>
            </div>
          ))}
        </div>
      )}
      {selected && (
        <ConfirmSheet
          title={t(
            'lumen.adminReaderDelivery.removeShelfTitle',
            'Remove {name}?',
            { name: selected.groupName }
          )}
          body={
            selected.syncToKobo
              ? t(
                  'lumen.adminReaderDelivery.removeShelfWithKobo',
                  'This removes the reader shelf and its Kobo Collection. Library files are kept.'
                )
              : t(
                  'lumen.adminReaderDelivery.removeShelfBody',
                  'This removes the reader shelf. Library files are kept.'
                )
          }
          confirm={t('lumen.adminReaderDelivery.removeShelf', 'Remove Shelf')}
          cancel={t('lumen.adminReaderDelivery.keepShelf', 'Keep it')}
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
  const { t } = useLumenLocale();
  const settings = useApi<Settings>(path);
  return (
    <>
      <header className="ph">
        <h1>{t('lumen.adminReaderDelivery.pageTitle', 'Reader Delivery')}</h1>
      </header>
      <div className="toolbar">
        <Link className="btn btn-quiet btn-sm" to="/admin">
          {t('lumen.nav.administration', 'Administration')}
        </Link>
      </div>
      <ServiceNote
        what="reader settings"
        title={t(
          'lumen.adminReaderDelivery.loadSettingsFailure',
          'Couldn’t Load Reader Settings'
        )}
        error={settings.error}
        retryLabel={t('lumen.common.retry', 'Retry')}
        retry={settings.reload}
      />
      {settings.data ? (
        <Connections initial={settings.data} />
      ) : (
        !settings.error && (
          <p className="note" role="status">
            {t(
              'lumen.adminReaderDelivery.loadingSettings',
              'Loading reader settings…'
            )}
          </p>
        )
      )}
      <ManagedShelves />
    </>
  );
}
