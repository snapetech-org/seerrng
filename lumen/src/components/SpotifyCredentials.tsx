import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api } from '../api';
import { forget } from '../apiCache';
import { friendlyError } from '../errors';
import { useLumenLocale } from '../i18n';
import { Section } from './cards';

interface Credentials {
  spotifyClientId?: string;
  spotifyClientSecret?: string;
}

export default function SpotifyCredentials({
  initial,
}: {
  initial: Credentials;
}) {
  const { t } = useLumenLocale();
  const [savedId, setSavedId] = useState(initial.spotifyClientId ?? '');
  const [clientId, setClientId] = useState(savedId);
  const [hasSecret, setHasSecret] = useState(
    Boolean(initial.spotifyClientSecret)
  );
  const [secret, setSecret] = useState('');
  const [removeSecret, setRemoveSecret] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [failure, setFailure] = useState('');
  const pending = useRef(false);
  const idChanged = clientId.trim() !== savedId;
  const secretChange = removeSecret ? '' : secret.trim() || undefined;
  const dirty = idChanged || secretChange !== undefined;

  useEffect(() => {
    if (window.location.hash === '#spotifyClientId') {
      document
        .getElementById('spotifyClientId')
        ?.scrollIntoView({ block: 'start' });
    }
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || !dirty) return;
    pending.current = true;
    setBusy(true);
    setFeedback('');
    setFailure('');
    try {
      const result = await api<Credentials>('/settings/main', {
        method: 'POST',
        body: JSON.stringify({
          ...(idChanged ? { spotifyClientId: clientId.trim() } : {}),
          ...(secretChange !== undefined
            ? { spotifyClientSecret: secretChange }
            : {}),
        }),
      });
      if (
        (idChanged && result.spotifyClientId !== clientId.trim()) ||
        (secretChange !== undefined &&
          Boolean(result.spotifyClientSecret) !== Boolean(secretChange))
      ) {
        throw new Error(
          t(
            'lumen.adminGeneral.spotify.confirmFailure',
            'Could not confirm saved Spotify credentials.'
          )
        );
      }
      forget('/settings/main');
      forget('/playlist/spotify/status');
      setSavedId(result.spotifyClientId ?? '');
      setClientId(result.spotifyClientId ?? '');
      setHasSecret(Boolean(result.spotifyClientSecret));
      setSecret('');
      setRemoveSecret(false);
      setFeedback(
        t('lumen.adminGeneral.spotify.saved', 'Spotify credentials saved.')
      );
    } catch (error) {
      setFailure(
        friendlyError(
          error,
          t(
            'lumen.adminGeneral.spotify.saveFailure',
            'Could not save Spotify credentials.'
          ),
          (id, fallback) => t(id, fallback)
        )
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <Section
      title={t('lumen.adminGeneral.spotify.title', 'Spotify Playlist Import')}
      id="spotifyClientId"
    >
      <form onSubmit={(event) => void save(event)}>
        <div className="setlist">
          <label
            className="set cfg-row"
            htmlFor="spotify-client-id"
            aria-label={t(
              'components.Settings.SettingsMain.spotifyClientId',
              'Spotify Client ID'
            )}
          >
            <span>
              <b>
                {t(
                  'components.Settings.SettingsMain.spotifyClientId',
                  'Spotify Client ID'
                )}
              </b>
              <small>
                {t(
                  'lumen.adminGeneral.spotify.clientIdHelp',
                  'Create an application in the Spotify Developer Dashboard and copy its client ID.'
                )}
              </small>
            </span>
            <input
              id="spotify-client-id"
              className="cfg-input"
              value={clientId}
              maxLength={512}
              disabled={busy}
              onChange={(event) => setClientId(event.target.value)}
            />
          </label>
          <label
            className="set cfg-row"
            htmlFor="spotify-client-secret"
            aria-label={t(
              'components.Settings.SettingsMain.spotifyClientSecret',
              'Spotify Client Secret'
            )}
          >
            <span>
              <b>
                {t(
                  'components.Settings.SettingsMain.spotifyClientSecret',
                  'Spotify Client Secret'
                )}
              </b>
              <small>
                {t(
                  'lumen.adminGeneral.spotify.clientSecretHelp',
                  'The Spotify client secret is stored in SeerrNG and never shown in full after saving.'
                )}
              </small>
              {hasSecret && (
                <small>
                  {t(
                    'lumen.adminGeneral.spotify.secretSaved',
                    'A secret is saved. Leave blank to keep it.'
                  )}
                </small>
              )}
            </span>
            <input
              id="spotify-client-secret"
              className="cfg-input"
              type="password"
              autoComplete="new-password"
              value={secret}
              maxLength={512}
              disabled={busy || removeSecret}
              onChange={(event) => setSecret(event.target.value)}
            />
          </label>
          {hasSecret && (
            <label className="set cfg-row">
              <b>
                {t(
                  'lumen.adminGeneral.spotify.removeSecret',
                  'Remove saved Spotify secret'
                )}
              </b>
              <input
                type="checkbox"
                checked={removeSecret}
                disabled={busy}
                onChange={(event) => setRemoveSecret(event.target.checked)}
              />
            </label>
          )}
        </div>
        <div className="toolbar">
          <button className="btn btn-tonal btn-sm" disabled={busy || !dirty}>
            {t(
              'lumen.adminGeneral.spotify.saveButton',
              'Save Spotify Credentials'
            )}
          </button>
        </div>
        {feedback && (
          <p className="note" role="status">
            {feedback}
          </p>
        )}
        {failure && (
          <p className="note" role="alert">
            {failure}
          </p>
        )}
      </form>
    </Section>
  );
}
