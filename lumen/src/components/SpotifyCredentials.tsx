import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api } from '../api';
import { forget } from '../apiCache';
import { friendlyError } from '../errors';
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
        throw new Error('Could not confirm saved Spotify credentials.');
      }
      forget('/settings/main');
      forget('/playlist/spotify/status');
      setSavedId(result.spotifyClientId ?? '');
      setClientId(result.spotifyClientId ?? '');
      setHasSecret(Boolean(result.spotifyClientSecret));
      setSecret('');
      setRemoveSecret(false);
      setFeedback('Spotify credentials saved.');
    } catch (error) {
      setFailure(friendlyError(error, 'Could not save Spotify credentials.'));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <Section title="Spotify Playlist Import" id="spotifyClientId">
      <form onSubmit={(event) => void save(event)}>
        <div className="setlist">
          <label className="set cfg-row">
            <b>Spotify Client ID</b>
            <input
              className="cfg-input"
              value={clientId}
              maxLength={512}
              disabled={busy}
              onChange={(event) => setClientId(event.target.value)}
            />
          </label>
          <label className="set cfg-row">
            <span>
              <b>Spotify Client Secret</b>
              {hasSecret && (
                <small>A secret is saved. Leave blank to keep it.</small>
              )}
            </span>
            <input
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
              <b>Remove saved Spotify secret</b>
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
            Save Spotify Credentials
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
