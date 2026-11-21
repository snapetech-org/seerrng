import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ExtraHeader, ServiceNote } from '../components/extra';
import { useExtras } from '../extras';
import { cachedApi, useApi } from '../hooks';
import { useLumenLocale } from '../i18n';
import { sessionGeneration } from '../sessionState';

const labels = {
  similar: 'Similar',
  recommended: 'Recommended',
  'shared-person': 'Shared People',
  'shared-genre': 'Shared Genres',
};
const detailRoutes = {
  movie: 'movie',
  tv: 'tv',
  album: 'music',
  artist: 'artist',
  book: 'book',
  person: 'person',
};

type MediaType = keyof typeof detailRoutes;
type EdgeType = keyof typeof labels;
interface AssociationGraph {
  root: { title: string };
  edges: {
    type: EdgeType;
    reason: string;
    weight?: number;
    node: {
      id: number | string;
      mediaType: MediaType;
      title?: string;
      name?: string;
      bookFormat?: string;
    };
  }[];
}

function validIdentity(type: string, id: string) {
  if (type === 'movie' || type === 'tv' || type === 'person')
    return /^[1-9]\d{0,9}$/.test(id) && Number(id) <= 1_000_000_000;
  return (
    (type === 'book' || type === 'artist' || type === 'album') &&
    /^[A-Za-z0-9_-]{1,128}$/.test(id)
  );
}

type AssociationEdge = AssociationGraph['edges'][number];

function edgeKey({ type, node }: AssociationEdge) {
  return `${type}:${node.mediaType}:${node.id}`;
}

function EdgeDetails({ edge }: { edge: AssociationEdge }) {
  const { node, type, reason } = edge;
  const name = node.title ?? node.name;
  const id = String(node.id);
  const format = node.bookFormat === 'audiobook' ? '?f=audio' : '';
  return (
    <div>
      {validIdentity(node.mediaType, id) ? (
        <Link
          className="go"
          to={`/${detailRoutes[node.mediaType]}/${encodeURIComponent(id)}${format}`}
        >
          {name}
        </Link>
      ) : (
        <b>{name}</b>
      )}
      <small>{labels[type]}</small>
      <small>{reason}</small>
    </div>
  );
}

const GRAPH_VIEW = '(min-width: 640px)';

function RelationshipGraph({
  title,
  edges,
}: {
  title: string;
  edges: AssociationEdge[];
}) {
  const [active, setActive] = useState('');
  const center = { x: 360, y: 295 };
  const radius = 260;
  const nodes = edges.map((edge, index) => {
    const angle = (index / edges.length) * Math.PI * 2 - Math.PI / 2;
    return {
      edge,
      x: center.x + radius * Math.cos(angle),
      y: center.y + radius * Math.sin(angle),
    };
  });
  const selection = edges.find((edge) => edgeKey(edge) === active);

  return (
    <section aria-label="Association Graph">
      <svg
        viewBox="0 0 720 590"
        width="100%"
        aria-label={`Relationships for ${title}`}
      >
        {nodes.map(({ edge, x, y }) => (
          <line
            key={edgeKey(edge)}
            x1={center.x}
            y1={center.y}
            x2={x}
            y2={y}
            stroke={edgeKey(edge) === active ? 'var(--accent)' : 'var(--line)'}
            strokeWidth={edgeKey(edge) === active ? 3 : 1.5}
            aria-hidden="true"
          />
        ))}
        <circle
          cx={center.x}
          cy={center.y}
          r={17}
          fill="var(--ink)"
          aria-hidden="true"
        />
        {nodes.map(({ edge, x, y }) => {
          const name =
            edge.node.title ?? edge.node.name ?? String(edge.node.id);
          const key = edgeKey(edge);
          return (
            <g
              key={key}
              role="button"
              tabIndex={0}
              aria-label={`${name}, ${labels[edge.type]}`}
              aria-pressed={key === active}
              onClick={() => setActive(key)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setActive(key);
                }
              }}
            >
              <title>{name}</title>
              <circle cx={x} cy={y} r={13} fill="transparent" />
              <circle
                cx={x}
                cy={y}
                r={key === active ? 11 : 8}
                fill="var(--accent)"
              />
            </g>
          );
        })}
      </svg>
      {selection ? (
        <div className="set" aria-live="polite">
          <EdgeDetails edge={selection} />
        </div>
      ) : (
        <p className="note">Select a node to see why it’s related.</p>
      )}
    </section>
  );
}

export function AssociationLink({
  mediaType,
  id,
  audio = false,
}: {
  mediaType: Exclude<MediaType, 'person'>;
  id?: string;
  audio?: boolean;
}) {
  const { t } = useLumenLocale();
  if (!id || !validIdentity(mediaType, id)) return null;
  if (mediaType === 'book' && !/^OL\d+[WM]$/i.test(id)) return null;
  return (
    <Link
      className="chip"
      to={`/associations/${mediaType}/${encodeURIComponent(id)}${audio ? '?f=audio' : ''}`}
    >
      {t('lumen.actions.exploreAssociations', 'Explore Associations')}
    </Link>
  );
}

