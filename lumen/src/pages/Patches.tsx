import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth';
import { ExtraHeader, ServiceNote } from '../components/extra';
import FollowButton from '../components/FollowButton';
import { canViewFollowing } from '../followPermissions';
import { useApi } from '../hooks';

const KINDS = {
  translation: 'Translations',
  hack: 'ROM Hacks',
  improvement: 'Improvements',
};
const LANGUAGES = ['en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'pl'];
const STATUS = {
  complete: 'Complete',
  partial: 'Partial',
  'in-progress': 'In Progress',
  abandoned: 'Abandoned',
  unknown: 'Completeness Unknown',
};

interface PatchProject {
  id: string;
  name: string;
  kind: keyof typeof KINDS;
  language?: string;
  status: keyof typeof STATUS;
  summary?: string;
  game: { catalogKey?: string; title: string };
  latestVersionId?: string;
  versions: { id: string; version: string }[];
}

function gameLink(key?: string) {
  if (!key) return;
  if (/^dat-[0-9a-f]{64}$/.test(key)) {
    return `/game/retro/${encodeURIComponent(key)}?dat=1`;
  }
  if (/^[1-9]\d{0,9}$/.test(key) && Number(key) <= 2_147_483_647) {
    return `/game/retro/${key}`;
  }
}

export default function Patches() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const search = (params.get('q') ?? '').trim().slice(0, 200);
  const requestedKind = params.get('kind') ?? '';
  const kind = Object.hasOwn(KINDS, requestedKind) ? requestedKind : '';
  const requestedLanguage = params.get('language') ?? 'en';
  const language = LANGUAGES.includes(requestedLanguage)
    ? requestedLanguage
    : '';
  const completeOnly = params.get('completeOnly') !== 'false';
  const cursor = (params.get('cursor') ?? '').slice(0, 256);
  const query = new URLSearchParams();
  if (search) query.set('q', search);
  if (kind) query.set('kind', kind);
  if (language) query.set('language', language);
  if (completeOnly) query.set('completeOnly', 'true');
  if (cursor) query.set('cursor', cursor);
  const { data, error, reload } = useApi<{
    available: boolean;
    results: PatchProject[];
    nextCursor?: string | null;
  }>(`/patches/search?${query}`);

  const nextCursor = data?.nextCursor;

  return (
    <>
      <ExtraHeader title="Translations and Hacks" />
      <form
        key={query.toString()}
        className="toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const filters = new URLSearchParams();
          for (const key of ['q', 'kind', 'language']) {
            filters.set(key, String(form.get(key) ?? '').trim());
          }
          if (!form.has('completeOnly')) filters.set('completeOnly', 'false');
          setParams(filters);
        }}
      >
        <label className="search">
          <input
            name="q"
            type="search"
            aria-label="Search Titles"
            defaultValue={search}
            maxLength={200}
          />
        </label>
        <label className="sel">
          <span className="lbl">Kind</span>
          <select name="kind" aria-label="Kind" defaultValue={kind}>
            <option value="">Any Kind</option>
            {Object.entries(KINDS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="sel">
          <span className="lbl">Language</span>
          <select name="language" aria-label="Language" defaultValue={language}>
            <option value="">Any Language</option>
            {LANGUAGES.map((code) => (
              <option key={code} value={code}>
                {code.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
        <label>
          <input
            name="completeOnly"
            type="checkbox"
            defaultChecked={completeOnly}
          />{' '}
          Completed Projects Only
        </label>
        <button className="btn btn-tonal btn-sm" type="submit">
          Apply Filters
        </button>
      </form>
      <ServiceNote error={error} what="patch catalogue" retry={reload} />
      {!data && !error && (
        <p role="status" className="note">
          Loading projects…
        </p>
      )}
      {data && !data.available && (
        <ServiceNote
          error="This SeerrNG instance could not load the ROMarrNG patch catalogue."
          what="patch catalogue"
          retry={reload}
        />
      )}
      {data?.available && data.results.length === 0 && (
        <p className="note">No projects matched.</p>
      )}
      {!!data?.results.length && (
        <ul className="setlist">
          {data.results.map((project) => {
            const game = gameLink(project.game.catalogKey);
            const latest =
              project.versions.find(
                (version) => version.id === project.latestVersionId
              ) ?? project.versions[0];
            return (
              <li className="set" key={project.id}>
                <div>
                  <b>{project.name}</b>
                  <small>
                    {[
                      project.game.title,
                      KINDS[project.kind],
                      project.language?.toUpperCase(),
                      STATUS[project.status],
                      latest && `Latest ${latest.version}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </small>
                  {project.summary && <small>{project.summary}</small>}
                </div>
                <div className="toolbar">
                  {game && (
                    <Link className="go" to={game}>
                      Open Game
                    </Link>
                  )}
                  {canViewFollowing(user?.permissions) && (
                    <FollowButton
                      subject={{
                        kind: 'patch-project',
                        subjectKey: `patch:${project.id}`,
                        subjectLabel: project.name,
                        conditions: { ref: { projectId: project.id } },
                      }}
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {(cursor || data?.nextCursor) && (
        <nav className="toolbar" aria-label="Patch Catalogue Pages">
          {cursor && (
            <button
              className="btn btn-quiet btn-sm"
              type="button"
              onClick={() => {
                const first = new URLSearchParams(params);
                first.delete('cursor');
                setParams(first);
              }}
            >
              First Page
            </button>
          )}
          {nextCursor && nextCursor !== cursor && (
            <button
              className="btn btn-quiet btn-sm"
              type="button"
              onClick={() => {
                const next = new URLSearchParams(params);
                next.set('cursor', nextCursor);
                setParams(next);
              }}
            >
              Next Page
            </button>
          )}
        </nav>
      )}
    </>
  );
}
