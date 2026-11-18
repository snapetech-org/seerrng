import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { forget } from '../apiCache';
import { friendlyError } from '../errors';
import { Section } from './cards';
import { ConfirmSheet } from './ConfirmSheet';

export default function ApplicationApiKey({ initial }: { initial: string }) {
  const [key, setKey] = useState(initial);
  const [revealed, setRevealed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [failure, setFailure] = useState('');
  const pending = useRef(false);

  useEffect(() => {
    if (window.location.hash === '#apiKey')
      document.getElementById('apiKey')?.scrollIntoView({ block: 'start' });
  }, []);

  async function copy() {
    setFailure('');
    try {
      await navigator.clipboard.writeText(key);
      setNotice('Application API key copied.');
    } catch {
      setNotice('Reveal the key to copy it manually.');
    }
  }

  async function regenerate() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setNotice('');
    setFailure('');
    try {
      const result = await api<{ apiKey?: string }>(
        '/settings/main/regenerate',
        {
          method: 'POST',
        }
      );
      if (!result.apiKey || result.apiKey === key) {
        throw new Error('Could not confirm the replacement API key.');
      }
      forget('/settings/main');
      setKey(result.apiKey);
      setRevealed(false);
      setNotice('Application API key regenerated.');
    } catch (error) {
      setFailure(friendlyError(error, 'Could not regenerate the API key.'));
    } finally {
      pending.current = false;
      setConfirming(false);
      setBusy(false);
    }
  }

  return (
    <Section title="Application API Key" id="apiKey">
      <div className="setlist">
        <label className="set cfg-row">
          <b>API Key</b>
          <input
            className="cfg-input"
            value={revealed ? key : '••••••••••••••••'}
            readOnly
            autoComplete="off"
          />
        </label>
      </div>
      <div className="toolbar">
        <button
          className="btn btn-quiet btn-sm"
          aria-pressed={revealed}
          disabled={busy}
          onClick={() => setRevealed((value) => !value)}
        >
          {revealed ? 'Hide Key' : 'Reveal Key'}
        </button>
        <button
          className="btn btn-quiet btn-sm"
          disabled={busy}
          onClick={() => void copy()}
        >
          Copy Key
        </button>
        <button
          className="btn btn-tonal btn-sm"
          disabled={busy}
          onClick={() => setConfirming(true)}
        >
          Regenerate Key
        </button>
      </div>
      {notice && (
        <p className="note" role="status">
          {notice}
        </p>
      )}
      {failure && (
        <p className="note" role="alert">
          {failure}
        </p>
      )}
      {confirming && (
        <ConfirmSheet
          title="Regenerate the application API key?"
          body="The current key stops working immediately. Update any integrations that use it."
          confirm="Regenerate Key"
          cancel="Keep Current Key"
          busy={busy}
          onConfirm={() => void regenerate()}
          onClose={() => {
            if (!pending.current) setConfirming(false);
          }}
        />
      )}
    </Section>
  );
}
