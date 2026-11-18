import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api';
import { Section } from '../components/cards';
import { ServiceNote } from '../components/extra';
import { friendlyError } from '../errors';
import { useApi } from '../hooks';

const path = '/settings/tunerr';

interface Settings {
  enabled: boolean;
  hostname: string;
  useSsl: boolean;
  baseUrl: string;
  deckPort: number;
  tunerPort: number;
  guideUrl: string;
  sportarrBaseUrl: string;
  username: string;
  guideHours: number;
  passwordConfigured: boolean;
}
type Draft = Omit<
  Settings,
  'deckPort' | 'tunerPort' | 'guideHours' | 'passwordConfigured'
> & {
  deckPort: string;
  tunerPort: string;
  guideHours: string;
};
const toDraft = (settings: Settings): Draft => ({
  enabled: settings.enabled,
  hostname: settings.hostname,
  useSsl: settings.useSsl,
  baseUrl: settings.baseUrl,
  guideUrl: settings.guideUrl,
  sportarrBaseUrl: settings.sportarrBaseUrl ?? '',
  username: settings.username,
  deckPort: String(settings.deckPort),
  tunerPort: String(settings.tunerPort),
  guideHours: String(settings.guideHours),
});

interface Diagnostics {
  deck: boolean;
  guide: boolean;
  missingFeatures: string[];
  error?: string;
  guideError?: string;
}

interface Integration {
  tunerr: {
    configured: boolean;
    sportsAutomation: 'enabled' | 'disabled' | 'unavailable';
    eventCount?: number;
    matchedEventCount?: number;
  };
  sportarr: {
    configured: boolean;
    reachable: boolean | null;
    name?: string;
    feeds: {
      linked: boolean;
      source?: { active: boolean; hasError: boolean; channelCount: number };
      guide?: {
        active: boolean;
        hasError: boolean;
        programCount: number;
        linkedToSource: boolean;
      };
    };
  };
}

const textFields = [
  ['hostname', 'Hostname', 255],
  ['baseUrl', 'URL Base', 256],
  ['guideUrl', 'XMLTV Guide URL', 2048],
  ['sportarrBaseUrl', 'Tunerr URL From Sportarr', 1024],
  ['username', 'Deck Username', 256],
] as const;
const numberFields = [
  ['deckPort', 'Deck Port', 1, 65535],
  ['tunerPort', 'Tuner Port', 1, 65535],
  ['guideHours', 'Guide Window (Hours)', 6, 336],
] as const;

