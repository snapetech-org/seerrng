import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api';
import { Section } from '../components/cards';
import { ConfirmSheet } from '../components/ConfirmSheet';
import { ServiceNote } from '../components/extra';
import { KeywordResults } from '../components/SubjectTagFilter';
import { friendlyError } from '../errors';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';

const serviceTypes = [
  ['radarrServiceId', 'radarr', 'Radarr'],
  ['sonarrServiceId', 'sonarr', 'Sonarr'],
  ['lidarrServiceId', 'lidarr', 'Lidarr'],
  ['readarrServiceId', 'readarr', 'Bookshelf'],
] as const;
type ServiceKey = (typeof serviceTypes)[number][0];

const fields = [
  ['users', 'User IDs'],
  ['genre', 'Genres'],
  ['language', 'Languages'],
  ['keywords', 'Keywords'],
  ['productionCountries', 'Production Countries'],
  ['profileId', 'Quality Profile ID'],
  ['languageProfileId', 'Language Profile ID'],
  ['rootFolder', 'Root Folder'],
  ['tags', 'Tag IDs'],
] as const;

type Rule = { id: number } & Partial<Record<ServiceKey, number | null>> &
  Partial<Record<(typeof fields)[number][0], string | number | null>>;
type Service = { id: number; name: string };
type DestinationOptions = {
  profiles: { id: number; name: string }[];
  languageProfiles?: { id: number; name: string }[] | null;
  rootFolders: { path?: string }[];
  tags: { id: number; label: string }[];
};

function sameRule(left: Rule, right: Rule) {
  return (
    left.id === right.id &&
    [...serviceTypes.map(([key]) => key), ...fields.map(([key]) => key)].every(
      (key) => left[key] === right[key]
    )
  );
}

function RulesForService({
  rules,
  service,
  onEdit,
  onDelete,
  editing,
}: {
  rules: Rule[];
  editing: boolean;
  onEdit: (rule: Rule) => void;
  onDelete: (rule: Rule) => void;
  service: (typeof serviceTypes)[number];
}) {
  const { t } = useLumenLocale();
  const [key, endpoint, label] = service;
  const services = useApi<Service[]>(`/settings/${endpoint}`);
  return (
    <Section title={t(`lumen.override.service.${endpoint}`, label)}>
      <ServiceNote
        what={t('lumen.override.serviceNames', '{service} service names', {
          service: t(`lumen.override.service.${endpoint}`, label),
        })}
        error={services.error}
        retry={services.reload}
      />
      {rules.map((rule) => {
        const serviceId = rule[key];
        const name = services.data?.find(({ id }) => id === serviceId)?.name;
        return (
          <Section
            key={rule.id}
            title={t('lumen.override.ruleTitle', '{service} · Rule {id}', {
              service: name || `${label} Service ${serviceId}`,
              id: rule.id,
            })}
          >
            <dl className="setlist">
              {fields.map(([field, title]) => {
                const value = rule[field];
                if (value == null || value === '') return null;
                return (
                  <div className="set" key={field}>
                    <dt>
                      <b>{t(`lumen.override.field.${field}`, title)}</b>
                    </dt>
                    <dd>{value}</dd>
                  </div>
                );
              })}
            </dl>
            <div className="toolbar">
              <button
                className="btn btn-tonal btn-sm"
                disabled={editing}
                onClick={() => onEdit(rule)}
              >
                {t('lumen.override.edit', 'Edit Rule')}
              </button>
              <button
                className="btn btn-quiet btn-sm"
                disabled={editing}
                onClick={() => onDelete(rule)}
              >
                {t('lumen.override.delete', 'Delete Rule')}
              </button>
            </div>
          </Section>
        );
      })}
    </Section>
  );
}

