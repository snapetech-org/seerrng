import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ExtraHeader, ServiceNote } from '../components/extra';
import { useApi } from '../hooks';

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
  if (!id || !validIdentity(mediaType, id)) return null;
  if (mediaType === 'book' && !/^OL\d+[WM]$/i.test(id)) return null;
  return (
    <Link
      className="chip"
      to={`/associations/${mediaType}/${encodeURIComponent(id)}${audio ? '?f=audio' : ''}`}
    >
      Explore Associations
    </Link>
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
  const edges = data?.edges.filter((edge) => !filter || edge.type === filter);
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