function Editor({ initial }: { initial: Settings }) {
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(() => toDraft(initial));
  const [password, setPassword] = useState('');
  const [clear, setClear] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error?: boolean }>();
  const [diagnostics, setDiagnostics] = useState<Diagnostics>();
  const pending = useRef(false);
  const integration = useApi<Integration>(path + '/sportarr');
  const dirty =
    clear ||
    !!password ||
    JSON.stringify(draft) !== JSON.stringify(toDraft(saved));
  const status = integration.data;
  const canConnect =
    !dirty &&
    status?.tunerr.configured &&
    status.tunerr.sportsAutomation === 'enabled' &&
    status.sportarr.reachable === true;

  function update(patch: Partial<Draft>) {
    setDraft((previous) => ({ ...previous, ...patch }));
    setDiagnostics(undefined);
    setNotice(undefined);
  }

  async function run(action: 'save' | 'test' | 'connect') {
    if (
      pending.current ||
      (action === 'save' && !dirty) ||
      (action === 'connect' && !canConnect)
    )
      return;
    pending.current = true;
    setBusy(true);
    setNotice(undefined);
    setDiagnostics(undefined);
    const body = JSON.stringify({
      ...draft,
      deckPort: Number(draft.deckPort),
      tunerPort: Number(draft.tunerPort),
      guideHours: Number(draft.guideHours),
      ...(clear ? { clearPassword: true } : password ? { password } : {}),
    });
    try {
      if (action === 'test') {
        setDiagnostics(
          await api<Diagnostics>(path + '/test', { method: 'POST', body })
        );
      } else if (action === 'connect') {
        await api(path + '/sportarr/connect', { method: 'POST' });
        setNotice({ text: 'Sportarr feeds synchronized.' });
      } else {
        const result = await api<Settings>(path, { method: 'PUT', body });
        setSaved(result);
        setDraft(toDraft(result));
        setPassword('');
        setClear(false);
        setNotice({ text: 'Tunerr settings saved.' });
      }
    } catch (failure) {
      if (
        action === 'test' &&
        failure instanceof ApiError &&
        failure.testResults
      ) {
        setDiagnostics(failure.testResults as Diagnostics);
      } else {
        setNotice({
          text: friendlyError(failure, 'Tunerr operation failed.'),
          error: true,
        });
      }
    } finally {
      if (action !== 'test') integration.reload();
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <Section title="Tunerr Connection">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void run('save');
          }}
        >
          <div className="setlist">
            <label className="set cfg-row">
              <span>Enable Tunerr</span>
              <input
                type="checkbox"
                checked={draft.enabled}
                disabled={busy}
                onChange={(event) => update({ enabled: event.target.checked })}
              />
            </label>
            <label className="set cfg-row">
              <span>Use HTTPS</span>
              <input
                type="checkbox"
                checked={draft.useSsl}
                disabled={busy}
                onChange={(event) => update({ useSsl: event.target.checked })}
              />
            </label>
            {textFields.map(([key, label, maxLength]) => (
              <label className="set cfg-row" key={key}>
                <span>{label}</span>
                <input
                  className="cfg-input"
                  value={draft[key]}
                  disabled={busy}
                  maxLength={maxLength}
                  onChange={(event) => update({ [key]: event.target.value })}
                />
              </label>
            ))}
            {numberFields.map(([key, label, min, max]) => (
              <label className="set cfg-row" key={key}>
                <span>{label}</span>
                <input
                  className="cfg-input"
                  type="number"
                  value={draft[key]}
                  min={min}
                  max={max}
                  required
                  disabled={busy}
                  onChange={(event) => update({ [key]: event.target.value })}
                />
              </label>
            ))}
            <label className="set cfg-row">
              <span>Deck Password</span>
              <input
                className="cfg-input"
                type="password"
                autoComplete="new-password"
                value={password}
                placeholder={saved.passwordConfigured ? 'Saved' : undefined}
                maxLength={2048}
                disabled={busy || clear}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setDiagnostics(undefined);
                }}
              />
            </label>
            {saved.passwordConfigured && (
              <label className="set cfg-row">
                <span>Remove Saved Password</span>
                <input
                  type="checkbox"
                  checked={clear}
                  disabled={busy}
                  onChange={(event) => {
                    setClear(event.target.checked);
                    setDiagnostics(undefined);
                  }}
                />
              </label>
            )}
          </div>
          <div className="toolbar">
            <button
              type="button"
              className="btn btn-tonal btn-sm"
              disabled={busy || !draft.hostname.trim()}
              onClick={() => void run('test')}
            >
              Test Deck and Guide
            </button>
            {dirty && (
              <button
                type="button"
                className="btn btn-quiet btn-sm"
                disabled={busy}
                onClick={() => {
                  update(toDraft(saved));
                  setPassword('');
                  setClear(false);
                }}
              >
                Discard Changes
              </button>
            )}
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={busy || !dirty}
            >
              Save Changes
            </button>
          </div>
        </form>
        {diagnostics && (
          <div
            role={diagnostics.deck && diagnostics.guide ? 'status' : 'alert'}
          >
            <p className="note">
              {diagnostics.deck
                ? 'Deck connected.'
                : diagnostics.error || 'Deck unavailable.'}
            </p>
            <p className="note">
              {diagnostics.guide
                ? 'Guide connected.'
                : diagnostics.guideError || 'Guide unavailable.'}
            </p>
            {!!diagnostics.missingFeatures.length && (
              <p className="note">
                Unavailable deck features include{' '}
                {diagnostics.missingFeatures.join(', ')}.
              </p>
            )}
          </div>
        )}
        {notice && (
          <p className="note" role={notice.error ? 'alert' : 'status'}>
            {notice.text}
          </p>
        )}
      </Section>
      <Section title="Sportarr Feeds">
        <ServiceNote
          what="Sportarr integration"
          error={integration.error}
          retry={integration.reload}
        />
        {status ? (
          <div className="setlist">
            <div className="set">
              <span>Sports Automation</span>
              <b>
                {status.tunerr.configured
                  ? status.tunerr.sportsAutomation
                  : 'Tunerr is not configured'}
              </b>
            </div>
            {status.tunerr.sportsAutomation === 'enabled' && (
              <div className="set">
                <span>Matched Events</span>
                <b>
                  {status.tunerr.matchedEventCount ?? 0} of{' '}
                  {status.tunerr.eventCount ?? 0}
                </b>
              </div>
            )}
            <div className="set">
              <span>{status.sportarr.name || 'Sportarr'}</span>
              <b>
                {status.sportarr.configured
                  ? status.sportarr.reachable === true
                    ? 'Reachable'
                    : status.sportarr.reachable === false
                      ? 'Unreachable'
                      : 'Unchecked'
                  : 'Not configured'}
              </b>
            </div>
            <div className="set">
              <span>Feed Link</span>
              <b>{status.sportarr.feeds.linked ? 'Linked' : 'Unlinked'}</b>
            </div>
            {status.sportarr.feeds.source && (
              <div className="set">
                <span>Tuner Source</span>
                <b>
                  {status.sportarr.feeds.source.hasError
                    ? 'Needs attention'
                    : `${status.sportarr.feeds.source.channelCount} channels`}
                </b>
              </div>
            )}
            {status.sportarr.feeds.guide && (
              <div className="set">
                <span>XMLTV Guide</span>
                <b>
                  {status.sportarr.feeds.guide.hasError
                    ? 'Needs attention'
                    : `${status.sportarr.feeds.guide.programCount} programs`}
                </b>
              </div>
            )}
          </div>
        ) : (
          !integration.error && (
            <p className="note" role="status">
              Checking Sportarr integration…
            </p>
          )
        )}
        <div className="toolbar">
          <button
            type="button"
            className="btn btn-tonal btn-sm"
            disabled={busy}
            onClick={integration.reload}
          >
            Refresh Status
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy || !canConnect}
            onClick={() => void run('connect')}
          >
            {status?.sportarr.feeds.linked
              ? 'Sync Sportarr Feeds'
              : 'Connect Sportarr Feeds'}
          </button>
        </div>
      </Section>
    </>
  );
}

export default function AdminTunerr() {
  const settings = useApi<Settings>(path);
  return (
    <>
      <header className="ph">
        <h1>Tunerr Settings</h1>
      </header>
      <div className="toolbar">
        <Link className="btn btn-quiet btn-sm" to="/admin">
          Back to Administration
        </Link>
      </div>
      <ServiceNote
        what="Tunerr settings"
        error={settings.error}
        retry={settings.reload}
      />
      {settings.data ? (
        <Editor initial={settings.data} />
      ) : (
        !settings.error && (
          <p className="note" role="status">
            Loading Tunerr settings…
          </p>
        )
      )}
    </>
  );
}