function ConditionChoices({
  provider,
  values,
  onChange,
  busy,
}: {
  provider: (typeof serviceTypes)[number][1];
  values: Record<string, string>;
  onChange: (field: string, value: string) => void;
  busy: boolean;
}) {
  const { t } = useLumenLocale();
  const video = provider === 'radarr' || provider === 'sonarr';
  const [userSearch, setUserSearch] = useState('');
  const [userQuery, setUserQuery] = useState('');
  const [keywordSearch, setKeywordSearch] = useState('');
  const [keywordQuery, setKeywordQuery] = useState('');
  const [keywordPage, setKeywordPage] = useState(1);
  const users = useApi<{ results: { id: number; displayName: string }[] }>(
    `/user?take=50&sort=displayname&q=${encodeURIComponent(userQuery)}`,
    { currentPathOnly: true }
  );
  const genres = useApi<{ id: number; name: string }[]>(
    video ? `/genres/${provider === 'radarr' ? 'movie' : 'tv'}` : null,
    { currentPathOnly: true }
  );
  const languages = useApi<{ iso_639_1: string; english_name: string }[]>(
    provider !== 'lidarr' ? '/languages' : null
  );
  const countries = useApi<{ iso_3166_1: string; english_name: string }[]>(
    video ? '/regions' : null
  );
  const picked = (field: string) =>
    values[field]
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
  function toggle(field: string, value: string) {
    const current = picked(field);
    onChange(
      field,
      (current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value]
      ).join(',')
    );
  }
  const choices = [
    [
      'users',
      t('lumen.override.user', 'User'),
      users.data?.results.map(({ id, displayName }) => [
        String(id),
        displayName,
      ]),
    ],
    [
      'genre',
      t('lumen.override.genre', 'Genre'),
      genres.data?.map(({ id, name }) => [String(id), name]),
    ],
    [
      'language',
      t('lumen.override.language', 'Language'),
      languages.data?.map(({ iso_639_1, english_name }) => [
        iso_639_1,
        english_name,
      ]),
    ],
    [
      'productionCountries',
      t('lumen.override.productionCountry', 'Production Country'),
      countries.data?.map(({ iso_3166_1, english_name }) => [
        iso_3166_1,
        english_name,
      ]),
    ],
  ] as const;

  return (
    <Section
      title={t('lumen.override.findConditions', 'Find Conditions by Name')}
    >
      {(
        [
          ['users', users],
          ['genres', genres],
          ['languages', languages],
          [
            t('lumen.override.productionCountries', 'production countries'),
            countries,
          ],
        ] as const
      ).map(([what, lookup]) => (
        <ServiceNote
          key={what}
          what={what}
          title={t('lumen.override.lookupLoadError', 'Could not load {what}', {
            what,
          })}
          retryLabel={t('lumen.override.retry', 'Retry')}
          error={lookup.error}
          retry={lookup.reload}
        />
      ))}
      <div className="toolbar">
        <label className="sel">
          {t('lumen.override.searchUsers', 'Search Users')}
          <input
            className="cfg-input"
            type="search"
            value={userSearch}
            maxLength={80}
            disabled={busy}
            onChange={(event) => setUserSearch(event.target.value)}
          />
        </label>
        <button
          className="btn btn-tonal btn-sm"
          type="button"
          disabled={busy}
          onClick={() => setUserQuery(userSearch.trim())}
        >
          {t('lumen.override.findUsers', 'Find Users')}
        </button>
      </div>
      <div className="setlist">
        {choices.map(
          ([field, label, options]) =>
            options && (
              <label className="set cfg-row" key={field}>
                <b>{label}</b>
                <select
                  className="cfg-select"
                  value=""
                  disabled={busy}
                  onChange={(event) => {
                    if (event.target.value) toggle(field, event.target.value);
                  }}
                >
                  <option value="">
                    {t(
                      'lumen.override.chooseAddRemove',
                      'Choose to add or remove'
                    )}
                  </option>
                  {[...options]
                    .sort((a, b) => a[1].localeCompare(b[1]))
                    .map(([id, name]) => (
                      <option key={id} value={id}>
                        {name}
                        {picked(field).includes(id)
                          ? ` (${t('lumen.override.selected', 'selected')})`
                          : ''}
                      </option>
                    ))}
                </select>
              </label>
            )
        )}
      </div>
      {video && (
        <>
          <div className="toolbar">
            <label className="sel">
              {t('lumen.override.searchKeywords', 'Search Keywords')}
              <input
                className="cfg-input"
                type="search"
                value={keywordSearch}
                maxLength={100}
                disabled={busy}
                onChange={(event) => setKeywordSearch(event.target.value)}
              />
            </label>
            <button
              className="btn btn-tonal btn-sm"
              type="button"
              disabled={busy || !keywordSearch.trim()}
              onClick={() => {
                setKeywordPage(1);
                setKeywordQuery(keywordSearch.trim());
              }}
            >
              {t('lumen.override.findKeywords', 'Find Keywords')}
            </button>
          </div>
          {keywordQuery && (
            <KeywordResults
              query={keywordQuery}
              page={keywordPage}
              selected={picked('keywords')}
              toggle={({ id }) => toggle('keywords', String(id))}
              setPage={setKeywordPage}
              disabled={busy}
              limit={100}
            />
          )}
        </>
      )}
    </Section>
  );
}

