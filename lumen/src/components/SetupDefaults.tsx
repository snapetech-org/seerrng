import {
  buildSetupDefaultsSettings,
  getSetupDefaultsSelection,
  type SetupDefaultsSelection,
  type SetupDefaultsSettings,
} from '@app/components/Setup/setupDefaultsLogic';
import { useEffect, useState } from 'react';
import { api } from '../api';
import { forget } from '../apiCache';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';
import { invalidatePublicSettings } from '../mediaServer';
import { Section } from './cards';
import { ServiceNote } from './extra';

const path = '/settings/main';
const fields = [
  {
    key: 'allowRequests',
    title: 'components.Setup.requestAccess',
    titleFallback: 'Allow new users to request media',
    description: 'components.Setup.requestAccessDescription',
    descriptionFallback:
      'Give new users access to request items in the categories you enable.',
  },
  {
    key: 'enable4k',
    title: 'components.Setup.enable4k',
    titleFallback: 'Enable 4K request options',
    description: 'components.Setup.enable4kDescription',
    descriptionFallback:
      'Make 4K requests available throughout SeerrNG. Add separate 4K Radarr or Sonarr destinations under Movies & TV.',
  },
  {
    key: 'allow4kRequests',
    title: 'components.Setup.request4k',
    titleFallback: 'Allow new users to request in 4K',
    description: 'components.Setup.request4kDescription',
    descriptionFallback:
      'This is a default permission for new users. It needs request access and 4K options enabled.',
  },
  {
    key: 'partialRequestsEnabled',
    title: 'components.Setup.partialRequests',
    titleFallback: 'Allow partial TV season requests',
    description: 'components.Setup.partialRequestsDescription',
    descriptionFallback:
      'Let users request selected episodes instead of a full season. This applies to everyone.',
  },
] as const;

export default function SetupDefaults({
  onContinue,
  onDirtyChange,
}: {
  onContinue: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const { t } = useLumenLocale();
  const settings = useApi<SetupDefaultsSettings>(path);
  const [selection, setSelection] = useState<SetupDefaultsSelection>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const next =
    settings.data && selection
      ? buildSetupDefaultsSettings(settings.data, selection)
      : undefined;
  const dirty =
    !!settings.data &&
    !!next &&
    (settings.data.defaultPermissions !== next.defaultPermissions ||
      settings.data.enable4k !== next.enable4k ||
      settings.data.partialRequestsEnabled !== next.partialRequestsEnabled);

  useEffect(() => {
    if (settings.data) setSelection(getSetupDefaultsSelection(settings.data));
  }, [settings.data]);
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  async function saveAndContinue() {
    if (!settings.data || !selection || saving) return;
    setSaving(true);
    setError('');
    const next = buildSetupDefaultsSettings(settings.data, selection);
    let writeAcknowledged = false;
    try {
      const result = await api<SetupDefaultsSettings>(path, {
        method: 'POST',
        body: JSON.stringify(next),
      });
      writeAcknowledged = true;
      const readback = await api<SetupDefaultsSettings>(path, {
        cache: 'no-store',
      });
      if (
        Object.keys(next).some(
          (key) =>
            result[key as keyof SetupDefaultsSettings] !==
              next[key as keyof SetupDefaultsSettings] ||
            readback[key as keyof SetupDefaultsSettings] !==
              next[key as keyof SetupDefaultsSettings]
        )
      ) {
        throw new Error(
          t(
            'components.Setup.defaultsSaveError',
            'User defaults could not be saved. Try again.'
          )
        );
      }
      invalidatePublicSettings();
      forget('/settings/public');
      window.dispatchEvent(new Event('lumen-settings-updated'));
      settings.reload();
      onDirtyChange(false);
      onContinue();
    } catch (failure) {
      setError(
        writeAcknowledged
          ? t(
              'lumen.settings.confirmFailed',
              'The server accepted the change, but Lumen could not confirm the saved state. Keep this form open and retry.'
            )
          : failure instanceof Error
            ? failure.message
            : t(
                'components.Setup.defaultsSaveError',
                'User defaults could not be saved. Try again.'
              )
      );
    } finally {
      setSaving(false);
    }
  }

  function skip() {
    onDirtyChange(false);
    onContinue();
  }

  function update(key: keyof SetupDefaultsSelection, value: boolean) {
    setSelection((current) => {
      if (!current) return current;
      const next = { ...current, [key]: value };
      if ((key === 'allowRequests' || key === 'enable4k') && !value) {
        next.allow4kRequests = false;
      }
      return next;
    });
  }

  return (
    <Section
      title={t('components.Setup.defaultsTitle', 'Set defaults for new users')}
    >
      <p className="note">
        {t(
          'components.Setup.defaultsDescription',
          'Choose what people can request when they join. Requests still follow your approval and quota rules.'
        )}
      </p>
      <p className="note">
        {t(
          'components.Setup.defaultsTip',
          'You can change these defaults or adjust individual users later in Settings.'
        )}
      </p>
      <ServiceNote
        error={settings.error}
        what={t('lumen.adminGeneral.requestSettings.what', 'request settings')}
        retry={settings.reload}
      />
      {error && (
        <p className="note" role="alert">
          {error}
        </p>
      )}
      {settings.data && selection ? (
        <div className="setlist">
          {fields.map((field) => {
            const key = field.key as keyof SetupDefaultsSelection;
            const disabled =
              saving ||
              (key === 'allow4kRequests' &&
                (!selection.allowRequests || !selection.enable4k));
            return (
              <label className="set cfg-row" key={field.key}>
                <span>
                  <b>{t(field.title, field.titleFallback)}</b>
                  <small>
                    {t(field.description, field.descriptionFallback)}
                  </small>
                </span>
                <input
                  type="checkbox"
                  aria-label={t(field.title, field.titleFallback)}
                  checked={selection[key]}
                  disabled={disabled}
                  onChange={(event) => update(key, event.target.checked)}
                />
              </label>
            );
          })}
        </div>
      ) : (
        !settings.error && (
          <p className="note" role="status">
            {t('lumen.setup.checking', 'Checking…')}
          </p>
        )
      )}
      <div className="toolbar">
        <button
          className="btn btn-primary btn-sm"
          disabled={saving || !settings.data || !selection}
          onClick={() => void saveAndContinue()}
        >
          {t(
            saving
              ? 'components.Setup.savingDefaults'
              : 'components.Setup.saveDefaults',
            saving ? 'Saving…' : 'Save defaults and continue'
          )}
        </button>
        <button
          className="btn btn-quiet btn-sm"
          disabled={saving}
          onClick={skip}
        >
          {t('components.Setup.skipDefaults', 'Skip for now')}
        </button>
      </div>
    </Section>
  );
}