export function CollectionAssociations({
  mediaType,
  parts,
}: {
  mediaType: 'movie' | 'tv' | 'album';
  parts: { id: string | number }[];
}) {
  const [edges, setEdges] = useState<AssociationEdge[]>();
  const [partial, setPartial] = useState(false);
  const [filter, setFilter] = useState('');
  const pending = useRef(false);
  const ids = [...new Set(parts.map(({ id }) => String(id)))].filter((id) =>
    validIdentity(mediaType, id)
  );
  if (!ids.length) return null;

  async function load() {
    if (pending.current) return;
    pending.current = true;
    setEdges(undefined);
    setPartial(false);
    const generation = sessionGeneration();
    const memberIds = new Set(ids);
    const related = new Map<string, AssociationEdge>();
    let failed = false;
    try {
      for (let offset = 0; offset < ids.length; offset += 5) {
        if (generation !== sessionGeneration()) return;
        const results = await Promise.allSettled(
          ids
            .slice(offset, offset + 5)
            .map((id) =>
              cachedApi<AssociationGraph>(
                `/association/${mediaType}/${encodeURIComponent(id)}?includeWeak=true`
              )
            )
        );
        for (const result of results) {
          if (result.status === 'rejected') {
            failed = true;
            continue;
          }
          for (const edge of result.value.edges ?? []) {
            const id = String(edge.node.id);
            if (edge.node.mediaType === mediaType && memberIds.has(id))
              continue;
            const key = `${edge.node.mediaType}:${id}`;
            const existing = related.get(key);
            if (!existing || (edge.weight ?? 0) > (existing.weight ?? 0))
              related.set(key, edge);
          }
        }
      }
      if (generation === sessionGeneration()) {
        setEdges(
          [...related.values()].sort(
            (a, b) => (b.weight ?? 0) - (a.weight ?? 0)
          )
        );
        setPartial(failed);
      }
    } finally {
      pending.current = false;
    }
  }

  const visible = edges?.filter((edge) => !filter || edge.type === filter);
  return (
    <details
      className="adv"
      onToggle={(event) => {
        if (event.currentTarget.open && !edges) void load();
      }}
    >
      <summary>Collection Associations</summary>
      {!edges && (
        <p className="note" role="status">
          Loading associations…
        </p>
      )}
      {partial && (
        <ServiceNote
          what="collection associations"
          error="Some member associations could not be loaded."
          retry={() => void load()}
        />
      )}
      {!!edges?.length && (
        <label className="sel">
          <span className="lbl">Relationship</span>
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            <option value="">All Relationships</option>
            {Object.entries(labels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
      )}
      {visible?.length === 0 && !partial && (
        <p className="note">No associations found.</p>
      )}
      <ul className="setlist">
        {visible?.map((edge) => (
          <li className="set" key={edgeKey(edge)}>
            <EdgeDetails edge={edge} />
          </li>
        ))}
      </ul>
    </details>
  );
}

export default function Associations() {
  const { mediaType = '', id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const format =
    mediaType === 'book' && params.get('f') === 'audio' ? '?f=audio' : '';
  const valid = mediaType !== 'person' && validIdentity(mediaType, id);
  const { data, error, reload } = useApi<AssociationGraph>(
    valid
      ? `/association/${mediaType}/${encodeURIComponent(id)}?includeWeak=true`
      : null
  );
  const extras = useExtras();
  const movieEnabled = extras.categoryEnabled('movie');
  const tvEnabled = extras.categoryEnabled('tv');
  const [wide, setWide] = useState(() => window.matchMedia(GRAPH_VIEW).matches);
  useEffect(() => {
    const query = window.matchMedia(GRAPH_VIEW);
    const update = () => setWide(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  const graphView = wide && params.get('view') === 'graph';
  function showGraph(graph: boolean) {
    const next = new URLSearchParams(params);
    if (graph) next.set('view', 'graph');
    else next.delete('view');
    setParams(next);
  }
  const requestedType = params.get('type') ?? '';
  const filter = Object.hasOwn(labels, requestedType) ? requestedType : '';
  const edges = data?.edges.filter(
    (edge) =>
      (edge.node.mediaType !== 'movie' || movieEnabled) &&
      (edge.node.mediaType !== 'tv' || tvEnabled) &&
      (!filter || edge.type === filter)
  );
  return (
    <>
      <ExtraHeader
        title={
          data?.root.title
            ? `Associations for ${data.root.title}`
            : 'Associations'
        }
      >
        {valid && (
          <div className="toolbar">
            <Link
              className="chip"
              to={`/${detailRoutes[mediaType as MediaType]}/${encodeURIComponent(id)}${format}`}
            >
              Back to Details
            </Link>
          </div>
        )}
      </ExtraHeader>
      {!valid && (
        <p className="note" role="alert">
          Invalid association title.
        </p>
      )}
      <ServiceNote error={error} what="associations" retry={reload} />
      {valid && !data && !error && (
        <p className="note" role="status">
          Loading associations…
        </p>
      )}
      {data && (
        <>
          <div className="toolbar">
            {wide && (
              <div className="seg" role="group" aria-label="Association View">
                <button
                  type="button"
                  aria-pressed={!graphView}
                  onClick={() => showGraph(false)}
                >
                  List
                </button>
                <button
                  type="button"
                  aria-pressed={graphView}
                  onClick={() => showGraph(true)}
                >
                  Graph
                </button>
              </div>
            )}
            <label className="sel">
              <span className="lbl">Relationship</span>
              <select
                aria-label="Relationship"
                value={filter}
                onChange={(event) => {
                  const next = new URLSearchParams(params);
                  if (event.target.value) next.set('type', event.target.value);
                  else next.delete('type');
                  setParams(next);
                }}
              >
                <option value="">All Relationships</option>
                {Object.entries(labels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {edges?.length === 0 && (
            <p className="note">No associations found.</p>
          )}
          {graphView && edges?.length ? (
            <RelationshipGraph title={data.root.title} edges={edges} />
          ) : (
            <ul className="setlist">
              {edges?.map((edge) => (
                <li className="set" key={edgeKey(edge)}>
                  <EdgeDetails edge={edge} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}
