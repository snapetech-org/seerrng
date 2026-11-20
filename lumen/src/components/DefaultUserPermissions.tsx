import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../api';
import { friendlyError } from '../errors';
import { useLumenLocale } from '../i18n';
import { permissionOptions } from '../permissionOptions';
import { sessionGeneration } from '../sessionState';
import { Section } from './cards';
import { ConfirmSheet } from './ConfirmSheet';

export default function DefaultUserPermissions({
  initial,
}: {
  initial: number;
}) {
  const { t } = useLumenLocale();
  const { hash } = useLocation();
  const editor = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (hash !== '#default-user-permissions' || !editor.current) return;
    editor.current.open = true;
    document
      .getElementById('default-user-permissions')
      ?.scrollIntoView({ block: 'start' });
  }, [hash]);
  const [saved, setSaved] = useState(BigInt(initial));
  const [draft, setDraft] = useState(BigInt(initial));
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [failure, setFailure] = useState('');
  const pending = useRef(false);
  const grantsAdmin = (draft & 2n) !== 0n;

  async function save() {
    if (pending.current || draft === saved) return;
    const generation = sessionGeneration();
    pending.current = true;
    setBusy(true);
    setNotice('');
    setFailure('');
    try {
      const result = await api<{ defaultPermissions?: number }>(
        '/settings/main',
        {
          method: 'POST',
          body: JSON.stringify({ defaultPermissions: Number(draft) }),
        }
      );
      if (generation !== sessionGeneration()) return;
      if (result.defaultPermissions !== Number(draft)) {
        setFailure('Could not confirm the saved default permissions.');
        return;
      }
      setSaved(draft);
      setNotice('Default permissions saved.');
    } catch (error) {
      if (generation === sessionGeneration()) {
        setFailure(friendlyError(error, 'Could not save default permissions.'));
      }
    } finally {
      pending.current = false;
      setBusy(false);
      setConfirm(false);
    }
  }

  return (
    <Section title="Default User Permissions" id="default-user-permissions">
      <details ref={editor}>
        <summary>Edit Default Permissions</summary>
        <p className="note">
          SeerrNG assigns these permissions to new accounts that use the
          instance defaults.
        </p>
        {grantsAdmin && (
          <p className="note">This default grants full administrator access.</p>
        )}
        <div className="setlist" role="group" aria-label="Default Permissions">
          {permissionOptions.map(([bit, label, messageKey]) => (
            <label className="set" key={label}>
              <span>{t(messageKey, label)}</span>
              <input
                type="checkbox"
                checked={(draft & bit) !== 0n}
                disabled={busy || bit === 2n || grantsAdmin}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setDraft((current) =>
                    checked ? current | bit : current & ~bit
                  );
                  setNotice('');
                  setFailure('');
                }}
              />
            </label>
          ))}
        </div>
        {failure && (
          <p className="note" role="alert">
            {failure}
          </p>
        )}
        {notice && (
          <p className="note" role="status">
            {notice}
          </p>
        )}
        <div className="toolbar">
          <button
            className="btn btn-primary btn-sm"
            disabled={busy || draft === saved}
            onClick={() => setConfirm(true)}
          >
            Save Default Permissions
          </button>
        </div>
      </details>
      {confirm && (
        <ConfirmSheet
          title="Save Default Permissions?"
          body="New accounts using the instance defaults will receive these permissions."
          confirm="Save Default Permissions"
          cancel="Go Back"
          busy={busy}
          onConfirm={() => void save()}
          onClose={() => {
            if (!pending.current) setConfirm(false);
          }}
        />
      )}
    </Section>
  );
}
