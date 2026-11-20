import { useRef, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { friendlyError } from '../errors';
import { useLumenLocale } from '../i18n';
import { sessionGeneration } from '../sessionState';
import {
  isThemeColor,
  normalizeThemeColor,
  themeColors,
} from '../themeOverrides';
import { Section } from './cards';

export default function AccountThemeOverrides() {
  const { t } = useLumenLocale();
  const { user, refresh } = useAuth();
  const saved = user?.settings?.advancedThemeOverrides;
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [editingJson, setEditingJson] = useState(false);
  const [json, setJson] = useState('{}');
  const [jsonBase, setJsonBase] = useState<Record<string, string | number>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const pending = useRef(false);
  const dirty = Object.keys(draft).length > 0;
  const jsonDirty = json !== JSON.stringify(jsonBase, null, 2);
  const invalid = Object.values(draft).some(
    (value) => value.trim() !== '' && !isThemeColor(value.trim())
  );

  async function save(changes: Record<string, string | number | null>) {
    if (!user || pending.current || Object.keys(changes).length === 0) return;
    const generation = sessionGeneration();
    pending.current = true;
    setBusy(true);
    setNotice('');
    setError('');
    try {
      await api(`/user/${user.id}/settings/advanced-theme`, {
        method: 'POST',
        body: JSON.stringify({ changes }),
      });
      const confirmed = await refresh();
      if (generation !== sessionGeneration()) return;
      const readback = confirmed?.settings?.advancedThemeOverrides;
      if (
        !confirmed ||
        Object.keys(changes).some((key) => {
          const expected = changes[key];
          const actual = readback?.[key] ?? null;
          return (
            actual !== expected &&
            !(
              isThemeColor(expected) &&
              normalizeThemeColor(actual) === normalizeThemeColor(expected)
            )
          );
        })
      ) {
        setError(
          t(
            'lumen.account.themeOverrideConfirmFailure',
            'The server accepted the save, but Lumen could not confirm the updated colors.'
          )
        );
        return;
      }
      setDraft({});
      if (editingJson) openJson(readback ?? {});
      setNotice(
        t(
          editingJson
            ? 'pages.profile.advancedTheme.saved'
            : 'lumen.account.themeColorsSaved',
          editingJson
            ? 'Your theme overrides were saved.'
            : 'Theme colors saved.'
        )
      );
    } catch (cause) {
      if (generation === sessionGeneration())
        setError(
          friendlyError(
            cause,
            t(
              'lumen.account.themeColorsSaveFailure',
              'Could not save theme colors.'
            )
          )
        );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  function openJson(value: Record<string, string | number>) {
    setJsonBase(value);
    setJson(JSON.stringify(value, null, 2));
  }

  function saveJson() {
    try {
      const parsed: unknown = JSON.parse(json);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        throw new Error();
      const values = Object.entries(parsed);
      if (
        values.some(
          ([, value]) => typeof value !== 'string' && typeof value !== 'number'
        )
      )
        throw new Error();
      const changes = new Map<string, string | number | null>();
      for (const key of Object.keys(jsonBase))
        if (!Object.hasOwn(parsed, key)) changes.set(key, null);
      for (const [key, value] of values)
        if (jsonBase[key] !== value) changes.set(key, value);
      void save(Object.fromEntries(changes));
    } catch {
      setNotice('');
      setError('Enter a JSON object with string or numeric override values.');
    }
  }

  return (
    <Section
      title={t('pages.profile.advancedTheme.title', 'Advanced Theme Overrides')}
      id="advanced-theme"
    >
      <div className="toolbar">
        <button
          className="btn btn-quiet btn-sm"
          type="button"
          disabled={busy || dirty}
          onClick={() => {
            setNotice('');
            setError('');
            if (!editingJson && !jsonDirty) openJson(saved ?? {});
            setEditingJson(!editingJson);
          }}
        >
          {t(
            editingJson
              ? 'lumen.account.themeEditColors'
              : 'lumen.account.themeEditAll',
            editingJson ? 'Edit Theme Colors' : 'Edit All Overrides'
          )}
        </button>
      </div>
      {!editingJson ? (
        <p className="note">
          {t(
            'lumen.account.themeColorHelp',
            'Enter a hex color such as #2950e0, or clear the field to use the default.'
          )}
        </p>
      ) : (
        <p className="note">
          {t(
            'lumen.account.themeJsonHelp',
            'Edit the account override object. Remove a key to restore its default.'
          )}
        </p>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (editingJson) saveJson();
          else if (dirty && !invalid)
            void save(
              Object.fromEntries(
                Object.entries(draft).map(([key, value]) => [
                  key,
                  value.trim() || null,
                ])
              )
            );
        }}
      >
        {editingJson ? (
          <label className="set cfg-row">
            <b>{t('lumen.account.themeOverrideJson', 'Theme Override JSON')}</b>
            <textarea
              className="cfg-json"
              rows={10}
              spellCheck={false}
              value={json}
              disabled={busy}
              onChange={(event) => setJson(event.target.value)}
            />
          </label>
        ) : (
          <div className="setlist">
            {themeColors.map(([key, , label, messageKey]) => (
              <label className="set cfg-row" key={key}>
                <b>{t(messageKey, label)}</b>
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
        )}
        {error && (
          <p className="note" role="alert">
            {error ===
            'Enter a JSON object with string or numeric override values.'
              ? t(
                  'lumen.account.themeOverrideInvalidJson',
                  'Enter a JSON object with string or numeric override values.'
                )
              : error}
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
            disabled={busy || (editingJson ? !jsonDirty : !dirty || invalid)}
          >
            {t(
              editingJson
                ? 'pages.profile.advancedTheme.save'
                : 'lumen.account.saveThemeColors',
              editingJson ? 'Save overrides' : 'Save Theme Colors'
            )}
          </button>
        </div>
      </form>
    </Section>
  );
}
