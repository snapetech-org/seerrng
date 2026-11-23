import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api';
import { Section } from '../components/cards';
import { ServiceNote } from '../components/extra';
import { useLumenLocale } from '../i18n';
import { sessionGeneration } from '../sessionState';

type Provider = 'navidrome' | 'jellystat';
const names = { navidrome: 'Navidrome', jellystat: 'Jellystat' };
interface Settings {
  url: string;
  username?: string;
  password?: string;
  apiKey?: string;
  syncEnabled?: boolean;
}
const empty: Settings = {
  url: '',
  username: '',
  password: '',
  syncEnabled: true,
};

function Connection({
  provider,
  initial,
}: {
  provider: Provider;
  initial: Settings | null;
}) {
  const { t } = useLumenLocale();
  const name = names[provider];
  const endpoint = `/settings/${provider}`;
  const navidrome = provider === 'navidrome';
  const secretField = navidrome ? 'password' : 'apiKey';
  const secretLabel = t(
    navidrome
      ? 'lumen.adminUrlConnection.password'
      : 'lumen.adminUrlConnection.apiKey',
    navidrome ? 'Password' : 'API Key'
  );
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState({
    ...(initial ?? empty),
    [secretField]: '',
  });
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const pending = useRef(false);
  const secret =
    draft[secretField] || (saved?.[secretField] ? '[REDACTED]' : '');
  const ready = !!(
    draft.url.trim() &&
    (!navidrome || draft.username?.trim()) &&
    secret
  );
  const dirty =
    JSON.stringify(draft) !==
    JSON.stringify({ ...(saved ?? empty), [secretField]: '' });

  function update(patch: Partial<Settings>) {
    setDraft((value) => ({ ...value, ...patch }));
    setError('');
    setNotice('');
  }

  async function submit(action: 'test' | 'save' | 'disconnect') {
    if (pending.current || (action === 'disconnect' ? !confirm : !ready))
      return;
    pending.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    const generation = sessionGeneration();
    const body = JSON.stringify({
      url: draft.url.trim(),
      [secretField]: secret,
      ...(navidrome
        ? { username: draft.username?.trim(), syncEnabled: draft.syncEnabled }
        : {}),
    });
    try {
      if (action === 'test') {
        await api(endpoint + '/test', { method: 'POST', body }, 'empty');
      } else {
        let next: Settings | null = null;
        if (action === 'save') {
          const updated = await api<Settings>(endpoint, {
            method: 'PUT',
            body,
          });
          if (generation !== sessionGeneration()) return;
          const readback = await api<Settings>(endpoint);
          if (generation !== sessionGeneration()) return;
          const expected = {
            url: draft.url.trim().replace(/\/+$/, ''),
            ...(navidrome
              ? {
                  username: draft.username?.trim(),
                  syncEnabled: draft.syncEnabled,
                }
              : {}),
            [secretField]: '[REDACTED]',
          };
          const confirmed = Object.entries(expected).every(
            ([field, value]) =>
              updated[field as keyof Settings] === value &&
              readback[field as keyof Settings] === value
          );
          if (!confirmed) {
            setError(
              t(
                'lumen.adminUrlConnection.actionFailure',
                'Could not complete the {provider} action.',
                { provider: name }
              )
            );
            return;
          }
          next = readback;
        } else {
          await api(endpoint, { method: 'DELETE' }, 'empty');
          if (generation !== sessionGeneration()) return;
          next = await api<Settings | null>(endpoint);
          if (generation !== sessionGeneration()) return;
          if (next !== null) {
            setError(
              t(
                'lumen.adminUrlConnection.actionFailure',
                'Could not complete the {provider} action.',
                { provider: name }
              )
            );
            return;
          }
        }
        if (generation !== sessionGeneration()) return;
        setSaved(next);
        setDraft({ ...(next ?? empty), [secretField]: '' });
        setConfirm(false);
      }
      if (generation === sessionGeneration()) {
        setNotice(
          action === 'test'
            ? t(
                'lumen.adminUrlConnection.connectionVerified',
                '{provider} connection verified.',
                { provider: name }
              )
            : action === 'save'
              ? t(
                  'lumen.adminUrlConnection.settingsSaved',
                  '{provider} settings saved.',
                  { provider: name }
                )
              : t(
                  'lumen.adminUrlConnection.disconnected',
                  '{provider} disconnected.',
                  { provider: name }
                )
        );
      }
    } catch (failure) {
      if (generation === sessionGeneration())
        setError(
          failure instanceof ApiError
            ? failure.message
            : t(
                'lumen.adminUrlConnection.actionFailure',
                'Could not complete the {provider} action.',
                { provider: name }
              )
        );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <Section
      title={t(
        'lumen.adminUrlConnection.sectionTitle',
        '{provider} Connection',
        { provider: name }
      )}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (dirty) void submit('save');
        }}
      >
        <div className="setlist">
          <label className="set cfg-row">
            <span>{t('lumen.adminUrlConnection.serverUrl', 'Server URL')}</span>
            <input
              className="cfg-input"
              type="url"
              maxLength={512}
              disabled={busy}
              value={draft.url}
              onChange={(event) => update({ url: event.target.value })}
            />
          </label>
          {navidrome && (
            <label className="set cfg-row">
              <span>{t('lumen.adminUrlConnection.username', 'Username')}</span>
              <input
                className="cfg-input"
                maxLength={256}
                disabled={busy}
                value={draft.username}
                onChange={(event) => update({ username: event.target.value })}
              />
            </label>
          )}
          <label className="set cfg-row">
            <span>{secretLabel}</span>
            <input
              className="cfg-input"
              type="password"
              autoComplete="new-password"
              maxLength={512}
              disabled={busy}
              value={draft[secretField] ?? ''}
              placeholder={
                saved?.[secretField]
                  ? t(
                      'lumen.adminUrlConnection.savedCredential',
                      'Saved Credential'
                    )
                  : undefined
              }
              onChange={(event) =>
                update({ [secretField]: event.target.value })
              }
            />
          </label>
          {navidrome && (
            <label className="set cfg-row">
              <span>
                {t(
                  'lumen.adminUrlConnection.enableLibraryScan',
                  'Enable Library Scan'
                )}
              </span>
              <input
                type="checkbox"
                disabled={busy}
                checked={draft.syncEnabled}
                onChange={(event) =>
                  update({ syncEnabled: event.target.checked })
                }
              />
            </label>
          )}
        </div>
        {notice && (
          <p className="note" role="status">
            {notice}
          </p>
        )}
        {error && (
          <p className="note" role="alert">
            {error}
          </p>
        )}
        <div className="toolbar">
          <button
            type="button"
            className="btn btn-quiet btn-sm"
            disabled={busy || !ready}
            onClick={() => void submit('test')}
          >
            {t('lumen.adminUrlConnection.testConnection', 'Test Connection')}
          </button>
          <button
            type="submit"
            className="btn btn-primary btn-sm"
            disabled={busy || !ready || !dirty}
          >
            {t('lumen.adminUrlConnection.saveChanges', 'Save Changes')}
          </button>
          {saved && !confirm && (
            <button
              type="button"
              className="btn btn-quiet btn-sm"
              disabled={busy}
              onClick={() => setConfirm(true)}
            >
              {t('lumen.adminUrlConnection.disconnect', 'Disconnect')}
            </button>
          )}
        </div>
        {confirm && (
          <>
            <p className="note">
              {t(
                navidrome
                  ? 'lumen.adminUrlConnection.disconnectWithScans'
                  : 'lumen.adminUrlConnection.disconnectConfirm',
                navidrome
                  ? 'Disconnect {provider} and stop future library scans?'
                  : 'Disconnect {provider}?',
                { provider: name }
              )}
            </p>
            <div className="toolbar">
              <button
                type="button"
                className="btn btn-quiet btn-sm"
                disabled={busy}
                onClick={() => void submit('disconnect')}
              >
                {t(
                  'lumen.adminUrlConnection.confirmDisconnect',
                  'Confirm Disconnect'
                )}
              </button>
              <button
                type="button"
                className="btn btn-quiet btn-sm"
                disabled={busy}
                onClick={() => setConfirm(false)}
              >
                {t(
                  'lumen.adminUrlConnection.keepConnection',
                  'Keep Connection'
                )}
              </button>
            </div>
          </>
        )}
      </form>
    </Section>
  );
}

