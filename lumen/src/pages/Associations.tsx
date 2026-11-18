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
          <ul className="setlist">
            {edges?.map(({ type, reason, node }) => {
              const name = node.title ?? node.name;
              const route = detailRoutes[node.mediaType];
              const relatedId = String(node.id);
              const format = node.bookFormat === 'audiobook' ? '?f=audio' : '';
              return (
                <li
                  className="set"
                  key={`${type}:${node.mediaType}:${relatedId}`}
                >
                  <div>
                    {validIdentity(node.mediaType, relatedId) ? (
                      <Link
                        className="go"
                        to={`/${route}/${encodeURIComponent(relatedId)}${format}`}
                      >
                        {name}
                      </Link>
                    ) : (
                      <b>{name}</b>
                    )}
                    <small>{labels[type]}</small>
                    <small>{reason}</small>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}
