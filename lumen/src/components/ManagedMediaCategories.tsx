import { useRef, useState } from 'react';
import { api } from '../api';
import { friendlyError } from '../errors';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';
import { ServiceNote } from './extra';
import MediaCategorySwitches from './MediaCategorySwitches';

export default function ManagedMediaCategories({ id }: { id: number }) {
  const { t } = useLumenLocale();
  const path = `/user/${id}/settings/main`;
  const { data, error, reload } = useApi<{
    enabledMediaCategories: Record<string, boolean>;
    usesDefaultEnabledMediaCategories: boolean;
    showIndexerDetails?: boolean;
    defaultShowIndexerDetails?: boolean;
    usesDefaultShowIndexerDetails?: boolean;
  }>(path);
  const [draft, setDraft] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const [notice, setNotice] = useState('');
  const [indexerDraft, setIndexerDraft] = useState<string | null>(null);
  const working = useRef(false);

  async function save(
    change:
      | { enabledMediaCategories: Record<string, boolean> | null }
      | { showIndexerDetails: boolean | null }
  ) {
    const categoriesChanged = 'enabledMediaCategories' in change;
    if (!data || working.current) return;
    working.current = true;
    setBusy(true);
    setFailure('');
    setNotice('');
    try {
      await api(path, {
        method: 'POST',
        body: JSON.stringify(change),
      });
      const confirmed = await api<{
        enabledMediaCategories: Record<string, boolean>;
        usesDefaultEnabledMediaCategories: boolean;
        showIndexerDetails?: boolean;
        usesDefaultShowIndexerDetails?: boolean;
      }>(path, { cache: 'no-store' });
      const matches = categoriesChanged
        ? change.enabledMediaCategories === null
          ? confirmed.usesDefaultEnabledMediaCategories
          : !confirmed.usesDefaultEnabledMediaCategories &&
            Object.entries(change.enabledMediaCategories).every(
              ([key, value]) => confirmed.enabledMediaCategories[key] === value
            )
        : change.showIndexerDetails === null
          ? confirmed.usesDefaultShowIndexerDetails
          : !confirmed.usesDefaultShowIndexerDetails &&
            confirmed.showIndexerDetails === change.showIndexerDetails;
      if (!matches) {
        setFailure(
          t(
            'lumen.managedMediaCategories.confirmFailure',
            'Could not confirm the saved settings. Review the current values and retry.'
          )
        );
        reload();
        return;
      }
      if (categoriesChanged) setDraft({});
      else setIndexerDraft(null);
      setNotice(
        categoriesChanged
          ? t('lumen.managedMediaCategories.saved', 'Media categories saved.')
          : t(
              'lumen.managedMediaCategories.indexerSaved',
              'Indexer visibility saved.'
            )
      );
      reload();
    } catch (error) {
      setFailure(
        friendlyError(
          error,
          categoriesChanged
            ? t(
                'lumen.managedMediaCategories.saveFailure',
                'Could not save media categories.'
              )
            : t(
                'lumen.managedMediaCategories.indexerFailure',
                'Could not save indexer visibility.'
              ),
          t
        )
      );
    } finally {
      setBusy(false);
      working.current = false;
    }
  }

  return (
    <div>
      <ServiceNote
        error={error}
        what={t('lumen.managedMediaCategories.what', 'media categories')}
        retry={reload}
      />
      {!data && !error && (
        <p className="note" role="status">
          {t(
            'lumen.managedMediaCategories.loading',
            'Loading media categories…'
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
      {data && (
        <>
          <p className="note">
            {data.usesDefaultEnabledMediaCategories
              ? t(
                  'lumen.managedMediaCategories.serverDefaults',
                  'Using server defaults.'
                )
              : t(
                  'lumen.managedMediaCategories.accountOverrides',
                  'Using account overrides.'
                )}
          </p>
          <MediaCategorySwitches
            values={{ ...data.enabledMediaCategories, ...draft }}
            disabled={busy}
            onChange={(key, checked) => {
              setNotice('');
              setDraft((current) => {
                const next = { ...current };
                if (checked === data.enabledMediaCategories[key])
                  delete next[key];
                else next[key] = checked;
                return next;
              });
            }}
          />
          <div className="toolbar">
            <button
              className="btn btn-tonal btn-sm"
              disabled={busy || !Object.keys(draft).length}
              onClick={() => void save({ enabledMediaCategories: draft })}
            >
              {t('lumen.managedMediaCategories.save', 'Save Categories')}
            </button>
            <button
              className="btn btn-quiet btn-sm"
              disabled={busy || data.usesDefaultEnabledMediaCategories}
              onClick={() => void save({ enabledMediaCategories: null })}
            >
              {t(
                'lumen.managedMediaCategories.restore',
                'Restore Server Defaults'
              )}
            </button>
          </div>
          {data.defaultShowIndexerDetails === false && (
            <p className="note">
              {t(
                'lumen.managedMediaCategories.indexerDisabled',
                'Indexer details are disabled by the server.'
              )}
            </p>
          )}
          {data.defaultShowIndexerDetails === true && (
            <div className="toolbar">
              <label className="sel" data-layout="stacked-mobile">
                <span className="lbl">
                  {t(
                    'lumen.managedMediaCategories.indexerDetails',
                    'Indexer Details'
                  )}
                </span>
                <select
                  value={
                    indexerDraft ??
                    (data.usesDefaultShowIndexerDetails
                      ? 'default'
                      : data.showIndexerDetails
                        ? 'show'
                        : 'hide')
                  }
                  disabled={busy}
                  onChange={(event) => {
                    const value = event.target.value;
                    setIndexerDraft(value);
                    void save({
                      showIndexerDetails:
                        value === 'default' ? null : value === 'show',
                    });
                  }}
                >
                  <option value="default">
                    {t(
                      'lumen.managedMediaCategories.useDefault',
                      'Use Server Default'
                    )}
                  </option>
                  <option value="show">
                    {t('lumen.managedMediaCategories.show', 'Show')}
                  </option>
                  <option value="hide">
                    {t('lumen.managedMediaCategories.hide', 'Hide')}
                  </option>
                </select>
              </label>
              {indexerDraft !== null && failure && (
                <button
                  className="btn btn-tonal btn-sm"
                  disabled={busy}
                  onClick={() =>
                    void save({
                      showIndexerDetails:
                        indexerDraft === 'default'
                          ? null
                          : indexerDraft === 'show',
                    })
                  }
                >
                  {t('lumen.managedMediaCategories.retry', 'Retry')}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
