import { useRef, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { friendlyError } from '../errors';
import { sessionGeneration } from '../sessionState';
import { isThemeColor, themeColors } from '../themeOverrides';
import { Section } from './cards';

export default function AccountThemeOverrides() {
  const { user, refresh } = useAuth();
  const saved = user?.settings?.advancedThemeOverrides;
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const pending = useRef(false);
  const dirty = Object.keys(draft).length > 0;
  const invalid = Object.values(draft).some(
    (value) => value.trim() !== '' && !isThemeColor(value.trim())
  );

  async function save() {
    if (!user || pending.current || !dirty || invalid) return;
    const generation = sessionGeneration();
    pending.current = true;
    setBusy(true);
    setNotice('');
    setError('');
    const overrides = { ...saved };
    for (const [key, value] of Object.entries(draft)) {
      const color = value.trim();
      if (color) overrides[key] = color;
      else delete overrides[key];
    }
    try {
      await api(`/user/${user.id}/settings/advanced-theme`, {
        method: 'POST',
        body: JSON.stringify({ overrides }),
      });
      await refresh();
      if (generation !== sessionGeneration()) return;
      setDraft({});
      setNotice('Theme colors saved.');
    } catch (cause) {
      if (generation === sessionGeneration())
        setError(friendlyError(cause, 'Could not save theme colors.'));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <Section title="Advanced Theme Overrides" id="advanced-theme">
      <p className="note">
        Enter a hex color such as #2950e0, or clear the field to use the
        default.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div className="setlist">
          {themeColors.map(([key, , label]) => (
            <label className="set cfg-row" key={key}>
              <b>{label}</b>
              <input
                className="cfg-input"
                value={draft[key] ?? saved?.[key] ?? ''}
                maxLength={7}
                disabled={busy}
                onChange={(event) =>
                  setDraft({ ...draft, [key]: event.target.value })
                }
              />
            </label>
          ))}
        </div>
        {error && (
          <p className="note" role="alert">
            {error}
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
            type="submit"
            disabled={busy || !dirty || invalid}
          >
            Save Theme Colors
          </button>
        </div>
      </form>
    </Section>
  );
}
