import { useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth';
import { ExtraHeader, ServiceNote } from '../components/extra';
import FollowButton from '../components/FollowButton';
import { useToast } from '../components/toast';
import { friendlyError } from '../errors';
import { GAME_LABEL, requestGame, type Game } from '../extras';
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
  game: { catalogKey?: string; title: string; platformSlug?: string };
  latestVersionId?: string;
  versions: {
    id: string;
    version: string;
    notes?: string;
    base?: { available: boolean; region?: string; revision?: string };
  }[];
}

const PATCH_ID = /^[A-Za-z0-9][A-Za-z0-9:_.-]{0,127}$/;

function gameLink(key?: string, category = 'retro') {
  if (!key) return;
  if (/^dat-[0-9a-f]{64}$/.test(key)) {
    return `/game/${category}/${encodeURIComponent(key)}?dat=1`;
  }
  if (/^[1-9]\d{0,9}$/.test(key) && Number(key) <= 2_147_483_647) {
    return `/game/${category}/${key}`;
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
                  {PATCH_ID.test(project.id) && (
                    <Link
                      className="go"
                      to={`/patches/${encodeURIComponent(project.id)}`}
                    >
                      Choose a Version
                    </Link>
                  )}
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

export function PatchDetail() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const { user } = useAuth();
  const canRequest = canViewFollowing(user?.permissions);
  const patch = useApi<PatchProject>(
    PATCH_ID.test(id) ? `/patches/projects/${encodeURIComponent(id)}` : null
  );
  const project = patch.data?.id === id ? patch.data : null;
  const [category, setCategory] = useState<'retro' | 'modern'>('retro');
  const key = project?.game.catalogKey;
  const link = gameLink(key, category);
  const lookupQuery = new URLSearchParams({ category });
  const isDat = key?.startsWith('dat-');
  if (isDat) lookupQuery.set('catalogProvider', 'dat');
  const game = useApi<Game>(
    link && key && canRequest
      ? `/request/software/catalog/games/${encodeURIComponent(key)}?${lookupQuery}`
      : null
  );
  const resolvedGame = game.data;
  const matchingGame = isDat
    ? resolvedGame?.catalogProvider === 'dat' && resolvedGame.catalogId === key
    : resolvedGame?.catalogProvider === 'igdb' &&
      String(resolvedGame.igdbId) === key;
  const systems = matchingGame
    ? (resolvedGame?.emulationSystems ?? []).filter(
        (option) =>
          option.group === category &&
          (!project?.game.platformSlug ||
            option.slug === project.game.platformSlug)
      )
    : [];
  const [system, setSystem] = useState('');
  const targetSystem =
    systems.find((option) => option.slug === system) ??
    (systems.length === 1 ? systems[0] : undefined);
  const [picked, setPicked] = useState<string>();
  const versionId =
    picked ?? params.get('version') ?? project?.latestVersionId ?? '';
  const version = project?.versions.find((item) => item.id === versionId);
  const [keepOriginal, setKeepOriginal] = useState(true);
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState('');
  const pending = useRef(false);
  const toast = useToast();
  const ready =
    canRequest &&
    matchingGame &&
    !!targetSystem &&
    !!version?.base?.available &&
    PATCH_ID.test(version.id);

  async function submit() {
    if (
      pending.current ||
      receipt ||
      !ready ||
      !project ||
      !resolvedGame ||
      !targetSystem ||
      !version
    )
      return;
    pending.current = true;
    setBusy(true);
    try {
      const result = await requestGame(category, resolvedGame, {
        system: targetSystem.slug,
        selection: {
          kind: 'patch',
          projectId: id,
          versionId: version.id,
          keepOriginal,
        },
      });
      setReceipt(
        result.request.status === 'pending'
          ? 'Waiting for approval'
          : 'Patch requested'
      );
    } catch (error) {
      toast(friendlyError(error, 'Couldn’t request this patch'));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <ExtraHeader
        title={project?.name ?? 'Patch Project'}
        sub={project?.game.title}
      >
        <div className="toolbar">
          <Link className="chip" to="/patches">
            Browse Patches
          </Link>
          {link && (
            <Link className="chip" to={link}>
              Open Game
            </Link>
          )}
        </div>
      </ExtraHeader>
      {!PATCH_ID.test(id) && <p className="note">Patch project not found.</p>}
      <ServiceNote
        error={patch.error}
        what="patch project"
        retry={patch.reload}
      />
      {PATCH_ID.test(id) && !project && !patch.error && (
        <p className="note" role="status">
          Loading patch project…
        </p>
      )}
      {project && (
        <>
          {project.summary && <p className="note">{project.summary}</p>}
          <div className="toolbar">
            <label className="sel">
              <span className="lbl">Patch Version</span>
              <select
                aria-label="Patch Version"
                value={version?.id ?? ''}
                disabled={busy || Boolean(receipt)}
                onChange={(event) => setPicked(event.target.value)}
              >
                <option value="">Choose a version</option>
                {project.versions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.version}
                  </option>
                ))}
              </select>
            </label>
            {canRequest && link && (
              <>
                <label className="sel">
                  <span className="lbl">Game Type</span>
                  <select
                    aria-label="Game Type"
                    value={category}
                    disabled={busy || Boolean(receipt)}
                    onChange={(event) => {
                      setCategory(
                        event.target.value === 'modern' ? 'modern' : 'retro'
                      );
                      setSystem('');
                    }}
                  >
                    <option value="retro">{GAME_LABEL.retro}</option>
                    <option value="modern">{GAME_LABEL.modern}</option>
                  </select>
                </label>
                <label className="sel">
                  <span className="lbl">System</span>
                  <select
                    aria-label="System"
                    value={targetSystem?.slug ?? ''}
                    disabled={busy || Boolean(receipt) || !systems.length}
                    onChange={(event) => setSystem(event.target.value)}
                  >
                    <option value="">Choose a system</option>
                    {systems.map((option) => (
                      <option key={option.slug} value={option.slug}>
                        {option.name}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
          </div>
          {version?.notes && <p className="note">{version.notes}</p>}
          {version && !version.base?.available && (
            <p className="note">The required base revision is unavailable.</p>
          )}
          {canRequest && (
            <>
              {!link && (
                <p className="note">
                  This project has no supported game catalogue identity.
                </p>
              )}
              <ServiceNote
                error={game.error}
                what="associated game"
                retry={game.reload}
              />
              {resolvedGame && !systems.length && (
                <p className="note">
                  No compatible system was found in this game type.
                </p>
              )}
              <div className="toolbar">
                <label>
                  <input
                    type="checkbox"
                    checked={keepOriginal}
                    disabled={busy || Boolean(receipt)}
                    onChange={(event) => setKeepOriginal(event.target.checked)}
                  />{' '}
                  Keep Original
                </label>
                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={!ready || busy || Boolean(receipt)}
                  onClick={() => void submit()}
                >
                  Request Patch
                </button>
              </div>
              {receipt && (
                <p role="status" className="note">
                  {receipt}
                </p>
              )}
            </>
          )}
        </>
      )}
    </>
  );
}
