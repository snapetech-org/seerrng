import { Link, useParams } from 'react-router-dom';
import type { MovieDetails, TvDetails } from '../api';
import { People } from '../components/detail';
import { ExtraHeader, ServiceNote } from '../components/extra';
import { useApi } from '../hooks';

export default function VideoCredits({ media }: { media: 'movie' | 'tv' }) {
  const { id, credit } = useParams();
  const creditType = credit === 'cast' || credit === 'crew' ? credit : null;
  const path =
    id && /^[1-9]\d{0,9}$/.test(id) && Number(id) <= 1_000_000_000
      ? `/${media}/${id}`
      : null;
  const details = useApi<MovieDetails | TvDetails>(creditType ? path : null, {
    currentPathOnly: true,
  });
  const data = details.data;
  const people = creditType ? data?.credits?.[creditType] : undefined;
  return (
    <>
      <ExtraHeader
        title={
          creditType === 'cast'
            ? 'Cast'
            : creditType === 'crew'
              ? 'Crew'
              : 'Credits'
        }
        sub={data?.title ?? data?.name}
      >
        {path && creditType && (
          <div className="toolbar">
            <Link className="chip" to={path}>
              Back to Details
            </Link>
            <Link
              className="chip"
              to={`${path}/${creditType === 'cast' ? 'crew' : 'cast'}`}
            >
              {creditType === 'cast' ? 'View Crew' : 'View Cast'}
            </Link>
          </div>
        )}
      </ExtraHeader>
      {(!path || !creditType) && (
        <p className="note">This credits link is invalid.</p>
      )}
      <ServiceNote
        error={details.error}
        what="title credits"
        retry={details.reload}
      />
      {path && creditType && !data && !details.error && (
        <p className="note" role="status">
          Loading credits…
        </p>
      )}
      {data &&
        (people?.length ? (
          <People list={people} full />
        ) : (
          <p className="note">No credits available.</p>
        ))}
    </>
  );
}
