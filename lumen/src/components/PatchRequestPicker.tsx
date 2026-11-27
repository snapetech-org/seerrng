import { useEffect, useState } from 'react';
import { useAuth } from '../auth';
import type { PatchSelection } from '../extras';
import { canViewFollowing } from '../followPermissions';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';
import { Section } from './cards';
import { ServiceNote } from './extra';
import FollowButton from './FollowButton';

type Version = {
  id: string;
  version: string;
  releasedAt?: string;
  base: { available: boolean; region?: string; revision?: string };
};
type Project = {
  id: string;
  name: string;
  kind: 'translation' | 'hack' | 'improvement';
  language?: string;
  status: 'complete' | 'partial' | 'in-progress' | 'abandoned' | 'unknown';
  completeness?: number;
  summary?: string;
  author?: string;
  url?: string;
  differences?: string[];
  latestVersionId?: string;
  versions: Version[];
};
type Catalog = { available: boolean; results: Project[] };

const msg = {
  title: ['components.PatchProjects.heading', 'Translations and Hacks'],
  loading: ['components.PatchProjects.loading', 'Checking for patches…'],
  original: [
    'components.PatchProjects.original',
    'The original game, unmodified',
  ],
  keep: [
    'components.PatchProjects.keepOriginal',
    'Keep the original alongside the patched version',
  ],
  version: ['components.PatchProjects.version', 'Version'],
  missing: [
    'components.PatchProjects.baseMissing',
    'The base game this version needs is not available, so it cannot be prepared yet.',
  ],
  needs: ['components.PatchProjects.baseNeeds', 'Needs {region} {revision}'],
  translation: ['components.PatchProjects.translation', 'Translation'],
  hack: ['components.PatchProjects.hack', 'ROM Hack'],
  improvement: ['components.PatchProjects.improvement', 'Improvement'],
  complete: ['components.PatchProjects.complete', 'Complete'],
  partial: ['components.PatchProjects.partial', 'Partial'],
  progress: ['components.PatchProjects.inProgress', 'In Progress'],
  abandoned: ['components.PatchProjects.abandoned', 'Abandoned'],
  unknown: ['components.PatchProjects.unknownStatus', 'Completeness Unknown'],
  percent: ['components.PatchProjects.percent', '{percent}% translated'],
  by: ['components.PatchProjects.by', 'By {author}'],
  project: ['components.PatchProjects.project', 'Project Page'],
  changes: ['components.PatchProjects.differences', 'What Changes'],
  follow: ['components.PatchProjects.followProject', 'Follow This Project'],
  summary: ['components.PatchProjects.summary', 'What this request gets'],
  summaryOriginal: [
    'components.PatchProjects.summaryOriginal',
    'The original game.',
  ],
  summaryPatch: [
    'components.PatchProjects.summaryPatch',
    '{name} {version}{keep, select, true { and the unmodified original} other {}}.',
  ],
} as const;

function valid(value: Catalog | null): value is Catalog {
  return (
    !!value &&
    typeof value.available === 'boolean' &&
    Array.isArray(value.results) &&
    value.results.every(
      (p) =>
        p &&
        typeof p.id === 'string' &&
        typeof p.name === 'string' &&
        ['translation', 'hack', 'improvement'].includes(p.kind) &&
        ['complete', 'partial', 'in-progress', 'abandoned', 'unknown'].includes(
          p.status
        ) &&
        Array.isArray(p.versions) &&
        p.versions.every(
          (v) =>
            v &&
            typeof v.id === 'string' &&
            typeof v.version === 'string' &&
            typeof v.base?.available === 'boolean'
        )
    )
  );
}