function RuleEditor({
  rule,
  onSaved,
  onCancel,
}: {
  rule: Rule | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const { t } = useLumenLocale();
  const radarr = useApi<Service[]>('/settings/radarr');
  const sonarr = useApi<Service[]>('/settings/sonarr');
  const lidarr = useApi<Service[]>('/settings/lidarr');
  const readarr = useApi<Service[]>('/settings/readarr');
  const serviceLists = [radarr, sonarr, lidarr, readarr];
  const [target, setTarget] = useState(() => {
    const key = serviceTypes.find(([key]) => rule?.[key] != null)?.[0];
    return key ? `${key}:${rule?.[key]}` : '';
  });
  const [values, setValues] = useState(() =>
    Object.fromEntries(
      fields.map(([field]) => {
        const value = String(rule?.[field] ?? '');
        return [
          field,
          field === 'language' || field === 'productionCountries'
            ? value.replaceAll('|', ',')
            : value,
        ];
      })
    )
  );
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const [createdRuleId, setCreatedRuleId] = useState<number>();
  const pending = useRef(false);
  const serviceSelect = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    serviceSelect.current?.focus();
  }, []);
  const [targetKey, targetId] = target.split(':');
  const provider = serviceTypes.find(([key]) => key === targetKey)?.[1];
  const destination = useApi<DestinationOptions>(
    provider && /^\d+$/.test(targetId)
      ? `/service/${provider}/${targetId}`
      : null,
    { currentPathOnly: true }
  );
  const serviceChoices = destination.data && {
    profileId: destination.data.profiles.map(({ id, name }) => [
      String(id),
      name,
    ]),
    languageProfileId: (destination.data.languageProfiles ?? []).map(
      ({ id, name }) => [String(id), name]
    ),
    rootFolder: destination.data.rootFolders.flatMap(({ path }) =>
      path ? [[path, path]] : []
    ),
  };
  const selectedTags = values.tags
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
  const catalog =
    targetKey === 'lidarrServiceId' || targetKey === 'readarrServiceId';
  const visibleFields = fields.filter(
    ([key]) =>
      (key !== 'productionCountries' || !catalog) &&
      (key !== 'language' || targetKey !== 'lidarrServiceId') &&
      (key !== 'languageProfileId' || targetKey === 'sonarrServiceId')
  );
  const options = serviceTypes.flatMap(
    ([key, , label], index) =>
      serviceLists[index].data?.map(({ id, name }) => ({
        value: `${key}:${id}`,
        label: `${label} · ${name}`,
      })) ?? []
  );

  async function save() {
    if (!targetId || pending.current) return;
    const activeFields = new Set(visibleFields.map(([field]) => field));
    const conditions = fields.slice(0, 5);
    const overrides = fields.slice(5);
    const hasValue = ([field]: (typeof fields)[number]) =>
      activeFields.has(field) && values[field].trim();
    if (!conditions.some(hasValue) || !overrides.some(hasValue)) {
      setFailure(
        t(
          'lumen.override.requiredConditionSetting',
          'Enter at least one condition and one setting to override.'
        )
      );
      return;
    }
    pending.current = true;
    setBusy(true);
    setFailure('');
    try {
      const service = serviceTypes.map(([key]) => [
        key,
        key === targetKey ? Number(targetId) : null,
      ]);
      const settings = fields.map(([field]) => {
        const value = activeFields.has(field) ? values[field].trim() : '';
        return [
          field,
          value
            ? field === 'profileId' || field === 'languageProfileId'
              ? Number(value)
              : field === 'language' || field === 'productionCountries'
                ? value.replaceAll(',', '|')
                : value
            : null,
        ];
      });
      const recordId = rule?.id ?? createdRuleId;
      const saved = await api<Rule>(
        recordId === undefined ? '/overrideRule' : `/overrideRule/${recordId}`,
        {
          method: recordId === undefined ? 'POST' : 'PUT',
          body: JSON.stringify(Object.fromEntries([...service, ...settings])),
        }
      );
      if (!Number.isSafeInteger(saved.id) || saved.id < 1) {
        setFailure(
          t(
            'lumen.override.saveConfirmFailure',
            'The server did not confirm the saved rule. Keep this form open and try again.'
          )
        );
        return;
      }
      if (!rule) setCreatedRuleId(saved.id);
      let readback: Rule[];
      try {
        readback = await api<Rule[]>('/overrideRule', { cache: 'no-store' });
      } catch {
        setFailure(
          t(
            'lumen.override.saveConfirmFailure',
            'The server did not confirm the saved rule. Keep this form open and try again.'
          )
        );
        return;
      }
      if (!readback.some((persisted) => sameRule(saved, persisted))) {
        setFailure(
          t(
            'lumen.override.saveConfirmFailure',
            'The server did not confirm the saved rule. Keep this form open and try again.'
          )
        );
        return;
      }
      onSaved();
    } catch (error) {
      setFailure(
        friendlyError(
          error,
          t(
            'lumen.override.saveFailed',
            'Could not save the request override rule.'
          )
        )
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <Section
      title={
        rule
          ? t('lumen.override.editRuleId', 'Edit Rule {id}', { id: rule.id })
          : t('lumen.override.newRule', 'New Override Rule')
      }
    >
      {serviceTypes.map(([, , label], index) => (
        <ServiceNote
          key={label}
          what={t('lumen.override.services', '{service} services', {
            service: label,
          })}
          title={t(
            'lumen.override.serviceLoadError',
            'Could not load {service} services',
            { service: label }
          )}
          retryLabel={t('lumen.override.retry', 'Retry')}
          error={serviceLists[index].error}
          retry={serviceLists[index].reload}
        />
      ))}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div className="setlist">
          <label className="set cfg-row">
            <b>{t('lumen.override.service', 'Service')}</b>
            <select
              ref={serviceSelect}
              className="cfg-select"
              required
              disabled={busy}
              value={target}
              onChange={(event) => {
                const next = event.target.value;
                if (next.split(':')[0] !== targetKey) {
                  setValues((previous) => ({
                    ...previous,
                    genre: '',
                    keywords: '',
                    language: '',
                    productionCountries: '',
                    profileId: '',
                    languageProfileId: '',
                    rootFolder: '',
                    tags: '',
                  }));
                } else {
                  setValues((previous) => ({
                    ...previous,
                    profileId: '',
                    languageProfileId: '',
                    rootFolder: '',
                    tags: '',
                  }));
                }
                setTarget(next);
              }}
            >
              <option value="">
                {t('lumen.override.chooseService', 'Choose a service')}
              </option>
              {target && !options.some(({ value }) => value === target) && (
                <option value={target} disabled>
                  {t(
                    'lumen.override.previousService',
                    'Previously selected service'
                  )}
                </option>
              )}
              {options.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {target && (
          <>
            <ServiceNote
              what={t(
                'lumen.override.destinationChoices',
                'destination choices'
              )}
              title={t(
                'lumen.override.destinationLoadError',
                'Could not load destination choices'
              )}
              retryLabel={t('lumen.override.retry', 'Retry')}
              error={destination.error}
              retry={destination.reload}
            />
            <p className="note">
              {t(
                'lumen.override.conditionHelp',
                'Every populated condition must match. Use commas to enter multiple values.'
              )}
            </p>
            <div className="setlist">
              {visibleFields.map(([field, label]) => {
                if (
                  serviceChoices &&
                  (field === 'profileId' ||
                    field === 'languageProfileId' ||
                    field === 'rootFolder')
                ) {
                  const choices = serviceChoices[field];
                  return (
                    <label className="set cfg-row" key={field}>
                      <b>
                        {t(
                          `lumen.override.choice.${field}`,
                          label.replace(' ID', '')
                        )}
                      </b>
                      <select
                        className="cfg-select"
                        disabled={busy}
                        value={values[field]}
                        onChange={(event) =>
                          setValues({ ...values, [field]: event.target.value })
                        }
                      >
                        <option value="">
                          {t(
                            'lumen.override.serviceDefault',
                            'Use service default'
                          )}
                        </option>
                        {values[field] &&
                          !choices.some(
                            ([value]) => value === values[field]
                          ) && (
                            <option value={values[field]}>
                              {t(
                                'lumen.override.savedValue',
                                'Saved value ({value})',
                                { value: values[field] }
                              )}
                            </option>
                          )}
                        {choices.map(([value, name]) => (
                          <option key={value} value={value}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </label>
                  );
                }
                const number =
                  field === 'profileId' || field === 'languageProfileId';
                const display =
                  !catalog && field === 'genre'
                    ? t('lumen.override.tmdbGenreIds', 'TMDB Genre IDs')
                    : !catalog && field === 'keywords'
                      ? t('lumen.override.tmdbKeywordIds', 'TMDB Keyword IDs')
                      : field === 'language'
                        ? t('lumen.override.languageCodes', 'Language Codes')
                        : field === 'productionCountries'
                          ? t(
                              'lumen.override.productionCountryCodes',
                              'Production Country Codes'
                            )
                          : t(`lumen.override.field.${field}`, label);
                return (
                  <label className="set cfg-row" key={field}>
                    <b>{display}</b>
                    <input
                      className="cfg-input"
                      type={number ? 'number' : 'text'}
                      min={number ? 0 : undefined}
                      step={number ? 1 : undefined}
                      disabled={busy}
                      value={values[field]}
                      onChange={(event) =>
                        setValues({ ...values, [field]: event.target.value })
                      }
                    />
                  </label>
                );
              })}
            </div>
            {provider && (
              <ConditionChoices
                key={provider}
                provider={provider}
                busy={busy}
                values={values}
                onChange={(field, value) =>
                  setValues((previous) => ({ ...previous, [field]: value }))
                }
              />
            )}
            {!!destination.data?.tags.length && (
              <Section title={t('lumen.override.serviceTags', 'Service Tags')}>
                <div className="setlist">
                  {destination.data.tags.map(({ id, label }) => {
                    const value = String(id);
                    return (
                      <label className="set cfg-row" key={id}>
                        <b>{label}</b>
                        <input
                          type="checkbox"
                          checked={selectedTags.includes(value)}
                          disabled={busy}
                          onChange={(event) => {
                            const tags = event.target.checked
                              ? [...selectedTags, value]
                              : selectedTags.filter((tag) => tag !== value);
                            setValues({ ...values, tags: tags.join(',') });
                          }}
                        />
                      </label>
                    );
                  })}
                </div>
              </Section>
            )}
          </>
        )}
        {failure && (
          <p className="note" role="alert">
            {failure}
          </p>
        )}
        <div className="toolbar">
          <button
            type="submit"
            className="btn btn-primary btn-sm"
            disabled={busy || !options.some(({ value }) => value === target)}
          >
            {t('lumen.override.saveRule', 'Save Rule')}
          </button>
          <button
            type="button"
            className="btn btn-quiet btn-sm"
            onClick={onCancel}
            disabled={busy}
          >
            {t('lumen.override.cancel', 'Cancel')}
          </button>
        </div>
      </form>
    </Section>
  );
}

export default function AdminOverrideRules() {
  const { t } = useLumenLocale();
  const rules = useApi<Rule[]>('/overrideRule');
  const [editing, setEditing] = useState<Rule | null>();
  const [deleting, setDeleting] = useState<Rule>();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const [deleteAccepted, setDeleteAccepted] = useState(false);
  const pending = useRef(false);

  async function deleteRule() {
    if (!deleting || pending.current) return;
    pending.current = true;
    setBusy(true);
    setFailure('');
    try {
      if (!deleteAccepted) {
        try {
          await api(`/overrideRule/${deleting.id}`, { method: 'DELETE' });
          setDeleteAccepted(true);
        } catch (error) {
          if (!(error instanceof ApiError) || error.status !== 404) throw error;
          setDeleteAccepted(true);
        }
      }
      let readback: Rule[];
      try {
        readback = await api<Rule[]>('/overrideRule', { cache: 'no-store' });
      } catch {
        setFailure(
          t(
            'lumen.override.deleteConfirmFailure',
            'The server did not confirm rule removal. Keep this dialog open and try again.'
          )
        );
        return;
      }
      if (readback.some(({ id }) => id === deleting.id)) {
        setDeleteAccepted(false);
        setFailure(
          t(
            'lumen.override.deleteConfirmFailure',
            'The server did not confirm rule removal. Keep this dialog open and try again.'
          )
        );
        return;
      }
      setDeleting(undefined);
      setDeleteAccepted(false);
      rules.reload();
    } catch (error) {
      setFailure(
        friendlyError(
          error,
          t(
            'lumen.override.deleteFailed',
            'Could not delete the request override rule.'
          )
        )
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <header className="ph">
        <h1>{t('lumen.override.title', 'Request Override Rules')}</h1>
      </header>
      <div className="toolbar">
        <Link className="btn btn-quiet btn-sm" to="/admin">
          {t('lumen.admin.title', 'Administration')}
        </Link>
        <button
          className="btn btn-tonal btn-sm"
          disabled={editing !== undefined || !rules.data}
          onClick={() => setEditing(null)}
        >
          {t('lumen.override.newRule', 'New Override Rule')}
        </button>
      </div>
      <ServiceNote
        what={t('lumen.override.rules', 'request override rules')}
        title={t(
          'lumen.override.rulesLoadError',
          'Could not load request override rules'
        )}
        retryLabel={t('lumen.override.retry', 'Retry')}
        error={rules.error}
        retry={rules.reload}
      />
      {!rules.data && !rules.error && (
        <p className="note" role="status">
          {t('lumen.override.loading', 'Loading request override rules…')}
        </p>
      )}
      {rules.data?.length === 0 && (
        <p className="note">
          {t('lumen.override.empty', 'No request override rules configured.')}
        </p>
      )}
      {editing !== undefined && (
        <RuleEditor
          key={editing?.id ?? 'new'}
          rule={editing}
          onCancel={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            rules.reload();
          }}
        />
      )}
      {deleting && (
        <ConfirmSheet
          title={t('lumen.override.deleteTitle', 'Delete Override Rule')}
          body={t(
            'lumen.override.deleteBody',
            'Future requests will stop using this rule.'
          )}
          confirm={t('lumen.override.delete', 'Delete Rule')}
          busy={busy}
          onConfirm={() => void deleteRule()}
          onClose={() => {
            if (!busy) {
              setDeleting(undefined);
              setDeleteAccepted(false);
              setFailure('');
            }
          }}
        >
          {failure && (
            <p className="note" role="alert">
              {failure}
            </p>
          )}
        </ConfirmSheet>
      )}
      {serviceTypes.map((service) => {
        const matches = rules.data?.filter((rule) => rule[service[0]] != null);
        return matches?.length ? (
          <RulesForService
            key={service[0]}
            rules={matches}
            service={service}
            editing={editing !== undefined}
            onEdit={setEditing}
            onDelete={(rule) => {
              setDeleteAccepted(false);
              setDeleting(rule);
            }}
          />
        ) : null;
      })}
    </>
  );
}
