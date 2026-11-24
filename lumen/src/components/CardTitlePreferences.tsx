import { useId, useRef, useState } from 'react';
import {
  defaultCardTitleModes,
  type CardTitleMode,
  type CardTitleSettings,
} from '../api';
import { forget } from '../apiCache';
import { useAuth } from '../auth';
import { saveCardTitleModes } from '../cardTitleModes';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';
import { sessionGeneration } from '../sessionState';
import { Section } from './cards';
import { ServiceNote } from './extra';

const generalKey = 'components.UserProfile.UserSettings.UserGeneralSettings.';
const categories = [
  ['movie', 'Movies', 'cardTextVisibilityMovie'],
  ['tv', 'Series', 'cardTextVisibilityTv'],
  ['album', 'Music', 'cardTextVisibilityAlbum'],
  ['book', 'Books', 'cardTextVisibilityBook'],
] as const;

function CardTitleForm({
  path,
  initial,
}: {
  path: string;
  initial: CardTitleSettings;
}) {
  const { t } = useLumenLocale();
  const { refresh } = useAuth();
  const fieldId = useId();
  const [saved, setSaved] = useState({ ...defaultCardTitleModes, ...initial });
  const [draft, setDraft] = useState({ ...defaultCardTitleModes, ...initial });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const pending = useRef(false);
  const changed = categories.filter(([kind]) => draft[kind] !== saved[kind]);

  async function save() {
    if (pending.current || !changed.length) return;
    const generation = sessionGeneration();
    pending.current = true;
    setBusy(true);
    setNotice('');
    setError('');
    try {
      const confirmed = await saveCardTitleModes(
        path,
        Object.fromEntries(changed.map(([kind]) => [kind, draft[kind]]))
      );
      if (generation !== sessionGeneration()) return;
      forget(path);
      await refresh();
      if (generation !== sessionGeneration()) return;
      if (changed.some(([kind]) => confirmed[kind] !== draft[kind])) {
        setError(
          t(
            'lumen.account.cardTitleSettingsConfirmFailure',
            'Could not confirm the saved card title settings.'
          )
        );
        return;
      }
      setSaved({ ...defaultCardTitleModes, ...confirmed });
      setDraft({ ...defaultCardTitleModes, ...confirmed });
      setNotice(
        t('lumen.account.cardTitleSettingsSaved', 'Card title settings saved.')
      );
    } catch {
      if (generation === sessionGeneration())
        setError(
          t(
            'lumen.account.cardTitleSettingsSaveFailure',
            'Could not save card title settings. Try again.'
          )
        );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <p className="note">
        {t(
          generalKey + 'cardTextVisibilityTip',
          'Choose when poster cards show their titles. Touch devices keep titles visible.'
        )}
      </p>
      <div className="setlist">
        {categories.map(([kind, label, message]) => (
          <label className="set cfg-row" key={kind} htmlFor={fieldId + kind}>
            <b>{t(generalKey + message, label)}</b>
            <select
              className="cfg-select"
              id={fieldId + kind}
              value={draft[kind]}
              disabled={busy}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  [kind]: event.target.value as CardTitleMode,
                })
              }
            >
              <option value="hover">
                {t(
                  'lumen.account.cardTitleOnHover',
                  'On hover or keyboard focus'
                )}
              </option>
              <option value="always">
                {t(generalKey + 'cardTextVisibilityAlways', 'Always')}
              </option>
            </select>
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
          disabled={busy || !changed.length}
        >
          {t('lumen.account.saveCardTitles', 'Save Card Titles')}
        </button>
      </div>
    </form>
  );
}

export function CardTitlePreferences({ path }: { path: string }) {
  const { t } = useLumenLocale();
  const settings = useApi<CardTitleSettings>(path);
  return (
    <Section title={t(generalKey + 'cardTextVisibility', 'Card Titles')}>
      <ServiceNote
        error={settings.error}
        what={t(generalKey + 'cardTextVisibility', 'Card Titles')}
        retry={settings.reload}
      />
      {settings.data ? (
        <CardTitleForm path={path} initial={settings.data} />
      ) : (
        !settings.error && (
          <p className="note" role="status">
            Loading card title settings…
          </p>
        )
      )}
    </Section>
  );
}