export default function PatchRequestPicker({
  catalogKey,
  platform,
  disabled,
  onChange,
}: {
  catalogKey: string;
  platform: string;
  disabled: boolean;
  onChange: (selection: PatchSelection | null | undefined) => void;
}) {
  const { t } = useLumenLocale();
  const { user } = useAuth();
  const query = new URLSearchParams({ catalogKey, platform });
  const request = useApi<Catalog>('/patches/search?' + query);
  const data = valid(request.data) ? request.data : null;
  const [projectId, setProjectId] = useState('');
  const [versionId, setVersionId] = useState('');
  const [keepOriginal, setKeepOriginal] = useState(true);
  const project = data?.results.find((item) => item.id === projectId);
  const version =
    project?.versions.find(
      (item) => item.id === (versionId || project.latestVersionId)
    ) ?? project?.versions[0];
  const unprepared = !!version && !version.base.available;
  const selectPatch = (
    item: Project,
    selected: Version | undefined,
    keep: boolean
  ) => {
    if (!selected || !selected.base.available) {
      onChange(undefined);
      return;
    }
    onChange({
      kind: 'patch',
      projectId: item.id,
      versionId: selected.id,
      keepOriginal: keep,
    });
  };
  const text = (
    key: keyof typeof msg,
    values?: Record<string, string | number>
  ) => t(msg[key][0], msg[key][1], values);
  const patchSummary = (item: Project, selected: Version) => {
    const template = text('summaryPatch');
    const selector =
      /\{keep,\s*select,\s*true\s*\{([^{}]*)\}\s*other\s*\{([^{}]*)\}\}/;
    const match = template.match(selector);
    return (
      match
        ? template.replace(match[0], keepOriginal ? match[1] : match[2])
        : template
    ).replace(/\{(name|version)\}/g, (_placeholder, key: string) =>
      key === 'name' ? item.name : selected.version
    );
  };

  useEffect(() => {
    if (
      request.error ||
      (request.data && !data) ||
      (data && !data.available) ||
      (data && !data.results.length) ||
      (!projectId && data)
    )
      onChange(null);
    else if (!data) onChange(undefined);
    else if (!project || !version || unprepared) onChange(undefined);
    else
      onChange({
        kind: 'patch',
        projectId: project.id,
        versionId: version.id,
        keepOriginal,
      });
  }, [
    request.error,
    request.data,
    data,
    projectId,
    project,
    version,
    unprepared,
    keepOriginal,
    onChange,
  ]);

  if (request.error || (request.data && !data))
    return (
      <ServiceNote
        error={request.error || 'Invalid patch catalogue response.'}
        what={text('title')}
        retry={request.reload}
      />
    );
  if (!data)
    return (
      <p className="note" role="status">
        {text('loading')}
      </p>
    );
  if (!data.available || !data.results.length) return null;
  const kinds = {
    translation: 'translation',
    hack: 'hack',
    improvement: 'improvement',
  } as const;
  const statuses = {
    complete: 'complete',
    partial: 'partial',
    'in-progress': 'progress',
    abandoned: 'abandoned',
    unknown: 'unknown',
  } as const;
  return (
    <Section title={text('title')}>
      <div className="setlist" role="radiogroup" aria-label={text('title')}>
        <label className="set">
          <input
            type="radio"
            name={'patch-' + catalogKey + '-' + platform}
            checked={!projectId}
            disabled={disabled}
            onChange={() => {
              onChange(null);
              setProjectId('');
              setVersionId('');
            }}
          />
          <b>{text('original')}</b>
        </label>
        {data.results.map((item) => (
          <div className="set" key={item.id}>
            <input
              type="radio"
              aria-label={item.name}
              name={'patch-' + catalogKey + '-' + platform}
              checked={projectId === item.id}
              disabled={disabled}
              onChange={() => {
                onChange(undefined);
                setProjectId(item.id);
                setVersionId('');
              }}
            />
            <div>
              <b>{item.name}</b>
              <small>
                {text(kinds[item.kind])}
                {item.language
                  ? ' · ' + item.language.toUpperCase()
                  : ''} · {text(statuses[item.status])}
                {item.completeness !== undefined && item.status !== 'complete'
                  ? ' · ' +
                    text('percent', {
                      percent: Math.round(item.completeness * 100),
                    })
                  : ''}
              </small>
              {item.summary && <p className="note">{item.summary}</p>}
              {item.author && (
                <small>{text('by', { author: item.author })}</small>
              )}
              {item.url && /^https?:\/\//.test(item.url) && (
                <a href={item.url} target="_blank" rel="noopener noreferrer">
                  {text('project')}
                </a>
              )}
              {projectId === item.id && (
                <div className="setlist">
                  {!!item.differences?.length && (
                    <p className="note">
                      {text('changes')}: {item.differences.join(' · ')}
                    </p>
                  )}
                  <label>
                    {text('version')}
                    <select
                      value={version?.id ?? ''}
                      disabled={disabled}
                      onChange={(event) => {
                        const selected = item.versions.find(
                          (entry) => entry.id === event.target.value
                        );
                        selectPatch(item, selected, keepOriginal);
                        setVersionId(event.target.value);
                      }}
                    >
                      {item.versions.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.version}
                          {v.releasedAt
                            ? ' · ' + v.releasedAt.slice(0, 10)
                            : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                  {version && (
                    <p className="note">
                      {text('needs', {
                        region: version.base.region ?? '',
                        revision: version.base.revision ?? '',
                      })}
                      {unprepared ? ' — ' + text('missing') : ''}
                    </p>
                  )}
                  <label>
                    <input
                      type="checkbox"
                      checked={keepOriginal}
                      disabled={disabled}
                      onChange={(event) => {
                        const keep = event.currentTarget.checked;
                        selectPatch(item, version, keep);
                        setKeepOriginal(keep);
                      }}
                    />{' '}
                    {text('keep')}
                  </label>
                  {canViewFollowing(user?.permissions) && (
                    <FollowButton
                      label={text('follow')}
                      subject={{
                        kind: 'patch-project',
                        subjectKey: 'patch:' + item.id,
                        subjectLabel: item.name,
                        conditions: { ref: { projectId: item.id } },
                      }}
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      <p className="note" role="status">
        <b>{text('summary')}:</b>{' '}
        {project && version
          ? patchSummary(project, version)
          : text('summaryOriginal')}
      </p>
    </Section>
  );
}
