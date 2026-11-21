import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../api';
import { forget } from '../apiCache';
import { Section } from '../components/cards';
import { ServiceNote } from '../components/extra';
import InstanceAgeGate, {
  type AgeGateSettings,
} from '../components/InstanceAgeGate';
import MediaCategorySwitches from '../components/MediaCategorySwitches';
import { friendlyError } from '../errors';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';
import { invalidatePublicSettings } from '../mediaServer';
import { sessionGeneration } from '../sessionState';

const path = '/settings/main';

interface CategorySettings {
  enabledMediaCategories?: Record<string, boolean>;
  defaultEnabledMediaCategories?: Record<string, boolean>;
  ageGate?: AgeGateSettings;
}

function CategoryForm({
  initial,
  field,
  onSaved,
}: {
  initial: Record<string, boolean>;
  field: 'enabledMediaCategories' | 'defaultEnabledMediaCategories';
  onSaved?: () => void;
}) {
  const { t } = useLumenLocale();
  const defaults = field === 'defaultEnabledMediaCategories';
  const [categories, setCategories] = useState(initial);
  const [draft, setDraft] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [failure, setFailure] = useState('');
  const pending = useRef(false);
  const changes = Object.entries(draft);

  async function save() {
    if (!changes.length || pending.current) return;
    const generation = sessionGeneration();
    pending.current = true;
    setBusy(true);
    setNotice('');
    setFailure('');
    try {
      const result = await api<CategorySettings>(path, {
        method: 'POST',
        body: JSON.stringify({ [field]: draft }),
      });
      if (generation !== sessionGeneration()) return;
      invalidatePublicSettings();
      forget('/settings/public');
      const saved = result[field];
      if (!saved || changes.some(([key, value]) => saved[key] !== value)) {
        setFailure(
          t(
            'lumen.adminCategories.confirmFailure',
            'Could not confirm the saved categories.'
          )
        );
        return;
      }
      setCategories(saved);
      setDraft({});
      onSaved?.();
      setNotice(
        defaults
          ? t(
              'lumen.adminCategories.defaultCategoriesSaved',
              'Default categories saved.'
            )
          : t(
              'components.Settings.SettingsCategories.saveSuccess',
              'Category settings saved.'
            )
      );
    } catch (error) {
      if (generation === sessionGeneration()) {
        setFailure(
          friendlyError(
            error,
            t(
              'components.Settings.SettingsCategories.saveFailure',
              'Could not save category settings.'
            ),
            t
          )
        );
      }
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
      <MediaCategorySwitches
        values={{ ...categories, ...draft }}
        disabled={busy}
        disableUnavailable
        showDescriptions={!defaults}
        onChange={(key, enabled) => {
          setNotice('');
          setFailure('');
          setDraft((current) => {
            const next = { ...current };
            if (enabled === categories[key]) delete next[key];
            else next[key] = enabled;
            return next;
          });
        }}
      />
      {!defaults && (draft.adult ?? categories.adult) && (
        <p className="note">
          {t(
            'lumen.adminCategories.adultEnabledNote',
            'Adult discovery requires a configured Whisparr v3 service and account permission. Restricted accounts cannot access it.'
          )}
        </p>
      )}
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
          disabled={busy || !changes.length}
        >
          {defaults
            ? t(
                'lumen.adminCategories.saveDefaultCategories',
                'Save Default Categories'
              )
            : t('lumen.adminCategories.saveCategories', 'Save Categories')}
        </button>
      </div>
    </form>
  );
}

export default function AdminCategories({
  inSetup = false,
  onAvailableCategoriesSaved,
}: { inSetup?: boolean; onAvailableCategoriesSaved?: () => void } = {}) {
  const { t } = useLumenLocale();
  const formatError = useCallback(
    (error: unknown, fallback: string) => friendlyError(error, fallback, t),
    [t]
  );
  const { data, error, reload } = useApi<CategorySettings>(path, {
    formatError,
  });

  const { hash } = useLocation();
  const defaultCategoriesReady = !!data?.defaultEnabledMediaCategories;
  useEffect(() => {
    if (defaultCategoriesReady && hash === '#default-user-categories')
      document
        .getElementById('default-user-categories')
        ?.scrollIntoView({ block: 'start' });
  }, [defaultCategoriesReady, hash]);

  return (
    <>
      {!inSetup && (
        <header className="ph">
          <h1>
            {t(
              'components.Settings.SettingsCategories.title',
              'Media Categories'
            )}
          </h1>
          <div className="toolbar">
            <Link className="btn btn-quiet btn-sm" to="/me">
              {t('lumen.adminCategories.backToAccount', 'Back to Account')}
            </Link>
          </div>
        </header>
      )}
      <Section
        title={t(
          'components.Settings.SettingsCategories.groupTitle',
          'Available Categories'
        )}
      >
        <p className="note">
          {t(
            'components.Settings.SettingsCategories.description',
            'Disabled categories are hidden from discovery and block new requests. Existing requests and download history remain available.'
          )}
        </p>
        <p className="note">
          {t(
            'components.Settings.SettingsCategories.groupDescription',
            'These switches control category availability across SeerrNG.'
          )}
        </p>
        <ServiceNote
          error={error}
          what={t('lumen.adminCategories.categoriesWhat', 'media categories')}
          retry={reload}
        />
        {!data && !error && (
          <p className="note" role="status">
            {t('lumen.adminCategories.loading', 'Loading media categories…')}
          </p>
        )}
        {data?.enabledMediaCategories ? (
          <CategoryForm
            initial={data.enabledMediaCategories}
            field="enabledMediaCategories"
            onSaved={onAvailableCategoriesSaved}
          />
        ) : (
          data && (
            <p className="note">
              {t(
                'lumen.adminCategories.unavailable',
                'Category settings are unavailable.'
              )}
            </p>
          )
        )}
      </Section>
      {data?.defaultEnabledMediaCategories && (
        <Section
          title={t(
            'lumen.adminCategories.defaultUserCategories',
            'Default User Categories'
          )}
          id="default-user-categories"
        >
          <p className="note">
            {t(
              'lumen.adminCategories.defaultsDescription',
              'These choices apply to accounts that inherit the defaults. Instance-wide category restrictions still apply.'
            )}
          </p>
          <CategoryForm
            initial={data.defaultEnabledMediaCategories}
            field="defaultEnabledMediaCategories"
          />
        </Section>
      )}
      {data?.ageGate && <InstanceAgeGate initial={data.ageGate} />}
    </>
  );
}