export default function AdminUrlConnection({
  provider,
}: {
  provider: Provider;
}) {
  const { t } = useLumenLocale();
  const name = names[provider];
  const endpoint = `/settings/${provider}`;
  const [settings, setSettings] = useState<Settings | null>();
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const generation = sessionGeneration();
    const current = () =>
      !controller.signal.aborted && generation === sessionGeneration();
    api<Settings | null>(endpoint, { signal: controller.signal })
      .then((value) => {
        if (current()) setSettings(value);
      })
      .catch(() => {
        if (current())
          setError(
            t(
              'lumen.adminUrlConnection.loadFailure',
              'Could not load the {provider} connection.',
              { provider: name }
            )
          );
      });
    return () => controller.abort();
  }, [attempt, endpoint, name, t]);
  return (
    <>
      <h1>
        {t('lumen.adminUrlConnection.pageTitle', '{provider} Settings', {
          provider: name,
        })}
      </h1>
      <div className="toolbar">
        <Link className="btn btn-quiet btn-sm" to="/admin">
          {t('lumen.nav.administration', 'Administration')}
        </Link>
      </div>
      <ServiceNote
        what={`${name} settings`}
        title={t(
          'lumen.adminUrlConnection.loadFailureTitle',
          'Couldn’t Load {provider} Settings',
          { provider: name }
        )}
        error={error}
        retryLabel={t('lumen.common.retry', 'Retry')}
        retry={() => {
          setError(null);
          setAttempt((value) => value + 1);
        }}
      />
      {settings !== undefined ? (
        <Connection provider={provider} initial={settings} />
      ) : (
        !error && (
          <p className="note" role="status">
            {t(
              'lumen.adminUrlConnection.loading',
              'Loading {provider} settings…',
              {
                provider: name,
              }
            )}
          </p>
        )
      )}
    </>
  );
}
